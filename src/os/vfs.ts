/**
 * Virtual filesystem for AINCRAD OS.
 *
 * Every folder and text file lives in IndexedDB on this browser origin.
 * Nothing here reads or writes the user's Windows, macOS, or Linux disk.
 * Inventory and Terminal both call this module, so a change in one is
 * visible to the other as soon as the shared change event fires.
 */
import type { FSNode } from './types';
import { MAX_FILE_CHARS } from './types';
import { baseName, byteSize, joinPath, normalizePath, parentPath, uid, validateName } from './util';

const DB_NAME = 'aincrad-os';
const DB_VERSION = 1;
const STORE = 'nodes';

export const TRASH_ID = 'trash';
export const PROTECTED_IDS = new Set(['root', 'home', 'desktop', 'system', TRASH_ID]);

const WELCOME = `AINCRAD OS — Virtual Archive
============================

This text file lives in a virtual filesystem stored in this browser's IndexedDB.
It is not a file on your Windows, macOS, or Linux disk, and it is not a native
Windows feature.

Inventory and Terminal share this same archive. A folder you create in one
appears in the other.

Try:
  • Inventory — browse, edit, copy, move, and delete
  • Terminal — pwd, ls, cd, mkdir, touch, cat, write
  • Codex — notes with autosave
  • Settings — theme, wallpaper, sound, export

Your archive persists after refresh on this device and browser profile.
Clearing site data, or using Settings → Erase archive, removes it.
Export a JSON copy from Settings if you want a backup you can download.
`;

const NOTES = `Field notes
===========

The archive and the desktop are the same system.

- Folders created in Terminal show up in Inventory.
- Text saved in Codex is a file in the archive.
- Items in /Desktop appear as icons on the virtual desktop.
- /Home, /Desktop, and /System cannot be deleted or renamed.
- This is still not your computer's real filesystem.
`;

const README = `System readme
=============

AINCRAD OS ${'1.0.0'} keeps its archive in IndexedDB and its preferences in
localStorage. There is no server and no account.

Protected folders: /Home, /Desktop, /System.
You can add and remove their contents.

Terminal and Inventory are two views of this store. They are not a host shell
and not File Explorer.
`;

const DESKTOP_NOTE = `This icon is a text file in /Desktop of the virtual archive.
It is not a file on your computer's desktop.

Open it to edit. Right-click to rename or delete.
Folders you create here also appear as desktop icons.
`;

type Listener = () => void;
const listeners = new Set<Listener>();

export function onVfsChange(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function emit(): void {
  listeners.forEach((listener) => {
    try {
      listener();
    } catch {
      /* A broken listener must not break the archive. */
    }
  });
}

let chain: Promise<unknown> = Promise.resolve();

function lock<T>(fn: () => Promise<T>): Promise<T> {
  const run = chain.then(fn, fn);
  chain = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

let dbPromise: Promise<IDBDatabase> | null = null;

function openDatabase(): Promise<IDBDatabase> {
  if (typeof indexedDB === 'undefined') {
    return Promise.reject(new Error('IndexedDB is not available in this browser. AINCRAD OS needs it for the virtual archive.'));
  }
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE)) {
          const store = db.createObjectStore(STORE, { keyPath: 'id' });
          store.createIndex('parentId', 'parentId', { unique: false });
        }
      };
      request.onsuccess = () => {
        const db = request.result;
        db.onversionchange = () => db.close();
        resolve(db);
      };
      request.onerror = () => {
        dbPromise = null;
        reject(request.error ?? new Error('Could not open the virtual archive.'));
      };
      request.onblocked = () => {
        dbPromise = null;
        reject(new Error('The archive is blocked by another tab. Close other AINCRAD OS tabs and retry.'));
      };
    });
  }
  return dbPromise;
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Archive request failed.'));
  });
}

async function withStore<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T> | Promise<T> | T): Promise<T> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    let settled = false;
    const finish = (value: T) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };
    const fail = (error: unknown) => {
      if (settled) return;
      settled = true;
      reject(error instanceof Error ? error : new Error('Archive transaction failed.'));
    };
    tx.onerror = () => fail(tx.error ?? new Error('Archive transaction failed.'));
    tx.onabort = () => fail(tx.error ?? new Error('Archive transaction aborted.'));
    try {
      const result = fn(tx.objectStore(STORE));
      if (result instanceof IDBRequest) {
        result.onsuccess = () => finish(result.result);
        result.onerror = () => fail(result.error ?? new Error('Archive request failed.'));
      } else {
        Promise.resolve(result).then(finish, fail);
      }
    } catch (error) {
      fail(error);
    }
  });
}

async function getUnlocked(id: string): Promise<FSNode | null> {
  const node = await withStore<FSNode | undefined>('readonly', (store) => store.get(id));
  return node ?? null;
}

async function putUnlocked(node: FSNode): Promise<void> {
  await withStore('readwrite', (store) => store.put(node));
}

async function removeUnlocked(id: string): Promise<void> {
  await withStore('readwrite', (store) => store.delete(id));
}

async function listUnlocked(parentId: string): Promise<FSNode[]> {
  const nodes = await withStore<FSNode[]>('readonly', (store) => store.index('parentId').getAll(parentId));
  return (nodes ?? []).slice().sort(compareNodes);
}

async function getAllUnlocked(): Promise<FSNode[]> {
  const nodes = await withStore<FSNode[]>('readonly', (store) => store.getAll());
  return nodes ?? [];
}

function compareNodes(a: FSNode, b: FSNode): number {
  if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;
  return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
}

function displayName(node: FSNode): string {
  if (node.id === 'root') return 'Archive';
  return node.name || 'Archive';
}

async function mustGet(id: string): Promise<FSNode> {
  const node = await getUnlocked(id);
  if (!node) throw new Error('That item is no longer in the archive.');
  return node;
}

async function findChild(parentId: string, name: string): Promise<FSNode | null> {
  const children = await listUnlocked(parentId);
  return children.find((child) => child.name === name) ?? null;
}

async function uniqueName(parentId: string, desired: string): Promise<string> {
  const children = await listUnlocked(parentId);
  const names = new Set(children.map((child) => child.name));
  if (!names.has(desired)) return desired;
  const dot = desired.lastIndexOf('.');
  const hasExt = dot > 0;
  const stem = hasExt ? desired.slice(0, dot) : desired;
  const ext = hasExt ? desired.slice(dot) : '';
  let candidate = `${stem} copy${ext}`;
  let n = 2;
  while (names.has(candidate)) {
    candidate = `${stem} copy ${n}${ext}`;
    n += 1;
  }
  return candidate;
}

async function isUnder(ancestorId: string, nodeId: string): Promise<boolean> {
  let current = await getUnlocked(nodeId);
  const guard = new Set<string>();
  while (current) {
    if (current.id === ancestorId) return true;
    if (!current.parentId || guard.has(current.id)) return false;
    guard.add(current.id);
    current = await getUnlocked(current.parentId);
  }
  return false;
}

async function pathOfUnlocked(id: string): Promise<string> {
  if (id === 'root') return '/';
  const names: string[] = [];
  let current = await getUnlocked(id);
  const guard = new Set<string>();
  while (current && current.id !== 'root') {
    if (guard.has(current.id)) break;
    guard.add(current.id);
    names.push(current.name);
    if (!current.parentId) break;
    current = await getUnlocked(current.parentId);
  }
  return `/${names.reverse().join('/')}`;
}

async function getByPathUnlocked(path: string): Promise<FSNode | null> {
  const normalized = normalizePath(path);
  if (normalized === '/') return getUnlocked('root');
  const parts = normalized.split('/').filter(Boolean);
  let current = await getUnlocked('root');
  if (!current) return null;
  for (const part of parts) {
    const next = await findChild(current.id, part);
    if (!next) return null;
    current = next;
  }
  return current;
}

async function mustPath(path: string): Promise<FSNode> {
  const node = await getByPathUnlocked(path);
  if (!node) throw new Error(`No such path: ${normalizePath(path)}`);
  return node;
}

async function mustFolder(path: string): Promise<FSNode> {
  const node = await mustPath(path);
  if (node.type !== 'folder') throw new Error(`Not a directory: ${normalizePath(path)}`);
  return node;
}

function assertName(name: string): string {
  const trimmed = name.trim();
  const error = validateName(trimmed);
  if (error) throw new Error(error);
  return trimmed;
}

function assertCapacity(content: string): void {
  if (content.length > MAX_FILE_CHARS) {
    throw new Error(`File is too large for the archive (limit ${MAX_FILE_CHARS.toLocaleString()} characters).`);
  }
}

async function createFolderUnlocked(parentId: string, rawName: string): Promise<FSNode> {
  const parent = await mustGet(parentId);
  if (parent.type !== 'folder') throw new Error('Cannot create a folder inside a file.');
  const name = assertName(rawName);
  if (await findChild(parentId, name)) throw new Error(`Already exists: ${name}`);
  const now = Date.now();
  const node: FSNode = {
    id: uid(),
    name,
    parentId,
    type: 'folder',
    content: '',
    createdAt: now,
    modifiedAt: now,
  };
  await putUnlocked(node);
  return node;
}

async function createFileUnlocked(parentId: string, rawName: string, content: string): Promise<FSNode> {
  const parent = await mustGet(parentId);
  if (parent.type !== 'folder') throw new Error('Cannot create a file inside a file.');
  const name = assertName(rawName);
  if (await findChild(parentId, name)) throw new Error(`Already exists: ${name}`);
  assertCapacity(content);
  const now = Date.now();
  const node: FSNode = {
    id: uid(),
    name,
    parentId,
    type: 'file',
    content,
    createdAt: now,
    modifiedAt: now,
  };
  await putUnlocked(node);
  return node;
}

async function copyUnlocked(id: string, destParentId: string, newName?: string): Promise<FSNode> {
  const node = await mustGet(id);
  if (node.id === 'root') throw new Error('Cannot copy the archive root.');
  const destParent = await mustGet(destParentId);
  if (destParent.type !== 'folder') throw new Error('Destination is not a folder.');
  if (node.type === 'folder' && (node.id === destParentId || await isUnder(node.id, destParentId))) {
    throw new Error('Cannot copy a folder into itself.');
  }
  const name = newName ? assertName(newName) : await uniqueName(destParentId, node.name);
  if (newName && await findChild(destParentId, name)) throw new Error(`Already exists: ${name}`);
  assertCapacity(node.content);
  const now = Date.now();
  const copy: FSNode = {
    id: uid(),
    name,
    parentId: destParentId,
    type: node.type,
    content: node.content,
    createdAt: now,
    modifiedAt: now,
  };
  await putUnlocked(copy);
  if (node.type === 'folder') {
    const children = await listUnlocked(node.id);
    for (const child of children) await copyUnlocked(child.id, copy.id);
  }
  return copy;
}

async function moveUnlocked(id: string, destParentId: string, newName?: string): Promise<FSNode> {
  const node = await mustGet(id);
  if (PROTECTED_IDS.has(node.id)) throw new Error(`${displayName(node)} is a protected system folder.`);
  const destParent = await mustGet(destParentId);
  if (destParent.type !== 'folder') throw new Error('Destination is not a folder.');
  if (node.type === 'folder' && (node.id === destParentId || await isUnder(node.id, destParentId))) {
    throw new Error('Cannot move a folder into itself.');
  }
  const intoTrash = destParentId === TRASH_ID && node.parentId !== TRASH_ID;
  const name = newName ? assertName(newName) : intoTrash ? await uniqueName(TRASH_ID, node.name) : node.name;
  const clash = await findChild(destParentId, name);
  if (clash && clash.id !== node.id) throw new Error(`Already exists: ${name}`);
  const now = Date.now();
  const next: FSNode = { ...node, name, parentId: destParentId, modifiedAt: now };
  if (intoTrash) {
    next.trashedFrom = node.parentId ?? undefined;
    next.trashedName = node.name;
    next.trashedAt = now;
  } else if (destParentId !== TRASH_ID) {
    delete next.trashedFrom;
    delete next.trashedName;
    delete next.trashedAt;
  }
  await putUnlocked(next);
  return next;
}

async function deleteUnlocked(id: string, recursive: boolean): Promise<void> {
  const node = await mustGet(id);
  if (PROTECTED_IDS.has(node.id)) throw new Error(`${displayName(node)} is a protected system folder.`);
  if (node.type === 'folder') {
    const children = await listUnlocked(id);
    if (children.length && !recursive) throw new Error('Folder is not empty. Use rm -r to delete it and its contents.');
    for (const child of children) await deleteUnlocked(child.id, true);
  }
  await removeUnlocked(id);
}

function seedNodes(now: number): FSNode[] {
  return [
    { id: 'root', name: '', parentId: null, type: 'folder', content: '', createdAt: now, modifiedAt: now },
    { id: 'home', name: 'Home', parentId: 'root', type: 'folder', content: '', createdAt: now, modifiedAt: now },
    { id: 'desktop', name: 'Desktop', parentId: 'root', type: 'folder', content: '', createdAt: now, modifiedAt: now },
    { id: 'system', name: 'System', parentId: 'root', type: 'folder', content: '', createdAt: now, modifiedAt: now },
    { id: TRASH_ID, name: 'Trash', parentId: 'root', type: 'folder', content: '', createdAt: now, modifiedAt: now },
    { id: 'documents', name: 'Documents', parentId: 'home', type: 'folder', content: '', createdAt: now, modifiedAt: now },
    { id: 'welcome', name: 'Welcome.txt', parentId: 'documents', type: 'file', content: WELCOME, createdAt: now, modifiedAt: now },
    { id: 'field-notes', name: 'Field Notes.txt', parentId: 'documents', type: 'file', content: NOTES, createdAt: now, modifiedAt: now },
    { id: 'readme', name: 'Readme.txt', parentId: 'system', type: 'file', content: README, createdAt: now, modifiedAt: now },
    { id: 'desktop-note', name: 'Read Me.txt', parentId: 'desktop', type: 'file', content: DESKTOP_NOTE, createdAt: now, modifiedAt: now },
  ];
}

async function writeNodes(nodes: FSNode[]): Promise<void> {
  const db = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    const store = tx.objectStore(STORE);
    store.clear();
    for (const node of nodes) store.put(node);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('Could not write the archive.'));
    tx.onabort = () => reject(tx.error ?? new Error('Archive write aborted.'));
  });
}

/** Archives created before Trash existed, or imported without it, get one. */
async function ensureTrashUnlocked(): Promise<void> {
  const existing = await getUnlocked(TRASH_ID);
  if (existing?.type === 'folder' && existing.parentId === 'root') return;
  const now = Date.now();
  await putUnlocked({
    id: TRASH_ID,
    name: await uniqueName('root', 'Trash'),
    parentId: 'root',
    type: 'folder',
    content: '',
    createdAt: existing?.createdAt ?? now,
    modifiedAt: now,
  });
}

let initOnce: Promise<void> | null = null;

export function initVfs(): Promise<void> {
  if (!initOnce) {
    initOnce = lock(async () => {
      await openDatabase();
      const root = await getUnlocked('root');
      if (!root) await writeNodes(seedNodes(Date.now()));
      else await ensureTrashUnlocked();
    }).catch((error) => {
      initOnce = null;
      throw error;
    });
  }
  return initOnce;
}

export function list(parentId: string): Promise<FSNode[]> {
  return lock(() => listUnlocked(parentId));
}

export function getNode(id: string): Promise<FSNode | null> {
  return lock(() => getUnlocked(id));
}

export function getByPath(path: string): Promise<FSNode | null> {
  return lock(() => getByPathUnlocked(path));
}

export function pathOf(id: string): Promise<string> {
  return lock(() => pathOfUnlocked(id));
}

export async function createFolder(parentId: string, name: string): Promise<FSNode> {
  const node = await lock(() => createFolderUnlocked(parentId, name));
  emit();
  return node;
}

export async function createFile(parentId: string, name: string, content = ''): Promise<FSNode> {
  const node = await lock(() => createFileUnlocked(parentId, name, content));
  emit();
  return node;
}

/** Move an item to /Trash. It keeps its contents and remembers where it came from. */
export async function trashNode(id: string): Promise<FSNode> {
  const node = await lock(async () => {
    if (await isUnder(TRASH_ID, id)) throw new Error('Already in Trash.');
    return moveUnlocked(id, TRASH_ID);
  });
  emit();
  return node;
}

/** Put an item from the top of /Trash back where it came from (or /Home if that folder is gone). */
export async function restoreNode(id: string): Promise<{ node: FSNode; path: string }> {
  const result = await lock(async () => {
    const node = await mustGet(id);
    if (node.parentId !== TRASH_ID) throw new Error('Only items at the top of Trash can be restored.');
    let dest = node.trashedFrom ? await getUnlocked(node.trashedFrom) : null;
    if (!dest || dest.type !== 'folder' || await isUnder(TRASH_ID, dest.id)) dest = await getUnlocked('home');
    if (!dest) throw new Error('Home folder is missing. Reset the archive from Settings.');
    const name = await uniqueName(dest.id, node.trashedName ?? node.name);
    const next: FSNode = { ...node, name, parentId: dest.id, modifiedAt: Date.now() };
    delete next.trashedFrom;
    delete next.trashedName;
    delete next.trashedAt;
    await putUnlocked(next);
    return { node: next, path: await pathOfUnlocked(next.id) };
  });
  emit();
  return result;
}

/** Permanently delete everything in /Trash. Returns how many top-level items were removed. */
export async function emptyTrash(): Promise<number> {
  const count = await lock(async () => {
    const children = await listUnlocked(TRASH_ID);
    for (const child of children) await deleteUnlocked(child.id, true);
    return children.length;
  });
  emit();
  return count;
}

/** True for anything inside /Trash (not Trash itself). */
export function isInTrash(id: string): Promise<boolean> {
  return lock(async () => id !== TRASH_ID && isUnder(TRASH_ID, id));
}

/**
 * Terminal rm / rmdir: items outside Trash move to Trash; items already in Trash are deleted for good.
 * Folders need `recursive`, or must be empty when `emptyOnly` is set.
 */
export async function discardPath(path: string, opts: { recursive: boolean; emptyOnly?: boolean }): Promise<'trashed' | 'deleted'> {
  const outcome = await lock(async () => {
    const node = await mustPath(path);
    if (opts.emptyOnly) {
      if (node.type !== 'folder') throw new Error(`Not a directory: ${normalizePath(path)}`);
      if ((await listUnlocked(node.id)).length) throw new Error('Folder is not empty. Use rm -r to remove it and its contents.');
    } else if (node.type === 'folder' && !opts.recursive) {
      throw new Error(`Is a directory: ${normalizePath(path)}`);
    }
    if (PROTECTED_IDS.has(node.id)) throw new Error(`${displayName(node)} is a protected system folder.`);
    if (node.id !== TRASH_ID && await isUnder(TRASH_ID, node.id)) {
      await deleteUnlocked(node.id, true);
      return 'deleted' as const;
    }
    await moveUnlocked(node.id, TRASH_ID);
    return 'trashed' as const;
  });
  emit();
  return outcome;
}

/** Create a file, renaming to "name copy.ext" (then "copy 2", …) if the name is taken. */
export async function createFileUnique(parentId: string, desiredName: string, content: string): Promise<FSNode> {
  const node = await lock(async () => {
    const name = await uniqueName(parentId, assertName(desiredName));
    return createFileUnlocked(parentId, name, content);
  });
  emit();
  return node;
}

export async function writeContent(id: string, content: string): Promise<FSNode> {
  const node = await lock(async () => {
    const current = await mustGet(id);
    if (current.type !== 'file') throw new Error('Cannot write text into a folder.');
    assertCapacity(content);
    const next = { ...current, content, modifiedAt: Date.now() };
    await putUnlocked(next);
    return next;
  });
  emit();
  return node;
}

export async function renameNode(id: string, name: string): Promise<FSNode> {
  const node = await lock(async () => {
    const current = await mustGet(id);
    if (PROTECTED_IDS.has(current.id)) throw new Error(`${displayName(current)} is a protected system folder.`);
    if (!current.parentId) throw new Error('The archive root cannot be renamed.');
    return moveUnlocked(id, current.parentId, name);
  });
  emit();
  return node;
}

export async function removeNode(id: string, recursive: boolean): Promise<void> {
  await lock(() => deleteUnlocked(id, recursive));
  emit();
}

export async function moveNode(id: string, destParentId: string, newName?: string): Promise<FSNode> {
  const node = await lock(() => moveUnlocked(id, destParentId, newName));
  emit();
  return node;
}

export async function copyNode(id: string, destParentId: string, newName?: string): Promise<FSNode> {
  const node = await lock(() => copyUnlocked(id, destParentId, newName));
  emit();
  return node;
}

export async function searchArchive(query: string, fromId = 'root'): Promise<{ node: FSNode; path: string }[]> {
  return lock(async () => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const out: { node: FSNode; path: string }[] = [];
    const start = await getUnlocked(fromId);
    if (!start) return [];
    const startPath = await pathOfUnlocked(fromId);
    async function walk(id: string, basePath: string): Promise<void> {
      if (out.length >= 200) return;
      const children = await listUnlocked(id);
      for (const child of children) {
        const childPath = basePath === '/' ? `/${child.name}` : `${basePath}/${child.name}`;
        if (child.name.toLowerCase().includes(q)) out.push({ node: child, path: childPath });
        if (child.type === 'folder') await walk(child.id, childPath);
        if (out.length >= 200) return;
      }
    }
    if (start.type === 'folder') await walk(start.id, startPath);
    return out;
  });
}

/** Every folder outside /Trash with its path and depth, in tree order (for "Move to…"). */
export async function listFolders(): Promise<{ node: FSNode; path: string; depth: number }[]> {
  return lock(async () => {
    const nodes = await getAllUnlocked();
    const byParent = new Map<string, FSNode[]>();
    for (const node of nodes) {
      if (node.type !== 'folder' || !node.parentId) continue;
      const list = byParent.get(node.parentId) ?? [];
      list.push(node);
      byParent.set(node.parentId, list);
    }
    const root = nodes.find((node) => node.id === 'root');
    const out: { node: FSNode; path: string; depth: number }[] = [];
    if (!root) return out;
    const walk = (id: string, path: string, depth: number, guard: Set<string>) => {
      const children = (byParent.get(id) ?? []).filter((child) => child.id !== TRASH_ID).sort(compareNodes);
      for (const child of children) {
        if (guard.has(child.id)) continue;
        guard.add(child.id);
        const childPath = path === '/' ? `/${child.name}` : `${path}/${child.name}`;
        out.push({ node: child, path: childPath, depth });
        walk(child.id, childPath, depth + 1, guard);
      }
    };
    out.push({ node: root, path: '/', depth: 0 });
    walk('root', '/', 1, new Set());
    return out;
  });
}

/** Most recently modified files outside /Trash, newest first, with their paths. */
export async function recentFiles(limit = 5): Promise<{ node: FSNode; path: string }[]> {
  return lock(async () => {
    const nodes = await getAllUnlocked();
    const byId = new Map(nodes.map((node) => [node.id, node]));
    const inTrash = (node: FSNode): boolean => {
      const guard = new Set<string>();
      let current: FSNode | undefined = node;
      while (current?.parentId && !guard.has(current.id)) {
        if (current.parentId === TRASH_ID) return true;
        guard.add(current.id);
        current = byId.get(current.parentId);
      }
      return false;
    };
    const files = nodes
      .filter((node) => node.type === 'file' && !inTrash(node))
      .sort((a, b) => b.modifiedAt - a.modifiedAt)
      .slice(0, limit);
    const out: { node: FSNode; path: string }[] = [];
    for (const node of files) out.push({ node, path: await pathOfUnlocked(node.id) });
    return out;
  });
}

export async function archiveStats(): Promise<{ count: number; files: number; folders: number; bytes: number }> {
  return lock(async () => {
    const nodes = await getAllUnlocked();
    let bytes = 0;
    let files = 0;
    let folders = 0;
    for (const node of nodes) {
      if (node.type === 'file') {
        files += 1;
        bytes += byteSize(node.content);
      } else folders += 1;
    }
    return { count: nodes.length, files, folders, bytes };
  });
}

export async function exportArchive(): Promise<string> {
  const nodes = await lock(() => getAllUnlocked());
  return JSON.stringify(
    {
      format: 'aincrad-archive',
      version: 1,
      exportedAt: new Date().toISOString(),
      note: 'Virtual AINCRAD archive. This is not a copy of a device filesystem.',
      nodes,
    },
    null,
    2,
  );
}

function validateArchive(raw: unknown): FSNode[] {
  if (!raw || typeof raw !== 'object') throw new Error('That file is not an AINCRAD archive.');
  const data = raw as { format?: unknown; version?: unknown; nodes?: unknown };
  if (data.format !== 'aincrad-archive' || data.version !== 1 || !Array.isArray(data.nodes)) {
    throw new Error('Unrecognized archive format. Expected an AINCRAD archive export (version 1).');
  }
  const nodes: FSNode[] = [];
  const ids = new Set<string>();
  for (const item of data.nodes) {
    if (!item || typeof item !== 'object') throw new Error('Archive contains an invalid entry.');
    const node = item as Partial<FSNode>;
    if (typeof node.id !== 'string' || !node.id) throw new Error('Archive entry is missing an id.');
    if (ids.has(node.id)) throw new Error(`Duplicate id in archive: ${node.id}`);
    if (node.type !== 'file' && node.type !== 'folder') throw new Error(`Invalid type for ${node.id}.`);
    if (node.id !== 'root' && typeof node.name !== 'string') throw new Error(`Missing name for ${node.id}.`);
    if (node.id === 'root') {
      if (node.parentId !== null) throw new Error('Archive root is invalid.');
    } else if (typeof node.parentId !== 'string') {
      throw new Error(`Missing parent for ${node.name || node.id}.`);
    }
    const content = typeof node.content === 'string' ? node.content : '';
    if (content.length > MAX_FILE_CHARS) throw new Error(`A file in the archive exceeds the size limit (${node.name || node.id}).`);
    ids.add(node.id);
    nodes.push({
      id: node.id,
      name: node.id === 'root' ? '' : String(node.name),
      parentId: node.id === 'root' ? null : String(node.parentId),
      type: node.type,
      content: node.type === 'folder' ? '' : content,
      createdAt: typeof node.createdAt === 'number' ? node.createdAt : Date.now(),
      modifiedAt: typeof node.modifiedAt === 'number' ? node.modifiedAt : Date.now(),
      ...(typeof node.trashedFrom === 'string' ? { trashedFrom: node.trashedFrom } : {}),
      ...(typeof node.trashedName === 'string' ? { trashedName: node.trashedName } : {}),
      ...(typeof node.trashedAt === 'number' ? { trashedAt: node.trashedAt } : {}),
    });
  }
  for (const required of ['root', 'home', 'desktop', 'system']) {
    if (!ids.has(required)) throw new Error('Archive is missing a required system folder.');
  }
  for (const node of nodes) {
    if (node.parentId && !ids.has(node.parentId)) {
      throw new Error(`Broken parent link for ${node.name || node.id}.`);
    }
  }
  return nodes;
}

export async function importArchive(raw: unknown): Promise<void> {
  const nodes = validateArchive(raw);
  await lock(async () => {
    await writeNodes(nodes);
    await ensureTrashUnlocked();
  });
  emit();
}

export async function resetArchive(): Promise<void> {
  await lock(() => writeNodes(seedNodes(Date.now())));
  emit();
}

export async function ensureDocumentsFolder(): Promise<FSNode> {
  let created = false;
  const node = await lock(async () => {
    const docs = await getByPathUnlocked('/Home/Documents');
    if (docs?.type === 'folder') return docs;
    const home = await getByPathUnlocked('/Home');
    if (!home || home.type !== 'folder') throw new Error('Home folder is missing. Reset the archive from Settings.');
    if (docs) return home;
    created = true;
    return createFolderUnlocked(home.id, 'Documents');
  });
  if (created) emit();
  return node;
}

async function placeCopyOrMove(kind: 'copy' | 'move', srcPath: string, destPath: string): Promise<string> {
  const src = await mustPath(srcPath);
  const destNorm = normalizePath(destPath);
  if (normalizePath(srcPath) === destNorm) throw new Error('Source and destination are the same.');
  const existing = await getByPathUnlocked(destNorm);
  if (existing?.type === 'folder') {
    const placed = kind === 'copy'
      ? await copyUnlocked(src.id, existing.id)
      : await moveUnlocked(src.id, existing.id);
    return pathOfUnlocked(placed.id);
  }
  if (existing?.type === 'file') throw new Error(`Already exists: ${destNorm}`);
  const parent = await mustFolder(parentPath(destNorm));
  const name = baseName(destNorm);
  const placed = kind === 'copy'
    ? await copyUnlocked(src.id, parent.id, name)
    : await moveUnlocked(src.id, parent.id, name);
  return pathOfUnlocked(placed.id);
}

export function listPath(path: string): Promise<FSNode[]> {
  return lock(async () => {
    const folder = await mustFolder(path);
    return listUnlocked(folder.id);
  });
}

export async function mkdirPath(path: string): Promise<string> {
  const created = await lock(async () => {
    const normalized = normalizePath(path);
    if (normalized === '/') throw new Error('Archive root already exists.');
    const parent = await mustFolder(parentPath(normalized));
    return createFolderUnlocked(parent.id, baseName(normalized));
  });
  emit();
  return pathOf(created.id);
}

export async function touchPath(path: string): Promise<string> {
  const id = await lock(async () => {
    const normalized = normalizePath(path);
    const existing = await getByPathUnlocked(normalized);
    if (existing?.type === 'folder') throw new Error(`Is a directory: ${normalized}`);
    if (existing?.type === 'file') {
      const next = { ...existing, modifiedAt: Date.now() };
      await putUnlocked(next);
      return existing.id;
    }
    const parent = await mustFolder(parentPath(normalized));
    const file = await createFileUnlocked(parent.id, baseName(normalized), '');
    return file.id;
  });
  emit();
  return pathOf(id);
}

export function readPath(path: string): Promise<string> {
  return lock(async () => {
    const node = await mustPath(path);
    if (node.type !== 'file') throw new Error(`Is a directory: ${normalizePath(path)}`);
    return node.content;
  });
}

export async function writePath(path: string, content: string, append: boolean): Promise<string> {
  const id = await lock(async () => {
    const normalized = normalizePath(path);
    const existing = await getByPathUnlocked(normalized);
    if (existing?.type === 'folder') throw new Error(`Is a directory: ${normalized}`);
    if (existing?.type === 'file') {
      const nextContent = append
        ? existing.content + content
        : content;
      assertCapacity(nextContent);
      await putUnlocked({ ...existing, content: nextContent, modifiedAt: Date.now() });
      return existing.id;
    }
    if (append) {
      /* Appending to a missing file creates it. */
    }
    const parent = await mustFolder(parentPath(normalized));
    const file = await createFileUnlocked(parent.id, baseName(normalized), content);
    return file.id;
  });
  emit();
  return pathOf(id);
}

export async function renamePath(path: string, newName: string): Promise<string> {
  const node = await lock(async () => {
    const current = await mustPath(path);
    if (!current.parentId) throw new Error('The archive root cannot be renamed.');
    return moveUnlocked(current.id, current.parentId, newName);
  });
  emit();
  return pathOf(node.id);
}

export async function removePath(path: string, recursive: boolean): Promise<void> {
  await lock(async () => {
    const node = await mustPath(path);
    if (node.type === 'folder' && !recursive) {
      throw new Error(`Is a directory: ${normalizePath(path)}`);
    }
    await deleteUnlocked(node.id, node.type === 'folder');
  });
  emit();
}

export async function rmdirPath(path: string): Promise<void> {
  await lock(async () => {
    const node = await mustPath(path);
    if (node.type !== 'folder') throw new Error(`Not a directory: ${normalizePath(path)}`);
    await deleteUnlocked(node.id, false);
  });
  emit();
}

export async function copyPath(src: string, dest: string): Promise<string> {
  const result = await lock(() => placeCopyOrMove('copy', src, dest));
  emit();
  return result;
}

export async function movePath(src: string, dest: string): Promise<string> {
  const result = await lock(() => placeCopyOrMove('move', src, dest));
  emit();
  return result;
}

export function findUnder(path: string, query: string): Promise<{ node: FSNode; path: string }[]> {
  return lock(async () => {
    const folder = await mustFolder(path);
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const out: { node: FSNode; path: string }[] = [];
    const startPath = await pathOfUnlocked(folder.id);
    async function walk(id: string, basePath: string): Promise<void> {
      const children = await listUnlocked(id);
      for (const child of children) {
        const childPath = basePath === '/' ? `/${child.name}` : `${basePath}/${child.name}`;
        if (child.name.toLowerCase().includes(q)) out.push({ node: child, path: childPath });
        if (child.type === 'folder' && out.length < 200) await walk(child.id, childPath);
      }
    }
    await walk(folder.id, startPath);
    return out;
  });
}

export function resolveInput(cwd: string, input: string): string {
  return joinPath(cwd, input);
}

export function isProtected(id: string): boolean {
  return PROTECTED_IDS.has(id);
}

export async function childCount(id: string): Promise<number> {
  const children = await list(id);
  return children.length;
}