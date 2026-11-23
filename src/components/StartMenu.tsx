import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { BookOpen, FileText, LayoutGrid, ListChecks, Lock, LogOut, Monitor, Moon, Pencil, Power, Search, Settings as SettingsIcon } from 'lucide-react';
import { APPS, type AppDef } from '../os/apps';
import { OS_VERSION, type FSNode } from '../os/types';
import { isChecklistName } from '../os/noteTypes';
import { formatWhen } from '../os/util';
import { recentFiles, searchArchive } from '../os/vfs';
import { useOS } from '../context/OSContext';
import { useNotes } from '../context/useNotes';
import { useAuth } from '../context/authContext';
import { Avatar } from './AuthScreens';

const CATEGORIES = [
  { id: 'All', icon: LayoutGrid },
  { id: 'System', icon: Monitor },
  { id: 'Productivity', icon: Pencil },
  { id: 'Reference', icon: BookOpen },
] as const;
type Category = (typeof CATEGORIES)[number]['id'];

type Entry =
  | { kind: 'app'; key: string; app: AppDef }
  | { kind: 'file'; key: string; node: FSNode; path: string };

function parentOf(path: string): string {
  const i = path.lastIndexOf('/');
  return i <= 0 ? '/' : path.slice(0, i);
}

const POWER_OPTIONS = [
  { id: 'sleep', label: 'Sleep', hint: 'Screen off. Stay signed in.', icon: Moon },
  { id: 'lock', label: 'Lock', hint: 'Keep windows. Ask for password.', icon: Lock },
  { id: 'logout', label: 'Log out', hint: 'Save, close everything, sign out.', icon: LogOut },
] as const;

/** Power button with a Windows-style flyout: Sleep, Lock, Log out. */
function PowerMenu({ onSleep, onLock, onLogOut }: { onSleep: () => void; onLock: () => void; onLogOut: () => void }) {
  const [open, setOpen] = useState(false);
  const [focus, setFocus] = useState(0);
  const wrapRef = useRef<HTMLSpanElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);

  useEffect(() => {
    if (!open) return;
    itemRefs.current[focus]?.focus();
  }, [open, focus]);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (!wrapRef.current?.contains(event.target as Node)) setOpen(false);
    };
    window.addEventListener('pointerdown', onPointer, true);
    return () => window.removeEventListener('pointerdown', onPointer, true);
  }, [open]);

  const choose = (id: (typeof POWER_OPTIONS)[number]['id']) => {
    setOpen(false);
    if (id === 'sleep') onSleep();
    else if (id === 'lock') onLock();
    else onLogOut();
  };

  return (
    <span
      className="power-wrap"
      ref={wrapRef}
      onKeyDown={(event) => {
        if (!open) return;
        if (event.key === 'Escape') {
          // Close just the power menu, not the whole start menu.
          event.preventDefault();
          event.stopPropagation();
          setOpen(false);
          wrapRef.current?.querySelector<HTMLButtonElement>('.power-btn')?.focus();
        } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
          event.preventDefault();
          event.stopPropagation();
          const step = event.key === 'ArrowDown' ? 1 : -1;
          setFocus((current) => (current + step + POWER_OPTIONS.length) % POWER_OPTIONS.length);
        }
      }}
    >
      {open && (
        <div className="power-flyout" role="menu" aria-label="Power options" data-testid="power-menu">
          {POWER_OPTIONS.map((option, index) => {
            const Icon = option.icon;
            return (
              <button
                key={option.id}
                ref={(el) => { itemRefs.current[index] = el; }}
                type="button"
                role="menuitem"
                className={`power-item${option.id === 'logout' ? ' is-logout' : ''}`}
                data-testid={`power-${option.id}`}
                onMouseEnter={() => setFocus(index)}
                onClick={() => choose(option.id)}
              >
                <span className="power-item-icon"><Icon size={16} /></span>
                <span>
                  <strong>{option.label}</strong>
                  <em>{option.hint}</em>
                </span>
              </button>
            );
          })}
        </div>
      )}
      <button
        type="button"
        className={`btn btn-ghost icon-only power-btn${open ? ' is-open' : ''}`}
        aria-label="Power"
        aria-haspopup="menu"
        aria-expanded={open}
        title="Power"
        data-testid="power-button"
        onClick={() => { setFocus(0); setOpen(!open); }}
      >
        <Power size={15} />
      </button>
    </span>
  );
}

/** Mounted only while the menu is open, so search and selection start fresh each time. */
function StartPanel() {
  const { setStartOpen, openApp, openOrFocus, settings, play, vfsTick } = useOS();
  const { account, sleep, lock, logOut } = useAuth();
  const { openFile } = useNotes();
  const [category, setCategory] = useState<Category>('All');
  const [query, setQuery] = useState('');
  const [cursor, setCursor] = useState(0);
  const [recent, setRecent] = useState<{ node: FSNode; path: string }[]>([]);
  const [found, setFound] = useState<{ q: string; hits: { node: FSNode; path: string }[] }>({ q: '', hits: [] });
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const q = query.trim().toLowerCase();

  useEffect(() => {
    const timer = window.setTimeout(() => inputRef.current?.focus(), 30);
    const onPointer = (event: PointerEvent) => {
      const target = event.target as HTMLElement;
      if (ref.current?.contains(target) || target.closest('[data-testid="start-button"]')) return;
      setStartOpen(false);
    };
    window.addEventListener('pointerdown', onPointer, true);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('pointerdown', onPointer, true);
    };
  }, [setStartOpen]);

  useEffect(() => {
    let alive = true;
    void recentFiles(4).then((files) => { if (alive) setRecent(files); }).catch(() => undefined);
    return () => { alive = false; };
  }, [vfsTick]);

  // File search, debounced. Trash is left out.
  useEffect(() => {
    if (!q) return;
    let alive = true;
    const timer = window.setTimeout(() => {
      void searchArchive(q).then((hits) => {
        if (alive) setFound({ q, hits: hits.filter((hit) => hit.node.type === 'file' && !hit.path.startsWith('/Trash/')).slice(0, 8) });
      });
    }, 120);
    return () => { alive = false; window.clearTimeout(timer); };
  }, [q, vfsTick]);

  const apps = useMemo(() => APPS.filter((app) => {
    if (q) return `${app.name} ${app.description} ${app.keywords.join(' ')} ${app.category}`.toLowerCase().includes(q);
    return category === 'All' || app.category === category;
  }), [category, q]);

  const files = q ? (found.q === q ? found.hits : []) : category === 'All' ? recent : [];
  const entries: Entry[] = [
    ...apps.map((app): Entry => ({ kind: 'app', key: `app:${app.id}`, app })),
    ...files.map((hit): Entry => ({ kind: 'file', key: `file:${hit.node.id}`, node: hit.node, path: hit.path })),
  ];
  const active = Math.min(cursor, Math.max(0, entries.length - 1));

  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>('.is-cursor')?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  const launch = (entry: Entry | undefined) => {
    if (!entry) return;
    play('click');
    if (entry.kind === 'app') {
      if (entry.app.multi) openApp(entry.app.id, undefined, { forceNew: true });
      else openOrFocus(entry.app.id);
    } else {
      openFile(entry.node);
    }
    setStartOpen(false);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (!entries.length) return;
      const step = event.key === 'ArrowDown' ? 1 : -1;
      setCursor((active + step + entries.length) % entries.length);
    } else if (event.key === 'Enter' && (event.target as HTMLElement).tagName === 'INPUT') {
      event.preventDefault();
      launch(entries[active]);
    }
  };

  const row = (entry: Entry, index: number) => {
    const isCursor = index === active;
    const common = {
      type: 'button' as const,
      onMouseEnter: () => setCursor(index),
      onClick: () => launch(entry),
    };
    if (entry.kind === 'app') {
      const Icon = entry.app.icon;
      return (
        <button key={entry.key} {...common} className={`app-tile${isCursor ? ' is-cursor' : ''}`} data-testid={`launch-${entry.app.id}`} title={entry.app.description}>
          <span className="app-tile-icon"><Icon size={16} /></span>
          <span className="app-tile-text">
            <strong>{entry.app.name}</strong>
            <em>{entry.app.description}</em>
          </span>
        </button>
      );
    }
    const Icon = isChecklistName(entry.node.name) ? ListChecks : FileText;
    return (
      <button key={entry.key} {...common} className={`app-tile file-tile${isCursor ? ' is-cursor' : ''}`} data-testid={`start-file-${entry.node.name}`} title={entry.path}>
        <span className="app-tile-icon"><Icon size={15} /></span>
        <span className="app-tile-text">
          <strong>{entry.node.name}</strong>
          <em>{parentOf(entry.path)}{q ? '' : ` · ${formatWhen(entry.node.modifiedAt)}`}</em>
        </span>
      </button>
    );
  };

  const appRows = entries.filter((entry) => entry.kind === 'app');
  const fileRows = entries.filter((entry) => entry.kind === 'file');

  return (
    <div className="start-menu" ref={ref} data-testid="start-menu" role="dialog" aria-label="Application launcher" onKeyDown={onKeyDown}>
      <header className="start-head">
        <label className="start-search">
          <Search size={15} aria-hidden="true" />
          <input
            ref={inputRef}
            value={query}
            placeholder="Search apps and files"
            title="↑↓ select · Enter open · Esc close"
            aria-label="Search apps and files"
            data-testid="start-search"
            onChange={(event) => { setQuery(event.target.value); setCursor(0); }}
          />
        </label>
        <nav className={`start-tabs${q ? ' is-muted' : ''}`} aria-label="Categories">
          {CATEGORIES.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                type="button"
                className={!q && category === item.id ? 'is-active' : ''}
                aria-pressed={!q && category === item.id}
                data-testid={`start-cat-${item.id}`}
                onClick={() => { setCategory(item.id); setQuery(''); setCursor(0); inputRef.current?.focus(); }}
              >
                <Icon size={13} /> {item.id}
              </button>
            );
          })}
        </nav>
      </header>

      <div className="start-list" ref={listRef}>
        {appRows.length > 0 && (
          <section>
            <p className="start-section">{q ? 'Apps' : category === 'All' ? 'Applications' : category}</p>
            <div className="start-apps">{appRows.map((entry) => row(entry, entries.indexOf(entry)))}</div>
          </section>
        )}
        {fileRows.length > 0 && (
          <section>
            <p className="start-section">{q ? 'Files' : 'Recent files'}</p>
            <div className="start-files">{fileRows.map((entry) => row(entry, entries.indexOf(entry)))}</div>
          </section>
        )}
        {!entries.length && (
          <p className="empty-note start-empty">{q && found.q !== q ? 'Searching…' : `Nothing matches “${query.trim()}”.`}</p>
        )}
      </div>

      <footer className="start-foot">
        <span className="start-user" title={`Signed in as ${settings.username}`}>
          <Avatar src={account?.avatar} name={settings.username} size={30} />
          <span>
            <strong>{settings.username}</strong>
            <em>AINCRAD OS {OS_VERSION}</em>
          </span>
        </span>
        <button type="button" className="btn btn-ghost icon-only" aria-label="Settings" title="Settings" onClick={() => { openOrFocus('settings'); setStartOpen(false); }}>
          <SettingsIcon size={15} />
        </button>
        <PowerMenu onSleep={sleep} onLock={lock} onLogOut={() => { void logOut(); }} />
      </footer>
    </div>
  );
}

export function StartMenu() {
  const { startOpen } = useOS();
  return startOpen ? <StartPanel /> : null;
}
