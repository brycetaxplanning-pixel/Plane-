import type { ModuleId } from '../../lib/schema';

/* ------------------------------------------------------------------
   The line set.

   One 24-unit grid, one stroke weight, round caps and joins — so eleven
   modules read as eleven members of one family rather than eleven pictures
   borrowed from eleven places. This replaced the emoji: an emoji is drawn by
   the platform, at the platform's weight, in the platform's palette, and no
   two of them agree with each other.
------------------------------------------------------------------ */

const base = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.7,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
};

const wrap = (children: React.ReactNode) => (
  <svg viewBox="0 0 24 24" {...base} aria-hidden="true">{children}</svg>
);

export const Icons = {
  home: () => wrap(<><path d="M3 10.5 12 3l9 7.5" /><path d="M5.5 9.5V20h13V9.5" /><path d="M9.5 20v-5.5h5V20" /></>),

  /* ---- the eleven module marks ---- */

  /** Abitos — a return, signed off. */
  folder: () => wrap(<><path d="M6 3.5h7.5L18 8v12.5H6z" /><path d="M13.2 3.7V8H17.8" /><path d="m9 13.4 2 2 4-4.2" /></>),
  /** Business — a target with the shot already leaving it. */
  target: () => wrap(<><circle cx="11" cy="13" r="7.2" /><circle cx="11" cy="13" r="3" /><path d="m11 13 8-8" /><path d="M15.4 5h4.2v4.2" /></>),
  /** Spanish — two bubbles, because the point is the conversation. */
  chat: () => wrap(<>
    <path d="M3 7.2A2.6 2.6 0 0 1 5.6 4.6h7.6a2.6 2.6 0 0 1 2.6 2.6v3.6a2.6 2.6 0 0 1-2.6 2.6H8l-3.6 2.8v-2.8h-.8a.6.6 0 0 1-.6-.6z" />
    <path d="M18.4 8.6h.6a2 2 0 0 1 2 2v3.8a2 2 0 0 1-2 2h-.5v2.4l-3-2.4h-3.2" />
  </>),
  /** Fitness — a dumbbell. A running figure or a shoe turns to mush at 30px;
   *  this shape stays itself all the way down to the nav bar. */
  run: () => wrap(<>
    <path d="M3.4 9.8v4.4M6.6 7.4v9.2M17.4 7.4v9.2M20.6 9.8v4.4" />
    <path d="M6.6 12h10.8" />
  </>),
  /** Finances — a coin, with a second behind it. */
  wallet: () => wrap(<>
    <circle cx="13.4" cy="12.6" r="7.4" />
    <path d="M13.4 8.8v7.6" />
    <path d="M15.6 10.4h-3.1a1.6 1.6 0 0 0 0 3.2h1.8a1.6 1.6 0 0 1 0 3.2h-3.1" />
    <path d="M8.4 19.2A7.4 7.4 0 0 1 8.4 6" />
  </>),
  /** Habits — the loop, broken open so it reads as a cycle you re-enter. */
  repeat: () => wrap(<>
    <path d="M4.2 10.4a7.8 7.8 0 0 1 13.3-4.2" />
    <path d="M19.8 13.6a7.8 7.8 0 0 1-13.3 4.2" />
    <path d="M17.8 2.6v3.8H14" /><path d="M6.2 21.4v-3.8H10" />
  </>),
  /** Goals — a pennant on a planted pole. */
  flag: () => wrap(<><path d="M5.6 21V3.2" /><path d="M5.6 4.4h12.2l-2.6 4.1 2.6 4.1H5.6" /></>),
  /** Notes — the same sheet as Abitos, ruled instead of signed. */
  note: () => wrap(<>
    <path d="M5 3.6h9L19 8.4V20.4H5z" /><path d="M13.6 3.8v4.8h4.9" />
    <path d="M8.2 12.6h6" /><path d="M8.2 16.2h4" />
  </>),
  /** Life Coach — a compass needle. */
  compass: () => wrap(<><circle cx="12" cy="12" r="9.2" /><path d="m15.6 8.4-1.9 5.3-5.3 1.9 1.9-5.3z" /></>),
  /** Health — one heartbeat across the grid. */
  pulse: () => wrap(<path d="M2.8 12h4l1.7-4.2 2.8 8.4 2-4.2h7.9" />),
  /** Dating — drawn on the same grid as the rest, so it stops looking like a sticker. */
  heart: () => wrap(<path d="M12 20.4S3.6 15.3 3.6 9.4a4.6 4.6 0 0 1 8.4-2.6 4.6 4.6 0 0 1 8.4 2.6c0 5.9-8.4 11-8.4 11z" />),

  /* ---- chrome ---- */

  gear: () => wrap(<><path d="M4 7h6M14 7h6M4 12h11M19 12h1M4 17h3M11 17h9" /><circle cx="12" cy="7" r="2" /><circle cx="17" cy="12" r="2" /><circle cx="9" cy="17" r="2" /></>),
  flame: () => wrap(<><path d="M12 3s4.5 3.6 4.5 8a4.5 4.5 0 0 1-9 0c0-1.4.6-2.6 1.3-3.5.2 1.4 1 2.2 1.9 2.2 1 0 1.5-.9 1.3-2.3-.2-1.7-.5-3-.5-4.4Z" /><path d="M7 13.5A5 5 0 0 0 12 21a5 5 0 0 0 5-5" /></>),
  calendar: () => wrap(<><rect x="3.5" y="5" width="17" height="15.5" rx="2.5" /><path d="M3.5 10h17" /><path d="M8 3.5v3M16 3.5v3" /></>),
  bell: () => wrap(<><path d="M6 9.5a6 6 0 0 1 12 0c0 3 .7 4.6 1.6 5.6.4.5.1 1.4-.6 1.4H5c-.7 0-1-.9-.6-1.4C5.3 14.1 6 12.5 6 9.5Z" /><path d="M10 19.5a2.2 2.2 0 0 0 4 0" /></>),
  grid: () => wrap(<><rect x="3.5" y="3.5" width="7" height="7" rx="2" /><rect x="13.5" y="3.5" width="7" height="7" rx="2" /><rect x="3.5" y="13.5" width="7" height="7" rx="2" /><rect x="13.5" y="13.5" width="7" height="7" rx="2" /></>),
  back: () => wrap(<path d="M15 5.5 8.5 12l6.5 6.5" />),
  plus: () => wrap(<><path d="M12 5.5v13M5.5 12h13" /></>),
  /** Progress — bars with the trend drawn over them. */
  chart: () => wrap(<><path d="M3.4 20.4h17.2" /><path d="M6.6 20.4v-5.6M11 20.4v-9.2M15.4 20.4v-6.4M19.8 20.4v-12" /></>),
  /** Search. */
  search: () => wrap(<><circle cx="10.8" cy="10.8" r="6.6" /><path d="m15.6 15.6 4.2 4.2" /></>),
  /** A clock — anything with a date on it. */
  clock: () => wrap(<><circle cx="12" cy="12" r="8.8" /><path d="M12 6.8V12l3.4 2" /></>),
  /** Scales — a comparison between two things. */
  scales: () => wrap(<>
    <path d="M12 4.2v16.2" /><path d="M6.4 6.2h11.2" /><path d="M8.4 20.4h7.2" />
    <path d="M6.4 6.2 3.4 13h6z" /><path d="m17.6 6.2-3 6.8h6z" />
  </>),
  /** A crescent — something that has gone quiet. */
  moon: () => wrap(<path d="M20 14.4A8.6 8.6 0 0 1 9.6 4a8.8 8.8 0 1 0 10.4 10.4z" />),
  /** Interlocking pieces — how the parts sit against each other. */
  puzzle: () => wrap(<>
    <path d="M9.6 3.6h4.8v2.2a1.8 1.8 0 1 0 3.6 0V3.6h2.4v4.8h-2.2a1.8 1.8 0 1 0 0 3.6h2.2v4.8h-4.8v-2.2a1.8 1.8 0 1 0-3.6 0v2.2H3.6v-4.8h2.2a1.8 1.8 0 1 0 0-3.6H3.6V3.6z" />
  </>),
  /** An `i` in a ring — the app talking about itself. */
  info: () => wrap(<><circle cx="12" cy="12" r="8.8" /><path d="M12 11v5.4" /><path d="M12 7.7h.1" /></>),
  /** The rank marker's tick. */
  check: () => wrap(<path d="m5 12.6 4.6 4.6L19 6.4" />),
  /** An office — Business's list of companies. */
  building: () => wrap(<>
    <path d="M4 20.4V5.2a1.6 1.6 0 0 1 1.6-1.6h7.2a1.6 1.6 0 0 1 1.6 1.6v15.2" />
    <path d="M14.4 10h4a1.6 1.6 0 0 1 1.6 1.6v8.8" />
    <path d="M2.6 20.4h18.8" /><path d="M7.4 7.4h3.6M7.4 11h3.6M7.4 14.6h3.6" />
  </>),
  /** A call — the outreach log. */
  phone: () => wrap(<path d="M8.2 3.6 10.4 8l-2 2a12 12 0 0 0 5.6 5.6l2-2 4.4 2.2v3a2 2 0 0 1-2.2 2C10.5 20 4 13.5 3.2 5.8a2 2 0 0 1 2-2.2z" />),
  /** A line going the right way — investing. */
  trend: () => wrap(<><path d="M3.4 20.4h17.2" /><path d="m4.6 16.4 4.8-5.2 3.6 3 6.4-7.6" /><path d="M15.6 6.6h4.2v4.2" /></>),
  /** A plate — meals. */
  plate: () => wrap(<><circle cx="12" cy="12" r="8.6" /><circle cx="12" cy="12" r="4.2" /></>),
  /** A drop — bloodwork. */
  drop: () => wrap(<path d="M12 3.2c3 3.4 5.6 6.3 5.6 9.4a5.6 5.6 0 0 1-11.2 0c0-3.1 2.6-6 5.6-9.4z" />),
  /** A vault — saving goals. */
  bank: () => wrap(<>
    <path d="M3.2 9.4 12 3.6l8.8 5.8" /><path d="M4.8 9.4v9.2M19.2 9.4v9.2" />
    <path d="M8.6 12.4v4M12 12.4v4M15.4 12.4v4" /><path d="M2.8 20.4h18.4" />
  </>),
  /** A spark — the idea list. */
  bulb: () => wrap(<>
    <path d="M9 16.6a6 6 0 1 1 6 0v1.8H9z" /><path d="M9.8 21h4.4" />
  </>),
  /** A microphone — every talk-instead-of-type control. */
  mic: () => wrap(<>
    <rect x="9.2" y="2.6" width="5.6" height="11" rx="2.8" />
    <path d="M5.6 11.4a6.4 6.4 0 0 0 12.8 0" /><path d="M12 17.8v3.6" />
  </>),
  /* ---- award marks ---- */

  /** First thing ever logged. */
  sprout: () => wrap(<>
    <path d="M12 20.4v-7.2" /><path d="M12 13.2C12 9.6 9 7.2 5.4 7.2c0 3.6 3 6 6.6 6z" />
    <path d="M12 13.2c0-3 2.6-5.2 5.8-5.2 0 3-2.6 5.2-5.8 5.2z" />
  </>),
  /** A long streak. */
  mountain: () => wrap(<><path d="m2.6 19.4 6-10.2 3.6 5.8 2.4-3.6 6.8 8z" /><path d="m8.6 9.2 2.2 3.6" /></>),
  /** A count that has run a long way past a marker. Tally strokes rather
   *  than another pennant — the first attempt was a flag, which made this
   *  indistinguishable from the finished-a-goal award beside it. */
  milestone: () => wrap(<>
    <path d="M5.4 6.4v11.2M9.2 6.4v11.2M13 6.4v11.2M16.8 6.4v11.2" />
    <path d="M3.6 17.4 19 6.6" />
  </>),
  /** A weekly quota, filled all the way round. */
  rosette: () => wrap(<>
    <circle cx="12" cy="9.4" r="6" /><path d="m8.4 14.6-1.6 6 5.2-2.6 5.2 2.6-1.6-6" />
  </>),
  /** Rounds on the mat. A fist with a thumb and a wrist strap — the first
   *  attempt reused the dumbbell's silhouette and read as a lightbulb. */
  glove: () => wrap(<>
    <path d="M7.6 4.6h5a4.8 4.8 0 0 1 4.8 4.8v3.4a3 3 0 0 1-3 3H7.6z" />
    <path d="M7.6 8.2H5.8a2.4 2.4 0 0 0 0 4.8h1.8" />
    <path d="M7.2 15.8h9.6v2.4a1.4 1.4 0 0 1-1.4 1.4H8.6a1.4 1.4 0 0 1-1.4-1.4z" />
  </>),
  /** The distance. */
  trophy: () => wrap(<>
    <path d="M7.4 3.6h9.2v5a4.6 4.6 0 1 1-9.2 0z" />
    <path d="M7.4 5.4H4.8v1.8a3 3 0 0 0 2.6 3" /><path d="M16.6 5.4h2.6v1.8a3 3 0 0 1-2.6 3" />
    <path d="M12 13.2v3.6" /><path d="M8.6 20.4h6.8l-1-3.6h-4.8z" />
  </>),
  /** Hours put in. */
  hourglass: () => wrap(<>
    <path d="M6.4 3.4h11.2M6.4 20.6h11.2" />
    <path d="M7.6 3.4v3.2L12 12l-4.4 5.4v3.2" /><path d="M16.4 3.4v3.2L12 12l4.4 5.4v3.2" />
  </>),
  /** Study, seven days running. */
  book: () => wrap(<>
    <path d="M4 4.6a1.6 1.6 0 0 1 1.6-1.6H11v16.4H5.6A1.6 1.6 0 0 0 4 21z" />
    <path d="M20 4.6A1.6 1.6 0 0 0 18.4 3H13v16.4h5.4A1.6 1.6 0 0 1 20 21z" />
  </>),
  /** A week built without a gap. */
  bricks: () => wrap(<>
    <rect x="3" y="4.2" width="18" height="15.6" rx="1.6" />
    <path d="M3 9.4h18M3 14.6h18" /><path d="M9.4 4.2v5.2M14.6 9.4v5.2M9.4 14.6v5.2" />
  </>),
  /** Every line accounted for. */
  receipt: () => wrap(<>
    <path d="M5.4 3.4h13.2v17.2l-2.2-1.4-2.2 1.4-2.2-1.4-2.2 1.4-2.2-1.4-2.2 1.4z" />
    <path d="M8.6 8h6.8M8.6 12h4.6" />
  </>),
  /** Work sent out. */
  outbox: () => wrap(<>
    <path d="M3.4 13.6h4.4l1.4 2.4h5.6l1.4-2.4h4.4v5.2a1.6 1.6 0 0 1-1.6 1.6H5a1.6 1.6 0 0 1-1.6-1.6z" />
    <path d="M12 3.6v7.2" /><path d="m8.8 6.8 3.2-3.2 3.2 3.2" />
  </>),

  /** Locked into the plan. */
  lock: () => wrap(<>
    <rect x="4.4" y="10.4" width="15.2" height="10" rx="2.2" />
    <path d="M8 10.4V7.6a4 4 0 0 1 8 0v2.8" />
  </>),
  /** A perfect habit week — the award worn beside your name. */
  lotus: () => wrap(<>
    <path d="M12 4.6c2.4 2.2 3.4 4.4 3.4 6.6S13.8 15 12 16.4C10.2 15 8.6 13.4 8.6 11.2S9.6 6.8 12 4.6z" />
    <path d="M12 16.4c-3.4 1.2-6.6.4-8.6-1.8 2.2-2.2 5.2-2.6 7.4-1" />
    <path d="M12 16.4c3.4 1.2 6.6.4 8.6-1.8-2.2-2.2-5.2-2.6-7.4-1" />
  </>),
  /** The brand mark: a paper plane, drawn on the same grid as everything else. */
  plane: () => wrap(<><path d="M21 3.4 2.6 11.2l7.3 2.5z" /><path d="m9.9 13.7 2.6 7.1L21 3.4z" /><path d="m9.9 13.7 3.4-3.4" /></>),
};

/** Every mark by name, so a definition elsewhere can point at one without
 *  importing JSX. */
export type IconName = keyof typeof Icons;

/** The mark for a module, keyed the way the rest of the app keys modules. */
export const MODULE_GLYPH: Record<ModuleId, () => React.ReactNode> = {
  work: Icons.folder, planning: Icons.target, spanish: Icons.chat,
  fitness: Icons.run, finance: Icons.wallet, habits: Icons.repeat,
  goals: Icons.flag, notes: Icons.note, coach: Icons.compass,
  health: Icons.pulse, dating: Icons.heart,
};

/** A module's mark at a given size, tinted by whatever `color` is in scope. */
export function ModuleGlyph({ id, size = 24 }: { id: ModuleId; size?: number }) {
  return (
    <span className="glyph" aria-hidden style={{ width: size, height: size }}>
      {MODULE_GLYPH[id]()}
    </span>
  );
}
