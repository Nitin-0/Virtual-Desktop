import { Bell, Volume2, VolumeX, Wifi, WifiOff } from 'lucide-react';
import { useEffect, useState } from 'react';
import { getApp } from '../os/apps';
import { useNow } from '../os/useNow';
import { useOS } from '../context/OSContext';

export function Taskbar() {
  const {
    windows,
    activeId,
    focusWindow,
    minimizeWindow,
    toggleMaximize,
    closeWindow,
    startOpen,
    setStartOpen,
    setNoticesOpen,
    noticesOpen,
    notifications,
    clearNotices,
    dismissNotice,
    settings,
    updateSettings,
    showMenu,
    openOrFocus,
    play,
  } = useOS();
  const now = useNow(1000);
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

  const time = now.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: settings.showSeconds ? '2-digit' : undefined,
  });
  const date = now.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });

  return (
    <footer className="taskbar" data-testid="taskbar">
      <button
        type="button"
        className={`start-btn${startOpen ? ' is-open' : ''}`}
        data-testid="start-button"
        aria-expanded={startOpen}
        onClick={() => {
          play('click');
          setNoticesOpen(false);
          setStartOpen(!startOpen);
        }}
      >
        <span className="start-mark" aria-hidden="true" />
        <span>MENU</span>
      </button>

      <div className="task-windows">
        {windows.map((win) => {
          const app = getApp(win.appId);
          const Icon = app?.icon;
          const active = activeId === win.id && !win.minimized;
          return (
            <button
              key={win.id}
              type="button"
              className={`task-btn${active ? ' is-active' : ''}${win.minimized ? ' is-min' : ''}`}
              data-testid={`task-${win.appId}`}
              onClick={() => {
                if (win.minimized || activeId !== win.id) focusWindow(win.id);
                else minimizeWindow(win.id);
              }}
              onContextMenu={(event) => {
                event.preventDefault();
                showMenu(event.clientX, event.clientY, [
                  { id: 'restore', label: 'Restore', disabled: !win.minimized && !win.maximized, onSelect: () => focusWindow(win.id) },
                  { id: 'min', label: 'Minimize', disabled: win.minimized, onSelect: () => minimizeWindow(win.id) },
                  { id: 'max', label: win.maximized ? 'Restore down' : 'Maximize', onSelect: () => toggleMaximize(win.id) },
                  { id: 'sep', label: '', separator: true },
                  { id: 'close', label: 'Close', danger: true, onSelect: () => { void closeWindow(win.id); } },
                ]);
              }}
            >
              {Icon && <Icon size={15} />}
              <span>{win.title}</span>
            </button>
          );
        })}
      </div>

      <div className="tray">
        <span className="tray-btn" title={online ? 'Browser online. Archive is local.' : 'Browser offline. Archive still works.'} aria-label={online ? 'Browser online' : 'Browser offline'}>
          {online ? <Wifi size={15} /> : <WifiOff size={15} />}
        </span>
        <button
          type="button"
          className="tray-btn"
          data-testid="sound-toggle"
          aria-label={settings.soundEnabled ? 'Mute interface sounds' : 'Enable interface sounds'}
          title={settings.soundEnabled ? 'Sounds on' : 'Sounds off'}
          onClick={() => updateSettings({ soundEnabled: !settings.soundEnabled })}
        >
          {settings.soundEnabled ? <Volume2 size={15} /> : <VolumeX size={15} />}
        </button>
        <button
          type="button"
          className={`tray-btn${noticesOpen ? ' is-open' : ''}`}
          data-testid="notice-button"
          aria-label="Notifications"
          onClick={() => {
            setStartOpen(false);
            setNoticesOpen(!noticesOpen);
          }}
        >
          <Bell size={15} />
          {notifications.length > 0 && <em>{Math.min(9, notifications.length)}</em>}
        </button>
        <button
          type="button"
          className="clock-btn"
          data-testid="taskbar-clock"
          onClick={() => openOrFocus('system')}
          title="Open System"
        >
          <strong>{time}</strong>
          <span>{date}</span>
        </button>
      </div>

      {noticesOpen && (
        <div className="notice-panel" data-testid="notice-panel">
          <header>
            <strong>Notices</strong>
            <button type="button" className="btn btn-ghost" onClick={clearNotices} disabled={!notifications.length}>Clear</button>
          </header>
          {notifications.length === 0 && <p className="notice-empty">No notices yet.</p>}
          <ul>
            {notifications.map((notice) => (
              <li key={notice.id} className={`is-${notice.kind}`}>
                <button type="button" onClick={() => dismissNotice(notice.id)}>
                  <strong>{notice.title}</strong>
                  {notice.body && <span>{notice.body}</span>}
                  <time>{new Date(notice.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</time>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </footer>
  );
}
