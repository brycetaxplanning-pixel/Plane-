/** Bringing health data in from somewhere else — a Garmin or Whoop CSV, an
 *  Apple Health export, a spreadsheet you keep yourself.
 *
 *  Two things are deliberate. Nothing is converted between units: a number is
 *  stored as the file gave it, and the unit is whatever you told the module
 *  you weigh in. And an import never overwrites something you typed unless you
 *  say so — by default it only fills gaps, and it tells you which is which
 *  before anything is saved. */

import type { Vitals } from './schema';
import { parseCSV } from './finance';
import { toKey, type DateKey } from './date';
import { uid } from './id';

export type VitalField = 'weight' | 'restingHr' | 'systolic' | 'diastolic' | 'sleepHours';

export const VITAL_FIELDS: { id: VitalField; label: string }[] = [
  { id: 'weight', label: 'Weight' },
  { id: 'restingHr', label: 'Resting heart rate' },
  { id: 'systolic', label: 'Blood pressure (systolic)' },
  { id: 'diastolic', label: 'Blood pressure (diastolic)' },
  { id: 'sleepHours', label: 'Sleep (hours)' },
];

export interface ColumnMap {
  /** Index of the date column. Null means nothing usable was found. */
  date: number | null;
  fields: Partial<Record<VitalField, number>>;
}

/* ---------------- dates ---------------- */

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

/**
 * The date formats these exports actually use: ISO, ISO with a time, US
 * slashes, and "Jul 27, 2026". Anything else returns null rather than a guess —
 * a misread date silently files a reading under the wrong day.
 */
export function parseDate(raw: string): DateKey | null {
  const s = raw.trim();
  if (!s) return null;

  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

  const us = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(s);
  if (us) return `${us[3]}-${pad(us[1])}-${pad(us[2])}`;

  const named = /^([A-Za-z]{3})[a-z]*\.?\s+(\d{1,2}),?\s+(\d{4})/.exec(s);
  if (named) {
    const m = MONTHS.indexOf(named[1].toLowerCase());
    if (m >= 0) return `${named[3]}-${pad(m + 1)}-${pad(named[2])}`;
  }

  return null;
}

const pad = (n: string | number): string => String(n).padStart(2, '0');

/** Strips thousands separators and a trailing unit: "180.6 lb" is 180.6. */
export function parseNumber(raw: string): number | null {
  const m = /-?\d+(?:[.,]\d+)?/.exec(raw.replace(/,(?=\d{3}\b)/g, ''));
  if (!m) return null;
  const n = Number(m[0].replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

/* ---------------- CSV ---------------- */

const HINTS: Record<VitalField, RegExp> = {
  weight: /\b(weight|body ?mass|weigh)\b/i,
  restingHr: /\b(resting.*(hr|heart)|rhr|heart rate.*resting)\b/i,
  systolic: /\bsystolic|\bsys\b/i,
  diastolic: /\bdiastolic|\bdia\b/i,
  sleepHours: /\b(sleep|asleep|time in bed)\b/i,
};

const DATE_HINT = /\b(date|day|timestamp|time|start)\b/i;

/** A first guess at which column is which, from the header row. Every guess is
 *  shown in the form and can be changed before anything is imported. */
export function guessMapping(header: string[]): ColumnMap {
  const map: ColumnMap = { date: null, fields: {} };

  header.forEach((h, i) => {
    if (map.date === null && DATE_HINT.test(h)) map.date = i;
    for (const f of Object.keys(HINTS) as VitalField[]) {
      if (map.fields[f] === undefined && HINTS[f].test(h)) map.fields[f] = i;
    }
  });

  // A file whose first column parses as a date but is not called one.
  if (map.date === null && header.length > 0) map.date = 0;
  return map;
}

export interface ParsedRows {
  rows: Vitals[];
  /** Lines that had no readable date, or no value in any mapped column. */
  skipped: number;
}

export function fromCSV(text: string, map: ColumnMap): ParsedRows {
  const table = parseCSV(text);
  if (table.length < 2 || map.date === null) return { rows: [], skipped: Math.max(0, table.length - 1) };

  const byDate = new Map<DateKey, Vitals>();
  let skipped = 0;

  for (const line of table.slice(1)) {
    const date = parseDate(line[map.date] ?? '');
    if (!date) { skipped += 1; continue; }

    const entry: Vitals = byDate.get(date) ?? { id: uid('vit'), date };
    let got = false;
    for (const [field, col] of Object.entries(map.fields) as [VitalField, number][]) {
      const value = parseNumber(line[col] ?? '');
      if (value === null) continue;
      entry[field] = value;
      got = true;
    }

    if (!got) { skipped += 1; continue; }
    byDate.set(date, entry);
  }

  return { rows: [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date)), skipped };
}

/* ---------------- Apple Health ---------------- */

const APPLE_TYPES: Record<string, VitalField> = {
  HKQuantityTypeIdentifierBodyMass: 'weight',
  HKQuantityTypeIdentifierRestingHeartRate: 'restingHr',
  HKQuantityTypeIdentifierBloodPressureSystolic: 'systolic',
  HKQuantityTypeIdentifierBloodPressureDiastolic: 'diastolic',
};

const RECORD = /<Record\b[^>]*\/?>/g;
const ATTR = (name: string) => new RegExp(`${name}="([^"]*)"`);

export interface AppleTotals {
  vitals: Map<DateKey, Vitals>;
  /** Dietary totals per day, kept apart because they become meals, not vitals. */
  food: Map<DateKey, { calories: number; protein: number }>;
  records: number;
}

export const emptyTotals = (): AppleTotals => ({ vitals: new Map(), food: new Map(), records: 0 });

/**
 * Reads one chunk of an Apple Health `export.xml` and folds it into the running
 * totals. Chunked because that file is routinely hundreds of megabytes — it is
 * streamed past rather than held in memory.
 *
 * Returns the tail that did not contain a complete record, to be prepended to
 * the next chunk.
 */
export function scanApple(chunk: string, into: AppleTotals): string {
  const lastOpen = chunk.lastIndexOf('<Record');
  const lastClose = chunk.lastIndexOf('>');
  const cut = lastOpen > lastClose ? lastOpen : chunk.length;
  const body = chunk.slice(0, cut);
  const tail = chunk.slice(cut);

  for (const tag of body.match(RECORD) ?? []) {
    const type = ATTR('type').exec(tag)?.[1];
    if (!type) continue;

    const start = ATTR('startDate').exec(tag)?.[1] ?? '';
    const end = ATTR('endDate').exec(tag)?.[1] ?? start;
    const value = ATTR('value').exec(tag)?.[1] ?? '';

    const field = APPLE_TYPES[type];
    if (field) {
      const date = parseDate(start);
      const n = parseNumber(value);
      if (!date || n === null) continue;
      // The last reading of a day wins, which is how the Health app shows it.
      const entry = into.vitals.get(date) ?? { id: uid('vit'), date };
      entry[field] = round(n);
      into.vitals.set(date, entry);
      into.records += 1;
      continue;
    }

    if (type === 'HKCategoryTypeIdentifierSleepAnalysis' && /Asleep/i.test(value)) {
      const hours = spanHours(start, end);
      const date = sleepNight(end);
      if (!date || hours <= 0) continue;
      const entry = into.vitals.get(date) ?? { id: uid('vit'), date };
      entry.sleepHours = round((entry.sleepHours ?? 0) + hours);
      into.vitals.set(date, entry);
      into.records += 1;
      continue;
    }

    if (type === 'HKQuantityTypeIdentifierDietaryEnergyConsumed' || type === 'HKQuantityTypeIdentifierDietaryProtein') {
      const date = parseDate(start);
      const n = parseNumber(value);
      if (!date || n === null) continue;
      const day = into.food.get(date) ?? { calories: 0, protein: 0 };
      if (type.endsWith('Protein')) day.protein += n;
      else day.calories += n;
      into.food.set(date, day);
      into.records += 1;
    }
  }

  return tail;
}

const round = (n: number): number => Math.round(n * 10) / 10;

/** Apple stamps are "2026-08-31 07:12:03 -0700"; the offset is already applied
 *  to the wall-clock part, which is the part we want. */
function stampToDate(raw: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/.exec(raw.trim());
  if (!m) return null;
  return new Date(
    Number(m[1]), Number(m[2]) - 1, Number(m[3]),
    Number(m[4]), Number(m[5]), Number(m[6] ?? 0),
  );
}

function spanHours(start: string, end: string): number {
  const a = stampToDate(start);
  const b = stampToDate(end);
  if (!a || !b) return 0;
  return (b.getTime() - a.getTime()) / 3_600_000;
}

/** A night belongs to the day you woke up on. A daytime nap therefore lands on
 *  that same day and adds to it, which is what you would want counted. */
function sleepNight(end: string): DateKey | null {
  const d = stampToDate(end);
  return d ? toKey(d) : null;
}

/* ---------------- merging ---------------- */

export interface MergeReport {
  added: number;
  filled: number;
  /** Values already present that an overwrite would replace. */
  conflicts: number;
  vitals: Vitals[];
}

/**
 * Folds imported readings into what is already stored. Existing values are
 * kept unless `overwrite` is set — the count of what would change is reported
 * either way, so the choice is made with the number in front of you.
 */
export function merge(existing: Vitals[], incoming: Vitals[], overwrite: boolean): MergeReport {
  const byDate = new Map(existing.map((v) => [v.date, { ...v }]));
  let added = 0;
  let filled = 0;
  let conflicts = 0;

  for (const row of incoming) {
    const current = byDate.get(row.date);
    if (!current) {
      byDate.set(row.date, { ...row });
      added += 1;
      continue;
    }
    for (const f of VITAL_FIELDS.map((x) => x.id)) {
      const value = row[f];
      if (value === undefined) continue;
      if (current[f] === undefined) {
        current[f] = value;
        filled += 1;
      } else if (current[f] !== value) {
        conflicts += 1;
        if (overwrite) current[f] = value;
      }
    }
  }

  return {
    added,
    filled,
    conflicts,
    vitals: [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date)),
  };
}
