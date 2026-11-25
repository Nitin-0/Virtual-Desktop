import { useEffect, useState } from 'react';
import {
  ArrowRightLeft, BookOpen, Boxes, CalendarDays, Columns2, FolderOpen, GitBranch, HelpCircle,
  Lightbulb, LayoutPanelLeft, ListChecks, ListOrdered, Network, Rows3, StickyNote, Table, type LucideIcon,
} from 'lucide-react';
import { useOS } from '../context/OSContext';
import { useNotes } from '../context/useNotes';
import { NOTE_TYPES, appForFile, type NoteType } from '../os/noteTypes';
import type { FSNode } from '../os/types';
import { createFolder, getByPath, list, onVfsChange } from '../os/vfs';
import { useSwipe } from '../os/useSwipe';

/** Where notes made from the mobile "+" button are saved. */
export const MOBILE_NOTES_PATH = '/Home/Notes';

/** Shown first, side by side and highlighted. */
const PRIMARY = ['note', 'checklist'];

const ICONS: Record<string, LucideIcon> = {
  checklist: ListChecks,
  note: StickyNote,
  cornell: LayoutPanelLeft,
  outline: ListOrdered,
  mindmap: Network,
  charting: Table,
  sentence: Rows3,
  boxing: Boxes,
  zettel: GitBranch,
  flow: ArrowRightLeft,
  bujo: CalendarDays,
  qec: HelpCircle,
  split: Columns2,
  feynman: Lightbulb,
};

/** Find /Home/Notes, creating it the first time a note is made. */
async function notesFolder(create: boolean): Promise<FSNode | null> {
  const existing = await getByPath(MOBILE_NOTES_PATH);
  if (existing || !create) return existing;
  const home = await getByPath('/Home');
  return home ? createFolder(home.id, 'Notes') : null;
}

/**
 * Bottom sheet opened by the "+" in the mobile navigation bar: every
 * note-taking method, plus the most recent notes. New notes go to /Home/Notes.
 */
export function NoteSheet({ onClose }: { onClose: () => void }) {
  const { openApp, notify } = useOS();
  const { createNote, openFile } = useNotes();
  const [recent, setRecent] = useState<FSNode[]>([]);
  const swipe = useSwipe({ onDown: onClose });

  useEffect(() => {
    let alive = true;
    const load = async () => {
      const folder = await notesFolder(false);
      const items = folder ? await list(folder.id) : [];
      if (!alive) return;
      setRecent(items.filter((node) => node.type === 'file').sort((a, b) => b.modifiedAt - a.modifiedAt).slice(0, 3));
    };
    void load();
    const off = onVfsChange(() => { void load(); });
    return () => { alive = false; off(); };
  }, []);

  const pick = async (type: NoteType) => {
    const folder = await notesFolder(true);
    if (!folder) {
      notify({ title: 'Home folder missing', body: 'Reset the archive from Settings if this persists.', kind: 'error' });
      return;
    }
    onClose();
    await createNote(folder.id, type);
  };

  const tile = (type: NoteType) => {
    const Icon = ICONS[type.id] ?? BookOpen;
    return (
      <button
        key={type.id}
        type="button"
        className={`m-note-type${PRIMARY.includes(type.id) ? ' is-primary' : ''}`}
        data-testid={`m-new-${type.id}`}
        onClick={() => { void pick(type); }}
      >
        <span className="m-note-icon"><Icon size={20} /></span>
        <strong>{type.label}</strong>
        <em>{type.blurb}</em>
      </button>
    );
  };

  return (
    <div className="m-sheet-back" data-testid="m-note-sheet" onClick={onClose}>
      <div className="m-sheet" role="dialog" aria-label="New note" onClick={(event) => event.stopPropagation()}>
        <div className="m-sheet-handle" {...swipe}><span /></div>
        <header className="m-sheet-head">
          <div>
            <h2>New note</h2>
            <p>Saved to {MOBILE_NOTES_PATH}</p>
          </div>
          <button
            type="button"
            className="m-sheet-folder"
            data-testid="m-notes-folder"
            onClick={() => { onClose(); void notesFolder(true).then(() => openApp('inventory', { path: MOBILE_NOTES_PATH }, { forceNew: true })); }}
          >
            <FolderOpen size={16} /> My notes
          </button>
        </header>

        <div className="m-sheet-body">
          <div className="m-note-grid is-primary">{PRIMARY.map((id) => NOTE_TYPES.find((type) => type.id === id)).filter((type): type is NoteType => !!type).map(tile)}</div>
          <div className="m-note-grid">{NOTE_TYPES.filter((type) => !PRIMARY.includes(type.id)).map(tile)}</div>

          {recent.length > 0 && (
            <>
              <p className="m-sheet-section">Recent notes</p>
              <div className="m-sheet-recent">
                {recent.map((node) => (
                  <button key={node.id} type="button" className="m-file" data-testid="m-recent-note" onClick={() => { onClose(); openFile(node); }}>
                    {appForFile(node.name) === 'checklist' ? <ListChecks size={18} /> : <StickyNote size={18} />}
                    <span><strong>{node.name}</strong><em>{new Date(node.modifiedAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}</em></span>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}