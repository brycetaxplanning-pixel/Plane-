/**
 * When this device should be woken, and what it should say when it is.
 *
 * The two halves are kept apart on purpose. The *times* go to the server, so
 * it knows when to send a push. The *wording* is written into IndexedDB on
 * this device and never leaves it — the service worker reads it back when the
 * push lands. So the server, the push service and anyone in between learn that
 * something was due, and nothing else.
 */

import { remindMs, type AppState } from './schema';
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

/**
 * The most nudges one to-do may claim out of a fortnight's schedule.
 *
 * "Remind me every ten minutes" over fourteen days is two thousand wakes, and
 * the whole schedule is capped at a hundred — so without a per-item cap one
 * impatient to-do would take every slot and silence everything else in the app.
 */
const NUDGE_CAP = 12;

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

  /* To-dos asking to be nudged on their own cadence, whether or not they have
     a deadline. This is the one case where an undated one is pushed: you asked
     to be reminded every N, so being reminded is the whole point, and nothing
     here claims a due date it does not have. */
  for (const d of dueList(state)) {
    const r = d.reminder;
    if (r.done || !r.remindEvery) continue;
    const gap = remindMs(r.remindEvery);
    // From now rather than from when it was written: a to-do made a fortnight
    // ago on a ten-minute cadence should not arrive as a thousand backdated
    // nudges the moment the schedule is built.
    let at = now + gap;
    for (let i = 0; i < NUDGE_CAP && at < horizon; i += 1, at += gap) {
      wakes.push({
        at,
        tag: `todo-nudge:${r.id}:${at}`,
        title: r.title,
        body: d.undated ? 'Still on your list.' : `Due ${d.due}${r.time ? ` at ${r.time}` : ''}.`,
        to: 'reminders',
      });
    }
  }

  /* Reminders: at their own time when they have one, first thing otherwise. */
  for (const d of dueList(state)) {
    const r = d.reminder;
    if (r.done) continue;
    // Undated ones borrow today from dueList to sort by. Pushing that would
    // announce a deadline the reminder never had — and the morning-after chase
    // would then say it was due yesterday.
    if (d.undated) continue;
    const when = r.time ? atTime(d.due, r.time) : at(d.due, MORNING_HOUR);
    if (when > now && when < horizon) {
      wakes.push({
        at: when,
        tag: `reminder:${r.id}:${d.due}`,
        title: r.title,
        body: r.time ? `Due at ${r.time}.` : 'Due today.',
        to: 'reminders',
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
        to: 'reminders',
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

/**
 * What the server is allowed to see: a time, and nothing else.
 *
 * The tags stay here. They name the module and the record — `work:abc:2026-09-02`
 * — which is exactly the sort of thing the server is not supposed to learn, and
 * it does not need them: the client replaces the whole schedule each time, so
 * there is nothing to reconcile by id.
 */
export const timesOnly = (wakes: Wake[]): { at: number }[] =>
  wakes.map((w) => ({ at: w.at }));
