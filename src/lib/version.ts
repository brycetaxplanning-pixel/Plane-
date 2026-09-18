/**
 * Which build is running, and which one the server has.
 *
 * A deploy replaces the files on the server; it does not touch a copy of the
 * app that is already open. On a phone that is most of the time — an installed
 * PWA is backgrounded rather than closed, and comes back to the page it was on
 * without ever navigating again, so it can sit on a version from days ago and
 * look exactly like nothing shipped.
 *
 * The service worker cannot answer this on its own. It is network-first for
 * navigations, which is right, but `sw.js` is byte-identical from one deploy to
 * the next, so the browser never installs a new one and no update event ever
 * fires. What changes every deploy is the build — so that is what gets asked
 * about.
 */

/** Compiled in at build time. See the plugin in vite.config.ts. */
declare const __BUILD_ID__: string | undefined;

export const BUILD_ID: string = typeof __BUILD_ID__ === 'string' ? __BUILD_ID__ : 'dev';

/**
 * What the server is serving now, or null if it could not be asked.
 *
 * `no-store` because the whole point is to miss every cache between here and
 * the origin; a cached answer would say the version that is already running.
 * Any failure is null rather than a throw: being offline is the normal case for
 * this app and is not news.
 */
export async function latestBuild(): Promise<string | null> {
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}version.json`, { cache: 'no-store' });
    if (!res.ok) return null;
    const body: unknown = await res.json();
    const build = (body as { build?: unknown })?.build;
    return typeof build === 'string' ? build : null;
  } catch {
    return null;
  }
}

/** True when the server has moved on from what is running here. */
export async function isStale(): Promise<boolean> {
  const latest = await latestBuild();
  return latest !== null && latest !== BUILD_ID;
}

/**
 * Take the new version.
 *
 * The cached shell goes first. Navigations are network-first, so a plain reload
 * would usually be enough — but "usually" is what left the old version on
 * screen in the first place, and an app that has told you there is an update
 * has to actually produce one.
 */
export async function takeUpdate(): Promise<void> {
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    await reg?.update();
  } catch { /* no worker, or it refused; the reload still stands */ }
  try {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k.startsWith('plane-')).map((k) => caches.delete(k)));
  } catch { /* no cache storage; nothing to clear */ }
  window.location.reload();
}
