/** Health: the logbook side of the body. Weight, sleep, blood pressure, what
 *  you ate, and what the last lab report said.
 *
 *  Two rules run through all of it. Nothing here interprets a result — a
 *  marker is compared against the range printed on your own report and
 *  reported as inside or outside it, never explained. And no figure is
 *  invented: an unset target shows as unset. */

import type { AppState, BloodMarker, BloodPanel, Meal, Vitals } from './schema';
import { lastDays, monthKey, todayKey, type DateKey } from './date';

/* ---------------- food ---------------- */

export interface DayTotals {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  meals: number;
}

export function dayTotals(meals: Meal[], date: DateKey = todayKey()): DayTotals {
  const mine = meals.filter((m) => m.date === date);
  return {
    calories: sum(mine, 'calories'),
    protein: sum(mine, 'protein'),
    carbs: sum(mine, 'carbs'),
    fat: sum(mine, 'fat'),
    meals: mine.length,
  };
}

const sum = (meals: Meal[], key: 'calories' | 'protein' | 'carbs' | 'fat'): number =>
  meals.reduce((n, m) => n + (m[key] ?? 0), 0);

/** Daily protein over a window, for the chart. Days with nothing logged are
 *  zero, which is the truth: an unlogged day is not a day off. */
export const proteinSeries = (meals: Meal[], days = 14): { key: DateKey; value: number }[] =>
  lastDays(days).map((d) => ({ key: d, value: dayTotals(meals, d).protein }));

export const calorieSeries = (meals: Meal[], days = 14): { key: DateKey; value: number }[] =>
  lastDays(days).map((d) => ({ key: d, value: dayTotals(meals, d).calories }));

/** Average over the days that actually have a log — an average that counts
 *  untouched days as zero says more about your logging than your eating. */
export function averageLogged(series: { value: number }[]): { avg: number; days: number } {
  const logged = series.filter((s) => s.value > 0);
  return {
    avg: logged.length ? logged.reduce((n, s) => n + s.value, 0) / logged.length : 0,
    days: logged.length,
  };
}

/* ---------------- vitals ---------------- */

export const sortedVitals = (v: Vitals[]): Vitals[] =>
  [...v].sort((a, b) => a.date.localeCompare(b.date));

/** The most recent entry that carries a given reading. */
export function latest<K extends keyof Vitals>(v: Vitals[], key: K): Vitals | null {
  const found = sortedVitals(v).filter((x) => x[key] !== undefined && x[key] !== null);
  return found.length ? found[found.length - 1] : null;
}

export const weightSeries = (v: Vitals[]): { key: DateKey; value: number }[] =>
  sortedVitals(v).filter((x) => x.weight !== undefined).map((x) => ({ key: x.date, value: x.weight! }));

/** Change over roughly the last `days`, using the earliest reading inside the
 *  window. Null when there is only one reading — one point is not a trend. */
export function weightChange(v: Vitals[], days = 30): { from: number; to: number; delta: number } | null {
  const series = weightSeries(v);
  if (series.length < 2) return null;
  const cutoff = lastDays(days)[0];
  const window = series.filter((s) => s.key >= cutoff);
  const use = window.length >= 2 ? window : series.slice(-2);
  const from = use[0].value;
  const to = use[use.length - 1].value;
  return { from, to, delta: to - from };
}

export const sleepSeries = (v: Vitals[], days = 14): { key: DateKey; value: number }[] => {
  const byDate = new Map(sortedVitals(v).filter((x) => x.sleepHours !== undefined).map((x) => [x.date, x.sleepHours!]));
  return lastDays(days).map((d) => ({ key: d, value: byDate.get(d) ?? 0 }));
};

/* ---------------- bloodwork ---------------- */

export type MarkerStatus = 'low' | 'high' | 'in' | 'unknown';

/** Inside or outside the range you entered. Nothing more is claimed. */
export function markerStatus(m: BloodMarker): MarkerStatus {
  if (m.low === undefined && m.high === undefined) return 'unknown';
  if (m.low !== undefined && m.value < m.low) return 'low';
  if (m.high !== undefined && m.value > m.high) return 'high';
  return 'in';
}

export const flagged = (p: BloodPanel): BloodMarker[] =>
  p.markers.filter((m) => markerStatus(m) !== 'in' && markerStatus(m) !== 'unknown');

export const sortedPanels = (panels: BloodPanel[]): BloodPanel[] =>
  [...panels].sort((a, b) => b.date.localeCompare(a.date));

export const latestPanel = (panels: BloodPanel[]): BloodPanel | null => sortedPanels(panels)[0] ?? null;

/** One marker's readings across every panel, oldest first, so a value can be
 *  read as a direction rather than a single number. */
export function markerHistory(panels: BloodPanel[], name: string): { date: DateKey; marker: BloodMarker }[] {
  return [...panels]
    .sort((a, b) => a.date.localeCompare(b.date))
    .flatMap((p) => p.markers.filter((m) => m.name === name).map((m) => ({ date: p.date, marker: m })))
    ;
}

/** Every distinct marker name that has been recorded, most recent first. */
export function markerNames(panels: BloodPanel[]): string[] {
  const seen: string[] = [];
  for (const p of sortedPanels(panels)) {
    for (const m of p.markers) if (!seen.includes(m.name)) seen.push(m.name);
  }
  return seen;
}

/**
 * A starting list for entering a panel by hand, so the common ones do not have
 * to be typed out. The ranges are the ones most US labs print for adults;
 * they are a convenience, not an authority — labs differ, and the form always
 * lets you overwrite them with the numbers on your own report.
 */
export interface MarkerTemplate { name: string; unit: string; low?: number; high?: number; group: string }

export const MARKER_CATALOGUE: MarkerTemplate[] = [
  { group: 'Metabolic', name: 'Glucose (fasting)', unit: 'mg/dL', low: 70, high: 99 },
  { group: 'Metabolic', name: 'HbA1c', unit: '%', high: 5.7 },
  { group: 'Metabolic', name: 'Insulin (fasting)', unit: 'µIU/mL', low: 2, high: 19 },
  { group: 'Lipids', name: 'Total cholesterol', unit: 'mg/dL', high: 200 },
  { group: 'Lipids', name: 'LDL', unit: 'mg/dL', high: 100 },
  { group: 'Lipids', name: 'HDL', unit: 'mg/dL', low: 40 },
  { group: 'Lipids', name: 'Triglycerides', unit: 'mg/dL', high: 150 },
  { group: 'Thyroid', name: 'TSH', unit: 'µIU/mL', low: 0.45, high: 4.5 },
  { group: 'Thyroid', name: 'Free T4', unit: 'ng/dL', low: 0.82, high: 1.77 },
  { group: 'Hormones', name: 'Testosterone (total)', unit: 'ng/dL', low: 264, high: 916 },
  { group: 'Hormones', name: 'Vitamin D (25-OH)', unit: 'ng/mL', low: 30, high: 100 },
  { group: 'Blood count', name: 'Haemoglobin', unit: 'g/dL', low: 13.2, high: 16.6 },
  { group: 'Blood count', name: 'Ferritin', unit: 'ng/mL', low: 30, high: 400 },
  { group: 'Blood count', name: 'White cell count', unit: 'K/µL', low: 3.4, high: 10.8 },
  { group: 'Liver & kidney', name: 'ALT', unit: 'U/L', high: 44 },
  { group: 'Liver & kidney', name: 'AST', unit: 'U/L', high: 40 },
  { group: 'Liver & kidney', name: 'Creatinine', unit: 'mg/dL', low: 0.76, high: 1.27 },
  { group: 'Inflammation', name: 'hs-CRP', unit: 'mg/L', high: 3 },
];

export const MARKER_GROUPS = [...new Set(MARKER_CATALOGUE.map((m) => m.group))];

/** How long since the last panel, in whole months. Null when there is none. */
export function monthsSincePanel(panels: BloodPanel[], from: DateKey = todayKey()): number | null {
  const last = latestPanel(panels);
  if (!last) return null;
  const a = new Date(`${last.date}T00:00:00`);
  const b = new Date(`${from}T00:00:00`);
  return (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth());
}

/* ---------------- the module's headline ---------------- */

export interface HealthSummary {
  today: DayTotals;
  proteinTarget?: number;
  calorieTarget?: number;
  /** Fraction of today's protein target, or null when no target is set. */
  proteinPct: number | null;
  weight: { value: number; date: DateKey } | null;
  weightDelta: number | null;
  sleepLast: number | null;
  flaggedCount: number;
  monthsSincePanel: number | null;
  loggedDaysThisMonth: number;
}

export function healthSummary(s: AppState): HealthSummary {
  const { meals, vitals, panels, targets } = s.health;
  const today = dayTotals(meals);
  const w = latest(vitals, 'weight');
  const change = weightChange(vitals);
  const sleep = latest(vitals, 'sleepHours');
  const panel = latestPanel(panels);
  const month = monthKey();

  return {
    today,
    proteinTarget: targets.protein,
    calorieTarget: targets.calories,
    proteinPct: targets.protein ? today.protein / targets.protein : null,
    weight: w?.weight !== undefined ? { value: w.weight, date: w.date } : null,
    weightDelta: change ? change.delta : null,
    sleepLast: sleep?.sleepHours ?? null,
    flaggedCount: panel ? flagged(panel).length : 0,
    monthsSincePanel: monthsSincePanel(panels),
    loggedDaysThisMonth: new Set(meals.filter((m) => monthKey(m.date) === month).map((m) => m.date)).size,
  };
}
