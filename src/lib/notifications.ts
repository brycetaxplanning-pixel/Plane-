import type { AppNotification, AppState, ModuleId } from './schema';
import { addDays, diffDays, inWeek, todayKey, weekStart } from './date';
import { allRows } from './habits';
import { findInsights } from './insights';
import { needsReview } from './finance';
import { lastCompletedWeek } from './awards';
import { dueLabel, dueList } from './reminders';
import { uid } from './id';

/** Kept bounded: a year of daily use would otherwise grow without limit. */
const MAX_STORED = 300;

type Candidate = Omit<AppNotification, 'id' | 'createdAt' | 'read'>;

/**
 * Escalation thresholds are crossings, not exact matches.
 *
 * Matching an exact day count only works if the app is opened every single
 * day: something that goes overdue on a Saturday you never opened would sail
 * past the "1 day late" rung and never be raised at all. These return the
 * rung actually reached, so a gap in usage still surfaces the right one.
 */
const passedRung = (daysPast: number, rungs: number[]): number | null => {
  const reached = rungs.filter((r) => daysPast >= r);
  return reached.length ? Math.max(...reached) : null;
};

const approachRung = (daysUntil: number, rungs: number[]): number | null => {
  const reached = rungs.filter((r) => daysUntil <= r);
  return reached.length ? Math.min(...reached) : null;
};

/**
 * Every condition worth raising, with a stable key.
 *
 * The key is what stops the same thing being raised twice, so it encodes the
 * condition *and* the window it belongs to: a habit two days into a slip is a
 * different notification from the same habit five days in, but opening the app
 * three times on the same day is not three notifications.
 */
export function candidates(state: AppState): Candidate[] {
  const out: Candidate[] = [];
  const today = todayKey();
  const week = weekStart();

  /* Habits sliding — the escalation, at widening intervals rather than daily. */
  for (const row of allRows(state)) {
    if (row.status !== 'red') continue;
    const steps = [2, 3, 5, 7, 10, 14, 21];
    if (!steps.includes(row.missStreak)) continue;
    out.push({
      key: `habit:${row.habit.id}:${row.missStreak}`,
      kind: 'habit',
      module: 'habits',
      title: row.nudge,
      body: row.habit.cadence === 'weekly'
        ? `${row.weekCount} of ${row.weekTarget} this week.`
        : `Last done ${row.daysSince === null ? 'never' : `${row.daysSince} days ago`}.`,
      to: 'habits',
    });
  }

  /* Client work past its date. */
  for (const p of state.work.projects) {
    if (p.stage === 'Filed' || !p.due || p.due >= today) continue;
    const over = diffDays(today, p.due);
    const rung = passedRung(over, [1, 3, 7, 14, 30]);
    if (rung === null) continue;
    out.push({
      key: `work:${p.id}:${rung}`,
      kind: 'due',
      module: 'work',
      title: `${p.client} is ${over} day${over === 1 ? '' : 's'} past due`,
      body: `${p.service} · ${p.stage}`,
      to: 'work',
    });
  }

  /* A deal with a next step that has arrived. */
  for (const d of state.planning.deals) {
    if (d.stage === 'Won' || d.stage === 'Lost' || !d.nextStepDate) continue;
    if (d.nextStepDate !== today) continue;
    out.push({
      key: `deal:${d.id}:${d.nextStepDate}`,
      kind: 'deal',
      module: 'planning',
      title: `${d.name}: ${d.nextStep ?? 'next step'} is due today`,
      to: 'planning',
    });
  }

  /* Outreach pace, checked once mid-week rather than nagged daily. */
  const dayOfWeek = diffDays(today, week);
  if (dayOfWeek === 3 && state.planning.weeklyTarget > 0) {
    const done = state.planning.outreach.filter((o) => inWeek(o.date)).length;
    const expected = state.planning.weeklyTarget * (4 / 7);
    if (done < expected * 0.6) {
      out.push({
        key: `pace:${week}`,
        kind: 'due',
        module: 'planning',
        title: `${done} of ${state.planning.weeklyTarget} outreach with three days left`,
        body: `You would need ${Math.ceil((state.planning.weeklyTarget - done) / 3)} a day to finish the week on target.`,
        to: 'planning',
      });
    }
  }

  /* Goals with a date coming up. */
  for (const g of state.goals.items) {
    if (g.done || !g.due) continue;
    const away = diffDays(g.due, today);
    if (away < 0) continue;
    const rung = approachRung(away, [0, 1, 7, 14, 30]);
    if (rung === null) continue;
    out.push({
      key: `goal:${g.id}:${rung}`,
      kind: 'due',
      module: 'goals',
      title: away === 0 ? `${g.title} — that's today` : `${g.title} is ${away} day${away === 1 ? '' : 's'} away`,
      body: g.plan,
      to: 'goals',
    });
  }

  /* The race. */
  const race = state.fitness.race;
  if (race.date) {
    const away = diffDays(race.date, today);
    const rung = away >= 0 ? approachRung(away, [1, 7, 14, 30, 60]) : null;
    if (rung !== null) {
      out.push({
        key: `race:${race.date}:${rung}`,
        kind: 'due',
        module: 'fitness',
        title: `${race.name} is ${away} day${away === 1 ? '' : 's'} out`,
        body: `Longest run so far: ${state.fitness.activities.reduce((m, a) => Math.max(m, a.distanceKm ?? 0), 0).toFixed(1)} km.`,
        to: 'fitness',
        tab: 'race',
      });
    }
  }

  /* Transactions piling up unexplained. */
  const review = needsReview(state.finance.transactions);
  if (review.length >= 5) {
    out.push({
      key: `review:${week}:${Math.floor(review.length / 5) * 5}`,
      kind: 'finance',
      module: 'finance',
      title: `${review.length} transactions still need a category`,
      body: 'Until they are sorted, the budget totals are wrong.',
      to: 'finance',
      tab: 'review',
    });
  }

  /* Reminders that have arrived or gone past. */
  for (const d of dueList(state)) {
    const late = -d.daysAway;
    // Rung 0 is "it has arrived"; the rest escalate as it is left undone.
    const rung = passedRung(late, [0, 3, 7, 14, 30]);
    if (rung === null) continue;
    out.push({
      key: `reminder:${d.reminder.id}:${d.due}:${rung}`,
      kind: 'due',
      module: d.reminder.module,
      title: d.daysAway === 0
        ? `${d.reminder.title} — today`
        : `${d.reminder.title} — ${late} day${late === 1 ? '' : 's'} past`,
      body: dueLabel(d),
      to: 'tracker',
      tab: 'reminders',
    });
  }

  /* The strongest finding from the log. */
  const insight = findInsights(state).filter((i) => !state.insights.dismissed.includes(i.id))[0];
  if (insight && insight.weight >= 55) {
    out.push({
      key: `insight:${insight.id}:${week}`,
      kind: 'insight',
      module: 'coach',
      title: insight.title,
      body: insight.body,
      to: 'coach',
      tab: 'analysis',
    });
  }

  /* A perfect habit week. */
  const awarded = lastCompletedWeek();
  if (state.awards.enlightened.includes(awarded)) {
    out.push({
      key: `award:${awarded}`,
      kind: 'award',
      module: 'habits',
      title: 'Enlightenment — a perfect habit week',
      body: 'Every daily habit, every day, and every weekly habit.',
      to: 'habits',
    });
  }

  return out;
}

/** Adds anything new, leaves everything already raised alone. */
export function mergeNotifications(state: AppState): AppState {
  const existing = new Set(state.notifications.items.map((n) => n.key));
  const now = Date.now();

  const fresh = candidates(state)
    .filter((c) => !existing.has(c.key))
    .map((c, i) => ({ ...c, id: uid('ntf'), createdAt: now - i, read: false }));

  if (fresh.length === 0) return state;

  const items = [...fresh, ...state.notifications.items]
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, MAX_STORED);

  return { ...state, notifications: { ...state.notifications, items } };
}

export const unreadCount = (state: AppState): number =>
  state.notifications.items.filter((n) => !n.read).length;

/** Unread count per module, for the dots on the launcher. */
export function unreadByModule(state: AppState): Partial<Record<ModuleId, number>> {
  const out: Partial<Record<ModuleId, number>> = {};
  for (const n of state.notifications.items) {
    if (n.read || !n.module) continue;
    out[n.module] = (out[n.module] ?? 0) + 1;
  }
  return out;
}

export function relativeTime(at: number): string {
  const mins = Math.round((Date.now() - at) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  return `${Math.round(days / 7)}w ago`;
}

/* ------------------------------------------------------------------ */
/* Device alerts                                                       */
/* ------------------------------------------------------------------ */

export const deviceAlertsSupported = (): boolean =>
  typeof window !== 'undefined' && 'Notification' in window;

export async function requestDeviceAlerts(): Promise<boolean> {
  if (!deviceAlertsSupported()) return false;
  if (Notification.permission === 'granted') return true;
  if (Notification.permission === 'denied') return false;
  return (await Notification.requestPermission()) === 'granted';
}

/**
 * Fires a device-level alert for anything new.
 *
 * This only works while the app is open. Real push — an alert arriving when
 * the app is closed — needs a server holding a subscription and signing
 * messages, which a static site cannot do.
 */
export function raiseDeviceAlerts(items: AppNotification[]): void {
  if (!deviceAlertsSupported() || Notification.permission !== 'granted') return;
  for (const n of items.slice(0, 3)) {
    try {
      new Notification(n.title, { body: n.body, tag: n.key });
    } catch {
      // Some browsers only allow this through a service worker registration.
    }
  }
}

export const withinDays = (key: string, days: number): boolean =>
  key >= addDays(todayKey(), -days);
