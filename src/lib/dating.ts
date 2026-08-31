/** Dating: who you are seeing and what it costs.
 *
 *  The one part of the app holding data about somebody who never agreed to be
 *  in it, so it asks for as little as possible — a first name or initials, how
 *  you met, and what you spent. No contact details, no last names, nothing a
 *  phone left on a table would give away.
 */

import type { AppState, Outing, Person } from './schema';
import { monthKey, todayKey, type DateKey } from './date';

export interface PersonRow {
  person: Person;
  outings: Outing[];
  spend: number;
  /** Outings marked as having gone somewhere. */
  nights: number;
  /** Spend divided by outings. Null with no outings. */
  perOuting: number | null;
  /** Spend divided by nights together. Null when there are none — dividing by
   *  zero would print a nonsense figure. */
  perNight: number | null;
  lastSeen: DateKey | null;
  daysSince: number | null;
}

const days = (from: DateKey, to: DateKey = todayKey()): number =>
  Math.round((new Date(`${to}T00:00:00`).getTime() - new Date(`${from}T00:00:00`).getTime()) / 86_400_000);

export function personRow(s: AppState, person: Person): PersonRow {
  const outings = s.dating.outings
    .filter((o) => o.personId === person.id)
    .sort((a, b) => b.date.localeCompare(a.date));
  const spend = outings.reduce((n, o) => n + o.cost, 0);
  const nights = outings.filter((o) => o.intimate).length;
  const lastSeen = outings[0]?.date ?? null;

  return {
    person,
    outings,
    spend,
    nights,
    perOuting: outings.length ? spend / outings.length : null,
    perNight: nights ? spend / nights : null,
    lastSeen,
    daysSince: lastSeen ? days(lastSeen) : null,
  };
}

export interface DatingStats {
  rows: PersonRow[];
  active: Person[];
  totalSpend: number;
  monthSpend: number;
  monthOutings: number;
  totalOutings: number;
  totalNights: number;
  perOuting: number | null;
  perNight: number | null;
}

export function datingStats(s: AppState): DatingStats {
  const people = s.dating.people.filter((p) => !p.archived);
  const rows = people.map((p) => personRow(s, p))
    .sort((a, b) => (a.daysSince ?? 9999) - (b.daysSince ?? 9999));
  const month = monthKey();
  const outings = s.dating.outings;
  const totalSpend = outings.reduce((n, o) => n + o.cost, 0);
  const nights = outings.filter((o) => o.intimate).length;
  const inMonth = outings.filter((o) => monthKey(o.date) === month);

  return {
    rows,
    active: people.filter((p) => p.status !== 'Ended'),
    totalSpend,
    monthSpend: inMonth.reduce((n, o) => n + o.cost, 0),
    monthOutings: inMonth.length,
    totalOutings: outings.length,
    totalNights: nights,
    perOuting: outings.length ? totalSpend / outings.length : null,
    perNight: nights ? totalSpend / nights : null,
  };
}

/** What this month's dating spend is against the budget, when there is one to
 *  compare with. Null when no budget is set — the comparison would be invented. */
export function shareOfBudget(s: AppState): { spend: number; budget: number; pct: number } | null {
  const budget = Object.values(s.finance.budgets).reduce((n, v) => n + v, 0);
  if (budget <= 0) return null;
  const spend = datingStats(s).monthSpend;
  if (spend <= 0) return null;
  return { spend, budget, pct: spend / budget };
}
