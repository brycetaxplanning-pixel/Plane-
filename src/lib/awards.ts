import type { IconName } from '../components/layout/Icons';
import type { AppState } from './schema';
import { addDays, weekStart, type DateKey } from './date';

export interface Award {
  id: string;
  name: string;
  icon: IconName;
  blurb: string;
}

/** Kept deliberately short. A row of five badges beside a name means nothing;
 *  one that is hard to earn means something. */
export const AWARDS: Award[] = [
  {
    id: 'enlightened',
    name: 'Enlightenment',
    icon: 'lotus' as const,
    blurb: 'Every daily habit, every day, and every weekly habit — for a whole week.',
  },
];

/**
 * A week counts only when it is over and nothing was missed: every daily
 * habit met on all seven days, and every weekly habit at or above its count.
 * A week with no habits set up does not qualify.
 */
export function weekWasPerfect(state: AppState, start: DateKey): boolean {
  const daily = state.habits.items.filter((h) => h.cadence === 'daily' && !h.archived && h.createdAt <= start);
  const weekly = state.habits.items.filter((h) => h.cadence === 'weekly' && !h.archived && h.createdAt <= start);
  if (daily.length === 0 && weekly.length === 0) return false;

  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  const dailyPerfect = daily.every((h) =>
    days.every((d) => state.habits.logs.some((l) => l.habitId === h.id && l.date === d && l.met)));

  const weeklyPerfect = weekly.every((h) => {
    const count = state.habits.logs.filter((l) => l.habitId === h.id && l.met && weekStart(l.date) === start).length;
    return count >= Math.max(1, h.timesPerWeek ?? 1);
  });

  return dailyPerfect && weeklyPerfect;
}

/** The most recent completed week. */
export const lastCompletedWeek = (): DateKey => addDays(weekStart(), -7);

/** The award is worn for the week after the one that earned it, and is lost
 *  the moment that next week ends without repeating. */
export function isEnlightened(state: AppState): boolean {
  return state.awards.enlightened.includes(lastCompletedWeek());
}

/** A newly earned week that has not been celebrated yet, if any. */
export function pendingAward(state: AppState): DateKey | null {
  const week = lastCompletedWeek();
  if (!state.awards.enlightened.includes(week)) return null;
  if (state.awards.acknowledged.includes(week)) return null;
  return week;
}

/** Runs on load: records the last completed week if it qualifies. Idempotent. */
export function reconcileAwards(state: AppState): AppState {
  const week = lastCompletedWeek();
  if (state.awards.enlightened.includes(week)) return state;
  if (!weekWasPerfect(state, week)) return state;
  return { ...state, awards: { ...state.awards, enlightened: [...state.awards.enlightened, week] } };
}

