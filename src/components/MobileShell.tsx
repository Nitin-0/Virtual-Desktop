import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { Bell, ChevronLeft, ChevronUp, Circle, Plus, Square, Volume2, VolumeX, Wifi, WifiOff, X } from 'lucide-react';
import { APPS, getApp, type AppDef } from '../os/apps';
import type { AppWindow } from '../os/types';
import { useNow } from '../os/useNow';
import { useOS } from '../context/OSContext';
import { AppBoundary } from './AppBoundary';
import { AppHost } from './AppHost';
import { AppDrawer } from './MobileDrawer';
import { NotificationShade } from './MobileShade';
import { NoteSheet } from './MobileNoteSheet';
import { useSwipe } from '../os/useSwipe';
import { runBackHandler } from '../os/backHandlers';

/** Apps pinned to the dock at the bottom of the home screen. */
const DOCK = ['inventory', 'editor', 'checklist', 'settings'];

function useOnline(): boolean {
  const [online, setOnline] = useState(() => navigator.onLine);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);
  return online;
}

function StatusBar({ onOpenShade }: { onOpenShade: () => void }) {
  const { settings, notifications } = useOS();
  const now = useNow(1000);
  const online = useOnline();
  const swipe = useSwipe({ onDown: onOpenShade, threshold: 30 });
  return (
    <header className="m-status" data-testid="m-status" role="button" tabIndex={0} aria-label="Open notifications and quick settings" onClick={onOpenShade} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') onOpenShade(); }} {...swipe}>
      <strong>{now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</strong>
      <span className="m-status-icons">
        {notifications.length > 0 && <span className="m-status-count" aria-label={`${notifications.length} notifications`}><Bell size={13} />{Math.min(9, notifications.length)}</span>}
        {settings.soundEnabled ? <Volume2 size={14} aria-label="Sound on" /> : <VolumeX size={14} aria-label="Sound off" />}
        {online ? <Wifi size={14} aria-label="Online" /> : <WifiOff size={14} aria-label="Offline" />}
      </span>
    </header>
  );
}

function AppIcon({ app, onOpen, label = true }: { app: AppDef; onOpen: (app: AppDef) => void; label?: boolean }) {
  const Icon = app.icon;
  return (
    <button type="button" className="m-icon" data-testid={`m-app-${app.id}`} onClick={() => onOpen(app)} aria-label={app.name}>
      <span className="m-icon-tile"><Icon size={24} /></span>
      {label && <span className="m-icon-label">{app.name}</span>}
    </button>
  );
}

function HomeScreen({ onOpen, onOpenDrawer, onOpenShade, onNewNote }: { onOpen: (app: AppDef) => void; onOpenDrawer: () => void; onOpenShade: () => void; onNewNote: () => void }) {
  const now = useNow(1000);
  const swipe = useSwipe({ onUp: onOpenDrawer, onDown: onOpenShade });
  const dock = DOCK.map((id) => getApp(id)).filter((app): app is AppDef => !!app);
  const grid = APPS.filter((app) => !DOCK.includes(app.id));
  return (
    <div className="m-home" data-testid="m-home" {...swipe}>
      <div className="m-clock" aria-hidden="true">
        <strong>{now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</strong>
        <span>{now.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })}</span>
      </div>
      <div className="m-grid">
        {grid.map((app) => <AppIcon key={app.id} app={app} onOpen={onOpen} />)}
      </div>
      <button type="button" className="m-drawer-hint" data-testid="m-all-apps" onClick={onOpenDrawer}>
        <ChevronUp size={18} aria-hidden="true" />
        <span>All apps</span>
      </button>
      <nav className="m-dock" aria-label="Dock">
        {dock.slice(0, 2).map((app) => <AppIcon key={app.id} app={app} onOpen={onOpen} label={false} />)}
        <button type="button" className="m-icon m-dock-new" data-testid="m-new-note" aria-label="New note" onClick={onNewNote}>
          <span className="m-icon-tile"><Plus size={28} strokeWidth={2.4} /></span>
        </button>
        {dock.slice(2).map((app) => <AppIcon key={app.id} app={app} onOpen={onOpen} label={false} />)}
      </nav>
    </div>
  );
}

function Recents({ windows, onPick, onClose, onClearAll }: {
  windows: AppWindow[];
  onPick: (id: string) => void;
  onClose: (id: string) => void;
  onClearAll: () => void;
}) {
  const list = windows.slice().sort((a, b) => b.z - a.z);
  return (
    <div className="m-recents" data-testid="m-recents">
      <p className="m-recents-title">Recent apps <span>· swipe a card sideways to close it</span></p>
      {list.length === 0 && <p className="m-recents-empty">No recent apps</p>}
      <div className="m-recents-list">
        {list.map((win) => {
          const app = getApp(win.appId);
          const Icon = app?.icon;
          return (
            <SwipeCard key={win.id} win={win} appName={app?.name ?? win.appId} Icon={Icon} onPick={onPick} onClose={onClose} />
          );
        })}
      </div>
      {list.length > 0 && <button type="button" className="btn btn-ghost m-clear" data-testid="m-clear-all" onClick={onClearAll}>Clear all</button>}
    </div>
  );
}

/**
 * A Recents card. Tap to switch to the app; drag it sideways past about a
 * third of its width to close the app. A shorter drag springs back.
 */
function SwipeCard({ win, appName, Icon, onPick, onClose }: {
  win: AppWindow;
  appName: string;
  Icon?: AppDef['icon'];
  onPick: (id: string) => void;
  onClose: (id: string) => void;
}) {
  const [dx, setDx] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [leaving, setLeaving] = useState<0 | 1 | -1>(0);
  const moved = useRef(false);

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (leaving || (event.pointerType === 'mouse' && event.button !== 0)) return;
    if ((event.target as HTMLElement).closest('.m-card-close')) return;
    const startX = event.clientX;
    const startY = event.clientY;
    const width = event.currentTarget.offsetWidth;
    let horizontal: boolean | null = null;
    let last = 0;
    moved.current = false;
    const move = (ev: PointerEvent) => {
      const mx = ev.clientX - startX;
      const my = ev.clientY - startY;
      if (horizontal === null) {
        if (Math.abs(mx) < 8 && Math.abs(my) < 8) return;
        horizontal = Math.abs(mx) > Math.abs(my);
        if (!horizontal) return end();
        setDragging(true);
      }
      moved.current = true;
      last = mx;
      setDx(mx);
    };
    const up = () => {
      end();
      if (!horizontal) return;
      setDragging(false);
      if (Math.abs(last) > Math.max(90, width * 0.35)) {
        setLeaving(last < 0 ? -1 : 1);
        window.setTimeout(() => onClose(win.id), 180);
      } else {
        setDx(0);
      }
    };
    const end = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  };

  const offset = leaving ? `${leaving * 120}%` : `${dx}px`;
  return (
    <div
      className={`m-card${dragging ? ' is-dragging' : ''}`}
      data-testid={`m-card-${win.appId}`}
      style={{ transform: `translateX(${offset})`, opacity: leaving ? 0 : Math.max(0.35, 1 - Math.abs(dx) / 400) }}
      onPointerDown={onPointerDown}
      onClickCapture={(event) => {
        // A drag should not also count as a tap on the card.
        if (moved.current) {
          event.stopPropagation();
          event.preventDefault();
          moved.current = false;
        }
      }}
    >
      <button type="button" className="m-card-open" onClick={() => onPick(win.id)}>
        <span className="m-icon-tile">{Icon && <Icon size={22} />}</span>
        <span>
          <strong>{appName}</strong>
          <em>{win.title}</em>
        </span>
      </button>
      <button type="button" className="m-card-close" aria-label={`Close ${win.title}`} onClick={() => onClose(win.id)}><X size={16} /></button>
    </div>
  );
}

const EDITABLE = 'input, textarea, select, [contenteditable="true"]';

/**
 * Long-press on touch opens the same menu as right-click (New note, Rename,
 * Move to Trash…). iPhones never send a right-click for a long-press and
 * Android only sometimes does, so the shell sends one itself, makes sure only
 * one menu opens, and stops the finger lifting from also counting as a tap.
 * Text fields keep their normal long-press (text selection).
 */
function useLongPressMenus(rootRef: React.RefObject<HTMLDivElement | null>) {
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    let timer = 0;
    let start: { x: number; y: number; target: Element } | null = null;
    let firedAt = 0;
    // After a long-press the browser still sends a tap where the finger lifts. The menu
    // is now under the finger, so that tap must be swallowed (page-wide, since menus
    // are drawn outside the shell) or it would trigger a menu item.
    let suppressUntil = 0;
    const suppressNextTap = () => { suppressUntil = Date.now() + 1000; };

    const clear = () => { window.clearTimeout(timer); start = null; };
    const down = (event: PointerEvent) => {
      if (event.pointerType !== 'touch') return;
      const target = event.target as Element;
      if (target.closest(EDITABLE)) return;
      clear();
      suppressUntil = 0;
      start = { x: event.clientX, y: event.clientY, target };
      timer = window.setTimeout(() => {
        if (!start) return;
        firedAt = Date.now();
        suppressNextTap();
        start.target.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: start.x, clientY: start.y, button: 2 }));
        navigator.vibrate?.(12);
        start = null;
      }, 500);
    };
    const move = (event: PointerEvent) => {
      if (start && Math.hypot(event.clientX - start.x, event.clientY - start.y) > 10) clear();
    };
    const nativeMenu = (event: MouseEvent) => {
      if (!event.isTrusted) return; // ours
      if (Date.now() - firedAt < 1000) {
        // We already opened the menu for this long-press; drop the browser's duplicate.
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      if (start) {
        // The browser's own long-press menu came first (Android): let it through, skip ours.
        clear();
        suppressNextTap();
      }
    };
    const swallowTap = (event: MouseEvent) => {
      if (Date.now() > suppressUntil) return;
      event.preventDefault();
      event.stopPropagation();
      if (event.type === 'click') suppressUntil = 0;
    };
    root.addEventListener('pointerdown', down, true);
    root.addEventListener('pointermove', move, true);
    root.addEventListener('pointerup', clear, true);
    root.addEventListener('pointercancel', clear, true);
    root.addEventListener('contextmenu', nativeMenu, true);
    window.addEventListener('mousedown', swallowTap, true);
    window.addEventListener('click', swallowTap, true);
    return () => {
      clear();
      root.removeEventListener('pointerdown', down, true);
      root.removeEventListener('pointermove', move, true);
      root.removeEventListener('pointerup', clear, true);
      root.removeEventListener('pointercancel', clear, true);
      root.removeEventListener('contextmenu', nativeMenu, true);
      window.removeEventListener('mousedown', swallowTap, true);
      window.removeEventListener('click', swallowTap, true);
    };
  }, [rootRef]);
}

/**
 * On-screen keyboard: size the layout to the part of the screen above the
 * keyboard, report whether the keyboard is open (to hide the nav bar), and
 * scroll the field being typed into into view.
 */
function useKeyboardViewport(): boolean {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const vv = window.visualViewport;
    const html = document.documentElement;
    let tallest = vv?.height ?? window.innerHeight;
    const update = () => {
      const height = vv?.height ?? window.innerHeight;
      tallest = Math.max(tallest, height);
      html.style.setProperty('--m-vh', `${Math.round(height)}px`);
      const typing = !!document.activeElement?.closest(EDITABLE);
      setOpen(typing && height < tallest - 150);
    };
    const onOrientation = () => { tallest = 0; update(); };
    const onFocus = (event: FocusEvent) => {
      const el = event.target as HTMLElement | null;
      if (!el?.closest?.(EDITABLE)) return;
      update();
      window.setTimeout(() => {
        update();
        el.scrollIntoView({ block: 'nearest' });
      }, 300);
    };
    update();
    vv?.addEventListener('resize', update);
    window.addEventListener('resize', update);
    window.addEventListener('orientationchange', onOrientation);
    document.addEventListener('focusin', onFocus);
    document.addEventListener('focusout', update);
    return () => {
      vv?.removeEventListener('resize', update);
      window.removeEventListener('resize', update);
      window.removeEventListener('orientationchange', onOrientation);
      document.removeEventListener('focusin', onFocus);
      document.removeEventListener('focusout', update);
      html.style.removeProperty('--m-vh');
    };
  }, []);
  return open;
}

/**
 * Android-style shell for phones and tablets: status bar, home screen with
 * app grid and dock, one full-screen app at a time, and a Back / Home /
 * Recents navigation bar. Apps and data are the same as on the desktop.
 */
export function MobileShell() {
  const { windows, activeId, openOrFocus, focusWindow, minimizeWindow, closeWindow, getWindows } = useOS();
  const [recentsOpen, setRecentsOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [shadeOpen, setShadeOpen] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);
  const current = windows.find((win) => win.id === activeId && !win.minimized) ?? null;

  const openAppFromHome = (app: AppDef) => {
    setNotesOpen(false);
    setRecentsOpen(false);
    setDrawerOpen(false);
    setShadeOpen(false);
    openOrFocus(app.id);
  };

  /** Home: put every app in the background. They stay in Recents. */
  const goHome = () => {
    setNotesOpen(false);
    setRecentsOpen(false);
    setDrawerOpen(false);
    setShadeOpen(false);
    for (const win of getWindows()) if (!win.minimized) minimizeWindow(win.id);
  };

  /** Back: leave Recents, or close the current app (saving first). The previous app, or Home, shows next. */
  const goBack = () => {
    if (notesOpen) {
      setNotesOpen(false);
      return;
    }
    if (shadeOpen) {
      setShadeOpen(false);
      return;
    }
    if (recentsOpen) {
      setRecentsOpen(false);
      return;
    }
    if (drawerOpen) {
      setDrawerOpen(false);
      return;
    }
    if (!current) return;
    // Let the app go back first (e.g. Inventory to the previous folder); otherwise close it.
    if (runBackHandler(current.id)) return;
    void closeWindow(current.id);
  };

  const backRef = useRef(goBack);
  useEffect(() => {
    backRef.current = goBack;
  });

  // The phone's own back button/gesture: keep one browser-history entry while an
  // app or Recents is open, so pressing back runs goBack instead of leaving the site.
  const nav = useRef({ pushed: false, ignorePop: false });
  const [pops, setPops] = useState(0);
  const somethingOpen = !!current || recentsOpen || drawerOpen || shadeOpen || notesOpen;
  useEffect(() => {
    if (somethingOpen && !nav.current.pushed) {
      window.history.pushState({ aincradNav: true }, '');
      nav.current.pushed = true;
    } else if (!somethingOpen && nav.current.pushed) {
      // Returned home with the on-screen buttons: remove our entry quietly.
      nav.current.pushed = false;
      nav.current.ignorePop = true;
      window.history.back();
    }
  }, [somethingOpen, pops]);
  useEffect(() => {
    const onPop = () => {
      if (nav.current.ignorePop) {
        nav.current.ignorePop = false;
        return;
      }
      nav.current.pushed = false;
      backRef.current();
      setPops((n) => n + 1);
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const shellRef = useRef<HTMLDivElement>(null);
  useLongPressMenus(shellRef);
  const keyboardOpen = useKeyboardViewport();

  return (
    <div className="m-shell" data-testid="m-shell" ref={shellRef} data-keyboard={keyboardOpen ? 'open' : 'closed'}>
      <StatusBar onOpenShade={() => setShadeOpen(true)} />
      <main className="m-main">
        {!current && <HomeScreen onOpen={openAppFromHome} onOpenDrawer={() => setDrawerOpen(true)} onOpenShade={() => setShadeOpen(true)} onNewNote={() => setNotesOpen(true)} />}
        {drawerOpen && !current && <AppDrawer onClose={() => setDrawerOpen(false)} onOpenApp={openAppFromHome} />}
        {/* Every app stays mounted so switching keeps its state; only the current one is shown. */}
        {windows.map((win) => {
          const app = getApp(win.appId);
          const Icon = app?.icon;
          const shown = win.id === current?.id;
          return (
            <section
              key={win.id}
              className={`window m-app${shown ? ' is-focused' : ''}`}
              data-app={win.appId}
              data-window-id={win.id}
              data-testid={`window-${win.appId}`}
              style={{ display: shown ? 'flex' : 'none' }}
            >
              <header className="m-appbar">
                {Icon && <Icon size={16} aria-hidden="true" />}
                <h2>{win.title}</h2>
              </header>
              <div className="window-body m-app-body">
                <AppBoundary onClose={() => { void closeWindow(win.id); }}>
                  <AppHost win={win} />
                </AppBoundary>
              </div>
            </section>
          );
        })}
        {recentsOpen && (
          <Recents
            windows={windows}
            onPick={(id) => { setRecentsOpen(false); focusWindow(id); }}
            onClose={(id) => { void closeWindow(id); }}
            onClearAll={() => {
              void (async () => {
                for (const win of getWindows().slice()) await closeWindow(win.id);
                setRecentsOpen(false);
              })();
            }}
          />
        )}
      </main>
      {shadeOpen && (
        <NotificationShade
          onClose={() => setShadeOpen(false)}
          onOpenSettings={() => { setShadeOpen(false); setDrawerOpen(false); setRecentsOpen(false); openOrFocus('settings'); }}
        />
      )}
      {notesOpen && <NoteSheet onClose={() => setNotesOpen(false)} />}
      <nav className="m-nav" aria-label="Navigation">
        <button type="button" aria-label="Back" data-testid="m-back" onClick={goBack}><ChevronLeft size={22} /></button>
        <button type="button" aria-label="Home" data-testid="m-home-btn" onClick={goHome}><Circle size={18} /></button>
        <button type="button" aria-label="Recent apps" data-testid="m-recents-btn" className={recentsOpen ? 'is-active' : ''} onClick={() => { setNotesOpen(false); setDrawerOpen(false); setShadeOpen(false); setRecentsOpen(!recentsOpen); }}><Square size={16} /></button>
      </nav>
    </div>
  );
}