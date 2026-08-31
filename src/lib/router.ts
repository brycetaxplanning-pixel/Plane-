import { useEffect, useState } from 'react';

export type Route =
  | 'dashboard' | 'work' | 'planning' | 'spanish'
  | 'fitness' | 'finance' | 'coach' | 'settings';

const ROUTES: Route[] = ['dashboard', 'work', 'planning', 'spanish', 'fitness', 'finance', 'coach', 'settings'];

function read(): Route {
  const hash = window.location.hash.replace(/^#\/?/, '').split('?')[0];
  return (ROUTES as string[]).includes(hash) ? (hash as Route) : 'dashboard';
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
    window.location.hash = r === 'dashboard' ? '/' : `/${r}`;
  };

  return [route, navigate];
}

export const routeOf = (r: Route) => (r === 'dashboard' ? '#/' : `#/${r}`);
