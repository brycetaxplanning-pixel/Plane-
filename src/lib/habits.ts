import type { AppState, Habit, HabitLog } from './schema';
import { addDays, diffDays, inWeek, lastDays, todayKey, weekStart, type DateKey } from './date';

export type HabitStatus = 'done' | 'due' | 'yellow' | 'red' | 'new';

export interface HabitRow {
  habit: Habit;
  status: HabitStatus;
  /** Never colour alone: this label ships beside the dot everywhere. */
  statusLabel: string;
  /** Days since it was last met. null when it has never been met. */
  daysSince: number | null;
  /** Daily: met today. Weekly: hit this week's count. */
  metNow: boolean;
  /** Weekly only. */
  weekCount: number;
  weekTarget: number;
  /** Consecutive missed days (daily) or weeks (weekly), not counting the
   *  current one — a day still in progress is not yet a miss. */
  missStreak: number;
  /** Last seven days, oldest first: did it count that day. */
  last7: { date: DateKey; met: boolean }[];
  /** What the app says about it, tuned by tone. */
  nudge: string;
}

const metLog = (logs: HabitLog[], habitId: string, date: DateKey) =>
  logs.some((l) => l.habitId === habitId && l.date === date && l.met);

/** Does a logged entry satisfy the habit? Kept separate from the log itself so
 *  a target change never rewrites history — `met` is frozen at log time. */
export function meetsTarget(habit: Habit, value: { amount?: number; time?: string }): boolean {
  if (habit.kind === 'amount') return (value.amount ?? 0) >= (habit.target ?? 0);
  if (habit.kind === 'before') {
    if (!value.time || !habit.targetTime) return false;
    // Anything logged before 05:00 belongs to the night before, so "in bed by
    // 23:30" is not failed by a 00:20 entry being numerically smaller.
    const minutes = (t: string) => {
      const [h, m] = t.split(':').map(Number);
      return h < 5 ? (h + 24) * 60 + m : h * 60 + m;
    };
    return minutes(value.time) <= minutes(habit.targetTime);
  }
  return true;
}

export function habitRow(habit: Habit, logs: HabitLog[]): HabitRow {
  const today = todayKey();
  const relevant = logs.filter((l) => l.habitId === habit.id && l.met).map((l) => l.date).sort();
  const lastMet = relevant.at(-1) ?? null;
  const daysSince = lastMet ? diffDays(today, lastMet) : null;

  const last7 = Array.from({ length: 7 }, (_, i) => {
    const date = addDays(today, i - 6);
    return { date, met: metLog(logs, habit.id, date) };
  });

  if (habit.cadence === 'weekly') {
    const target = Math.max(1, habit.timesPerWeek ?? 1);
    const weekCount = logs.filter((l) => l.habitId === habit.id && l.met && inWeek(l.date)).length;

    // Count back over completed weeks only; this week is still in progress.
    let missStreak = 0;
    for (let w = 1; w <= 12; w++) {
      const start = addDays(weekStart(), -7 * w);
      const count = logs.filter((l) => l.habitId === habit.id && l.met && weekStart(l.date) === start).length;
      if (count >= target) break;
      // Weeks before the habit existed are not misses.
      if (addDays(start, 6) < habit.createdAt) break;
      missStreak++;
    }

    const metNow = weekCount >= target;
    const status: HabitStatus = metNow ? 'done'
      : relevant.length === 0 && missStreak === 0 ? 'new'
      : missStreak === 0 ? 'due'
      : missStreak === 1 ? 'yellow' : 'red';

    return {
      habit, status, statusLabel: labelFor(status, habit.cadence, missStreak),
      daysSince, metNow, weekCount, weekTarget: target, missStreak, last7,
      nudge: '',
    };
  }

  const metNow = metLog(logs, habit.id, today);
  let missStreak = 0;
  for (let d = 1; d <= 60; d++) {
    const date = addDays(today, -d);
    if (date < habit.createdAt) break;
    if (metLog(logs, habit.id, date)) break;
    missStreak++;
  }

  const status: HabitStatus = metNow ? 'done'
    : relevant.length === 0 && missStreak === 0 ? 'new'
    : missStreak === 0 ? 'due'
    : missStreak === 1 ? 'yellow' : 'red';

  return {
    habit, status, statusLabel: labelFor(status, habit.cadence, missStreak),
    daysSince, metNow, weekCount: 0, weekTarget: 1, missStreak, last7,
    nudge: '',
  };
}

function labelFor(status: HabitStatus, cadence: Habit['cadence'], missStreak: number): string {
  const unit = cadence === 'weekly' ? 'week' : 'day';
  switch (status) {
    case 'done': return cadence === 'weekly' ? 'Week done' : 'Done today';
    case 'due': return cadence === 'weekly' ? 'Still to do this week' : 'Due today';
    case 'new': return 'Not started';
    case 'yellow': return `Missed last ${unit}`;
    case 'red': return `Missed ${missStreak} ${unit}s running`;
  }
}

/** The status colour is a reserved status token, and every place it appears
 *  it is paired with `statusLabel` and an icon — never colour alone. */
export const statusColor = (s: HabitStatus): string => {
  switch (s) {
    case 'done': return 'var(--status-good)';
    case 'yellow': return 'var(--status-warning)';
    case 'red': return 'var(--status-critical)';
    default: return 'var(--text-muted)';
  }
};

export const statusIcon = (s: HabitStatus): string => {
  switch (s) {
    case 'done': return '✓';
    case 'yellow': return '!';
    case 'red': return '‼';
    default: return '○';
  }
};

const TONE = {
  gentle: {
    yellow: (t: string) => `Missed ${t} yesterday — easy to pick back up today.`,
    red: (t: string, n: number) => `It has been ${n} days without ${t}. Want to start again today?`,
    weeklyYellow: (t: string) => `${t} didn't happen last week. Worth getting in this week.`,
    weeklyRed: (t: string, n: number) => `${n} weeks without ${t} now. Let's get one in.`,
  },
  direct: {
    yellow: (t: string) => `You missed ${t} yesterday. Do it today.`,
    red: (t: string, n: number) => `${n} days without ${t}. This one is slipping — do it today.`,
    weeklyYellow: (t: string) => `You didn't ${t} last week. Get it in this week.`,
    weeklyRed: (t: string, n: number) => `${n} weeks without ${t}. Book it now, not later.`,
  },
  drill: {
    yellow: (t: string) => `You skipped ${t} yesterday. Not tomorrow — today.`,
    red: (t: string, n: number) => `${n} days. ${n} days without ${t}. Stop reading and go do it.`,
    weeklyYellow: (t: string) => `A whole week went by without ${t}. Fix that this week.`,
    weeklyRed: (t: string, n: number) => `${n} weeks without ${t}. That is a decision you keep making. Change it today.`,
  },
} as const;

export function nudgeFor(row: HabitRow, tone: keyof typeof TONE): string {
  const t = row.habit.title;
  const copy = TONE[tone] ?? TONE.direct;
  if (row.status === 'done') return row.habit.cadence === 'weekly' ? 'Done for the week.' : 'Done today.';
  if (row.status === 'new') return 'No history yet — start today.';
  if (row.habit.cadence === 'weekly') {
    if (row.status === 'yellow') return copy.weeklyYellow(t);
    if (row.status === 'red') return copy.weeklyRed(t, row.missStreak);
    return `${row.weekCount} of ${row.weekTarget} this week.`;
  }
  if (row.status === 'yellow') return copy.yellow(t);
  if (row.status === 'red') return copy.red(t, row.missStreak);
  return 'Due today.';
}

export function allRows(state: AppState): HabitRow[] {
  const tone = state.habits.tone;
  return state.habits.items
    .filter((h) => !h.archived)
    .map((h) => {
      const row = habitRow(h, state.habits.logs);
      return { ...row, nudge: nudgeFor(row, tone) };
    });
}

/** Everything that needs shouting about, worst first. */
export const attention = (rows: HabitRow[]): HabitRow[] =>
  rows.filter((r) => r.status === 'red' || r.status === 'yellow')
    .sort((a, b) => (a.status === b.status ? b.missStreak - a.missStreak : a.status === 'red' ? -1 : 1));

/** Share of daily habits met, for the module's ring. */
export function dailyCompletion(rows: HabitRow[], day: DateKey = todayKey()): number {
  const daily = rows.filter((r) => r.habit.cadence === 'daily');
  if (daily.length === 0) return 0;
  const met = daily.filter((r) => r.last7.find((d) => d.date === day)?.met).length;
  return met / daily.length;
}

/** Daily completion over the last seven days, for the bar chart. */
export function weekCompletion(rows: HabitRow[]): { key: DateKey; value: number }[] {
  return lastDays(7).map((d) => ({ key: d, value: Math.round(dailyCompletion(rows, d) * 100) }));
}
