import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { FileText, Folder, ListChecks, Trash2 } from 'lucide-react';
import { APPS } from '../os/apps';
import { TASKBAR_H, type FSNode, type IconSize } from '../os/types';
import { messageOf } from '../os/util';
import { createFile, createFolder, emptyTrash, getByPath, isProtected, list, pathOf, renameNode, TRASH_ID, trashNode } from '../os/vfs';
import { HexFrame } from './HexFrame';
import { useOS } from '../context/OSContext';
import { noteMenuItems, useNotes } from '../context/useNotes';
import { isChecklistName } from '../os/noteTypes';
import { readDrop, useDrop } from '../context/useDrop';
import { hasDeviceFiles, isAcceptedDrag } from '../os/dnd';

function cellSize(size: IconSize): number {
  if (size === 'small') return 84;
  if (size === 'large') return 118;
  return 100;
}

function defaultPos(index: number, size: IconSize): { x: number; y: number } {
  const cell = cellSize(size);
  const rows = Math.max(1, Math.floor((window.innerHeight - TASKBAR_H - 20) / cell));
  return {
    x: 14 + Math.floor(index / rows) * cell,
    y: 12 + (index % rows) * cell,
  };
}

function clampIcon(x: number, y: number, size: IconSize): { x: number; y: number } {
  const cell = cellSize(size);
  return {
    x: Math.max(8, Math.min(window.innerWidth - cell, x)),
    y: Math.max(8, Math.min(window.innerHeight - TASKBAR_H - cell, y)),
  };
}

interface DropTarget {
  id: string;
  name: string;
  el: HTMLElement;
}

/** The folder under the pointer: a desktop folder icon, an Inventory folder, or an Inventory window's open folder. */
function folderTargetAt(x: number, y: number, dragged: HTMLElement): DropTarget | null {
  for (const raw of document.elementsFromPoint(x, y)) {
    const el = raw as HTMLElement;
    if (dragged.contains(el) || el.closest('.drag-ghost')) continue;
    const desk = el.closest<HTMLElement>('.desk-icon[data-folder-id]');
    if (desk) return { id: desk.dataset.folderId!, name: desk.dataset.folderName ?? 'folder', el: desk };
    const invItem = el.closest<HTMLElement>('.inv-item[data-kind="folder"]');
    if (invItem) return { id: invItem.dataset.nodeId!, name: invItem.querySelector('.inv-name')?.textContent ?? 'folder', el: invItem };
    const inv = el.closest<HTMLElement>('.inv[data-folder-id]');
    if (inv) return { id: inv.dataset.folderId!, name: inv.dataset.folderName ?? 'folder', el: inv };
    return null;
  }
  return null;
}

function markTarget(next: DropTarget | null, prev: DropTarget | null): void {
  if (prev?.el === next?.el) return;
  prev?.el.classList.remove(prev.el.classList.contains('inv') ? 'is-drop-target' : 'is-drop');
  next?.el.classList.add(next.el.classList.contains('inv') ? 'is-drop-target' : 'is-drop');
}

interface DeskItem {
  key: string;
  label: string;
  kind: 'app' | 'file' | 'folder' | 'trash';
  appId?: string;
  node?: FSNode;
}

export function Desktop() {
  const {
    settings,
    updateSettings,
    openApp,
    openOrFocus,
    showMenu,
    hideMenu,
    vfsTick,
    notify,
    confirm,
    prompt,
    activeId,
    dialog,
    setStartOpen,
  } = useOS();
  const [files, setFiles] = useState<FSNode[]>([]);
  const [trashCount, setTrashCount] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [drag, setDrag] = useState<{ key: string; x: number; y: number } | null>(null);
  const { openFile, createNote } = useNotes();
  const { applyDrop } = useDrop();
  const [dropKey, setDropKey] = useState<string | null>(null);
  const [ghost, setGhost] = useState<{ x: number; y: number; label: string } | null>(null);

  /** Save icon positions for nodes that just landed on the desktop at (x, y). */
  const placeAt = (ids: string[], x: number, y: number) => {
    if (!ids.length) return;
    const cell = cellSize(settings.iconSize);
    updateSettings((current) => {
      const next = { ...current.iconPositions };
      ids.forEach((id, i) => {
        next[`file:${id}`] = clampIcon(x - cell / 2 + (i % 4) * cell, y - cell / 3 + Math.floor(i / 4) * cell, settings.iconSize);
      });
      return { iconPositions: next };
    });
  };

  /** Inventory items or device files dropped on the desktop background land in /Desktop at the drop point. */
  const dropOnDesktop = async (dt: DataTransfer, x: number, y: number) => {
    const payload = readDrop(dt);
    if (!payload) return;
    const folder = await getByPath('/Desktop');
    if (!folder) return;
    const landed = await applyDrop(payload, folder.id, 'Desktop');
    const ids = landed.map((node) => node.id);
    if (payload.kind === 'nodes') {
      // Items that were already in /Desktop just move to the drop point.
      ids.push(...payload.ids.filter((id) => files.some((file) => file.id === id)));
    }
    placeAt(ids, x, y);
  };

  useEffect(() => {
    let cancelled = false;
    getByPath('/Desktop').then(async (folder) => {
      if (!folder || cancelled) return;
      const items = await list(folder.id);
      const trashed = await list(TRASH_ID).catch(() => []);
      if (cancelled) return;
      setFiles(items);
      setTrashCount(trashed.length);
    }).catch(() => {
      if (!cancelled) setFiles([]);
    });
    return () => {
      cancelled = true;
    };
  }, [vfsTick]);

  const items = useMemo<DeskItem[]>(() => {
    const apps: DeskItem[] = APPS.map((app) => ({ key: `app:${app.id}`, label: app.name, kind: 'app', appId: app.id }));
    const desk: DeskItem[] = files.map((node) => ({
      key: `file:${node.id}`,
      label: node.name,
      kind: node.type === 'folder' ? 'folder' : 'file',
      node,
    }));
    const trash: DeskItem = { key: 'sys:trash', label: 'Trash', kind: 'trash' };
    return [...apps, trash, ...desk];
  }, [files]);

  const positionOf = (key: string, index: number) => {
    if (drag?.key === key) return { x: drag.x, y: drag.y };
    const saved = settings.iconPositions[key];
    if (saved) return clampIcon(saved.x, saved.y, settings.iconSize);
    return defaultPos(index, settings.iconSize);
  };

  const openItem = async (item: DeskItem) => {
    if (item.kind === 'trash') {
      openApp('inventory', { path: '/Trash' }, { forceNew: true });
      return;
    }
    if (item.kind === 'app' && item.appId) {
      openOrFocus(item.appId);
      return;
    }
    if (!item.node) return;
    if (item.node.type === 'folder') {
      const path = await pathOf(item.node.id);
      openApp('inventory', { path }, { forceNew: true });
      return;
    }
    openFile(item.node);
  };

  const newNoteOnDesktop = async (typeId: string) => {
    const folder = await getByPath('/Desktop');
    if (!folder) {
      notify({ title: 'Desktop folder missing', body: 'Reset the archive from Settings if this persists.', kind: 'error' });
      return;
    }
    await createNote(folder.id, typeId);
  };

  const createOnDesktop = async (kind: 'folder' | 'file') => {
    const folder = await getByPath('/Desktop');
    if (!folder) {
      notify({ title: 'Desktop folder missing', body: 'Reset the archive from Settings if this persists.', kind: 'error' });
      return;
    }
    const name = await prompt({
      title: kind === 'folder' ? 'New folder' : 'New text file',
      message: 'Created in /Desktop of the virtual archive. This does not touch your device disk.',
      defaultValue: kind === 'folder' ? 'New folder' : 'New file.txt',
      confirmLabel: 'Create',
    });
    if (!name) return;
    try {
      if (kind === 'folder') await createFolder(folder.id, name);
      else await createFile(folder.id, name, '');
      notify({ title: kind === 'folder' ? 'Folder created' : 'File created', body: name, kind: 'ok' });
    } catch (error) {
      notify({ title: 'Could not create item', body: messageOf(error), kind: 'error' });
    }
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest('input, textarea, select')) return;
      if (dialog || activeId) return;
      if (event.key === 'Enter' && selected) {
        const item = items.find((entry) => entry.key === selected);
        if (item) void openItem(item);
      }
      if ((event.key === 'Delete' || event.key === 'Backspace') && selected?.startsWith('file:')) {
        const item = items.find((entry) => entry.key === selected);
        if (item?.node) void deleteFile(item.node);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const deleteFile = async (node: FSNode) => {
    if (isProtected(node.id)) {
      notify({ title: 'Protected folder', body: `${node.name} cannot be deleted.`, kind: 'warn' });
      return;
    }
    try {
      await trashNode(node.id);
      setSelected(null);
      notify({ title: 'Moved to Trash', body: `${node.name} · open Trash to restore it`, kind: 'ok' });
    } catch (error) {
      notify({ title: 'Could not move to Trash', body: messageOf(error), kind: 'error' });
    }
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
      notify({ title: 'Trash emptied', body: `${removed} item${removed === 1 ? '' : 's'} deleted permanently`, kind: 'ok' });
    } catch (error) {
      notify({ title: 'Could not empty Trash', body: messageOf(error), kind: 'error' });
    }
  };


  return (
    <div
      className={`desktop size-${settings.iconSize}`}
      data-testid="desktop"
      onDragOver={(event) => {
        if (!isAcceptedDrag(event.dataTransfer)) return;
        event.preventDefault();
        setDropKey(null);
      }}
      onDrop={(event) => {
        if (!isAcceptedDrag(event.dataTransfer)) return;
        event.preventDefault();
        setDropKey(null);
        void dropOnDesktop(event.dataTransfer, event.clientX, event.clientY);
      }}
      onMouseDown={() => {
        setSelected(null);
        hideMenu();
        setStartOpen(false);
      }}
      onContextMenu={(event) => {
        if ((event.target as HTMLElement).closest('.desk-icon')) return;
        event.preventDefault();
        setSelected(null);
        showMenu(event.clientX, event.clientY, [
          { id: 'folder', label: 'New folder', onSelect: () => { void createOnDesktop('folder'); } },
          { id: 'file', label: 'New text file', onSelect: () => { void createOnDesktop('file'); } },
          { id: 'checklist', label: 'New checklist', onSelect: () => { void newNoteOnDesktop('checklist'); } },
          { id: 'note', label: 'New note', children: noteMenuItems((type) => { void newNoteOnDesktop(type.id); }) },
          { id: 'sep1', label: '', separator: true },
          { id: 'refresh', label: 'Refresh', onSelect: () => notify({ title: 'Desktop refreshed', kind: 'info' }) },
          {
            id: 'arrange',
            label: 'Auto-arrange icons',
            onSelect: () => updateSettings({ iconPositions: {} }),
          },
          { id: 'sep2', label: '', separator: true },
          { id: 'term', label: 'Open Terminal', onSelect: () => openApp('terminal', { cwd: '/Desktop' }, { forceNew: true }) },
          { id: 'inv', label: 'Open Inventory', onSelect: () => openApp('inventory', { path: '/Desktop' }, { forceNew: true }) },
          { id: 'set', label: 'Settings', onSelect: () => openOrFocus('settings') },
        ]);
      }}
    >
      {items.map((item, index) => {
        const pos = positionOf(item.key, index);
        const Icon = item.kind === 'app'
          ? APPS.find((app) => app.id === item.appId)?.icon
          : item.kind === 'trash' ? Trash2 : item.kind === 'folder' ? Folder : isChecklistName(item.label) ? ListChecks : FileText;
        return (
          <button
            key={item.key}
            type="button"
            className={`desk-icon${selected === item.key ? ' is-selected' : ''}${dropKey === item.key ? ' is-drop' : ''}${drag?.key === item.key ? ' is-dragging' : ''}`}
            style={{ left: pos.x, top: pos.y }}
            data-testid={item.kind === 'app' ? `desk-${item.appId}` : item.kind === 'trash' ? 'desk-trash' : `desk-file-${item.label}`}
            data-folder-id={item.kind === 'folder' ? item.node?.id : item.kind === 'trash' ? TRASH_ID : undefined}
            data-folder-name={item.kind === 'folder' || item.kind === 'trash' ? item.label : undefined}
            onDragOver={(event) => {
              if (item.kind === 'trash' && hasDeviceFiles(event.dataTransfer)) return;
              if ((item.kind !== 'folder' && item.kind !== 'trash') || !isAcceptedDrag(event.dataTransfer)) return;
              event.preventDefault();
              event.stopPropagation();
              setDropKey(item.key);
            }}
            onDragLeave={() => setDropKey((current) => (current === item.key ? null : current))}
            onDrop={(event) => {
              const destId = item.kind === 'trash' ? TRASH_ID : item.kind === 'folder' ? item.node?.id : undefined;
              if (!destId) return;
              event.preventDefault();
              event.stopPropagation();
              setDropKey(null);
              const payload = readDrop(event.dataTransfer);
              if (payload) void applyDrop(payload, destId, item.label);
            }}
            onMouseDown={(event) => event.stopPropagation()}
            onDoubleClick={(event) => {
              event.stopPropagation();
              void openItem(item);
            }}
            onClick={(event) => {
              event.stopPropagation();
              setSelected(item.key);
            }}
            onContextMenu={(event) => {
              event.preventDefault();
              event.stopPropagation();
              setSelected(item.key);
              const fileItems = item.kind === 'trash' ? [
                { id: 'open', label: 'Open', onSelect: () => { void openItem(item); } },
                { id: 'empty', label: 'Empty Trash', danger: true, disabled: trashCount === 0, onSelect: () => { void confirmEmptyTrash(); } },
              ] : item.node ? [
                { id: 'open', label: 'Open', onSelect: () => { void openItem(item); } },
                ...(item.node.type === 'file' && isChecklistName(item.node.name)
                  ? [{ id: 'open-text', label: 'Open as text', onSelect: () => { if (item.node) openOrFocus('editor', { fileId: item.node.id }); } }]
                  : []),
                {
                  id: 'rename',
                  label: 'Rename',
                  disabled: isProtected(item.node.id),
                  onSelect: () => {
                    void (async () => {
                      const name = await prompt({ title: 'Rename', message: 'New name in the virtual archive.', defaultValue: item.node!.name, confirmLabel: 'Rename' });
                      if (!name || !item.node) return;
                      try {
                        await renameNode(item.node.id, name);
                        notify({ title: 'Renamed', body: name, kind: 'ok' });
                      } catch (error) {
                        notify({ title: 'Could not rename', body: messageOf(error), kind: 'error' });
                      }
                    })();
                  },
                },
                { id: 'del', label: 'Move to Trash', danger: true, disabled: isProtected(item.node.id), onSelect: () => { if (item.node) void deleteFile(item.node); } },
              ] : [
                { id: 'open', label: 'Open', onSelect: () => { void openItem(item); } },
                {
                  id: 'new',
                  label: 'New window',
                  disabled: !APPS.find((app) => app.id === item.appId)?.multi,
                  onSelect: () => { if (item.appId) openApp(item.appId, undefined, { forceNew: true }); },
                },
              ];
              showMenu(event.clientX, event.clientY, fileItems);
            }}
            onPointerDown={(event) => {
              if (event.button !== 0) return;
              event.stopPropagation();
              setSelected(item.key);
              const startX = event.clientX;
              const startY = event.clientY;
              const origin = positionOf(item.key, index);
              const dragged = event.currentTarget;
              const node = item.node;
              let moved = false;
              let x = origin.x;
              let y = origin.y;
              let target: DropTarget | null = null;
              const move = (ev: PointerEvent) => {
                const dx = ev.clientX - startX;
                const dy = ev.clientY - startY;
                if (!moved && Math.hypot(dx, dy) < 4) return;
                moved = true;
                const next = clampIcon(origin.x + dx, origin.y + dy, settings.iconSize);
                x = next.x;
                y = next.y;
                setDrag({ key: item.key, x, y });
                if (node) {
                  const found = folderTargetAt(ev.clientX, ev.clientY, dragged);
                  markTarget(found, target);
                  target = found;
                  setGhost({ x: ev.clientX, y: ev.clientY, label: found ? `Move to ${found.name}` : item.label });
                }
              };
              const up = () => {
                window.removeEventListener('pointermove', move);
                window.removeEventListener('pointerup', up);
                markTarget(null, target);
                setGhost(null);
                if (!moved) return;
                setDrag(null);
                if (node && target) {
                  const dest = target;
                  void applyDrop({ kind: 'nodes', ids: [node.id] }, dest.id, dest.name).then((landed) => {
                    if (!landed.length) return;
                    updateSettings((current) => {
                      const next = { ...current.iconPositions };
                      delete next[item.key];
                      return { iconPositions: next };
                    });
                  });
                  return;
                }
                updateSettings((current) => ({
                  iconPositions: { ...current.iconPositions, [item.key]: { x, y } },
                }));
              };
              window.addEventListener('pointermove', move);
              window.addEventListener('pointerup', up);
            }}
          >
            <HexFrame active={selected === item.key}>
              {Icon && <Icon size={settings.iconSize === 'small' ? 16 : 18} />}
            </HexFrame>
            <span className="desk-label">{item.kind === 'trash' && trashCount ? `Trash (${trashCount})` : item.label}</span>
          </button>
        );
      })}
      {ghost && createPortal(
        <div
          className="drag-ghost"
          style={ghost.x > window.innerWidth - 290
            ? { left: ghost.x - 10, top: ghost.y + 14, transform: 'translateX(-100%)' }
            : { left: ghost.x + 14, top: ghost.y + 14 }}
        >
          {ghost.label}
        </div>,
        document.querySelector('.os') ?? document.body,
      )}
      {!settings.hintDismissed && (
        <div className="desk-hint">
          <p>Right-click the desktop for folders and files. MENU launches apps. The archive is in this browser, not on your disk.</p>
          <button type="button" className="btn btn-ghost" onClick={() => updateSettings({ hintDismissed: true })}>Dismiss</button>
        </div>
      )}
    </div>
  );
}
