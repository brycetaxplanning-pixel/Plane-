/* Offline shell for Plane.
   Navigations are network-first so a deploy is picked up immediately, with the
   cached shell as the offline fallback. Static assets are cache-first because
   Vite fingerprints their filenames. */

const CACHE = 'plane-v2';
const SHELL = './index.html';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll([SHELL, './manifest.webmanifest', './notify-core.js'])).then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // never touch API calls

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(SHELL, copy));
          return res;
        })
        .catch(() => caches.match(SHELL).then((hit) => hit ?? Response.error())),
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((hit) => hit ?? fetch(request).then((res) => {
      if (res.ok && res.type === 'basic') {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(request, copy));
      }
      return res;
    })),
  );
});

/* ---------- push ----------
   The push itself carries nothing. Everything shown here is read back out of
   IndexedDB on this device, written by the app when the schedule last changed.
   That is the whole point of the design: the server knows when, never what. */

importScripts('./notify-core.js');

const DB_NAME = 'plane-wakes';
const STORE = 'wakes';

function openDB() {
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

async function readWakes() {
  try {
    const db = await openDB();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return [];
  }
}

self.addEventListener('push', (event) => {
  event.waitUntil((async () => {
    const wakes = await readWakes();
    const plan = self.PlaneNotify.buildNotification(wakes, Date.now());

    // A push with nothing to say still has to show something — every browser
    // requires it — so say the honest thing rather than inventing a nudge.
    const shown = plan ?? {
      title: 'Plane',
      body: 'Something was due. Open the app to see what.',
      tag: 'plane',
      data: { to: 'launcher', tab: null },
    };

    await self.registration.showNotification(shown.title, {
      body: shown.body,
      tag: shown.tag,
      icon: './icons/icon-192.png',
      badge: './icons/icon-192.png',
      data: shown.data,
      renotify: false,
    });
  })());
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = self.PlaneNotify.urlFor(event.notification.data, self.registration.scope);

  event.waitUntil((async () => {
    const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of clients) {
      if (client.url.startsWith(self.registration.scope)) {
        await client.focus();
        if ('navigate' in client) await client.navigate(url);
        return;
      }
    }
    await self.clients.openWindow(url);
  })());
});
