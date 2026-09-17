import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { routeOf } from '../../lib/router';
import { Icons } from './Icons';

/**
 * Where you are inside a module, when a module has an inside.
 *
 * Business is the case: it opens on a grid of businesses, and picking one goes
 * a level deeper without changing the route. Two things above and below that
 * screen need to know it happened — the one back button, which should step out
 * of the business rather than out of the module, and the to-do corner, whose
 * list belongs to the business you are looking at and not to the module as a
 * whole. Neither of those is rendered by the module, so the module says where
 * it is and they read it.
 *
 * A module with no inside registers nothing and everything behaves as before.
 */
export interface SubLevel {
  /**
   * Names the level. Anything written down here is stamped with it and only
   * shows up here again, so two businesses do not share one to-do list.
   */
  id: string;
  /** Stepping out of it — what the back button does instead of leaving. */
  exit: () => void;
}

const SubContext = createContext<{
  sub: SubLevel | null;
  set: (s: SubLevel | null) => void;
}>({ sub: null, set: () => {} });

export function SubLevelProvider({ children }: { children: React.ReactNode }) {
  const [sub, set] = useState<SubLevel | null>(null);
  const value = useMemo(() => ({ sub, set }), [sub]);
  return <SubContext.Provider value={value}>{children}</SubContext.Provider>;
}

/**
 * Declared by a module: the level it is currently showing, or null at its top.
 *
 * Registered in an effect rather than during the render, because it is state
 * belonging to something rendered above this. The back button is labelled the
 * same either way, so the one frame before the effect lands changes nothing on
 * screen — only where the button would have gone had you hit it inside it.
 */
export function useSubLevel(id: string | null, exit: () => void) {
  const { set } = useContext(SubContext);
  useEffect(() => {
    set(id === null ? null : { id, exit });
    // Left behind on the way out, or the next module inherits it.
    return () => set(null);
    // `exit` is a fresh closure every render; the id is what actually changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, set]);
}

/** Read by the shell: which level is open, if any. */
export function useCurrentSubLevel(): SubLevel | null {
  return useContext(SubContext).sub;
}

/**
 * The one way back.
 *
 * It says "Back" and nothing else, and it steps out one level: out of the
 * business into the businesses, out of the module into the modules. There used
 * to be two — a module-level link pinned above the card and a second one
 * inside the module for its own depth — which is two controls answering the
 * same question and the higher of them was nowhere near the thing it left.
 */
export function BackButton() {
  const sub = useCurrentSubLevel();

  const face = (
    <>
      <span aria-hidden style={{ width: 15, height: 15, display: 'inline-flex' }}>{Icons.back()}</span>
      Back
    </>
  );

  // A real link while it leaves the module, so it can be opened in a tab and
  // read as a link. Stepping out of a sub-level changes no route, so that one
  // has nothing to link to.
  return sub
    ? <button className="backlink modback" onClick={sub.exit}>{face}</button>
    : <a className="backlink modback" href={routeOf('launcher')}>{face}</a>;
}
