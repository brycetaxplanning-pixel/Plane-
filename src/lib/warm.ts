/**
 * Pulls the other screens' chunks down quietly once the app is up and idle.
 *
 * Splitting the bundle made the first paint a third of the bytes, but it also
 * means a screen you have never opened is not on the device — which matters for
 * an app meant to work on the subway. So the chunks are fetched anyway, just
 * after the launcher is on screen and only when the browser says it is idle.
 * The service worker caches them as they arrive.
 */

const SCREENS = [
  () => import('../modules/Dashboard'),
  () => import('../modules/Work'),
  () => import('../modules/Planning'),
  () => import('../modules/Spanish'),
  () => import('../modules/Fitness'),
  () => import('../modules/Finance'),
  () => import('../modules/Habits'),
  () => import('../modules/Goals'),
  () => import('../modules/Notes'),
  () => import('../modules/Tracker'),
  () => import('../modules/Coach'),
  () => import('../modules/Health'),
  () => import('../modules/Settings'),
];

const idle = (fn: () => void, timeout = 4000): void => {
  const ric = (window as { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => void }).requestIdleCallback;
  if (ric) ric(fn, { timeout });
  else window.setTimeout(fn, 1200);
};

let started = false;

export function warmScreens(): void {
  if (started) return;
  started = true;

  // Not on a metered connection, and not when the browser has been asked to
  // save data — a background download is exactly what that setting is about.
  const conn = (navigator as { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
  if (conn?.saveData || (conn?.effectiveType && /2g/.test(conn.effectiveType))) return;

  let i = 0;
  const next = () => {
    if (i >= SCREENS.length) return;
    const load = SCREENS[i++];
    void load().catch(() => undefined).then(() => idle(next));
  };

  // A clear gap after first paint, so nothing competes with the screen the
  // person is actually looking at.
  window.setTimeout(() => idle(next), 2500);
}
