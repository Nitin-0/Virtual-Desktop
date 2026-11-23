/**
 * Drag and drop between the desktop, Inventory windows, and the user's computer.
 *
 * Archive items travel in a private MIME type so that dropping ordinary text
 * from another page is never mistaken for a list of node ids. Files dropped
 * from the computer are read with the File API and imported as text files;
 * nothing is written back to the device disk.
 */
import type { FSNode } from './types';
import { MAX_FILE_CHARS } from './types';
import { createFileUnique, getNode, moveNode } from './vfs';
import { messageOf } from './util';

export const NODE_MIME = 'application/x-aincrad-nodes';

const MAX_IMPORT_BYTES = 6 * 1024 * 1024;
const BINARY_TYPE = /^(image|audio|video|font)\/|^application\/(pdf|zip|x-zip|gzip|x-7z|x-rar|x-tar|octet-stream|vnd\.|msword|x-msdownload)/;

export function setDraggedNodes(dt: DataTransfer, ids: string[]): void {
  dt.setData(NODE_MIME, JSON.stringify(ids));
  dt.effectAllowed = 'move';
}

export function draggedNodeIds(dt: DataTransfer): string[] {
  try {
    const parsed: unknown = JSON.parse(dt.getData(NODE_MIME) || '[]');
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : [];
  } catch {
    return [];
  }
}

/** True while dragging something this app can accept: archive items or files from the computer. */
export function isAcceptedDrag(dt: DataTransfer | null): boolean {
  if (!dt) return false;
  const types = Array.from(dt.types);
  return types.includes(NODE_MIME) || types.includes('Files');
}

export function hasDeviceFiles(dt: DataTransfer | null): boolean {
  return !!dt && Array.from(dt.types).includes('Files') && !Array.from(dt.types).includes(NODE_MIME);
}

export interface DroppedFiles {
  files: File[];
  folders: string[];
}

/** Must be called synchronously inside the drop handler: the browser clears the list afterwards. */
export function collectDeviceFiles(dt: DataTransfer): DroppedFiles {
  const files: File[] = [];
  const folders: string[] = [];
  const items = Array.from(dt.items ?? []);
  if (items.length) {
    for (const item of items) {
      if (item.kind !== 'file') continue;
      const entry = typeof item.webkitGetAsEntry === 'function' ? item.webkitGetAsEntry() : null;
      if (entry?.isDirectory) {
        folders.push(entry.name);
        continue;
      }
      const file = item.getAsFile();
      if (file) files.push(file);
    }
  } else {
    files.push(...Array.from(dt.files ?? []));
  }
  return { files, folders };
}

/** Turn a device file name into a valid archive name. */
export function safeName(raw: string): string {
  let name = raw.replace(/[\\/:*?"<>|]/g, '_').replace(/[\u0000-\u001f]/g, '').trim(); // eslint-disable-line no-control-regex
  name = name.replace(/^-+/, '');
  if (name.length > 80) {
    const dot = name.lastIndexOf('.');
    const ext = dot > 0 && name.length - dot <= 10 ? name.slice(dot) : '';
    name = name.slice(0, 80 - ext.length) + ext;
  }
  name = name.replace(/[. ]+$/, '');
  if (!name || name === '.' || name === '..') name = 'Imported file.txt';
  return name;
}

async function readTextFile(file: File): Promise<string> {
  if (file.size > MAX_IMPORT_BYTES) throw new Error('larger than 6 MB');
  if (BINARY_TYPE.test(file.type)) throw new Error('not a text file');
  const head = new Uint8Array(await file.slice(0, 8192).arrayBuffer());
  if (head.includes(0)) throw new Error('not a text file');
  const text = await file.text();
  if (text.length > MAX_FILE_CHARS) throw new Error('too long for the archive');
  return text;
}

export interface ImportResult {
  imported: FSNode[];
  skipped: { name: string; reason: string }[];
}

export async function importDeviceFiles(dropped: DroppedFiles, parentId: string): Promise<ImportResult> {
  const result: ImportResult = {
    imported: [],
    skipped: dropped.folders.map((name) => ({ name, reason: 'folders cannot be imported, only files' })),
  };
  for (const file of dropped.files) {
    try {
      const text = await readTextFile(file);
      result.imported.push(await createFileUnique(parentId, safeName(file.name), text));
    } catch (error) {
      result.skipped.push({ name: file.name, reason: messageOf(error) });
    }
  }
  return result;
}

export interface MoveResult {
  moved: FSNode[];
  errors: string[];
}

/** Move nodes into a folder. Items already there, or the folder itself, are skipped quietly. */
export async function moveNodesInto(ids: string[], destId: string): Promise<MoveResult> {
  const result: MoveResult = { moved: [], errors: [] };
  for (const id of ids) {
    if (id === destId) continue;
    try {
      const node = await getNode(id);
      if (!node || node.parentId === destId) continue;
      result.moved.push(await moveNode(id, destId));
    } catch (error) {
      result.errors.push(messageOf(error));
    }
  }
  return result;
}
