import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { isStale, takeUpdate } from '../lib/version';
import { Icons } from './layout/Icons';

/** How often to ask while the app is actually being looked at. */
const EVERY_MS = 15 * 60 * 1000;

/**
 * "New version — tap to reload", when there is one.
 *
 * The check runs when the app comes back to the front, not on a timer alone,
 * because that is the moment this is for: an installed PWA is backgrounded
 * rather than closed, so it returns to the page it was on without navigating,
 * and a build from days ago looks exactly like a build from this morning.
 *
 * It says so and waits. Reloading underneath somebody mid-sentence would lose
 * whatever they were typing, and this app is mostly things being typed in — so
 * the app never takes the update on its own, however old it is.
 *
 * Portalled to <body> for the reason the action button is: <main> keeps an
 * identity transform from its drill-in animation, and a fixed child of a
 * transformed ancestor anchors to the ancestor instead of the viewport.
 */
export function UpdateBar() {
  /* Two separate facts. The server having moved on does not stop being true
     because the bar was waved away — folding them into one flag meant the
     dismissal re-ran the check, which found the same update, and put the bar
     straight back up. */
  const [stale, setStale] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [busy, setBusy] = useState(false);

  // No dependencies, so the effect below is set up once and a state change
  // cannot retrigger it.
  const check = useCallback(() => {
    void isStale().then((s) => { if (s) setStale(true); });
  }, []);

  useEffect(() => {
    check();
    const front = () => {
      if (document.visibilityState !== 'visible') return;
      // Coming back to the app is a fresh chance to be told, even if the bar
      // was sent away last time.
      setDismissed(false);
      check();
    };
    document.addEventListener('visibilitychange', front);
    window.addEventListener('focus', front);
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') check();
    }, EVERY_MS);
    return () => {
      document.removeEventListener('visibilitychange', front);
      window.removeEventListener('focus', front);
      window.clearInterval(timer);
    };
  }, [check]);

  if (!stale || dismissed) return null;

  return createPortal(
    <div className="updatebar" role="status">
      <span className="updatebar-mark" aria-hidden>{Icons.repeat()}</span>
      <span className="grow">A new version is ready.</span>
      <button className="btn btn-sm btn-primary" disabled={busy} onClick={() => { setBusy(true); void takeUpdate(); }}>
        {busy ? 'Reloading…' : 'Reload'}
      </button>
      {/* Dismissible, because "there is a new version" is not urgent and a bar
          you cannot get rid of is worse than an old build. It comes back on
          the next return to the app. */}
      <button className="updatebar-close" onClick={() => setDismissed(true)} aria-label="Not now">
        <span aria-hidden>{Icons.close()}</span>
      </button>
    </div>,
    document.body,
  );
}
