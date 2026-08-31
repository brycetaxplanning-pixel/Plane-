/** Task-completion animations.
 *
 *  Each entry is a CSS-driven effect keyed by id; `effects.css` owns the
 *  keyframes. Adding a hundredth effect means one row here plus one CSS block —
 *  nothing else in the app changes.
 *
 *  These are original effects rather than recreations of characters from film,
 *  games or anime: shipping someone else's character art in an app is their
 *  copyright, not ours. The engine is the reusable part — swap in your own
 *  artwork per effect and the rotation picks it up.
 */

export interface Effect {
  id: string;
  /** Shouted on screen while it plays. Half the fun. */
  name: string;
  /** Milliseconds before the row is actually removed. */
  duration: number;
}

export const EFFECTS: Effect[] = [
  { id: 'disintegrate', name: 'DUSTED',        duration: 900 },
  { id: 'freeze',       name: 'ICED',          duration: 1000 },
  { id: 'laser',        name: 'VAPORISED',     duration: 850 },
  { id: 'beam',         name: 'OBLITERATED',   duration: 950 },
  { id: 'stamp',        name: 'STAMPED',       duration: 800 },
  { id: 'erase',        name: 'ERASED',        duration: 900 },
  { id: 'shrink',       name: 'YEETED',        duration: 700 },
  { id: 'glitch',       name: 'TELEPORTED',    duration: 800 },
  { id: 'fill',         name: 'COMPLETE',      duration: 950 },
  { id: 'confetti',     name: 'LET US COOK',   duration: 1000 },
  { id: 'slam',         name: 'FLATTENED',     duration: 750 },
  { id: 'vacuum',       name: 'SUCKED IN',     duration: 850 },
  { id: 'crumple',      name: 'CRUMPLED',      duration: 900 },
  { id: 'pixelate',     name: 'DELETED',       duration: 850 },
  { id: 'slice',        name: 'SLICED',        duration: 900 },
  { id: 'rocket',       name: 'TO THE MOON',   duration: 900 },
  { id: 'blackhole',    name: 'EVENT HORIZON', duration: 950 },
  { id: 'speedlines',   name: 'GONE',          duration: 750 },
];

export const effectById = (id: string): Effect =>
  EFFECTS.find((e) => e.id === id) ?? EFFECTS[0];

/** Recent history lives in the module, not in saved state — nobody needs an
 *  animation log surviving a reload. Avoiding the last few keeps the rotation
 *  feeling random rather than repeating. */
const recent: string[] = [];
const MEMORY = 6;

export function nextEffect(): Effect {
  const pool = EFFECTS.filter((e) => !recent.includes(e.id));
  const from = pool.length ? pool : EFFECTS;
  const pick = from[Math.floor(Math.random() * from.length)];
  recent.push(pick.id);
  if (recent.length > MEMORY) recent.shift();
  return pick;
}
