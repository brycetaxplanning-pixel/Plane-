/**
 * Photos, kept out of the state blob.
 *
 * A goal's photo is a data URL of a hundred kilobytes or so. Stored inline in
 * the app state, a handful of them is most of localStorage's five megabytes,
 * and the app starts failing to save a year of transactions because of three
 * pictures of a car. IndexedDB has orders of magnitude more room and no
 * practical limit at this scale, so the pictures live there and the state keeps
 * only an id.
 *
 * They are still in the backup file: `exportBundle` inlines them on the way out
 * and `importBundle` puts them back, so a backup stays one self-contained file.
 */

import { uid } from './id';

const DB_NAME = 'plane-images';
const STORE = 'images';

export interface StoredImage {
  id: string;
  /** A data URL, as produced by the resizer. */
  dataUrl: string;
  bytes: number;
  createdAt: number;
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

const tx = async <T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> => {
  const db = await openDB();
  return new Promise<T>((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const req = fn(t.objectStore(STORE));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
};

export async function putImage(dataUrl: string, id = uid('img')): Promise<string> {
  await tx('readwrite', (store) =>
    store.put({ id, dataUrl, bytes: dataUrl.length, createdAt: Date.now() } satisfies StoredImage),
  );
  return id;
}

/** Null rather than a throw for a missing image: a card with a broken photo
 *  should still render, showing its emoji. */
export async function getImage(id: string): Promise<string | null> {
  try {
    const row = await tx<StoredImage | undefined>('readonly', (store) => store.get(id));
    return row?.dataUrl ?? null;
  } catch {
    return null;
  }
}

export async function deleteImage(id: string): Promise<void> {
  try {
    await tx('readwrite', (store) => store.delete(id));
  } catch {
    // A photo that cannot be deleted is a few kilobytes, not a problem worth
    // failing the delete of the goal it belonged to.
  }
}

export async function allImages(): Promise<StoredImage[]> {
  try {
    return await tx<StoredImage[]>('readonly', (store) => store.getAll());
  } catch {
    return [];
  }
}

export async function imageBytes(): Promise<number> {
  return (await allImages()).reduce((n, i) => n + i.bytes, 0);
}

/** Removes anything no goal points at any more — a photo replaced mid-edit and
 *  then abandoned, or one orphaned by an import. */
export async function pruneImages(keep: Set<string>): Promise<number> {
  const rows = await allImages();
  const dead = rows.filter((r) => !keep.has(r.id));
  for (const r of dead) await deleteImage(r.id);
  return dead.length;
}
