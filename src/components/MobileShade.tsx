import { ChevronUp, Lock, LogOut, Monitor, Moon, Settings as SettingsIcon, Sparkles, Sun, Volume2, VolumeX, X } from 'lucide-react';
import { useAuth } from '../context/authContext';
import { useOS } from '../context/OSContext';
import { allThemes, resolveTheme } from '../os/themes';
import { useNow } from '../os/useNow';
import { useSwipe } from '../os/useSwipe';
import { Avatar } from './AuthScreens';

/**
 * Android-style notification shade with quick settings. Pulled down from the
 * status bar or the home screen; swipe up, tap below it, Back, or Home closes it.
 */
export function NotificationShade({ onClose, onOpenSettings }: { onClose: () => void; onOpenSettings: () => void }) {
  const { settings, updateSettings, notifications, dismissNotice, clearNotices } = useOS();
  const { account, sleep, lock, logOut } = useAuth();
  const now = useNow(1000);
  const swipe = useSwipe({ onUp: onClose });
  const themes = allThemes(settings.customThemes);
  const activeTheme = resolveTheme(settings.theme, settings.customThemes);

  const tiles = [
    {
      id: 'sound',
      label: 'Sound',
      on: settings.soundEnabled,
      icon: settings.soundEnabled ? Volume2 : VolumeX,
      toggle: () => updateSettings({ soundEnabled: !settings.soundEnabled }),
    },
    {
      id: 'animations',
      label: 'Animations',
      on: settings.animations,
      icon: Sparkles,
      toggle: () => updateSettings({ animations: !settings.animations }),
    },
    {
      id: 'desktop',
      label: 'Desktop layout',
      on: false,
      icon: Monitor,
      toggle: () => { onClose(); updateSettings({ shellMode: 'desktop' }); },
    },
  ];

  const power = (action: () => void) => () => { onClose(); action(); };

  return (
    <div className="m-shade-back" data-testid="m-shade" onClick={onClose}>
      <div className="m-shade" role="dialog" aria-label="Notifications and quick settings" onClick={(event) => event.stopPropagation()}>
        <header className="m-shade-head">
          <div>
            <strong>{now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</strong>
            <span>{now.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })}</span>
          </div>
          <span className="m-shade-user">
            <Avatar src={account?.avatar} name={account?.username ?? settings.username} size={34} />
            <button type="button" className="m-round" aria-label="Settings" data-testid="m-shade-settings" onClick={onOpenSettings}><SettingsIcon size={17} /></button>
          </span>
        </header>

        <div className="m-tiles">
          {tiles.map((tile) => {
            const Icon = tile.icon;
            return (
              <button
                key={tile.id}
                type="button"
                className={`m-tile${tile.on ? ' is-on' : ''}`}
                aria-pressed={tile.id === 'desktop' ? undefined : tile.on}
                data-testid={`m-tile-${tile.id}`}
                onClick={tile.toggle}
              >
                <Icon size={18} />
                <span>{tile.label}</span>
              </button>
            );
          })}
        </div>

        <label className="m-bright">
          <Sun size={16} aria-hidden="true" />
          <input
            type="range"
            min={50}
            max={100}
            value={settings.brightness}
            aria-label="Brightness"
            data-testid="m-brightness"
            onChange={(event) => updateSettings({ brightness: Number(event.target.value) })}
          />
        </label>

        <div className="m-themes" role="group" aria-label="Theme">
          {themes.map((theme) => (
            <button
              key={theme.id}
              type="button"
              className={`m-theme${theme.id === activeTheme.id ? ' is-active' : ''}`}
              title={theme.name}
              aria-label={`Theme ${theme.name}`}
              aria-pressed={theme.id === activeTheme.id}
              data-testid={`m-theme-${theme.id}`}
              onClick={() => updateSettings({ theme: theme.id })}
              style={{ background: `linear-gradient(135deg, ${theme.colors[1]}, ${theme.colors[2]} 55%, ${theme.colors[3]})` }}
            />
          ))}
        </div>

        <div className="m-power" role="group" aria-label="Power">
          <button type="button" data-testid="m-power-sleep" onClick={power(sleep)}><Moon size={16} />Sleep</button>
          <button type="button" data-testid="m-power-lock" onClick={power(lock)}><Lock size={16} />Lock</button>
          <button type="button" className="is-logout" data-testid="m-power-logout" onClick={power(() => { void logOut(); })}><LogOut size={16} />Log out</button>
        </div>

        <section className="m-notes" aria-label="Notifications">
          <header>
            <span>Notifications</span>
            {notifications.length > 0 && <button type="button" data-testid="m-notes-clear" onClick={clearNotices}>Clear all</button>}
          </header>
          {notifications.length === 0 && <p className="m-notes-empty">No notifications</p>}
          {notifications.map((notice) => (
            <div key={notice.id} className={`m-note is-${notice.kind}`} data-testid="m-note">
              <div>
                <strong>{notice.title}</strong>
                {notice.body && <p>{notice.body}</p>}
                <time>{new Date(notice.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</time>
              </div>
              <button type="button" aria-label={`Dismiss ${notice.title}`} onClick={() => dismissNotice(notice.id)}><X size={15} /></button>
            </div>
          ))}
        </section>

        <div className="m-shade-grip" {...swipe}>
          <button type="button" aria-label="Close" data-testid="m-shade-close" onClick={onClose}><ChevronUp size={20} /></button>
        </div>
      </div>
    </div>
  );
}