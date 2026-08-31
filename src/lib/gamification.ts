import type { AppState, ModuleId, XpEvent } from './schema';
import { bucketOf } from './schema';
import { addDays, inWeek, todayKey, weekDays, type DateKey } from './date';

/** XP awarded per logged action. Deliberately flat-ish: the point is the
 *  streak and the weekly quotas, not grinding one module. */
export const XP = {
  workTask: 10,
  workProject: 60,
  outreach: 8,
  outreachMeeting: 25,
  spanishPerTenMin: 6,
  fitnessSession: 15,
  fitnessLongRun: 30,
  txReviewed: 4,
  checkIn: 20,
  note: 5,
  idea: 12,
  habitDone: 6,
  habitWeekly: 14,
  goalDone: 120,
  savingDeposit: 10,
  savingGoalFunded: 150,
  meal: 4,
  vitals: 8,
  bloodPanel: 40,
  outing: 6,
  weeklyTargetHit: 100,
} as const;

/** Level curve: each level costs 120 XP more than the one before, so early
 *  levels come fast and later ones take a real week of work. */
export function levelFor(totalXp: number): { level: number; into: number; span: number; floor: number } {
  let level = 1;
  let floor = 0;
  let span = 200;
  while (totalXp >= floor + span) {
    floor += span;
    span += 120;
    level += 1;
  }
  return { level, into: totalXp - floor, span, floor };
}

export const totalXp = (xp: XpEvent[]): number => xp.reduce((sum, e) => sum + e.amount, 0);

export function xpInRange(xp: XpEvent[], from: DateKey, to: DateKey): number {
  return xp.filter((e) => e.date >= from && e.date <= to).reduce((s, e) => s + e.amount, 0);
}

/** Consecutive days ending today (or yesterday — a day still in progress
 *  should not read as a broken streak). */
export function streakOf(days: DateKey[]): { current: number; longest: number } {
  if (days.length === 0) return { current: 0, longest: 0 };
  const set = new Set(days);
  const sorted = [...set].sort();

  let longest = 1;
  let run = 1;
  for (let i = 1; i < sorted.length; i++) {
    run = addDays(sorted[i - 1], 1) === sorted[i] ? run + 1 : 1;
    if (run > longest) longest = run;
  }

  const today = todayKey();
  let cursor = set.has(today) ? today : addDays(today, -1);
  if (!set.has(cursor)) return { current: 0, longest };
  let current = 0;
  while (set.has(cursor)) {
    current += 1;
    cursor = addDays(cursor, -1);
  }
  return { current, longest };
}

/* ------------------------------------------------------------------ */
/* Badges                                                             */
/* ------------------------------------------------------------------ */

export interface BadgeDef {
  id: string;
  name: string;
  description: string;
  icon: string;
  earned: (s: AppState) => boolean;
}

const weekCount = (dates: DateKey[]) => dates.filter((d) => inWeek(d)).length;

export const BADGES: BadgeDef[] = [
  {
    id: 'first-log', name: 'Day one', description: 'Logged anything at all', icon: '🌱',
    earned: (s) => s.xp.length > 0,
  },
  {
    id: 'streak-7', name: 'Seven straight', description: 'A 7-day check-in streak', icon: '🔥',
    earned: (s) => streakOf(s.activeDays).longest >= 7,
  },
  {
    id: 'streak-30', name: 'Month of showing up', description: 'A 30-day check-in streak', icon: '🏔️',
    earned: (s) => streakOf(s.activeDays).longest >= 30,
  },
  {
    id: 'outreach-50', name: 'Fifty in a week', description: 'Hit the weekly outreach target', icon: '📞',
    earned: (s) => weekCount(s.planning.outreach.map((o) => o.date)) >= s.planning.weeklyTarget,
  },
  {
    id: 'outreach-100', name: 'Century', description: '100 outreach conversations all time', icon: '💯',
    earned: (s) => s.planning.outreach.length >= 100,
  },
  {
    id: 'quota-12', name: 'Full dozen', description: 'Twelve fitness sessions in one week', icon: '🏅',
    earned: (s) => weekCount(s.fitness.activities.map((a) => a.date)) >= s.fitness.targets.total,
  },
  {
    id: 'mma-3', name: 'Three rounds', description: 'Three MMA sessions in one week', icon: '🥊',
    earned: (s) => s.fitness.activities.filter((a) => inWeek(a.date) && bucketOf(a.type) === 'mma').length >= s.fitness.targets.mma,
  },
  {
    id: 'run-21', name: 'Half marathon', description: 'Covered 21.1 km in a single run', icon: '🏆',
    earned: (s) => s.fitness.activities.some((a) => (a.distanceKm ?? 0) >= 21.1),
  },
  {
    id: 'spanish-10h', name: 'Ten hours deep', description: '10 hours of Spanish logged', icon: '🇪🇸',
    earned: (s) => s.spanish.sessions.reduce((n, x) => n + x.minutes, 0) >= 600,
  },
  {
    id: 'spanish-week', name: 'Seven days of Spanish', description: 'Studied every day for a week', icon: '📚',
    earned: (s) => {
      const days = new Set(s.spanish.sessions.map((x) => x.date));
      return weekDays().every((d) => days.has(d));
    },
  },
  {
    id: 'habit-week', name: 'Perfect week', description: 'Every daily habit, seven days running', icon: '🧱',
    earned: (s) => {
      const daily = s.habits.items.filter((h) => h.cadence === 'daily' && !h.archived);
      if (daily.length === 0) return false;
      return weekDays().every((d) => daily.every((h) => s.habits.logs.some((l) => l.habitId === h.id && l.date === d && l.met)));
    },
  },
  {
    id: 'goal-done', name: 'Crossed the line', description: 'Finished a goal', icon: '🏁',
    earned: (s) => s.goals.items.some((g) => g.done),
  },
  {
    id: 'inbox-zero', name: 'Nothing unexplained', description: 'Every transaction categorised', icon: '🧾',
    earned: (s) => s.finance.transactions.length >= 5 && s.finance.transactions.every((t) => t.reviewed),
  },
  {
    id: 'filed-10', name: 'Ten returns out', description: 'Ten client projects filed', icon: '📤',
    earned: (s) => s.work.projects.filter((p) => p.stage === 'Filed').length >= 10,
  },
];

export function earnedBadges(s: AppState): BadgeDef[] {
  return BADGES.filter((b) => b.earned(s));
}

export const MODULE_XP_LABEL: Record<ModuleId | 'general', string> = {
  work: 'Abitos', planning: 'Tax Planning', spanish: 'Spanish',
  fitness: 'Fitness', finance: 'Finances', habits: 'Habits',
  goals: 'Goals', notes: 'Notes', coach: 'Life Coach', health: 'Health', dating: 'Dating',
  general: 'General',
};
