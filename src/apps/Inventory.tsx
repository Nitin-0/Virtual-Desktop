import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ClipboardPaste,
  Copy,
  FilePlus,
  FolderPlus,
  Grid2x2,
  Info,
  List,
  NotebookPen,
  Scissors,
  Search,
  Trash2,
  Undo2,
} from 'lucide-react';
import { FileText, Folder, FolderInput, ListChecks, Lock } from 'lucide-react';
import { useOS } from '../context/OSContext';
import { noteMenuItems, useNotes } from '../context/useNotes';
import { isChecklistName } from '../os/noteTypes';
import { readDrop, useDrop } from '../context/useDrop';
import { registerBackHandler } from '../os/backHandlers';
import { useShellMode } from '../os/useShellMode';
import { isAcceptedDrag, setDraggedNodes } from '../os/dnd';
import type { FSNode } from '../os/types';
import { byteSize, formatBytes, formatWhen, messageOf } from '../os/util';
import {
  copyNode,
  createFile,
  createFolder,
  getByPath,
  getNode,
  isProtected,
  list,
  moveNode,
  pathOf,
  emptyTrash,
  isInTrash,
  removeNode,
  restoreNode,
  renameNode,
  searchArchive,
  TRASH_ID,
  trashNode,
  listFolders,
} from '../os/vfs';

function rootLabel(node: FSNode): string {
  return node.id === 'root' ? 'Archive' : node.name;
}

/** "Move to…": pick a destination folder. Works with touch, where drag-and-drop does not. */
function MoveDialog({ nodes, onClose, onPick }: {
  nodes: FSNode[];
  onClose: () => void;
  onPick: (folder: FSNode, label: string) => void;
}) {
  const [folders, setFolders] = useState<{ node: FSNode; path: string; depth: number }[] | null>(null);
  const [sources, setSources] = useState<string[]>([]);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const all = await listFolders();
      const paths = await Promise.all(nodes.map((node) => pathOf(node.id)));
      if (alive) {
        setFolders(all);
        setSources(paths);
      }
    })();
    return () => { alive = false; };
  }, [nodes]);

  // A folder cannot move into itself or anything inside it.
  const insideSource = (path: string) => nodes.some((node, i) => node.type === 'folder' && sources[i] && (path === sources[i] || path.startsWith(`${sources[i]}/`)));
  const isCurrent = (folder: FSNode) => nodes.every((node) => node.parentId === folder.id);

  return (
    <div className="props-back" onMouseDown={onClose}>
      <div className="props-panel move-panel" role="dialog" aria-label="Move to folder" data-testid="move-dialog" onMouseDown={(event) => event.stopPropagation()}>
        <p className="dialog-kicker">Move {nodes.length === 1 ? `“${nodes[0]!.name}”` : `${nodes.length} items`} to</p>
        <div className="move-list">
          {!folders && <p className="empty-note">Loading folders…</p>}
          {folders?.map(({ node, path, depth }) => {
            const label = node.id === 'root' ? 'Archive' : node.name;
            const disabled = insideSource(path) || isCurrent(node);
            return (
              <button
                key={node.id}
                type="button"
                className="move-item"
                style={{ paddingLeft: 10 + depth * 16 }}
                disabled={disabled}
                data-testid={`move-to-${path}`}
                onClick={() => onPick(node, label)}
              >
                <Folder size={16} aria-hidden="true" />
                <span>{label}</span>
                {isCurrent(node) && <em>current</em>}
              </button>
            );
          })}
        </div>
        <div className="dialog-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

export function InventoryApp({ windowId, initialPath }: { windowId: string; initialPath?: string }) {
  const {
    vfsTick,
    notify,
    confirm,
    prompt,
    openApp,
    openOrFocus,
    setWindowTitle,
    clipboard,
    setClipboard,
    settings,
    updateSettings,
    activeId,
    showMenu,
  } = useOS();
  const [path, setPath] = useState(initialPath || '/Home');
  // Folders visited before the current one, so mobile Back can retrace them.
  const navHistory = useRef<string[]>([]);
  // When a tap opens a folder, ignore taps for a moment so a habitual double-tap
  // does not also open whatever item lands under the finger in the new folder.
  const openedFolderAt = useRef(0);
  const navigate = (next: string) => {
    if (next !== path) navHistory.current.push(path);
    setPath(next);
  };
  const [folder, setFolder] = useState<FSNode | null>(null);
  const [items, setItems] = useState<FSNode[]>([]);
  const [crumbs, setCrumbs] = useState<{ name: string; path: string }[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<{ node: FSNode; path: string }[] | null>(null);
  const [propsFor, setPropsFor] = useState<{ node: FSNode; path: string; from?: string } | null>(null);
  const [sort, setSort] = useState<'name' | 'modified' | 'type'>('name');
  const [dropId, setDropId] = useState<string | null>(null);
  const { openFile, createNote } = useNotes();
  const { applyDrop } = useDrop();
  const mobile = useShellMode(settings.shellMode) === 'mobile';
  const [moveTargets, setMoveTargets] = useState<FSNode[] | null>(null);
  const [bodyDrop, setBodyDrop] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const node = await getByPath(path);
        if (cancelled) return;
        if (!node || node.type !== 'folder') {
          setError('That folder is no longer in the archive.');
          setFolder(null);
          setItems([]);
          return;
        }
        const children = await list(node.id);
        if (cancelled) return;
        setFolder(node);
        setItems(children);
        setError(null);
        const parts = path === '/' ? [] : path.split('/').filter(Boolean);
        const nextCrumbs = [{ name: 'Archive', path: '/' }];
        let built = '';
        for (const part of parts) {
          built += `/${part}`;
          nextCrumbs.push({ name: part, path: built });
        }
        setCrumbs(nextCrumbs);
        setSelected((prev) => prev.filter((id) => children.some((child) => child.id === id)));
        setWindowTitle(windowId, `Inventory — ${node.id === 'root' ? 'Archive' : node.name}`);
      } catch (err) {
        if (!cancelled) setError(messageOf(err));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [path, vfsTick, setWindowTitle, windowId]);

  useEffect(() => {
    if (!query.trim()) {
      setResults(null);
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(() => {
      const from = folder?.id ?? 'root';
      void searchArchive(query, from).then((found) => {
        if (!cancelled) setResults(found);
      });
    }, 160);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [query, folder?.id, vfsTick]);

  const shown = useMemo(() => {
    const copy = items.slice();
    copy.sort((a, b) => {
      if (sort === 'type' && a.type !== b.type) return a.type === 'folder' ? -1 : 1;
      if (sort === 'modified') return b.modifiedAt - a.modifiedAt;
      if (a.type !== b.type && sort === 'name') return a.type === 'folder' ? -1 : 1;
      return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
    });
    return copy;
  }, [items, sort]);

  const visibleNodes = results ? results.map((hit) => hit.node) : shown;
  const selectedNodes = visibleNodes.filter((item) => selected.includes(item.id));
  const inTrashView = path === '/Trash' || path.startsWith('/Trash/');
  const canRestore = (nodes: FSNode[]) => nodes.length > 0 && nodes.every((node) => node.parentId === TRASH_ID);

  // Mobile Back: close a panel, then clear search, then go to the previous folder.
  // Only when there is nothing left does Back close Inventory.
  useEffect(() => {
    if (!mobile) return;
    return registerBackHandler(windowId, () => {
      if (moveTargets) { setMoveTargets(null); return true; }
      if (propsFor) { setPropsFor(null); return true; }
      if (query) { setQuery(''); return true; }
      const previous = navHistory.current.pop();
      if (previous === undefined) return false;
      setPath(previous);
      setSelected([]);
      return true;
    });
  }, [mobile, windowId, moveTargets, propsFor, query]);

  const goUp = () => {
    if (path === '/') return;
    const index = path.lastIndexOf('/');
    navigate(index <= 0 ? '/' : path.slice(0, index));
    setSelected([]);
  };

  // The folder whose items are on screen. Right after navigating, `path` already points
  // to the new folder while the old items are still shown; joining onto `path` then
  // would build a wrong path (e.g. /Home/Documents/Documents).
  const shownPath = crumbs.length ? crumbs[crumbs.length - 1]!.path : path;

  const openNode = (node: FSNode, nodePath?: string) => {
    if (node.type === 'folder') {
      if (!nodePath && shownPath !== path) return; // still loading the folder just opened
      setQuery('');
      navigate(nodePath ?? (shownPath === '/' ? `/${node.name}` : `${shownPath}/${node.name}`));
      setSelected([]);
      return;
    }
    openFile(node);
  };

  const noteItems = () => noteMenuItems((type) => { if (folder) void createNote(folder.id, type); });

  const createItem = async (kind: 'folder' | 'file') => {
    if (!folder) return;
    const name = await prompt({
      title: kind === 'folder' ? 'New folder' : 'New text file',
      message: 'Stored in the virtual archive (IndexedDB), not on your device disk.',
      defaultValue: kind === 'folder' ? 'New folder' : 'New file.txt',
      confirmLabel: 'Create',
    });
    if (!name) return;
    try {
      if (kind === 'folder') await createFolder(folder.id, name);
      else {
        const file = await createFile(folder.id, name, '');
        openOrFocus('editor', { fileId: file.id });
      }
      notify({ title: kind === 'folder' ? 'Folder created' : 'File created', body: name, kind: 'ok' });
    } catch (err) {
      notify({ title: 'Could not create', body: messageOf(err), kind: 'error' });
    }
  };

  const removeItems = async (nodes?: FSNode[]) => {
    const targets = nodes ?? selectedNodes;
    if (!targets.length) return;
    if (targets.some((node) => isProtected(node.id))) {
      notify({ title: 'Protected folder', body: 'Deselect system folders before deleting.', kind: 'warn' });
      return;
    }
    const trashed: FSNode[] = [];
    const live: FSNode[] = [];
    for (const node of targets) ((await isInTrash(node.id)) ? trashed : live).push(node);
    const errors: string[] = [];
    // Outside Trash: move to Trash. Reversible, so no confirmation.
    for (const node of live) {
      try {
        await trashNode(node.id);
      } catch (err) {
        errors.push(messageOf(err));
      }
    }
    if (live.length && !errors.length) {
      notify({ title: 'Moved to Trash', body: `${live.length === 1 ? live[0]!.name : `${live.length} items`} · open Trash to restore`, kind: 'ok' });
    }
    // Already in Trash: delete for good, after confirming.
    if (trashed.length) {
      const ok = await confirm({
        title: 'Delete forever?',
        message: `Permanently delete ${trashed.length === 1 ? `“${trashed[0]!.name}”` : `${trashed.length} items`}? This cannot be undone.`,
        confirmLabel: 'Delete forever',
        danger: true,
      });
      if (ok) {
        for (const node of trashed) {
          try {
            await removeNode(node.id, true);
          } catch (err) {
            errors.push(messageOf(err));
          }
        }
        if (!errors.length) notify({ title: 'Deleted permanently', body: trashed.length === 1 ? trashed[0]!.name : `${trashed.length} items`, kind: 'ok' });
      }
    }
    setSelected([]);
    if (errors.length) notify({ title: 'Some items were not deleted', body: errors[0], kind: 'error' });
  };

  const restoreItems = async (nodes?: FSNode[]) => {
    const targets = (nodes ?? selectedNodes).filter((node) => node.parentId === TRASH_ID);
    if (!targets.length) return;
    const places: string[] = [];
    const errors: string[] = [];
    for (const node of targets) {
      try {
        const { path: restoredTo } = await restoreNode(node.id);
        places.push(restoredTo);
      } catch (err) {
        errors.push(messageOf(err));
      }
    }
    setSelected([]);
    if (places.length) notify({ title: 'Restored', body: places.length === 1 ? places[0] : `${places.length} items`, kind: 'ok' });
    if (errors.length) notify({ title: 'Some items were not restored', body: errors[0], kind: 'error' });
  };

  const confirmEmptyTrash = async () => {
    const count = (await list(TRASH_ID)).length;
    if (!count) return;
    const ok = await confirm({
      title: 'Empty Trash?',
      message: `Permanently delete ${count} item${count === 1 ? '' : 's'} in Trash? This cannot be undone.`,
      confirmLabel: 'Empty Trash',
      danger: true,
    });
    if (!ok) return;
    try {
      const removed = await emptyTrash();
      setSelected([]);
      notify({ title: 'Trash emptied', body: `${removed} item${removed === 1 ? '' : 's'} deleted permanently`, kind: 'ok' });
    } catch (err) {
      notify({ title: 'Could not empty Trash', body: messageOf(err), kind: 'error' });
    }
  };


  const renameItem = async (node?: FSNode) => {
    const target = node ?? selectedNodes[0];
    if (!target) return;
    if (isProtected(target.id)) {
      notify({ title: 'Protected folder', body: `${target.name} cannot be renamed.`, kind: 'warn' });
      return;
    }
    const name = await prompt({ title: 'Rename', message: 'New name in the virtual archive.', defaultValue: target.name, confirmLabel: 'Rename' });
    if (!name) return;
    try {
      await renameNode(target.id, name);
      notify({ title: 'Renamed', body: name, kind: 'ok' });
    } catch (err) {
      notify({ title: 'Could not rename', body: messageOf(err), kind: 'error' });
    }
  };

  const pasteInto = async (parentId: string) => {
    if (!clipboard?.ids.length) return;
    const errors: string[] = [];
    for (const id of clipboard.ids) {
      try {
        if (clipboard.mode === 'copy') await copyNode(id, parentId);
        else await moveNode(id, parentId);
      } catch (err) {
        errors.push(messageOf(err));
      }
    }
    if (clipboard.mode === 'cut') setClipboard(null);
    if (errors.length) notify({ title: 'Paste incomplete', body: errors[0], kind: 'error' });
    else notify({ title: clipboard.mode === 'copy' ? 'Copied' : 'Moved', kind: 'ok' });
  };

  const showProperties = async (node: FSNode) => {
    try {
      const full = await pathOf(node.id);
      const fresh = await getNode(node.id);
      const current = fresh ?? node;
      let from: string | undefined;
      if (current.trashedFrom) from = await pathOf(current.trashedFrom).catch(() => 'a folder that no longer exists');
      setPropsFor({ node: current, path: full, from });
    } catch (err) {
      notify({ title: 'Could not read properties', body: messageOf(err), kind: 'error' });
    }
  };

  useEffect(() => {
    if (activeId !== windowId) return;
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest('input, textarea')) return;
      if ((event.key === 'Backspace' || event.key === 'ArrowUp') && event.altKey) {
        event.preventDefault();
        goUp();
      }
      if (event.key === 'Delete') {
        event.preventDefault();
        void removeItems();
      }
      if (event.key === 'F2') {
        event.preventDefault();
        void renameItem();
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'c' && !window.getSelection()?.toString()) {
        if (selected.length) setClipboard({ mode: 'copy', ids: selected });
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'x' && selected.length) {
        setClipboard({ mode: 'cut', ids: selected });
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'v' && folder && !inTrashView) {
        event.preventDefault();
        void pasteInto(folder.id);
      }
      if (event.key === 'Enter' && selectedNodes[0]) openNode(selectedNodes[0]);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const onItemMenu = (event: React.MouseEvent, node: FSNode) => {
    event.preventDefault();
    event.stopPropagation();
    if (!selected.includes(node.id)) setSelected([node.id]);
    showMenu(event.clientX, event.clientY, [
      { id: 'open', label: 'Open', onSelect: () => openNode(node) },
      ...(node.type === 'file' && isChecklistName(node.name)
        ? [{ id: 'open-text', label: 'Open as text', onSelect: () => openOrFocus('editor', { fileId: node.id }) }]
        : []),
      { id: 'rename', label: 'Rename', disabled: isProtected(node.id), onSelect: () => { void renameItem(node); } },
      { id: 'copy', label: 'Copy', onSelect: () => setClipboard({ mode: 'copy', ids: [node.id] }) },
      { id: 'cut', label: 'Cut', disabled: isProtected(node.id), onSelect: () => setClipboard({ mode: 'cut', ids: [node.id] }) },
      {
        id: 'move',
        label: 'Move to…',
        disabled: isProtected(node.id),
        onSelect: () => {
          const group = selected.includes(node.id) && selected.length > 1 ? selectedNodes.filter((item) => !isProtected(item.id)) : [node];
          setMoveTargets(group);
        },
      },
      { id: 'paste', label: 'Paste into', disabled: node.type !== 'folder' || !clipboard, onSelect: () => { void pasteInto(node.id); } },
      { id: 'sep', label: '', separator: true },
      ...(inTrashView || node.parentId === TRASH_ID
        ? [{ id: 'restore', label: 'Restore', disabled: node.parentId !== TRASH_ID, onSelect: () => { void restoreItems([node]); } }]
        : []),
      {
        id: 'del',
        label: inTrashView || node.parentId === TRASH_ID ? 'Delete forever' : 'Move to Trash',
        danger: true,
        disabled: isProtected(node.id),
        onSelect: () => { void removeItems([node]); },
      },
      { id: 'props', label: 'Properties', onSelect: () => { void showProperties(node); } },
    ]);
  };

  const renderItem = (node: FSNode, nodePath?: string) => {
    const active = selected.includes(node.id);
    const cut = clipboard?.mode === 'cut' && clipboard.ids.includes(node.id);
    return (
      <button
        key={node.id}
        type="button"
        className={`inv-item${active ? ' is-selected' : ''}${cut ? ' is-cut' : ''}${dropId === node.id ? ' is-drop' : ''}`}
        data-testid={`inv-item-${node.name}`}
        data-node-id={node.id}
        data-kind={node.type}
        draggable={!isProtected(node.id)}
        onDragStart={(event) => {
          const ids = selected.includes(node.id) ? selected : [node.id];
          setSelected(ids);
          setDraggedNodes(event.dataTransfer, ids);
        }}
        onDragOver={(event) => {
          if (node.type !== 'folder' || !isAcceptedDrag(event.dataTransfer)) return;
          event.preventDefault();
          event.stopPropagation();
          setBodyDrop(false);
          setDropId(node.id);
        }}
        onDragLeave={() => setDropId((current) => (current === node.id ? null : current))}
        onDrop={(event) => {
          if (node.type !== 'folder') return;
          event.preventDefault();
          event.stopPropagation();
          setDropId(null);
          const payload = readDrop(event.dataTransfer);
          if (payload) void applyDrop(payload, node.id, node.name);
        }}
        onClick={(event) => {
          if (mobile && !event.ctrlKey && !event.metaKey) {
            // Phones and tablets: a single tap opens, like Android file managers.
            if (Date.now() - openedFolderAt.current < 400) return;
            if (node.type === 'folder') openedFolderAt.current = Date.now();
            setSelected([node.id]);
            openNode(node, nodePath);
            return;
          }
          if (event.ctrlKey || event.metaKey) {
            setSelected((prev) => (prev.includes(node.id) ? prev.filter((id) => id !== node.id) : [...prev, node.id]));
          } else {
            setSelected([node.id]);
          }
        }}
        onDoubleClick={() => { if (!mobile) openNode(node, nodePath); }}
        onContextMenu={(event) => onItemMenu(event, node)}
      >
        <span className="inv-glyph">
          {isProtected(node.id) ? <Lock size={14} /> : node.type === 'folder' ? <Folder size={18} /> : isChecklistName(node.name) ? <ListChecks size={18} /> : <FileText size={18} />}
        </span>
        <span className="inv-name">{node.name}</span>
        {settings.inventoryView === 'list' && (
          <>
            <span>{node.type === 'folder' ? 'Folder' : isChecklistName(node.name) ? 'Checklist' : 'Text'}</span>
            <span>{node.type === 'file' ? formatBytes(byteSize(node.content)) : '—'}</span>
            <span>{formatWhen(node.modifiedAt)}</span>
          </>
        )}
      </button>
    );
  };

  return (
    <div
      className={`inv${bodyDrop ? ' is-drop-target' : ''}`}
      data-folder-id={folder?.id}
      data-folder-name={folder ? rootLabel(folder) : undefined}
      onDragOver={(event) => {
        if (!folder || !isAcceptedDrag(event.dataTransfer)) return;
        event.preventDefault();
        setBodyDrop(true);
      }}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setBodyDrop(false);
      }}
      onDrop={(event) => {
        event.preventDefault();
        setBodyDrop(false);
        if (!folder) return;
        const payload = readDrop(event.dataTransfer);
        if (payload) void applyDrop(payload, folder.id, rootLabel(folder));
      }}
      onContextMenu={(event) => {
        if ((event.target as HTMLElement).closest('.inv-item')) return;
        event.preventDefault();
        showMenu(event.clientX, event.clientY, [
          { id: 'folder', label: 'New folder', disabled: inTrashView, onSelect: () => { void createItem('folder'); } },
          { id: 'file', label: 'New text file', disabled: inTrashView, onSelect: () => { void createItem('file'); } },
          { id: 'checklist', label: 'New checklist', disabled: !folder || inTrashView, onSelect: () => { if (folder) void createNote(folder.id, 'checklist'); } },
          { id: 'note', label: 'New note', disabled: !folder || inTrashView, children: noteItems() },
          { id: 'paste', label: 'Paste', disabled: !clipboard || !folder || inTrashView, onSelect: () => { if (folder) void pasteInto(folder.id); } },
          ...(path === '/Trash' ? [{ id: 'empty', label: 'Empty Trash', danger: true, disabled: !items.length, onSelect: () => { void confirmEmptyTrash(); } }] : []),
          { id: 'sep', label: '', separator: true },
          { id: 'term', label: 'Open Terminal here', onSelect: () => openApp('terminal', { cwd: path }, { forceNew: true }) },
          { id: 'props', label: 'Folder properties', disabled: !folder, onSelect: () => { if (folder) void showProperties(folder); } },
        ]);
      }}
    >
      <p className="inv-banner">
        {inTrashView
          ? 'Trash · deleted items wait here · Restore puts them back · Empty Trash deletes them for good'
          : 'Virtual archive · IndexedDB in this browser · not your Windows, macOS, or Linux disk'}
      </p>
      <div className="inv-toolbar">
        <div className="inv-actions">
        <button type="button" className="btn btn-ghost" data-testid="inv-new-folder" disabled={inTrashView} onClick={() => { void createItem('folder'); }}><FolderPlus size={14} /> Folder</button>
        <button type="button" className="btn btn-ghost" data-testid="inv-new-file" disabled={inTrashView} onClick={() => { void createItem('file'); }}><FilePlus size={14} /> File</button>
        <button
          type="button"
          className="btn btn-ghost"
          data-testid="inv-new-note"
          disabled={!folder || inTrashView}
          onClick={(event) => {
            const rect = event.currentTarget.getBoundingClientRect();
            showMenu(rect.left, rect.bottom + 4, noteItems());
          }}
        ><NotebookPen size={14} /> Note</button>
        <button type="button" className="btn btn-ghost" onClick={goUp} disabled={path === '/'}>Up</button>
        <button type="button" className="btn btn-ghost" disabled={!selected.length} onClick={() => setClipboard({ mode: 'cut', ids: selected })}><Scissors size={14} /> Cut</button>
        <button type="button" className="btn btn-ghost" disabled={!selected.length} onClick={() => setClipboard({ mode: 'copy', ids: selected })}><Copy size={14} /> Copy</button>
        <button type="button" className="btn btn-ghost" data-testid="inv-paste" disabled={!clipboard || !folder || inTrashView} onClick={() => { if (folder) void pasteInto(folder.id); }}><ClipboardPaste size={14} /> Paste</button>
        <button type="button" className="btn btn-ghost" disabled={selected.length !== 1} onClick={() => { void renameItem(); }}>Rename</button>
        {inTrashView && (
          <button type="button" className="btn btn-ghost" data-testid="inv-restore" disabled={!canRestore(selectedNodes)} onClick={() => { void restoreItems(); }}><Undo2 size={14} /> Restore</button>
        )}
        <button
          type="button"
          className="btn btn-ghost"
          data-testid="inv-move"
          disabled={!selectedNodes.some((item) => !isProtected(item.id)) || inTrashView}
          onClick={() => setMoveTargets(selectedNodes.filter((item) => !isProtected(item.id)))}
        ><FolderInput size={14} /> Move to…</button>
        <button type="button" className="btn btn-ghost" data-testid="inv-delete" disabled={!selected.length} onClick={() => { void removeItems(); }}><Trash2 size={14} /> {inTrashView ? 'Delete forever' : 'Delete'}</button>
        {inTrashView && (
          <button type="button" className="btn btn-danger" data-testid="inv-empty-trash" disabled={path !== '/Trash' || !items.length} onClick={() => { void confirmEmptyTrash(); }}>Empty Trash</button>
        )}
        <button type="button" className="btn btn-ghost" disabled={selected.length !== 1 && !folder} onClick={() => {
          const node = selectedNodes[0] ?? folder;
          if (node) void showProperties(node);
        }}><Info size={14} /> Properties</button>
        </div>
        <span className="toolbar-spacer" />
        <label className="search-field">
          <Search size={14} />
          <input
            data-testid="inv-search"
            value={query}
            placeholder="Search this folder"
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <select className="field field-sm" value={sort} aria-label="Sort" onChange={(event) => setSort(event.target.value as 'name' | 'modified' | 'type')}>
          <option value="name">Name</option>
          <option value="modified">Modified</option>
          <option value="type">Type</option>
        </select>
        <button
          type="button"
          className="btn btn-ghost"
          aria-label={settings.inventoryView === 'grid' ? 'List view' : 'Grid view'}
          onClick={() => updateSettings({ inventoryView: settings.inventoryView === 'grid' ? 'list' : 'grid' })}
        >
          {settings.inventoryView === 'grid' ? <List size={14} /> : <Grid2x2 size={14} />}
        </button>
      </div>
      <div className="inv-crumbs" data-testid="inv-crumbs">
        {crumbs.map((crumb, index) => (
          <span key={crumb.path}>
            {index > 0 && <span className="crumb-sep">/</span>}
            <button
              type="button"
              onClick={() => { setQuery(''); navigate(crumb.path); setSelected([]); }}
              onDragOver={(event) => {
                if (!isAcceptedDrag(event.dataTransfer)) return;
                event.preventDefault();
                event.stopPropagation();
              }}
              onDrop={(event) => {
                event.preventDefault();
                event.stopPropagation();
                setBodyDrop(false);
                const payload = readDrop(event.dataTransfer);
                if (!payload) return;
                void (async () => {
                  const target = await getByPath(crumb.path);
                  if (target) await applyDrop(payload, target.id, crumb.name);
                })();
              }}
            >
              {crumb.name}
            </button>
          </span>
        ))}
      </div>
      <div className={`inv-body ${settings.inventoryView === 'list' ? 'is-list' : 'is-grid'}`} data-testid="inv-body">
        {error && <p className="empty-note">{error} <button type="button" className="btn btn-ghost" onClick={() => navigate('/')}>Go to Archive</button></p>}
        {!error && results && (
          results.length === 0
            ? <p className="empty-note">No names match “{query}” under this folder.</p>
            : results.map((hit) => renderItem(hit.node, hit.path))
        )}
        {!error && !results && shown.length === 0 && <p className="empty-note">This folder is empty. Create a folder or text file to begin.</p>}
        {!error && !results && settings.inventoryView === 'list' && shown.length > 0 && (
          <div className="inv-list-head"><span /><span>Name</span><span>Kind</span><span>Size</span><span>Modified</span></div>
        )}
        {!error && !results && shown.map((node) => renderItem(node))}
      </div>
      <footer className="inv-status">
        <span>{results ? `${results.length} matches` : `${shown.length} items`}</span>
        <span>{clipboard ? `${clipboard.mode === 'cut' ? 'Cut' : 'Copied'} ${clipboard.ids.length}` : 'Clipboard empty'}</span>
        <span>Path {path}</span>
      </footer>
      {moveTargets && (
        <MoveDialog
          nodes={moveTargets}
          onClose={() => setMoveTargets(null)}
          onPick={(dest, label) => {
            setMoveTargets(null);
            setSelected([]);
            void applyDrop({ kind: 'nodes', ids: moveTargets.map((item) => item.id) }, dest.id, label);
          }}
        />
      )}
      {propsFor && (
        <div className="props-back" onMouseDown={() => setPropsFor(null)}>
          <div className="props-panel" role="dialog" aria-label="Properties" onMouseDown={(event) => event.stopPropagation()}>
            <p className="dialog-kicker">Properties</p>
            <h3>{propsFor.node.id === 'root' ? 'Archive' : propsFor.node.name}</h3>
            <dl>
              <div><dt>Kind</dt><dd>{propsFor.node.type === 'folder' ? 'Folder' : 'Text file'}</dd></div>
              <div><dt>Location</dt><dd>{propsFor.path}</dd></div>
              <div><dt>Size</dt><dd>{propsFor.node.type === 'file' ? `${formatBytes(byteSize(propsFor.node.content))} · ${propsFor.node.content.length.toLocaleString()} characters` : 'Folder'}</dd></div>
              <div><dt>Created</dt><dd>{formatWhen(propsFor.node.createdAt)}</dd></div>
              <div><dt>Modified</dt><dd>{formatWhen(propsFor.node.modifiedAt)}</dd></div>
              <div><dt>Storage</dt><dd>Browser IndexedDB · virtual archive, not a device file</dd></div>
              {propsFor.from && <div><dt>Deleted from</dt><dd>{propsFor.from}</dd></div>}
              {propsFor.node.trashedAt && <div><dt>Deleted</dt><dd>{formatWhen(propsFor.node.trashedAt)}</dd></div>}
              <div><dt>Protected</dt><dd>{isProtected(propsFor.node.id) ? 'Yes' : 'No'}</dd></div>
              <div><dt>Id</dt><dd className="mono">{propsFor.node.id}</dd></div>
            </dl>
            <div className="dialog-actions">
              <button type="button" className="btn btn-ghost" onClick={() => setPropsFor(null)}>Close</button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={isProtected(propsFor.node.id) || propsFor.node.id === 'root'}
                onClick={() => {
                  const target = propsFor.node;
                  setPropsFor(null);
                  void renameItem(target);
                }}
              >
                Rename
              </button>
            </div>
          </div>
        </div>
      )}
      <span className="sr-only">{rootLabel(folder ?? { id: 'root', name: '', parentId: null, type: 'folder', content: '', createdAt: 0, modifiedAt: 0 })}</span>
    </div>
  );
}