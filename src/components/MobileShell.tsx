import { useEffect, useRef, useState } from 'react';
import { Bell, ChevronLeft, Circle, Square, Volume2, VolumeX, Wifi, WifiOff, X } from 'lucide-react';
import { APPS, getApp, type AppDef } from '../os/apps';
import type { AppWindow } from '../os/types';
import { useNow } from '../os/useNow';
import { useOS } from '../context/OSContext';
import { AppBoundary } from './AppBoundary';
import { AppHost } from './AppHost';

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

function StatusBar() {
  const { settings, notifications } = useOS();
  const now = useNow(1000);
  const online = useOnline();
  return (
    <header className="m-status" data-testid="m-status">
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

function HomeScreen({ onOpen }: { onOpen: (app: AppDef) => void }) {
  const now = useNow(1000);
  const dock = DOCK.map((id) => getApp(id)).filter((app): app is AppDef => !!app);
  const grid = APPS.filter((app) => !DOCK.includes(app.id));
  return (
    <div className="m-home" data-testid="m-home">
      <div className="m-clock" aria-hidden="true">
        <strong>{now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</strong>
        <span>{now.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })}</span>
      </div>
      <div className="m-grid">
        {grid.map((app) => <AppIcon key={app.id} app={app} onOpen={onOpen} />)}
      </div>
      <nav className="m-dock" aria-label="Dock">
        {dock.map((app) => <AppIcon key={app.id} app={app} onOpen={onOpen} label={false} />)}
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
      <p className="m-recents-title">Recent apps</p>
      {list.length === 0 && <p className="m-recents-empty">No recent apps</p>}
      <div className="m-recents-list">
        {list.map((win) => {
          const app = getApp(win.appId);
          const Icon = app?.icon;
          return (
            <div key={win.id} className="m-card" data-testid={`m-card-${win.appId}`}>
              <button type="button" className="m-card-open" onClick={() => onPick(win.id)}>
                <span className="m-icon-tile">{Icon && <Icon size={22} />}</span>
                <span>
                  <strong>{app?.name ?? win.appId}</strong>
                  <em>{win.title}</em>
                </span>
              </button>
              <button type="button" className="m-card-close" aria-label={`Close ${win.title}`} onClick={() => onClose(win.id)}><X size={16} /></button>
            </div>
          );
        })}
      </div>
      {list.length > 0 && <button type="button" className="btn btn-ghost m-clear" data-testid="m-clear-all" onClick={onClearAll}>Clear all</button>}
    </div>
  );
}

/**
 * Android-style shell for phones and tablets: status bar, home screen with
 * app grid and dock, one full-screen app at a time, and a Back / Home /
 * Recents navigation bar. Apps and data are the same as on the desktop.
 */
export function MobileShell() {
  const { windows, activeId, openOrFocus, focusWindow, minimizeWindow, closeWindow, getWindows } = useOS();
  const [recentsOpen, setRecentsOpen] = useState(false);
  const current = windows.find((win) => win.id === activeId && !win.minimized) ?? null;

  const openAppFromHome = (app: AppDef) => {
    setRecentsOpen(false);
    openOrFocus(app.id);
  };

  /** Home: put every app in the background. They stay in Recents. */
  const goHome = () => {
    setRecentsOpen(false);
    for (const win of getWindows()) if (!win.minimized) minimizeWindow(win.id);
  };

  /** Back: leave Recents, or close the current app (saving first). The previous app, or Home, shows next. */
  const goBack = () => {
    if (recentsOpen) {
      setRecentsOpen(false);
      return;
    }
    if (current) void closeWindow(current.id);
  };

  const backRef = useRef(goBack);
  useEffect(() => {
    backRef.current = goBack;
  });

  // The phone's own back button/gesture: keep one browser-history entry while an
  // app or Recents is open, so pressing back runs goBack instead of leaving the site.
  const nav = useRef({ pushed: false, ignorePop: false });
  const [pops, setPops] = useState(0);
  const somethingOpen = !!current || recentsOpen;
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

  return (
    <div className="m-shell" data-testid="m-shell">
      <StatusBar />
      <main className="m-main">
        {!current && <HomeScreen onOpen={openAppFromHome} />}
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
      <nav className="m-nav" aria-label="Navigation">
        <button type="button" aria-label="Back" data-testid="m-back" onClick={goBack}><ChevronLeft size={22} /></button>
        <button type="button" aria-label="Home" data-testid="m-home-btn" onClick={goHome}><Circle size={18} /></button>
        <button type="button" aria-label="Recent apps" data-testid="m-recents-btn" className={recentsOpen ? 'is-active' : ''} onClick={() => setRecentsOpen(!recentsOpen)}><Square size={16} /></button>
      </nav>
    </div>
  );
}