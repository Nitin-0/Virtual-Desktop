import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { getApp } from '../os/apps';
import { playSound, unlockAudio, type SoundKind } from '../os/audio';
import { loadSettings, saveSettings } from '../os/settings';
import { TASKBAR_H, type AppPayload, type AppWindow, type Clip, type DialogRequest, type MenuItem, type MenuState, type Notice, type Settings } from '../os/types';
import { uid, messageOf } from '../os/util';
import { initVfs, onVfsChange } from '../os/vfs';

interface OSContextValue {
  ready: boolean;
  bootError: string | null;
  booted: boolean;
  enterDesktop: () => void;
  retryBoot: () => void;
  settings: Settings;
  updateSettings: (patch: Partial<Settings> | ((current: Settings) => Partial<Settings>)) => void;
  windows: AppWindow[];
  /** Current windows, read at call time (not tied to a render). */
  getWindows: () => AppWindow[];
  activeId: string | null;
  openApp: (appId: string, payload?: AppPayload, opts?: { forceNew?: boolean }) => string;
  openOrFocus: (appId: string, payload?: AppPayload) => string;
  closeWindow: (id: string) => Promise<void>;
  focusWindow: (id: string) => void;
  minimizeWindow: (id: string) => void;
  toggleMaximize: (id: string) => void;
  moveWindow: (id: string, x: number, y: number) => void;
  resizeWindow: (id: string, bounds: { x: number; y: number; w: number; h: number }) => void;
  setWindowTitle: (id: string, title: string) => void;
  setWindowPayload: (id: string, payload: AppPayload) => void;
  registerCloser: (id: string, fn: () => Promise<void>) => () => void;
  notifications: Notice[];
  notify: (notice: { title: string; body?: string; kind?: Notice['kind'] }) => void;
  dismissNotice: (id: string) => void;
  clearNotices: () => void;
  noticesOpen: boolean;
  setNoticesOpen: (open: boolean) => void;
  dialog: DialogRequest | null;
  alert: (opts: { title: string; message: string }) => Promise<void>;
  confirm: (opts: { title: string; message: string; confirmLabel?: string; danger?: boolean }) => Promise<boolean>;
  prompt: (opts: { title: string; message?: string; defaultValue?: string; confirmLabel?: string }) => Promise<string | null>;
  settleDialog: (value: string | boolean | null) => void;
  clipboard: Clip | null;
  setClipboard: (clip: Clip | null) => void;
  vfsTick: number;
  menu: MenuState | null;
  showMenu: (x: number, y: number, items: MenuItem[]) => void;
  hideMenu: () => void;
  startOpen: boolean;
  setStartOpen: (open: boolean) => void;
  play: (kind: SoundKind) => void;
}

const OSContext = createContext<OSContextValue | null>(null);

function desktopSize(): { w: number; h: number } {
  return {
    w: window.innerWidth,
    h: Math.max(240, window.innerHeight - TASKBAR_H),
  };
}

function clampPosition(x: number, y: number, w: number): { x: number; y: number } {
  const maxX = Math.max(16, window.innerWidth - 96);
  const minX = Math.min(16, 96 - w);
  const maxY = Math.max(0, window.innerHeight - TASKBAR_H - 40);
  return {
    x: Math.min(maxX, Math.max(minX, x)),
    y: Math.min(maxY, Math.max(0, y)),
  };
}

export function OSProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<Settings>(() => loadSettings());
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  const [ready, setReady] = useState(false);
  const [bootError, setBootError] = useState<string | null>(null);
  const [booted, setBooted] = useState(false);
  const [windows, setWindows] = useState<AppWindow[]>([]);
  const windowsRef = useRef(windows);
  windowsRef.current = windows;
  const [activeId, setActiveId] = useState<string | null>(null);
  const [notifications, setNotifications] = useState<Notice[]>([]);
  const [noticesOpen, setNoticesOpen] = useState(false);
  const [dialog, setDialog] = useState<DialogRequest | null>(null);
  const dialogRef = useRef<DialogRequest | null>(null);
  const dialogQueue = useRef<DialogRequest[]>([]);
  const [clipboard, setClipboard] = useState<Clip | null>(null);
  const [vfsTick, setVfsTick] = useState(0);
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [startOpen, setStartOpen] = useState(false);
  const zRef = useRef(20);
  const cascadeRef = useRef(0);
  const closersRef = useRef(new Map<string, () => Promise<void>>());
  const storageWarned = useRef(false);
  const notifyRef = useRef<(notice: { title: string; body?: string; kind?: Notice['kind'] }) => void>(() => undefined);

  const play = useCallback((kind: SoundKind) => {
    const current = settingsRef.current;
    playSound(kind, current.volume, current.soundEnabled);
  }, []);

  const notify = useCallback((notice: { title: string; body?: string; kind?: Notice['kind'] }) => {
    const kind = notice.kind ?? 'info';
    const item: Notice = {
      id: uid(),
      title: notice.title,
      body: notice.body,
      time: Date.now(),
      kind,
      toast: true,
    };
    setNotifications((prev) => [item, ...prev].slice(0, 40));
    play(kind === 'error' ? 'error' : kind === 'ok' ? 'ok' : 'notify');
    window.setTimeout(() => {
      setNotifications((prev) => prev.map((entry) => (entry.id === item.id ? { ...entry, toast: false } : entry)));
    }, 4200);
  }, [play]);
  notifyRef.current = notify;

  const updateSettings = useCallback((patch: Partial<Settings> | ((current: Settings) => Partial<Settings>)) => {
    setSettings((prev) => {
      const partial = typeof patch === 'function' ? patch(prev) : patch;
      const next = { ...prev, ...partial };
      const saved = saveSettings(next);
      if (!saved.ok && saved.error && !storageWarned.current) {
        storageWarned.current = true;
        queueMicrotask(() => notifyRef.current({ title: 'Preferences not saved', body: saved.error, kind: 'warn' }));
      }
      return next;
    });
  }, []);

  const dismissNotice = useCallback((id: string) => {
    setNotifications((prev) => prev.filter((notice) => notice.id !== id));
  }, []);

  const clearNotices = useCallback(() => setNotifications([]), []);

  const showDialog = useCallback((request: DialogRequest) => {
    if (!dialogRef.current) {
      dialogRef.current = request;
      setDialog(request);
    } else {
      dialogQueue.current.push(request);
    }
  }, []);

  const settleDialog = useCallback((value: string | boolean | null) => {
    const current = dialogRef.current;
    if (!current) return;
    current.resolve(value);
    const next = dialogQueue.current.shift() ?? null;
    dialogRef.current = next;
    setDialog(next);
  }, []);

  const alert = useCallback((opts: { title: string; message: string }) => {
    return new Promise<void>((resolve) => {
      showDialog({
        id: uid(),
        kind: 'alert',
        title: opts.title,
        message: opts.message,
        confirmLabel: 'OK',
        resolve: () => resolve(),
      });
    });
  }, [showDialog]);

  const confirm = useCallback((opts: { title: string; message: string; confirmLabel?: string; danger?: boolean }) => {
    return new Promise<boolean>((resolve) => {
      showDialog({
        id: uid(),
        kind: 'confirm',
        title: opts.title,
        message: opts.message,
        confirmLabel: opts.confirmLabel ?? 'Confirm',
        cancelLabel: 'Cancel',
        danger: opts.danger,
        resolve: (value) => resolve(value === true),
      });
    });
  }, [showDialog]);

  const prompt = useCallback((opts: { title: string; message?: string; defaultValue?: string; confirmLabel?: string }) => {
    return new Promise<string | null>((resolve) => {
      showDialog({
        id: uid(),
        kind: 'prompt',
        title: opts.title,
        message: opts.message ?? '',
        defaultValue: opts.defaultValue ?? '',
        confirmLabel: opts.confirmLabel ?? 'OK',
        cancelLabel: 'Cancel',
        resolve: (value) => resolve(typeof value === 'string' ? value : null),
      });
    });
  }, [showDialog]);

  const focusWindow = useCallback((id: string) => {
    zRef.current = Math.min(zRef.current + 1, 700);
    const z = zRef.current;
    setWindows((prev) => prev.map((win) => (win.id === id ? { ...win, z, minimized: false } : win)));
    setActiveId(id);
  }, []);

  const openApp = useCallback((appId: string, payload?: AppPayload, opts?: { forceNew?: boolean }) => {
    const app = getApp(appId);
    if (!app) return '';
    const existingWindows = windowsRef.current;
    if (!opts?.forceNew) {
      if (payload?.fileId) {
        const existing = existingWindows.find((win) => win.appId === appId && win.payload?.fileId === payload.fileId);
        if (existing) {
          focusWindow(existing.id);
          return existing.id;
        }
      }
      if (!app.multi) {
        const existing = existingWindows.find((win) => win.appId === appId);
        if (existing) {
          focusWindow(existing.id);
          return existing.id;
        }
      }
    }
    const narrow = window.innerWidth < 800;
    const offset = (cascadeRef.current % 8) * 28;
    cascadeRef.current += 1;
    const size = desktopSize();
    const placed = clampPosition(128 + offset, 28 + offset, app.defaultW);
    zRef.current += 1;
    const id = uid();
    const win: AppWindow = {
      id,
      appId,
      title: app.name,
      x: narrow ? 0 : placed.x,
      y: narrow ? 0 : placed.y,
      w: narrow ? size.w : Math.min(app.defaultW, size.w),
      h: narrow ? size.h : Math.min(app.defaultH, size.h),
      z: zRef.current,
      minimized: false,
      maximized: narrow,
      restore: narrow ? { x: placed.x, y: placed.y, w: app.defaultW, h: app.defaultH } : undefined,
      payload,
    };
    const next = [...windowsRef.current, win];
    windowsRef.current = next;
    setWindows(next);
    setActiveId(id);
    setStartOpen(false);
    setMenu(null);
    play('open');
    return id;
  }, [focusWindow, play]);

  const openOrFocus = useCallback((appId: string, payload?: AppPayload) => {
    const existingWindows = windowsRef.current;
    const existing = payload?.fileId
      ? existingWindows.find((win) => win.appId === appId && win.payload?.fileId === payload.fileId)
      : existingWindows.find((win) => win.appId === appId && !win.minimized) ?? existingWindows.find((win) => win.appId === appId);
    if (existing) {
      focusWindow(existing.id);
      return existing.id;
    }
    return openApp(appId, payload);
  }, [focusWindow, openApp]);

  const closeWindow = useCallback(async (id: string) => {
    const closer = closersRef.current.get(id);
    if (closer) {
      try {
        await closer();
      } catch (error) {
        notify({ title: 'Could not finish saving', body: messageOf(error), kind: 'error' });
        const ok = await confirm({
          title: 'Close anyway?',
          message: 'The latest changes may not be in the archive.',
          confirmLabel: 'Close',
          danger: true,
        });
        if (!ok) return;
      }
    }
    closersRef.current.delete(id);
    const next = windowsRef.current.filter((win) => win.id !== id);
    windowsRef.current = next;
    setWindows(next);
    setActiveId((current) => {
      if (current !== id) return current;
      const remaining = next.filter((win) => !win.minimized);
      remaining.sort((a, b) => b.z - a.z);
      return remaining[0]?.id ?? null;
    });
    play('close');
  }, [confirm, notify, play]);

  const minimizeWindow = useCallback((id: string) => {
    const next = windowsRef.current.map((win) => (win.id === id ? { ...win, minimized: true } : win));
    windowsRef.current = next;
    setWindows(next);
    setActiveId((current) => {
      if (current !== id) return current;
      const remaining = next.filter((win) => !win.minimized);
      remaining.sort((a, b) => b.z - a.z);
      return remaining[0]?.id ?? null;
    });
  }, []);

  const toggleMaximize = useCallback((id: string) => {
    const size = desktopSize();
    setWindows((prev) => prev.map((win) => {
      if (win.id !== id) return win;
      if (win.maximized) {
        const restore = win.restore ?? { x: 72, y: 32, w: 720, h: 480 };
        const placed = clampPosition(restore.x, restore.y, restore.w);
        return { ...win, maximized: false, x: placed.x, y: placed.y, w: restore.w, h: restore.h, restore: undefined };
      }
      return {
        ...win,
        maximized: true,
        restore: { x: win.x, y: win.y, w: win.w, h: win.h },
        x: 0,
        y: 0,
        w: size.w,
        h: size.h,
      };
    }));
    focusWindow(id);
  }, [focusWindow]);

  const moveWindow = useCallback((id: string, x: number, y: number) => {
    setWindows((prev) => prev.map((win) => {
      if (win.id !== id || win.maximized) return win;
      const placed = clampPosition(x, y, win.w);
      return { ...win, x: placed.x, y: placed.y };
    }));
  }, []);

  const resizeWindow = useCallback((id: string, bounds: { x: number; y: number; w: number; h: number }) => {
    setWindows((prev) => prev.map((win) => (win.id === id && !win.maximized ? { ...win, ...bounds } : win)));
  }, []);

  const setWindowTitle = useCallback((id: string, title: string) => {
    setWindows((prev) => {
      const current = prev.find((win) => win.id === id);
      if (!current || current.title === title) return prev;
      return prev.map((win) => (win.id === id ? { ...win, title } : win));
    });
  }, []);

  const setWindowPayload = useCallback((id: string, payload: AppPayload) => {
    setWindows((prev) => prev.map((win) => (win.id === id ? { ...win, payload } : win)));
  }, []);

  const getWindows = useCallback(() => windowsRef.current, []);

  const registerCloser = useCallback((id: string, fn: () => Promise<void>) => {
    closersRef.current.set(id, fn);
    return () => {
      if (closersRef.current.get(id) === fn) closersRef.current.delete(id);
    };
  }, []);

  const showMenu = useCallback((x: number, y: number, items: MenuItem[]) => {
    setStartOpen(false);
    setNoticesOpen(false);
    setMenu({ x, y, items });
  }, []);

  const hideMenu = useCallback(() => setMenu(null), []);

  const enterDesktop = useCallback(() => setBooted(true), []);

  const retryBoot = useCallback(() => {
    setBootError(null);
    setReady(false);
    initVfs()
      .then(() => setReady(true))
      .catch((error) => setBootError(messageOf(error)));
  }, []);

  useEffect(() => {
    let alive = true;
    initVfs()
      .then(() => {
        if (alive) setReady(true);
      })
      .catch((error) => {
        if (alive) setBootError(messageOf(error));
      });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => onVfsChange(() => setVfsTick((tick) => tick + 1)), []);

  useEffect(() => {
    const onResize = () => {
      const size = desktopSize();
      setWindows((prev) => prev.map((win) => {
        if (win.maximized) return { ...win, x: 0, y: 0, w: size.w, h: size.h };
        const placed = clampPosition(win.x, win.y, win.w);
        return { ...win, ...placed };
      }));
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    const unlock = () => unlockAudio();
    window.addEventListener('pointerdown', unlock, { once: true });
    return () => window.removeEventListener('pointerdown', unlock);
  }, []);

  useEffect(() => {
    if (!booted) return;
    if (sessionStorage.getItem('aincrad-welcomed')) return;
    sessionStorage.setItem('aincrad-welcomed', '1');
    notify({
      title: 'Archive online',
      body: 'Files live in this browser (IndexedDB), not on your Windows disk.',
      kind: 'info',
    });
  }, [booted, notify]);

  useEffect(() => {
    const online = () => notify({ title: 'Browser online', body: 'The archive stayed on this device the whole time.', kind: 'ok' });
    const offline = () => notify({ title: 'Browser offline', body: 'The virtual archive is local and still works.', kind: 'warn' });
    window.addEventListener('online', online);
    window.addEventListener('offline', offline);
    return () => {
      window.removeEventListener('online', online);
      window.removeEventListener('offline', offline);
    };
  }, [notify]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (dialogRef.current) return;
      if (menu) {
        setMenu(null);
        return;
      }
      if (startOpen) setStartOpen(false);
      if (noticesOpen) setNoticesOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [menu, startOpen, noticesOpen]);

  const value = useMemo<OSContextValue>(() => ({
    ready,
    bootError,
    booted,
    enterDesktop,
    retryBoot,
    settings,
    updateSettings,
    windows,
    getWindows,
    activeId,
    openApp,
    openOrFocus,
    closeWindow,
    focusWindow,
    minimizeWindow,
    toggleMaximize,
    moveWindow,
    resizeWindow,
    setWindowTitle,
    setWindowPayload,
    registerCloser,
    notifications,
    notify,
    dismissNotice,
    clearNotices,
    noticesOpen,
    setNoticesOpen,
    dialog,
    alert,
    confirm,
    prompt,
    settleDialog,
    clipboard,
    setClipboard,
    vfsTick,
    menu,
    showMenu,
    hideMenu,
    startOpen,
    setStartOpen,
    play,
  }), [
    ready, bootError, booted, enterDesktop, retryBoot, settings, updateSettings, windows, getWindows, activeId,
    openApp, openOrFocus, closeWindow, focusWindow, minimizeWindow, toggleMaximize, moveWindow,
    resizeWindow, setWindowTitle, setWindowPayload, registerCloser, notifications, notify,
    dismissNotice, clearNotices, noticesOpen, dialog, alert, confirm, prompt, settleDialog,
    clipboard, vfsTick, menu, showMenu, hideMenu, startOpen, play,
  ]);

  return <OSContext.Provider value={value}>{children}</OSContext.Provider>;
}

export function useOS(): OSContextValue {
  const ctx = useContext(OSContext);
  if (!ctx) throw new Error('useOS must be used inside OSProvider');
  return ctx;
}
