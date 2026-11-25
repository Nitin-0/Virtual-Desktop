import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { ChevronDown, FileText, ListChecks, Search } from 'lucide-react';
import { APPS, type AppDef } from '../os/apps';
import { isChecklistName } from '../os/noteTypes';
import type { FSNode } from '../os/types';
import { useSwipe } from '../os/useSwipe';
import { searchArchive } from '../os/vfs';
import { useOS } from '../context/OSContext';
import { useNotes } from '../context/useNotes';

type Hit = { node: FSNode; path: string };

/**
 * Android-style app drawer: slides up over the home screen with a search box,
 * every app A–Z, and (while searching) matching files. Swipe down on the
 * handle, Back, or Home closes it.
 */
export function AppDrawer({ onClose, onOpenApp }: { onClose: () => void; onOpenApp: (app: AppDef) => void }) {
  const { vfsTick } = useOS();
  const { openFile } = useNotes();
  const [query, setQuery] = useState('');
  const [found, setFound] = useState<{ q: string; hits: Hit[] }>({ q: '', hits: [] });
  const q = query.trim().toLowerCase();
  const swipe = useSwipe({ onDown: onClose });

  const apps = useMemo(() => APPS
    .filter((app) => !q || `${app.name} ${app.description} ${app.keywords.join(' ')}`.toLowerCase().includes(q))
    .sort((a, b) => a.name.localeCompare(b.name)), [q]);

  // File search, debounced. Trash is left out.
  useEffect(() => {
    if (!q) return;
    let alive = true;
    const timer = window.setTimeout(() => {
      void searchArchive(q).then((hits) => {
        if (alive) setFound({ q, hits: hits.filter((hit) => hit.node.type === 'file' && !hit.path.startsWith('/Trash/')).slice(0, 12) });
      });
    }, 150);
    return () => { alive = false; window.clearTimeout(timer); };
  }, [q, vfsTick]);

  const files = q && found.q === q ? found.hits : [];

  const openHit = (hit: Hit) => {
    onClose();
    openFile(hit.node);
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (apps[0]) onOpenApp(apps[0]);
    else if (files[0]) openHit(files[0]);
  };

  return (
    <div className="m-drawer" data-testid="m-drawer" role="dialog" aria-label="All apps">
      <div className="m-drawer-handle" {...swipe}>
        <button type="button" className="m-drawer-grip" aria-label="Close all apps" data-testid="m-drawer-close" onClick={onClose}>
          <ChevronDown size={20} />
        </button>
        <form className="m-drawer-search" onSubmit={submit}>
          <Search size={16} aria-hidden="true" />
          <input
            value={query}
            placeholder="Search apps and files"
            aria-label="Search apps and files"
            data-testid="m-drawer-search"
            enterKeyHint="go"
            onChange={(event) => setQuery(event.target.value)}
          />
        </form>
      </div>
      <div className="m-drawer-body">
        {apps.length > 0 && (
          <>
            {q && <p className="m-drawer-section">Apps</p>}
            <div className="m-drawer-grid">
              {apps.map((app) => {
                const Icon = app.icon;
                return (
                  <button key={app.id} type="button" className="m-icon" data-testid={`m-drawer-app-${app.id}`} onClick={() => onOpenApp(app)}>
                    <span className="m-icon-tile"><Icon size={24} /></span>
                    <span className="m-icon-label">{app.name}</span>
                  </button>
                );
              })}
            </div>
          </>
        )}
        {files.length > 0 && (
          <>
            <p className="m-drawer-section">Files</p>
            <div className="m-drawer-files">
              {files.map((hit) => {
                const Icon = isChecklistName(hit.node.name) ? ListChecks : FileText;
                const folder = hit.path.slice(0, hit.path.lastIndexOf('/')) || '/';
                return (
                  <button key={hit.node.id} type="button" className="m-file" data-testid={`m-drawer-file-${hit.node.name}`} onClick={() => openHit(hit)}>
                    <span className="m-file-icon"><Icon size={18} /></span>
                    <span>
                      <strong>{hit.node.name}</strong>
                      <em>{folder}</em>
                    </span>
                  </button>
                );
              })}
            </div>
          </>
        )}
        {q && apps.length === 0 && files.length === 0 && (
          <p className="m-drawer-empty">{found.q === q ? `Nothing matches “${query.trim()}”.` : 'Searching…'}</p>
        )}
      </div>
    </div>
  );
}