import type { InvestmentAccount, Projection } from './schema';

export interface YearPoint {
  /** Years from now. 0 is today. */
  t: number;
  /** Calendar year, so the axis reads 2031 rather than "5". */
  calendar: number;
  /** Everything you put in: starting balance plus deposits to date. */
  contributed: number;
  /** Balance minus contributed. */
  growth: number;
  balance: number;
}

export const startingTotal = (accounts: InvestmentAccount[]): number =>
  accounts.reduce((n, a) => n + a.balance, 0);

export const monthlyTotal = (accounts: InvestmentAccount[]): number =>
  accounts.reduce((n, a) => n + a.monthly, 0);

/**
 * Monthly compounding with deposits made at the end of each month — the
 * ordinary-annuity convention, and the conservative one: a deposit does not
 * earn a return in the month it lands.
 *
 *   balance = P(1+r)^n + PMT · ((1+r)^n − 1) / r
 *
 * A zero return degenerates to simple addition, which the closed form cannot
 * express (division by zero), so it is handled separately.
 */
export function balanceAfterMonths(principal: number, monthly: number, annualReturnPct: number, months: number): number {
  const r = annualReturnPct / 100 / 12;
  if (months <= 0) return principal;
  if (Math.abs(r) < 1e-12) return principal + monthly * months;
  const growth = (1 + r) ** months;
  return principal * growth + monthly * ((growth - 1) / r);
}

/** One point per year, from today out to the horizon. */
export function projectSeries(
  principal: number,
  monthly: number,
  { years, returnPct, inflationPct, real }: Projection,
): YearPoint[] {
  const thisYear = new Date().getFullYear();
  const horizon = Math.max(1, Math.round(years));

  return Array.from({ length: horizon + 1 }, (_, t) => {
    const nominal = balanceAfterMonths(principal, monthly, returnPct, t * 12);
    // "Real" restates the whole balance in today's money, contributions
    // included, so the two halves of the stack stay comparable.
    const deflator = real ? (1 + inflationPct / 100) ** t : 1;
    const balance = nominal / deflator;
    const contributed = (principal + monthly * 12 * t) / deflator;
    return {
      t,
      calendar: thisYear + t,
      contributed: Math.min(contributed, balance),
      growth: Math.max(0, balance - contributed),
      balance,
    };
  });
}

/** Compact axis and hero formatting: $1.2M, $840k, $80k. */
export function fmtCompact(n: number, currency = 'USD'): string {
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency', currency, notation: 'compact', maximumFractionDigits: n >= 1_000_000 ? 2 : 1,
    }).format(n);
  } catch {
    return `$${Math.round(n).toLocaleString()}`;
  }
}

/** What the same money does at a few different rates — the "play with it"
 *  comparison under the chart. */
export function scenarios(principal: number, monthly: number, projection: Projection, rates: number[]): { rate: number; balance: number }[] {
  return rates.map((rate) => ({
    rate,
    balance: projectSeries(principal, monthly, { ...projection, returnPct: rate }).at(-1)?.balance ?? 0,
  }));
}
