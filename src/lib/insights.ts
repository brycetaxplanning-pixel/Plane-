import { bucketOf, type AppState, type Habit } from './schema';
import { addDays, fmtDate, fmtRange, lastWeeks, monthKey, todayKey, weekStart, type DateKey } from './date';
import { allRows, dailyCompletion } from './habits';

/**
 * Weekly aggregates across every module, and the plain-arithmetic analysis
 * that runs over them.
 *
 * Everything here is descriptive. With a few dozen weeks of one person's
 * self-reported log there is no way to establish that one thing causes
 * another, so findings are phrased as "in the weeks where X, Y averaged Z"
 * and always carry the number of weeks they are based on. The UI repeats that
 * caveat; the engine simply never claims more than it can show.
 */

export interface WeekRow {
  week: DateKey;
  fitness: number;
  mma: number;
  strength: number;
  runKm: number;
  trainingMinutes: number;
  spanish: number;
  outreach: number;
  meetings: number;
  tasksDone: number;
  habitPct: number;
  mood: number | null;
  energy: number | null;
  notes: number;
}

export const METRICS = {
  fitness: { label: 'fitness sessions', unit: '' },
  mma: { label: 'MMA sessions', unit: '' },
  strength: { label: 'strength sessions', unit: '' },
  runKm: { label: 'kilometres run', unit: ' km' },
  trainingMinutes: { label: 'minutes training', unit: ' min' },
  spanish: { label: 'minutes of Spanish', unit: ' min' },
  outreach: { label: 'outreach contacts', unit: '' },
  meetings: { label: 'meetings booked', unit: '' },
  tasksDone: { label: 'client tasks finished', unit: '' },
  habitPct: { label: 'habit completion', unit: '%' },
  mood: { label: 'mood', unit: '/5' },
  energy: { label: 'energy', unit: '/5' },
  notes: { label: 'notes written', unit: '' },
} as const;

export type MetricKey = keyof typeof METRICS;

/** Metrics that plausibly drive an outcome, and the outcomes worth watching.
 *  Kept explicit rather than testing every pair: with this many columns,
 *  scanning all of them would surface coincidences by construction. */
const DRIVERS: MetricKey[] = ['fitness', 'mma', 'strength', 'runKm', 'trainingMinutes', 'spanish', 'habitPct'];
const OUTCOMES: MetricKey[] = ['tasksDone', 'outreach', 'meetings', 'mood', 'energy', 'habitPct'];

export function weeklyRows(state: AppState, weeks = 12): WeekRow[] {
  const rows = allRows(state);

  return lastWeeks(weeks).map((week) => {
    const inWeekRange = (d: DateKey) => weekStart(d) === week;
    const acts = state.fitness.activities.filter((a) => inWeekRange(a.date));
    const checkIns = state.coach.checkIns.filter((c) => inWeekRange(c.date));
    const days = Array.from({ length: 7 }, (_, i) => addDays(week, i));

    const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

    return {
      week,
      fitness: acts.length,
      mma: acts.filter((a) => bucketOf(a.type) === 'mma').length,
      strength: acts.filter((a) => bucketOf(a.type) === 'strength').length,
      runKm: Math.round(acts.reduce((n, a) => n + (a.distanceKm ?? 0), 0) * 10) / 10,
      trainingMinutes: acts.reduce((n, a) => n + a.minutes, 0),
      spanish: state.spanish.sessions.filter((x) => inWeekRange(x.date)).reduce((n, x) => n + x.minutes, 0),
      outreach: state.planning.outreach.filter((o) => inWeekRange(o.date)).length,
      meetings: state.planning.outreach.filter((o) => inWeekRange(o.date) && o.outcome === 'Meeting booked').length,
      tasksDone: state.work.projects.flatMap((p) => p.tasks).filter((t) => t.doneAt && inWeekRange(t.doneAt)).length,
      habitPct: Math.round((days.reduce((n, d) => n + dailyCompletion(rows, d), 0) / 7) * 100),
      mood: avg(checkIns.map((c) => c.mood)),
      energy: avg(checkIns.map((c) => c.energy)),
      notes: state.notes.items.filter((n) => inWeekRange(n.createdAt)).length,
    };
  });
}

/** A week counts as lived-in only if something was logged; empty weeks would
 *  otherwise drag every average toward zero and invent findings. */
const isLive = (r: WeekRow): boolean =>
  r.fitness > 0 || r.spanish > 0 || r.outreach > 0 || r.tasksDone > 0 || r.habitPct > 0 || r.notes > 0;

export type InsightKind = 'split' | 'trend' | 'neglect' | 'streak' | 'balance';

export interface Insight {
  /** Stable across runs so a dismissal sticks to the finding, not the day. */
  id: string;
  kind: InsightKind;
  title: string;
  body: string;
  /** How much it is worth saying out loud. Drives ordering and the popup. */
  weight: number;
  /** Shown under every finding so the sample size is never hidden. */
  evidence: string;
  module?: string;
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const fmt = (n: number, key: MetricKey) => {
  const m = METRICS[key];
  const v = Math.abs(n) >= 10 ? Math.round(n) : Math.round(n * 10) / 10;
  return `${v}${m.unit}`;
};

/** The first week a metric shows any activity. Comparing against weeks before
 *  a module existed is how you manufacture a finding out of nothing: every
 *  earlier week reads as a zero, so anything started recently correlates with
 *  everything else that happened recently. */
function firstActive(rows: WeekRow[], key: MetricKey): number {
  return rows.findIndex((r) => r[key] !== null && Number(r[key]) > 0);
}

/**
 * Splits the weeks into the ones at or above the median of a driver and the
 * ones below, then compares the outcome across the two groups.
 *
 * A median split beats a correlation coefficient here: it needs fewer weeks to
 * say anything, it is robust to one freak week, and "in your best weeks you
 * did X" is what a person can act on. Both groups need at least three weeks
 * and the gap has to be large enough not to be noise.
 */
function splitInsight(rows: WeekRow[], driver: MetricKey, outcome: MetricKey): Insight | null {
  if (driver === outcome) return null;

  // Only compare over the span where both metrics were actually being kept.
  const from = Math.max(firstActive(rows, driver), firstActive(rows, outcome));
  if (from < 0) return null;

  const usable = rows.slice(from).filter((r) => r[outcome] !== null && r[driver] !== null);
  if (usable.length < 6) return null;

  // A metric that is mostly zeros inside its own window is too sparse to
  // average meaningfully.
  const outcomeLive = usable.filter((r) => Number(r[outcome]) > 0).length;
  if (outcomeLive / usable.length < 0.7) return null;

  const driverValues = usable.map((r) => Number(r[driver])).sort((a, b) => a - b);
  const median = driverValues[Math.floor(driverValues.length / 2)];
  if (median <= 0) return null;
  // A driver that barely moves cannot explain anything.
  if (new Set(driverValues).size < 3) return null;

  const high = usable.filter((r) => Number(r[driver]) >= median);
  const low = usable.filter((r) => Number(r[driver]) < median);
  if (high.length < 3 || low.length < 3) return null;

  const highOut = mean(high.map((r) => Number(r[outcome])));
  const lowOut = mean(low.map((r) => Number(r[outcome])));
  if (lowOut <= 0 && highOut <= 0) return null;

  const base = Math.max(lowOut, 0.5);
  const lift = (highOut - lowOut) / base;
  // A third better or worse is the floor for saying anything at all.
  if (Math.abs(lift) < 0.33) return null;

  const better = lift > 0;
  const d = METRICS[driver].label;
  const o = METRICS[outcome].label;

  return {
    id: `split:${driver}:${outcome}`,
    kind: 'split',
    weight: Math.min(1, Math.abs(lift)) * 100 + usable.length,
    title: better
      ? `Your strongest weeks for ${o} are the weeks you did more ${d}`
      : `More ${d} lines up with less ${o}`,
    body: `In the ${high.length} weeks where ${d} reached ${fmt(median, driver)} or more, ${o} averaged ${fmt(highOut, outcome)}. Across the other ${low.length} weeks it averaged ${fmt(lowOut, outcome)}.`,
    evidence: `${usable.length} weeks of your own log. This is a pattern in the data, not proof one causes the other.`,
  };
}

/** Three weeks moving the same way, in a metric where direction matters. */
function trendInsight(rows: WeekRow[], key: MetricKey): Insight | null {
  const live = rows.filter(isLive);
  if (live.length < 4) return null;
  const last4 = live.slice(-4).map((r) => Number(r[key]));
  if (last4.some((v) => Number.isNaN(v))) return null;

  const rising = last4.every((v, i) => i === 0 || v > last4[i - 1]);
  const falling = last4.every((v, i) => i === 0 || v < last4[i - 1]);
  if (!rising && !falling) return null;
  if (Math.abs(last4[3] - last4[0]) < 2) return null;

  const label = METRICS[key].label;
  return {
    id: `trend:${key}:${rising ? 'up' : 'down'}`,
    kind: 'trend',
    weight: 60 + Math.abs(last4[3] - last4[0]),
    title: rising ? `${cap(label)} has climbed four weeks running` : `${cap(label)} has fallen four weeks running`,
    body: `From ${fmt(last4[0], key)} to ${fmt(last4[3], key)} a week.`,
    evidence: 'The last four weeks, in order.',
  };
}

/** Something that used to happen and has stopped. */
function neglectInsights(state: AppState): Insight[] {
  const today = todayKey();
  const out: Insight[] = [];

  const check = (id: string, label: string, dates: DateKey[], warnDays: number) => {
    if (dates.length < 3) return;
    const last = dates.slice().sort().at(-1)!;
    const gap = Math.round((new Date(today).getTime() - new Date(last).getTime()) / 86_400_000);
    if (gap < warnDays) return;
    // Phrased so it reads correctly whether the label is singular or plural.
    out.push({
      id: `neglect:${id}`,
      kind: 'neglect',
      weight: 50 + gap,
      title: `${cap(label)}: quiet for ${gap} days`,
      body: `Nothing logged since ${fmtDate(last)}, after ${dates.length} entries before that.`,
      evidence: 'Compared against how often you were logging it before.',
    });
  };

  check('spanish', 'Spanish', state.spanish.sessions.map((s) => s.date), 5);
  check('outreach', 'outreach', state.planning.outreach.map((o) => o.date), 5);
  check('fitness', 'training', state.fitness.activities.map((a) => a.date), 4);
  check('checkins', 'check-ins', state.coach.checkIns.map((c) => c.date), 5);
  return out;
}

/**
 * How thinly the week is spread. Counts the goals and quotas that are live and
 * compares against how many actually moved this week.
 */
function balanceInsight(state: AppState, rows: WeekRow[]): Insight | null {
  const current = rows.at(-1);
  if (!current) return null;

  const fronts = [
    { name: 'client work', active: current.tasksDone > 0 },
    { name: 'outreach', active: current.outreach > 0 },
    { name: 'Spanish', active: current.spanish > 0 },
    { name: 'training', active: current.fitness > 0 },
    { name: 'habits', active: current.habitPct >= 50 },
  ];
  const openGoals = state.goals.items.filter((g) => !g.done).length;
  const moved = fronts.filter((f) => f.active).length;
  const stalled = fronts.filter((f) => !f.active).map((f) => f.name);

  if (openGoals < 4 || stalled.length < 2) return null;

  return {
    id: 'balance:spread',
    kind: 'balance',
    weight: 55 + openGoals * 2,
    title: `${openGoals} open goals, ${moved} of 5 fronts moving this week`,
    body: `Nothing logged this week for ${stalled.join(', ')}. Spreading across everything usually means everything moves slowly rather than nothing moving at all — worth picking which two matter most this month.`,
    evidence: 'This week, against your open goals.',
  };
}

/** The longest current run of days with something logged. */
function streakInsight(state: AppState): Insight | null {
  const days = new Set(state.activeDays);
  let run = 0;
  let cursor = days.has(todayKey()) ? todayKey() : addDays(todayKey(), -1);
  while (days.has(cursor)) { run++; cursor = addDays(cursor, -1); }
  if (run < 7) return null;
  return {
    id: `streak:${Math.floor(run / 7)}`,
    kind: 'streak',
    weight: 40 + run,
    title: `${run} days without missing a day`,
    body: 'Whatever else is going on, you have opened this and logged something every day for over a week.',
    evidence: `${state.activeDays.length} active days recorded in total.`,
  };
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Everything worth saying, strongest first. */
export function findInsights(state: AppState): Insight[] {
  const rows = weeklyRows(state).filter(isLive);
  const found: Insight[] = [];

  for (const driver of DRIVERS) {
    for (const outcome of OUTCOMES) {
      const insight = splitInsight(rows, driver, outcome);
      if (insight) found.push(insight);
    }
  }
  for (const key of ['outreach', 'fitness', 'spanish', 'habitPct'] as MetricKey[]) {
    const insight = trendInsight(rows, key);
    if (insight) found.push(insight);
  }
  found.push(...neglectInsights(state));

  const balance = balanceInsight(state, weeklyRows(state));
  if (balance) found.push(balance);
  const streak = streakInsight(state);
  if (streak) found.push(streak);

  // One split finding per outcome, so a single good week does not produce six
  // variations on the same sentence.
  const seenOutcome = new Set<string>();
  return found
    .sort((a, b) => b.weight - a.weight)
    .filter((i) => {
      if (i.kind !== 'split') return true;
      const outcome = i.id.split(':')[2];
      if (seenOutcome.has(outcome)) return false;
      seenOutcome.add(outcome);
      return true;
    });
}

/** The one to raise unprompted, if any: strongest finding not already waved
 *  away, and never more than one a day. */
export function popupInsight(state: AppState): Insight | null {
  if (!state.insights.enabled) return null;
  if (state.insights.lastPopup === todayKey()) return null;
  const candidates = findInsights(state).filter((i) => !state.insights.dismissed.includes(i.id));
  return candidates.find((i) => i.weight >= 55) ?? null;
}

/* ------------------------------------------------------------------ */
/* The reality check                                                   */
/* ------------------------------------------------------------------ */

export interface TimeDemand {
  name: string;
  hours: number;
  /** True when the figure comes from the user's own averages rather than a
   *  stated assumption. */
  measured: boolean;
  note: string;
}

export interface RealityCheck {
  demands: TimeDemand[];
  committed: number;
  available: number;
  jobHours: number;
  sleepHours: number;
  overBy: number;
}

/**
 * Adds up what a week actually asks for, using the user's own logged averages
 * wherever they exist, and compares it with the hours left after sleep and the
 * day job. This is the arithmetic behind "you cannot fit all of this".
 */
export function realityCheck(state: AppState, jobHours = 45, sleepHours = 8): RealityCheck {
  const demands: TimeDemand[] = [];

  const acts = state.fitness.activities;
  const avgSession = acts.length ? acts.reduce((n, a) => n + a.minutes, 0) / acts.length : 60;
  const sessions = state.fitness.targets.total;
  demands.push({
    name: `Training — ${sessions} sessions`,
    hours: (sessions * avgSession) / 60,
    measured: acts.length >= 5,
    note: acts.length >= 5
      ? `Your sessions average ${Math.round(avgSession)} min.`
      : 'Assuming 60 min a session until more are logged.',
  });

  const spanishWeekly = state.spanish.weeklyGoalMinutes || state.spanish.dailyGoalMinutes * 7;
  demands.push({
    name: 'Spanish',
    hours: spanishWeekly / 60,
    measured: true,
    note: 'Your stated weekly goal.',
  });

  const outreachTarget = state.planning.weeklyTarget;
  demands.push({
    name: `Outreach — ${outreachTarget} contacts`,
    hours: (outreachTarget * 6) / 60,
    measured: false,
    note: 'Assuming 6 min per contact including the follow-up note.',
  });

  const dailyHabits = state.habits.items.filter((h) => h.cadence === 'daily' && !h.archived).length;
  const weeklyHabits = state.habits.items.filter((h) => h.cadence === 'weekly' && !h.archived);
  const weeklyCount = weeklyHabits.reduce((n, h) => n + Math.max(1, h.timesPerWeek ?? 1), 0);
  if (dailyHabits + weeklyCount > 0) {
    demands.push({
      name: 'Habits',
      hours: (dailyHabits * 7 * 12 + weeklyCount * 25) / 60,
      measured: false,
      note: 'Assuming 12 min per daily habit and 25 min per weekly one.',
    });
  }

  const committed = demands.reduce((n, d) => n + d.hours, 0);
  const available = 168 - sleepHours * 7 - jobHours;
  return { demands, committed, available, jobHours, sleepHours, overBy: committed - available };
}

const TIME_UNITS = ['h', 'hr', 'hrs', 'hour', 'hours', 'min', 'mins', 'minute', 'minutes'];

export interface TimeSink {
  habit: string;
  unit: string;
  /** Hours logged against this cap this week. */
  hoursThisWeek: number;
  /** What the cap allowed across the days actually logged — not across the
   *  whole week. Comparing one logged day against a seven-day allowance
   *  reports a heavy day as comfortably under. */
  capForLoggedDays: number;
  capPerDay: number;
  daysLogged: number;
  overBy: number;
  /** Where the week lands if the logged days are representative. */
  projectedWeek: number;
}

/**
 * Habits with a ceiling and a time unit — screen time being the obvious one.
 * There is no public API for iOS Screen Time, so the number is whatever you
 * type in; this just adds it up and puts it next to the hours you actually
 * have.
 */
/**
 * The running total for a capped time habit — screen time being the one this
 * was built for. The weekly view above says how this week is going; this says
 * how much of your life has gone into it since you started counting, which is
 * the number that actually stings.
 *
 * Only logged days count. A day you did not log is not assumed to be zero and
 * not assumed to be bad — it is simply not counted, and the number of days is
 * reported alongside so the total can be read for what it is.
 */
export interface SinkTotal {
  habit: Habit;
  unit: string;
  daysLogged: number;
  /** Every hour logged against this habit, ever. */
  hoursTotal: number;
  hoursThisMonth: number;
  /** Hours beyond the cap, summed over the days that went over. */
  hoursOver: number;
  hoursOverThisMonth: number;
  /** Days that came in at or under the cap. */
  daysUnder: number;
  capPerDay: number;
  /** Average across logged days, so a week of not logging cannot flatter it. */
  averagePerDay: number;
  /** What the overage would be over a year at this rate. */
  projectedYear: number;
}

/**
 * Puts a number of hours into terms taken from what this person actually does:
 * the length of their own Spanish sessions, their own training sessions. Falls
 * back to plain days only when there is nothing logged to compare against —
 * an invented equivalent would be worse than none.
 */
export function hoursAs(state: AppState, hours: number): string | null {
  if (hours < 1) return null;

  const sessions = state.spanish.sessions;
  const activities = state.fitness.activities;

  const avgStudy = sessions.length
    ? sessions.reduce((n, x) => n + x.minutes, 0) / sessions.length / 60
    : 0;
  const avgTraining = activities.length
    ? activities.reduce((n, x) => n + x.minutes, 0) / activities.length / 60
    : 0;

  if (avgStudy > 0 && hours / avgStudy >= 2) {
    return `${Math.round(hours / avgStudy)} Spanish sessions, the length you actually do them`;
  }
  if (avgTraining > 0 && hours / avgTraining >= 2) {
    return `${Math.round(hours / avgTraining)} training sessions`;
  }
  if (hours >= 24) return `${(hours / 24).toFixed(1)} full days`;
  return null;
}

export function sinkTotals(state: AppState): SinkTotal[] {
  const toHours = (v: number, unit: string) => (unit.startsWith('min') ? v / 60 : v);
  const month = monthKey();
  const round = (n: number) => Math.round(n * 10) / 10;

  return state.habits.items
    .filter((h) => h.kind === 'under' && !h.archived && h.unit && TIME_UNITS.includes(h.unit.toLowerCase()))
    .map((h) => {
      const unit = (h.unit ?? 'h').toLowerCase();
      const capPerDay = toHours(h.target ?? 0, unit);
      const logs = state.habits.logs.filter((l) => l.habitId === h.id && l.amount !== undefined);

      let hoursTotal = 0;
      let hoursThisMonth = 0;
      let hoursOver = 0;
      let hoursOverThisMonth = 0;
      let daysUnder = 0;

      for (const l of logs) {
        const hours = toHours(l.amount ?? 0, unit);
        const over = Math.max(0, hours - capPerDay);
        hoursTotal += hours;
        hoursOver += over;
        if (over === 0) daysUnder += 1;
        if (monthKey(l.date) === month) {
          hoursThisMonth += hours;
          hoursOverThisMonth += over;
        }
      }

      const daysLogged = logs.length;
      return {
        habit: h,
        unit: h.unit ?? 'h',
        daysLogged,
        hoursTotal: round(hoursTotal),
        hoursThisMonth: round(hoursThisMonth),
        hoursOver: round(hoursOver),
        hoursOverThisMonth: round(hoursOverThisMonth),
        daysUnder,
        capPerDay: round(capPerDay),
        averagePerDay: daysLogged ? round(hoursTotal / daysLogged) : 0,
        projectedYear: daysLogged ? round((hoursOver / daysLogged) * 365) : 0,
      };
    })
    .filter((s) => s.daysLogged > 0);
}

export function timeSinks(state: AppState): TimeSink[] {
  const week = lastWeeks(1)[0];
  const toHours = (v: number, unit: string) => (unit.startsWith('min') ? v / 60 : v);

  return state.habits.items
    .filter((h) => h.kind === 'under' && !h.archived && h.unit && TIME_UNITS.includes(h.unit.toLowerCase()))
    .map((h) => {
      const logs = state.habits.logs.filter((l) => l.habitId === h.id && weekStart(l.date) === week && l.amount !== undefined);
      const unit = (h.unit ?? 'h').toLowerCase();
      const hoursThisWeek = logs.reduce((n, l) => n + toHours(l.amount ?? 0, unit), 0);
      const capPerDay = toHours(h.target ?? 0, unit);
      const capForLoggedDays = capPerDay * logs.length;
      const round = (n: number) => Math.round(n * 10) / 10;
      return {
        habit: h.title,
        unit: h.unit ?? 'h',
        hoursThisWeek: round(hoursThisWeek),
        capForLoggedDays: round(capForLoggedDays),
        capPerDay: round(capPerDay),
        daysLogged: logs.length,
        overBy: round(hoursThisWeek - capForLoggedDays),
        projectedWeek: round(logs.length ? (hoursThisWeek / logs.length) * 7 : 0),
      };
    })
    .filter((s) => s.daysLogged > 0);
}

/** A short, factual summary of the current month's spending pace, used by the
 *  analysis panel. */
export function spendPace(state: AppState): { spent: number; budget: number; dayOfMonth: number; daysInMonth: number } | null {
  const month = monthKey();
  const budget = Object.values(state.finance.budgets).reduce((n, v) => n + v, 0);
  if (!budget) return null;
  const spent = state.finance.transactions
    .filter((t) => monthKey(t.date) === month)
    .reduce((n, t) => n + t.amount, 0);
  const now = new Date();
  return {
    spent,
    budget,
    dayOfMonth: now.getDate(),
    daysInMonth: new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate(),
  };
}

export const weekLabel = (week: DateKey): string => fmtRange(week, addDays(week, 6));
