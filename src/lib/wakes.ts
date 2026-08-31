/**
 * When this device should be woken, and what it should say when it is.
 *
 * The two halves are kept apart on purpose. The *times* go to the server, so
 * it knows when to send a push. The *wording* is written into IndexedDB on
 * this device and never leaves it — the service worker reads it back when the
 * push lands. So the server, the push service and anyone in between learn that
 * something was due, and nothing else.
 */

import type { AppState } from './schema';
import { addDays, fromKey, todayKey, type DateKey } from './date';
import { dueList } from './reminders';
import { allRows } from './habits';

export interface Wake {
  /** Epoch milliseconds. */
  at: number;
  /** Opaque to the server; only used to match a wake to its text here. */
  tag: string;
  title: string;
  body: string;
  /** Where tapping it should land. */
  to?: string;
  tab?: string;
}

/** The hour a day-level nudge arrives, in local time. */
export const MORNING_HOUR = 8;
export const EVENING_HOUR = 20;

const at = (key: DateKey, hour: number, minute = 0): number => {
  const d = fromKey(key);
  d.setHours(hour, minute, 0, 0);
  return d.getTime();
};

/** Parses "18:30" into a same-day timestamp. */
const atTime = (key: DateKey, time: string): number => {
  const [h, m] = time.split(':').map(Number);
  return at(key, h ?? MORNING_HOUR, m ?? 0);
};

/**
 * Builds the schedule for the next fortnight. Only future times are returned —
 * a wake in the past is not a notification, it is a missed one.
 */
export function wakePlan(state: AppState, now = Date.now()): Wake[] {
  const wakes: Wake[] = [];
  const horizon = now + 14 * 86_400_000;

  /* Reminders: at their own time when they have one, first thing otherwise. */
  for (const d of dueList(state)) {
    const r = d.reminder;
    if (r.done) continue;
    const when = r.time ? atTime(d.due, r.time) : at(d.due, MORNING_HOUR);
    if (when > now && when < horizon) {
      wakes.push({
        at: when,
        tag: `reminder:${r.id}:${d.due}`,
        title: r.title,
        body: r.time ? `Due at ${r.time}.` : 'Due today.',
        to: 'tracker',
        tab: 'reminders',
      });
    }
    // And once more the morning after, if it is still not done.
    const chase = at(addDays(d.due, 1), MORNING_HOUR);
    if (chase > now && chase < horizon) {
      wakes.push({
        at: chase,
        tag: `reminder-late:${r.id}:${d.due}`,
        title: `${r.title} — still not done`,
        body: 'It was due yesterday.',
        to: 'tracker',
        tab: 'reminders',
      });
    }
  }

  /* Client work with a due date: the morning of, and the morning after. */
  for (const p of state.work.projects) {
    if (!p.due || p.stage === 'Filed') continue;
    const morning = at(p.due, MORNING_HOUR);
    if (morning > now && morning < horizon) {
      wakes.push({
        at: morning,
        tag: `work:${p.id}:${p.due}`,
        title: `${p.client} — ${p.service} due today`,
        body: `${p.tasks.filter((t) => !t.done).length} task(s) still open.`,
        to: 'work',
      });
    }
  }

  /* The race, at a week and at a day out. */
  const race = state.fitness.race;
  if (race.date) {
    for (const [days, label] of [[7, 'a week away'], [1, 'tomorrow']] as const) {
      const when = at(addDays(race.date, -days), MORNING_HOUR);
      if (when > now && when < horizon) {
        wakes.push({
          at: when,
          tag: `race:${race.date}:${days}`,
          title: `${race.name} is ${label}`,
          body: race.targetTime ? `Target ${race.targetTime}.` : 'Ready?',
          to: 'fitness',
        });
      }
    }
  }

  /* One evening nudge, only on a day where something is actually slipping. */
  const slipping = allRows(state).filter((r) => r.status === 'due' || r.status === 'yellow' || r.status === 'red');
  if (slipping.length > 0) {
    const tonight = at(todayKey(), EVENING_HOUR);
    const when = tonight > now ? tonight : at(addDays(todayKey(), 1), EVENING_HOUR);
    if (when < horizon) {
      wakes.push({
        at: when,
        tag: `habits:${todayKey()}`,
        title: slipping.length === 1 ? slipping[0].habit.title : `${slipping.length} habits still open`,
        body: slipping.slice(0, 3).map((r) => r.habit.title).join(', '),
        to: 'habits',
      });
    }
  }

  return wakes
    .filter((w) => w.at > now)
    .sort((a, b) => a.at - b.at)
    .slice(0, 100);
}

/** What the server is allowed to see: a time and an opaque tag. */
export const timesOnly = (wakes: Wake[]): { at: number; tag: string }[] =>
  wakes.map((w) => ({ at: w.at, tag: w.tag }));
