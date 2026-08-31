import type { AppState, Reminder } from './schema';
import { addDays, diffDays, fmtDate, fromKey, todayKey, type DateKey } from './date';

export interface DueReminder {
  reminder: Reminder;
  /** The date it is next due. */
  due: DateKey;
  /** Negative when overdue. */
  daysAway: number;
  overdue: boolean;
  /** For interval reminders: how long since it was last done. */
  sinceLast: number | null;
}

/** When a reminder next wants your attention. */
export function nextDue(r: Reminder): DateKey | null {
  if (r.repeat === 'Every N days') {
    const gap = Math.max(1, r.everyDays ?? 7);
    // Never done: due now, so a new interval reminder does not sit silent
    // waiting for a first completion that has to be triggered by itself.
    return r.lastDone ? addDays(r.lastDone, gap) : r.createdAt;
  }
  if (!r.date) return null;
  if (r.repeat === 'Once') return r.date;

  // Roll a recurring date forward to the next occurrence at or after today.
  const today = todayKey();
  let cursor = r.date;
  let guard = 0;
  while (cursor < today && guard++ < 400) {
    if (r.repeat === 'Daily') cursor = addDays(cursor, 1);
    else if (r.repeat === 'Weekly') cursor = addDays(cursor, 7);
    else {
      const d = fromKey(cursor);
      d.setMonth(d.getMonth() + 1);
      cursor = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    }
  }
  return cursor;
}

export function dueList(state: AppState): DueReminder[] {
  const today = todayKey();
  return state.reminders.items
    .filter((r) => !r.done)
    .map((r) => {
      const due = nextDue(r) ?? today;
      return {
        reminder: r,
        due,
        daysAway: diffDays(due, today),
        overdue: due < today,
        sinceLast: r.lastDone ? diffDays(today, r.lastDone) : null,
      };
    })
    .sort((a, b) => a.due.localeCompare(b.due));
}

/** What the row says under the title. */
export function dueLabel(d: DueReminder): string {
  const { reminder: r } = d;
  if (r.repeat === 'Every N days') {
    const gap = Math.max(1, r.everyDays ?? 7);
    if (d.sinceLast === null) return `Every ${gap} days · never done`;
    return d.overdue
      ? `${d.sinceLast} days since the last one — due every ${gap}`
      : `${d.sinceLast} days ago · next in ${d.daysAway}`;
  }
  const when = d.daysAway === 0 ? 'today' : d.daysAway === 1 ? 'tomorrow'
    : d.daysAway < 0 ? `${-d.daysAway} day${d.daysAway === -1 ? '' : 's'} ago` : `in ${d.daysAway} days`;
  const time = r.time ? ` at ${r.time}` : '';
  return `${fmtDate(d.due)}${time} · ${when}${r.repeat === 'Once' ? '' : ` · ${r.repeat.toLowerCase()}`}`;
}

/* ------------------------------------------------------------------ */
/* Calendar export                                                     */
/* ------------------------------------------------------------------ */

const stamp = (date: DateKey, time?: string): string => {
  const clean = date.replace(/-/g, '');
  if (!time) return clean;
  return `${clean}T${time.replace(':', '')}00`;
};

const escape = (s: string) => s.replace(/([,;\\])/g, '\\$1').replace(/\n/g, '\\n');

const RRULE: Record<string, string | null> = {
  Once: null,
  Daily: 'FREQ=DAILY',
  Weekly: 'FREQ=WEEKLY',
  Monthly: 'FREQ=MONTHLY',
};

/**
 * An .ics file, which is the only way to put something in Apple Calendar
 * without a server: Apple has no calendar API for third parties. Opening the
 * file adds the event, and it syncs onward from there.
 */
export function toICS(reminders: Reminder[]): string {
  const now = new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';

  const events = reminders.flatMap((r) => {
    const due = nextDue(r);
    if (!due) return [];
    const allDay = !r.time;
    const rule = r.repeat === 'Every N days'
      ? `FREQ=DAILY;INTERVAL=${Math.max(1, r.everyDays ?? 7)}`
      : RRULE[r.repeat];

    return [[
      'BEGIN:VEVENT',
      `UID:${r.id}@plane.local`,
      `DTSTAMP:${now}`,
      allDay
        ? `DTSTART;VALUE=DATE:${stamp(due)}`
        : `DTSTART:${stamp(due, r.time)}`,
      allDay
        ? `DTEND;VALUE=DATE:${stamp(addDays(due, 1))}`
        : `DTEND:${stamp(due, addHour(r.time!))}`,
      rule ? `RRULE:${rule}` : '',
      `SUMMARY:${escape(r.title)}`,
      r.notes ? `DESCRIPTION:${escape(r.notes)}` : '',
      'END:VEVENT',
    ].filter(Boolean).join('\r\n')];
  });

  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Plane//Reminders//EN',
    'CALSCALE:GREGORIAN',
    ...events,
    'END:VCALENDAR',
  ].join('\r\n');
}

function addHour(time: string): string {
  const [h, m] = time.split(':').map(Number);
  return `${String((h + 1) % 24).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** A one-click "add to Google Calendar" link, for the same reason. */
export function googleCalendarUrl(r: Reminder): string {
  const due = nextDue(r) ?? todayKey();
  const dates = r.time
    ? `${stamp(due, r.time)}/${stamp(due, addHour(r.time))}`
    : `${stamp(due)}/${stamp(addDays(due, 1))}`;

  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: r.title,
    dates,
    ...(r.notes ? { details: r.notes } : {}),
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}
