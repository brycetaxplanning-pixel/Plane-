/** All dates are handled as local-time `YYYY-MM-DD` keys so a log made at
 *  11pm belongs to that day, not to tomorrow in UTC. */

export type DateKey = string;

export function toKey(d: Date): DateKey {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function fromKey(key: DateKey): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

export const todayKey = (): DateKey => toKey(new Date());

export function addDays(key: DateKey, n: number): DateKey {
  const d = fromKey(key);
  d.setDate(d.getDate() + n);
  return toKey(d);
}

export function diffDays(a: DateKey, b: DateKey): number {
  const ms = fromKey(a).getTime() - fromKey(b).getTime();
  return Math.round(ms / 86_400_000);
}

/** Monday-based week start. */
export function weekStart(key: DateKey = todayKey()): DateKey {
  const d = fromKey(key);
  const shift = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - shift);
  return toKey(d);
}

export function weekEnd(key: DateKey = todayKey()): DateKey {
  return addDays(weekStart(key), 6);
}

/** The seven date keys of the week containing `key`, Monday first. */
export function weekDays(key: DateKey = todayKey()): DateKey[] {
  const start = weekStart(key);
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

/** Start keys for the last `n` weeks, oldest first, ending with this week. */
export function lastWeeks(n: number, key: DateKey = todayKey()): DateKey[] {
  const start = weekStart(key);
  return Array.from({ length: n }, (_, i) => addDays(start, (i - n + 1) * 7));
}

/** The last `n` date keys, oldest first, ending today. */
export function lastDays(n: number, key: DateKey = todayKey()): DateKey[] {
  return Array.from({ length: n }, (_, i) => addDays(key, i - n + 1));
}

export function inWeek(key: DateKey, anchor: DateKey = todayKey()): boolean {
  const s = weekStart(anchor);
  return key >= s && key <= addDays(s, 6);
}

export const monthKey = (key: DateKey = todayKey()): string => key.slice(0, 7);

export function lastMonths(n: number, key: DateKey = todayKey()): string[] {
  const d = fromKey(key);
  return Array.from({ length: n }, (_, i) => {
    const m = new Date(d.getFullYear(), d.getMonth() - (n - 1 - i), 1);
    return toKey(m).slice(0, 7);
  });
}

const DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
export const dowLabel = (key: DateKey): string => DOW[(fromKey(key).getDay() + 6) % 7];

export function fmtDate(key: DateKey): string {
  return fromKey(key).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/** Month and year, for a projection where a specific day would be a lie. */
export function fmtMonthYear(key: DateKey): string {
  return fromKey(key).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
}

/** A chosen date, with the year — a deadline two years out reads wrong without it. */
export function fmtDateFull(key: DateKey): string {
  return fromKey(key).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' });
}

export function fmtDateLong(key: DateKey): string {
  return fromKey(key).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
}

export function fmtMonth(m: string): string {
  const [y, mo] = m.split('-').map(Number);
  const name = new Date(y, mo - 1, 1).toLocaleDateString(undefined, { month: 'short' });
  return `${name} \u2019${String(y).slice(-2)}`;
}

export function fmtRange(a: DateKey, b: DateKey): string {
  return `${fmtDate(a)} – ${fmtDate(b)}`;
}

/** "in 3 days" / "2 days ago" / "today", relative to today. */
export function relativeDay(key: DateKey): string {
  const n = diffDays(key, todayKey());
  if (n === 0) return 'today';
  if (n === 1) return 'tomorrow';
  if (n === -1) return 'yesterday';
  if (n > 0) return `in ${n} days`;
  return `${-n} days ago`;
}

export function fmtDuration(minutes: number): string {
  if (minutes < 60) return `${Math.round(minutes)}m`;
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return m ? `${h}h ${m}m` : `${h}h`;
}
