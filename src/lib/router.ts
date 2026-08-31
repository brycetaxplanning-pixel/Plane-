import { useEffect, useState } from 'react';

export type Route =
  | 'launcher' | 'home' | 'work' | 'planning' | 'spanish'
  | 'fitness' | 'finance' | 'habits' | 'goals' | 'notes' | 'coach'
  | 'health' | 'tracker' | 'notifications' | 'settings';

const ROUTES: Route[] = [
  'launcher', 'home', 'work', 'planning', 'spanish',
  'fitness', 'finance', 'habits', 'goals', 'notes', 'coach',
  'health', 'tracker', 'notifications', 'settings',
];

/** How deep a route sits, so the shell can animate a drill-in versus a
 *  step back out. */
export const depthOf = (r: Route): number => (r === 'launcher' ? 0 : 1);

function read(): Route {
  const hash = window.location.hash.replace(/^#\/?/, '').split('?')[0];
  return (ROUTES as string[]).includes(hash) ? (hash as Route) : 'launcher';
}

const readQuery = (): URLSearchParams =>
  new URLSearchParams(window.location.hash.split('?')[1] ?? '');

/** Query part of the hash, so a notification can deep-link to a tab. */
export function useHashQuery(): URLSearchParams {
  const [params, setParams] = useState<URLSearchParams>(readQuery);
  useEffect(() => {
    const onHash = () => setParams(readQuery());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  return params;
}

/**
 * A module's tab, seeded from `?tab=` on first render so a link can open the
 * right one. It is not kept in the URL afterwards — the tab is transient
 * state, and rewriting the hash on every tab press would fill the back stack.
 */
export function useTabParam<T extends string>(valid: readonly T[], fallback: T): [T, (t: T) => void] {
  const wanted = (): T | null => {
    const q = readQuery().get('tab') as T | null;
    return q && valid.includes(q) ? q : null;
  };
  const [tab, setTab] = useState<T>(() => wanted() ?? fallback);

  // A second deep link into a module you are already looking at only changes
  // the hash, so without this the tab would stay where it was.
  useEffect(() => {
    const onHash = () => {
      const next = wanted();
      if (next) setTab(next);
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return [tab, setTab];
}

/** Hash routing keeps the app a single static file — it works from a file://
 *  open, GitHub Pages, or any static host with no server rewrite rules. */
export function useRoute(): [Route, (r: Route) => void] {
  const [route, setRoute] = useState<Route>(read);

  useEffect(() => {
    const onHash = () => {
      setRoute(read());
      window.scrollTo({ top: 0 });
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const navigate = (r: Route) => {
    window.location.hash = r === 'launcher' ? '/' : `/${r}`;
  };

  return [route, navigate];
}

export const routeOf = (r: Route, params?: Record<string, string>) => {
  const base = r === 'launcher' ? '#/' : `#/${r}`;
  const query = params ? new URLSearchParams(params).toString() : '';
  return query ? `${base}?${query}` : base;
};

/** Narrows an arbitrary string to a Route, for links stored in data. */
export const asRoute = (value: string | undefined): Route | null =>
  value && (ROUTES as string[]).includes(value) ? (value as Route) : null;
