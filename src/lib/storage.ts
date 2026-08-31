import { migrate, type AppState } from './schema';

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
