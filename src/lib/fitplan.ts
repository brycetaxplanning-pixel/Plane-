import { ACTIVITY_TYPES, bucketOf, type Activity, type AppState, type PlanItem } from './schema';
import { inWeek, weekStart, type DateKey } from './date';

/** The lines in force for the current week: every locked line, plus the
 *  unlocked ones added this week. */
export function activePlan(state: AppState, week: DateKey = weekStart()): PlanItem[] {
  return state.fitness.plan.filter((p) => p.locked || p.week === week);
}

export interface PlanRow {
  item: PlanItem;
  done: number;
  met: boolean;
}

export interface WeekPlan {
  rows: PlanRow[];
  /** Sessions the plan accounts for. */
  committed: number;
  /** Sessions logged against a planned activity. */
  plannedDone: number;
  /** Total weekly goal minus what the plan accounts for. */
  open: number;
  /** Sessions logged this week that no plan line covers. */
  openFilled: number;
  total: number;
  target: number;
}

export function weekPlan(state: AppState, week: DateKey = weekStart()): WeekPlan {
  const items = activePlan(state, week);
  const acts = state.fitness.activities.filter((a) => weekStart(a.date) === week);

  const rows: PlanRow[] = items.map((item) => {
    const done = acts.filter((a) => a.type === item.activity).length;
    return { item, done, met: done >= item.perWeek };
  });

  const committed = items.reduce((n, i) => n + i.perWeek, 0);
  const plannedDone = rows.reduce((n, r) => n + Math.min(r.done, r.item.perWeek), 0);
  const planned = new Set(items.map((i) => i.activity));
  const openFilled = acts.filter((a) => !planned.has(a.type)).length
    + rows.reduce((n, r) => n + Math.max(0, r.done - r.item.perWeek), 0);

  return {
    rows,
    committed,
    plannedDone,
    open: Math.max(0, state.fitness.targets.total - committed),
    openFilled,
    total: acts.length,
    target: state.fitness.targets.total,
  };
}

/** Suggestions for the open slots: activities not already in the plan, framed
 *  as a single session so they read as easy rather than as another commitment.
 *  The set is stable within a week so it does not shuffle on every render. */
export function suggestions(state: AppState, week: DateKey = weekStart(), count = 3): { activity: string; reason: string }[] {
  const planned = new Set(activePlan(state, week).map((p) => p.activity));
  const recent = new Set(
    state.fitness.activities.filter((a) => inWeek(a.date)).map((a) => a.type),
  );

  const pool = ACTIVITY_TYPES
    .filter((a) => a.label !== 'Other')
    .filter((a) => !planned.has(a.label) && !recent.has(a.label));

  const seed = Number(week.replace(/-/g, '')) % Math.max(1, pool.length);

  return Array.from({ length: Math.min(count, pool.length) }, (_, i) => {
    const entry = pool[(seed + i * 3) % pool.length];
    return { activity: entry.label, reason: reasonFor(entry.label, state) };
  });
}

function reasonFor(activity: string, state: AppState): string {
  const bucket = bucketOf(activity);
  const km = state.fitness.activities
    .filter((a) => inWeek(a.date))
    .reduce((n, a) => n + (a.distanceKm ?? 0), 0);

  if (activity === 'Basketball') return 'Gets you a session and some people in one go.';
  if (activity === 'Swim') return 'Nothing for the legs to absorb — good the day after sparring.';
  if (activity === 'Mobility') return 'Cheapest session of the week and it helps the posture work.';
  if (activity === 'Long run' || activity === 'Run') {
    return km < 10 ? 'Race distance needs more weekly kilometres than this.' : 'Keeps the weekly distance ticking up.';
  }
  if (bucket === 'mma') return 'Counts toward the MMA side of the week.';
  if (bucket === 'strength') return 'Counts toward the strength side of the week.';
  return 'An easy way to fill an open slot.';
}

/** Common starting points offered when the plan is empty. */
export const PLAN_PRESETS: { activity: string; perWeek: number }[] = [
  { activity: 'Weightlifting', perWeek: 4 },
  { activity: 'MMA', perWeek: 3 },
  { activity: 'Calisthenics', perWeek: 2 },
  { activity: 'Run', perWeek: 2 },
];

/** Sessions logged this week, by bucket — still needed by the coach. */
export function bucketCounts(acts: Activity[]): { mma: number; strength: number; other: number } {
  return {
    mma: acts.filter((a) => bucketOf(a.type) === 'mma').length,
    strength: acts.filter((a) => bucketOf(a.type) === 'strength').length,
    other: acts.filter((a) => bucketOf(a.type) === 'other').length,
  };
}
