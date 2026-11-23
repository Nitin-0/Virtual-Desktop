import { useCallback } from 'react';
import type { FSNode } from '../os/types';
import { collectDeviceFiles, draggedNodeIds, importDeviceFiles, moveNodesInto, NODE_MIME, type DroppedFiles } from '../os/dnd';
import { TRASH_ID } from '../os/vfs';
import { useOS } from './OSContext';

export type DropPayload = { kind: 'nodes'; ids: string[] } | { kind: 'device'; dropped: DroppedFiles };

/** Read a drop synchronously (the browser empties DataTransfer after the event). */
export function readDrop(dt: DataTransfer | null): DropPayload | null {
  if (!dt) return null;
  if (Array.from(dt.types).includes(NODE_MIME)) {
    const ids = draggedNodeIds(dt);
    return ids.length ? { kind: 'nodes', ids } : null;
  }
  if (Array.from(dt.types).includes('Files')) {
    const dropped = collectDeviceFiles(dt);
    return dropped.files.length || dropped.folders.length ? { kind: 'device', dropped } : null;
  }
  return null;
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

export function useDrop() {
  const { notify } = useOS();

  /** Move archive items or import device files into `destId`. Returns the nodes that landed there. */
  const applyDrop = useCallback(async (payload: DropPayload, destId: string, destLabel: string): Promise<FSNode[]> => {
    if (payload.kind === 'nodes') {
      const { moved, errors } = await moveNodesInto(payload.ids, destId);
      if (errors.length) notify({ title: moved.length ? 'Some items were not moved' : 'Could not move', body: errors[0], kind: 'error' });
      else if (moved.length) notify({ title: `Moved to ${destLabel}`, body: moved.length === 1 ? moved[0]!.name : plural(moved.length, 'item'), kind: 'ok' });
      return moved;
    }
    if (destId === TRASH_ID) {
      notify({ title: 'Not imported', body: 'Files from your computer cannot be dropped into Trash.', kind: 'warn' });
      return [];
    }
    const { imported, skipped } = await importDeviceFiles(payload.dropped, destId);
    if (imported.length) {
      notify({
        title: `Imported into ${destLabel}`,
        body: imported.length === 1 ? imported[0]!.name : plural(imported.length, 'file'),
        kind: 'ok',
      });
    }
    if (skipped.length) {
      const first = skipped[0]!;
      notify({
        title: imported.length ? `${plural(skipped.length, 'file')} skipped` : 'Nothing imported',
        body: `${first.name}: ${first.reason}${skipped.length > 1 ? ` (and ${skipped.length - 1} more)` : ''}. Text files only.`,
        kind: 'warn',
      });
    }
    return imported;
  }, [notify]);

  return { applyDrop };
}
