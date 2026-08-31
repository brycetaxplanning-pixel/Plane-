import { migrate, type AppState } from './schema';
import { getImage, putImage } from './images';

/** Everything the app needs from persistence. A cloud-sync backend can
 *  implement this same interface later without touching the UI or reducer. */
export interface StorageAdapter {
  readonly name: string;
  load(): Promise<AppState | null>;
  save(state: AppState): Promise<void>;
  clear(): Promise<void>;
}

const KEY = 'plane.state.v1';

export class LocalStorageAdapter implements StorageAdapter {
  readonly name = 'local';

  async load(): Promise<AppState | null> {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return null;
      return migrate(JSON.parse(raw));
    } catch (err) {
      console.error('[storage] load failed, starting fresh', err);
      return null;
    }
  }

  async save(state: AppState): Promise<void> {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch (err) {
      // Quota is the realistic failure here; surfacing it beats a silent no-op.
      console.error('[storage] save failed', err);
      throw err;
    }
  }

  async clear(): Promise<void> {
    localStorage.removeItem(KEY);
  }
}

/** Used when localStorage is unavailable (private mode, blocked site data). */
export class MemoryAdapter implements StorageAdapter {
  readonly name = 'memory';
  private state: AppState | null = null;
  async load() { return this.state; }
  async save(state: AppState) { this.state = state; }
  async clear() { this.state = null; }
}

export function createAdapter(): StorageAdapter {
  try {
    const probe = '__plane_probe__';
    localStorage.setItem(probe, '1');
    localStorage.removeItem(probe);
    return new LocalStorageAdapter();
  } catch {
    console.warn('[storage] localStorage unavailable — data will not persist');
    return new MemoryAdapter();
  }
}

export function exportJSON(state: AppState): string {
  return JSON.stringify(state, null, 2);
}

export function importJSON(text: string): AppState {
  return migrate(JSON.parse(text));
}

export function downloadFile(filename: string, contents: string, mime = 'application/json') {
  const blob = new Blob([contents], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/* ---------------- backups ----------------
   Photos live in IndexedDB, outside the state blob, but a backup has to be one
   file you can email yourself. So they are inlined on the way out and put back
   on the way in. The file's shape is unchanged from before the photos moved,
   which means an old backup still imports and a new one still opens anywhere. */

/** State with every photo inlined, ready to be written to a file. */
export async function exportBundle(state: AppState): Promise<string> {
  const items = await Promise.all(
    state.goals.items.map(async (g) => {
      if (!g.imageId) return g;
      const dataUrl = await getImage(g.imageId);
      // A missing photo drops the reference rather than exporting a dangling
      // id that would import as a broken card.
      return dataUrl ? { ...g, image: dataUrl } : { ...g, imageId: undefined };
    }),
  );
  return exportJSON({ ...state, goals: { ...state.goals, items } });
}

/** Reads a backup, moving any inlined photos into the image store. */
export async function importBundle(text: string): Promise<AppState> {
  const state = importJSON(text);
  return absorbImages(state);
}

/**
 * Moves inline photos out of the state and into the image store, returning the
 * state that should be kept. Used both by import and, on load, to lift an older
 * save that still has its photos inline.
 */
export async function absorbImages(state: AppState): Promise<AppState> {
  if (!state.goals.items.some((g) => g.image)) return state;

  const items = await Promise.all(
    state.goals.items.map(async (g) => {
      if (!g.image) return g;
      try {
        const id = await putImage(g.image, g.imageId);
        return { ...g, imageId: id, image: undefined };
      } catch {
        // If IndexedDB is unavailable the photo stays where it is. That costs
        // storage space, which is better than losing the picture.
        return g;
      }
    }),
  );

  return { ...state, goals: { ...state.goals, items } };
}
