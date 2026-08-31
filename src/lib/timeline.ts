import { MODULES, type AppState, type ModuleId } from './schema';
import { addDays, diffDays, todayKey, weekStart, type DateKey } from './date';
import { nextDue } from './reminders';

export interface TimelineItem {
  id: string;
  date: DateKey;
  title: string;
  detail?: string;
  module?: ModuleId;
  /** Where tapping it goes. */
  to?: string;
  tab?: string;
  kind: 'project' | 'deal' | 'goal' | 'race' | 'reminder';
  done?: boolean;
}

export const moduleColor = (id?: ModuleId): string =>
  MODULES.find((m) => m.id === id)?.color ?? 'var(--text-muted)';

/** Everything with a date on it, from every module, in one list. */
export function timelineItems(state: AppState): TimelineItem[] {
  const out: TimelineItem[] = [];

  for (const p of state.work.projects) {
    if (!p.due || p.stage === 'Filed') continue;
    out.push({
      id: `prj-${p.id}`, date: p.due, kind: 'project', module: 'work', to: 'work',
      title: p.client,
      detail: `${p.service} · ${p.stage}`,
    });
  }

  for (const d of state.planning.deals) {
    if (!d.nextStepDate || d.stage === 'Won' || d.stage === 'Lost') continue;
    out.push({
      id: `deal-${d.id}`, date: d.nextStepDate, kind: 'deal', module: 'planning', to: 'planning',
      title: d.name,
      detail: d.nextStep ?? d.stage,
    });
  }

  for (const g of state.goals.items) {
    if (g.done || !g.due) continue;
    out.push({
      id: `goal-${g.id}`, date: g.due, kind: 'goal', module: 'goals', to: 'goals',
      title: g.title,
      detail: g.plan,
    });
  }

  const race = state.fitness.race;
  if (race.date) {
    out.push({
      id: 'race', date: race.date, kind: 'race', module: 'fitness', to: 'fitness', tab: 'race',
      title: race.name,
      detail: `${race.distanceKm} km${race.targetTime ? ` · target ${race.targetTime}` : ''}`,
    });
  }

  for (const r of state.reminders.items) {
    if (r.done) continue;
    const due = nextDue(r);
    if (!due) continue;
    out.push({
      id: `rem-${r.id}`, date: due, kind: 'reminder', module: r.module, to: 'tracker',
      title: r.title,
      detail: r.time ? `at ${r.time}` : r.repeat !== 'Once' ? r.repeat.toLowerCase() : undefined,
    });
  }

  return out.sort((a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title));
}

export interface DayGroup {
  date: DateKey;
  items: TimelineItem[];
}

/** Grouped by day across a window, including empty days so the shape of the
 *  week is visible rather than just a list of whatever happens to exist. */
export function groupByDay(items: TimelineItem[], from: DateKey, days: number): DayGroup[] {
  return Array.from({ length: days }, (_, i) => {
    const date = addDays(from, i);
    return { date, items: items.filter((x) => x.date === date) };
  });
}

/** Anything already past its date and still open. */
export const overdueItems = (items: TimelineItem[]): TimelineItem[] =>
  items.filter((x) => x.date < todayKey());

/** Anything beyond the visible window, so nothing silently disappears. */
export const beyond = (items: TimelineItem[], from: DateKey, days: number): TimelineItem[] =>
  items.filter((x) => x.date >= addDays(from, days));

export const windowStart = (view: 'week' | 'month'): DateKey =>
  view === 'week' ? weekStart() : todayKey();

export const windowLength = (view: 'week' | 'month'): number => (view === 'week' ? 7 : 35);

export const isToday = (d: DateKey): boolean => d === todayKey();
export const daysFromToday = (d: DateKey): number => diffDays(d, todayKey());
