/**
 * Turning notifications on: ask the browser, hand the subscription to the
 * server, and keep the wake schedule in sync.
 *
 * The split is the whole design. Times go to the server; wording is written
 * into IndexedDB here and read back by the service worker when a push lands.
 */

import type { AppState } from './schema';
import { timesOnly, wakePlan, type Wake } from './wakes';

const DB_NAME = 'plane-wakes';
const STORE = 'wakes';

export const pushSupported = (): boolean =>
  typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

/* ---------------- the on-device mirror ---------------- */

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'tag' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** Replaces the stored wakes wholesale, so nothing stale can be shown. */
export async function writeWakes(wakes: Wake[]): Promise<void> {
  const db = await openDB();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    const store = tx.objectStore(STORE);
    store.clear();
    for (const w of wakes) store.put(w);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function readWakes(): Promise<Wake[]> {
  try {
    const db = await openDB();
    return await new Promise<Wake[]>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).getAll();
      req.onsuccess = () => resolve(req.result as Wake[]);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return [];
  }
}

/* ---------------- the server ---------------- */

export interface PushDevice {
  deviceId: string;
  secret: string;
  server: string;
}

const api = async (server: string, path: string, body: unknown, device?: PushDevice) => {
  const res = await fetch(server.replace(/\/$/, '') + path, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(device ? { authorization: `Bearer ${device.deviceId}:${device.secret}` } : {}),
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`${res.status}${text ? `: ${text.slice(0, 120)}` : ''}`);
  }
  return res.json();
};

/** The server publishes the VAPID key its pushes are signed with. */
export async function serverKey(server: string): Promise<string> {
  const res = await fetch(server.replace(/\/$/, '') + '/health');
  if (!res.ok) throw new Error(`the server answered ${res.status}`);
  const body = await res.json();
  if (!body.vapid) throw new Error('that server has no VAPID key configured');
  return body.vapid as string;
}

const urlB64ToBytes = (s: string): Uint8Array => {
  const pad = (s + '='.repeat((4 - (s.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(pad), (c) => c.charCodeAt(0));
};

/**
 * Asks the browser, then registers with the server. Throws with something
 * readable at every step that can fail, because "notifications didn't work"
 * is the least useful error message there is.
 */
export async function enablePush(server: string): Promise<PushDevice> {
  if (!pushSupported()) throw new Error('This browser cannot do push notifications.');

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    throw new Error(
      permission === 'denied'
        ? 'Notifications are blocked for this site. Turn them back on in the browser settings for this page.'
        : 'Notifications were not allowed.',
    );
  }

  const key = await serverKey(server);
  const reg = await navigator.serviceWorker.ready;

  const existing = await reg.pushManager.getSubscription();
  if (existing) await existing.unsubscribe();

  const sub = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlB64ToBytes(key) as BufferSource,
  });

  const out = await api(server, '/subscribe', { subscription: sub.toJSON() }) as { deviceId: string; secret: string };
  return { ...out, server };
}

export async function disablePush(device: PushDevice): Promise<void> {
  await api(device.server, '/unsubscribe', {}, device).catch(() => undefined);
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  if (sub) await sub.unsubscribe();
}

/** Writes the wording here and sends only the times. Safe to call often. */
export async function syncWakes(state: AppState, device: PushDevice | null): Promise<number> {
  const wakes = wakePlan(state);
  await writeWakes(wakes);
  if (!device) return wakes.length;
  await api(device.server, '/schedule', { wakes: timesOnly(wakes) }, device);
  return wakes.length;
}

export const sendTestPush = (device: PushDevice): Promise<unknown> =>
  api(device.server, '/test', {}, device);
