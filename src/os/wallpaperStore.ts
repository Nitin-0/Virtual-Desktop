/**
 * Wallpapers uploaded from the computer. The image file is copied into its own
 * IndexedDB database in this browser (separate from the file archive), and
 * shown through a blob: URL. Nothing is uploaded to a server.
 */
import { uid } from './util';

const DB_NAME = 'aincrad-os-wallpapers';
const STORE = 'images';
export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;
const ACCEPTED = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif'];
export const ACCEPT_ATTR = ACCEPTED.join(',');

interface StoredImage {
  id: string;
  name: string;
  type: string;
  size: number;
  width: number;
  height: number;
  createdAt: number;
  blob: Blob;
}

let dbPromise: Promise<IDBDatabase> | null = null;

function open(): Promise<IDBDatabase> {
  if (typeof indexedDB === 'undefined') return Promise.reject(new Error('IndexedDB is not available in this browser.'));
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE, { keyPath: 'id' });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => {
        dbPromise = null;
        reject(request.error ?? new Error('Could not open wallpaper storage.'));
      };
    });
  }
  return dbPromise;
}

async function run<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const request = fn(tx.objectStore(STORE));
    let result: T;
    request.onsuccess = () => { result = request.result; };
    tx.oncomplete = () => resolve(result);
    tx.onerror = () => reject(tx.error ?? new Error('Wallpaper storage failed.'));
    tx.onabort = () => reject(tx.error ?? new Error('Wallpaper storage was aborted. The browser may be out of space.'));
  });
}

async function measure(file: Blob): Promise<{ width: number; height: number }> {
  try {
    const bitmap = await createImageBitmap(file);
    const size = { width: bitmap.width, height: bitmap.height };
    bitmap.close();
    return size;
  } catch {
    throw new Error('That file could not be read as an image.');
  }
}

/** Copy an image file into browser storage. Returns the new wallpaper id (`file-…`). */
export async function saveWallpaperFile(file: File): Promise<{ id: string; width: number; height: number }> {
  if (!ACCEPTED.includes(file.type)) throw new Error('Use a JPG, PNG, WebP, GIF, or AVIF image.');
  if (file.size > MAX_UPLOAD_BYTES) throw new Error('That image is larger than 20 MB.');
  const { width, height } = await measure(file);
  const id = `file-${uid().slice(0, 12)}`;
  const record: StoredImage = { id, name: file.name, type: file.type, size: file.size, width, height, createdAt: Date.now(), blob: file };
  await run('readwrite', (store) => store.put(record));
  return { id, width, height };
}

const urls = new Map<string, string>();

/** A blob: URL for a stored wallpaper, or null if it is no longer stored. */
export async function wallpaperFileUrl(id: string): Promise<string | null> {
  const cached = urls.get(id);
  if (cached) return cached;
  const record = await run<StoredImage | undefined>('readonly', (store) => store.get(id));
  if (!record) return null;
  const url = URL.createObjectURL(record.blob);
  urls.set(id, url);
  return url;
}

export async function deleteWallpaperFile(id: string): Promise<void> {
  await run('readwrite', (store) => store.delete(id));
  const url = urls.get(id);
  if (url) URL.revokeObjectURL(url);
  urls.delete(id);
}

/** Remove stored images that no saved wallpaper refers to (e.g. after preferences were cleared). */
export async function pruneWallpaperFiles(keep: string[]): Promise<number> {
  const ids = await run<IDBValidKey[]>('readonly', (store) => store.getAllKeys());
  const stale = ids.map(String).filter((id) => !keep.includes(id));
  for (const id of stale) await deleteWallpaperFile(id);
  return stale.length;
}

export async function wallpaperFilesSize(): Promise<number> {
  const records = await run<StoredImage[]>('readonly', (store) => store.getAll());
  return records.reduce((sum, record) => sum + record.size, 0);
}
