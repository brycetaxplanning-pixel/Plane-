/** Saving goals: what a thing costs, what you have put aside, and — the part
 *  that matters — whether the plan survives contact with your real spending.
 *  Every figure here comes from logged transactions or from something you
 *  typed. Nothing is assumed on your behalf. */

import type { AppState, SavingGoal, Transaction } from './schema';
import { categoryAmounts } from './finance';
import { fromKey, lastMonths, monthKey, todayKey, toKey } from './date';
import type { DateKey } from './date';

/* ---------------- presets ---------------- */

export interface GoalPreset {
  id: string;
  name: string;
  emoji: string;
  blurb: string;
  /** Suggests an amount from real data where it can. Null when only you
   *  know the number. */
  suggest?: (s: AppState) => number | null;
  /** Why the suggested figure is what it is, shown under the field. */
  basis?: string;
  /** How far out the preset usually runs, in months. */
  months?: number;
  /** The follow-up questions worth answering for this kind of goal. */
  questions: string[];
}

export const GOAL_PRESETS: GoalPreset[] = [
  {
    id: 'emergency',
    name: 'Emergency fund',
    emoji: '🛟',
    blurb: 'Three months of spending, sitting somewhere boring.',
    suggest: (s) => {
      const avg = averageMonthlySpend(s);
      return avg > 0 ? Math.round((avg * 3) / 100) * 100 : null;
    },
    basis: 'Three times your average month of logged spending.',
    months: 12,
    questions: [
      'Three months or six? Self-employed income usually wants six.',
      'Where does it sit — and can you get at it within a day or two?',
      'What counts as an emergency, decided now rather than in the moment?',
    ],
  },
  {
    id: 'car',
    name: 'Car in cash',
    emoji: '🚗',
    blurb: 'The whole price up front, no payment to carry.',
    months: 18,
    questions: [
      'Cash or a lease? Write down the monthly figure you would otherwise pay.',
      'What does insurance, registration and the first service add on top?',
      'What is the car actually replacing — and what does that free up?',
    ],
  },
  {
    id: 'move',
    name: 'Moving out',
    emoji: '🏠',
    blurb: 'Deposit, first month, and the furniture you cannot avoid.',
    suggest: (s) => {
      const rent = averageCategory(s, 'Housing');
      return rent > 0 ? Math.round((rent * 3) / 100) * 100 : null;
    },
    basis: 'Deposit plus first month plus a month of setup, from your Housing spend.',
    months: 9,
    questions: [
      'What is the monthly rent, and what does it do to the rest of the budget?',
      'Deposit, broker fee, first month — which of those are due on the same day?',
      'What are you furnishing on day one, and what can wait?',
    ],
  },
  {
    id: 'tax',
    name: 'Tax set-aside',
    emoji: '🧾',
    blurb: 'The bill you already know is coming.',
    months: 6,
    questions: [
      'What did last year come to, and is this year bigger?',
      'Quarterly or one payment — when is the next date?',
      'Is this in a separate account, or is it mixed in with everything else?',
    ],
  },
  {
    id: 'roth',
    name: 'Roth for the year',
    emoji: '📈',
    blurb: 'Filled steadily rather than in a December panic.',
    months: 12,
    questions: [
      'What is this year’s contribution limit, and does your income still allow it?',
      'Monthly, or a lump sum when a big invoice lands?',
      'What is it invested in once it is in there?',
    ],
  },
  {
    id: 'runway',
    name: 'Business runway',
    emoji: '💼',
    blurb: 'Months you could go without a client paying.',
    suggest: (s) => {
      const avg = averageMonthlySpend(s);
      return avg > 0 ? Math.round((avg * 6) / 100) * 100 : null;
    },
    basis: 'Six times your average month of logged spending.',
    months: 18,
    questions: [
      'How many months of nothing coming in does this need to cover?',
      'Which costs would you actually cut on month one of a dry spell?',
      'Is this separate from your personal emergency fund, or the same pot?',
    ],
  },
  {
    id: 'trip',
    name: 'A trip',
    emoji: '✈️',
    blurb: 'Flights, the bed, and the spending once you are there.',
    months: 8,
    questions: [
      'Flights, accommodation, food, the thing you are going for — which have you actually priced?',
      'What is the date it has to be paid by, not the date you fly?',
      'What are you not doing this year to pay for it?',
    ],
  },
  {
    id: 'custom',
    name: 'Something else',
    emoji: '🎯',
    blurb: 'Name it yourself.',
    months: 12,
    questions: [
      'What does it cost in full, including the parts that are easy to forget?',
      'What is the date, and what happens if it slips?',
      'What does the money come out of — which category gives?',
    ],
  },
];

export const presetById = (id?: string): GoalPreset | undefined =>
  GOAL_PRESETS.find((p) => p.id === id);

/* ---------------- spend and capacity ---------------- */

const spendIn = (txs: Transaction[], month: string): number =>
  txs.filter((t) => monthKey(t.date) === month).reduce((n, t) => n + t.amount, 0);

/** The last three *complete* months, so a month that is two days old does not
 *  read as a cheap one. Falls back to the current month when that is all
 *  there is, and to zero when there is nothing logged at all. */
export function averageMonthlySpend(s: AppState): number {
  const txs = s.finance.transactions;
  if (txs.length === 0) return 0;
  const current = monthKey();
  const months = lastMonths(4).filter((m) => m !== current);
  const used = months.filter((m) => txs.some((t) => monthKey(t.date) === m));
  if (used.length === 0) return spendIn(txs, current);
  return used.reduce((n, m) => n + spendIn(txs, m), 0) / used.length;
}

/** Average monthly spend in one category, over the same window. */
export function averageCategory(s: AppState, category: string): number {
  const txs = s.finance.transactions;
  const current = monthKey();
  const months = lastMonths(4).filter((m) => m !== current);
  const used = months.filter((m) => txs.some((t) => monthKey(t.date) === m));
  const window = used.length ? used : [current];
  const total = window.reduce((sum, m) => {
    const inMonth = txs.filter((t) => monthKey(t.date) === m);
    return sum + inMonth.flatMap(categoryAmounts)
      .filter((c) => c.category === category)
      .reduce((n, c) => n + c.amount, 0);
  }, 0);
  return total / window.length;
}

export interface Capacity {
  /** What you said you take home. Zero when you have not said. */
  income: number;
  avgSpend: number;
  /** Income minus spending. Null when there is no income figure to work from. */
  surplus: number | null;
  /** Everything you have already promised these goals each month. */
  committed: number;
  /** What is left of the surplus after those promises. */
  free: number | null;
  /** True when the monthly promises exceed what is actually left over. */
  overcommitted: boolean;
}

export function capacity(s: AppState): Capacity {
  const income = s.finance.monthlyIncome || 0;
  const avgSpend = averageMonthlySpend(s);
  const surplus = income > 0 ? income - avgSpend : null;
  const committed = s.finance.savingGoals
    .filter((g) => !g.archived && !isDone(g))
    .reduce((n, g) => n + (g.monthly || 0), 0);
  const free = surplus === null ? null : surplus - committed;
  return { income, avgSpend, surplus, committed, free, overcommitted: free !== null && free < 0 };
}

/* ---------------- one goal ---------------- */

export const saved = (g: SavingGoal): number =>
  g.contributions.reduce((n, c) => n + c.amount, 0);

export const isDone = (g: SavingGoal): boolean => saved(g) >= g.target && g.target > 0;

/** Whole months from today to a date, rounded up, never below zero. */
export function monthsUntil(date: DateKey, from: DateKey = todayKey()): number {
  const a = fromKey(from);
  const b = fromKey(date);
  const months = (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth());
  const partial = b.getDate() >= a.getDate() ? 0 : -1;
  return Math.max(0, months + partial);
}

export function addMonths(date: DateKey, n: number): DateKey {
  const d = fromKey(date);
  const day = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + n);
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(day, last));
  return toKey(d);
}

export type GoalStatus = 'done' | 'ontrack' | 'behind' | 'stalled' | 'open';

export interface GoalRow {
  goal: SavingGoal;
  balance: number;
  remaining: number;
  pct: number;
  /** Months left until the date. Null when the goal has no date. */
  monthsLeft: number | null;
  /** What you would have to put in monthly to make the date. Null without one. */
  requiredMonthly: number | null;
  /** When it lands at the rate you are actually putting in. Null when nothing is. */
  projectedDate: DateKey | null;
  /** Months at the current rate. Null when nothing is going in. */
  projectedMonths: number | null;
  status: GoalStatus;
  /** The gap between what the date needs and what you are putting in. */
  shortfall: number;
}

export function goalRow(g: SavingGoal): GoalRow {
  const balance = saved(g);
  const remaining = Math.max(0, g.target - balance);
  const pct = g.target > 0 ? Math.min(1, balance / g.target) : 0;
  const monthsLeft = g.targetDate ? monthsUntil(g.targetDate) : null;
  const requiredMonthly =
    monthsLeft === null ? null : monthsLeft === 0 ? remaining : remaining / monthsLeft;
  const projectedMonths = g.monthly > 0 ? Math.ceil(remaining / g.monthly) : null;
  const projectedDate = projectedMonths === null ? null : addMonths(todayKey(), projectedMonths);

  let status: GoalStatus;
  if (remaining === 0 && g.target > 0) status = 'done';
  else if (g.monthly <= 0) status = 'stalled';
  else if (requiredMonthly === null) status = 'open';
  else status = g.monthly + 0.005 >= requiredMonthly ? 'ontrack' : 'behind';

  return {
    goal: g,
    balance,
    remaining,
    pct,
    monthsLeft,
    requiredMonthly,
    projectedDate,
    projectedMonths,
    status,
    shortfall: requiredMonthly === null ? 0 : Math.max(0, requiredMonthly - g.monthly),
  };
}

export const goalRows = (s: AppState): GoalRow[] =>
  s.finance.savingGoals.filter((g) => !g.archived).map(goalRow);

/* ---------------- the honest part ---------------- */

/** Categories that do not move month to month without a real life change.
 *  Everything else is fair game for a cut, which is a budgeting fact, not a
 *  judgement about how you spend. */
const FIXED = ['Housing', 'Utilities', 'Health', 'Education', 'Business'];

export interface Cut {
  category: string;
  monthly: number;
  /** Half of it — the size of cut worth naming out loud. */
  freed: number;
}

/** The biggest non-fixed categories, largest first. */
export function cutCandidates(s: AppState, limit = 3): Cut[] {
  return (s.finance.categories.length ? s.finance.categories : [])
    .filter((c) => !FIXED.includes(c))
    .map((c) => ({ category: c, monthly: averageCategory(s, c), freed: averageCategory(s, c) / 2 }))
    .filter((c) => c.monthly >= 20)
    .sort((a, b) => b.monthly - a.monthly)
    .slice(0, limit);
}

export interface Verdict {
  tone: 'good' | 'warn' | 'bad' | 'unknown';
  headline: string;
  detail: string;
  /** Where the missing money could come from, when there is a gap. */
  cuts: Cut[];
}

const money = (n: number) => `$${Math.round(n).toLocaleString()}`;

/** What this goal, at this rate, actually means — checked against the
 *  surplus rather than against optimism. */
export function verdict(s: AppState, row: GoalRow): Verdict {
  const cap = capacity(s);
  const g = row.goal;

  if (row.status === 'done') {
    return { tone: 'good', headline: 'Funded', detail: `${money(row.balance)} put aside. This one is finished.`, cuts: [] };
  }

  if (g.monthly <= 0) {
    return {
      tone: 'warn',
      headline: 'Nothing going in',
      detail: row.monthsLeft
        ? `${money(row.remaining)} to go and no monthly amount set. The date needs ${money(row.remaining / Math.max(1, row.monthsLeft))} a month.`
        : `${money(row.remaining)} to go and no monthly amount set, so there is no date this arrives on.`,
      cuts: [],
    };
  }

  const overspends = cap.free !== null && cap.free < 0;

  if (row.requiredMonthly !== null && g.monthly + 0.005 < row.requiredMonthly) {
    return {
      tone: 'bad',
      headline: `${money(row.shortfall)} a month short of the date`,
      detail: `${money(g.monthly)} a month gets there ${
        row.projectedDate ? `around ${fmtMonthName(row.projectedDate)}` : 'eventually'
      }, not by ${fmtMonthName(g.targetDate!)}. The date needs ${money(row.requiredMonthly)} a month.`,
      cuts: cutCandidates(s),
    };
  }

  if (overspends) {
    return {
      tone: 'bad',
      headline: 'The maths works, your month does not',
      detail: `These goals ask for ${money(cap.committed)} a month and there is ${money(
        cap.surplus ?? 0,
      )} left after an average month of spending. Something has to give.`,
      cuts: cutCandidates(s),
    };
  }

  if (cap.surplus === null) {
    return {
      tone: 'unknown',
      headline: row.monthsLeft !== null ? 'On pace for the date' : `${money(g.monthly)} a month`,
      detail: `${money(row.remaining)} to go${
        row.projectedDate ? `, landing around ${fmtMonthName(row.projectedDate)}` : ''
      }. Add your monthly take-home to see whether that is actually affordable.`,
      cuts: [],
    };
  }

  return {
    tone: 'good',
    headline: row.monthsLeft !== null ? 'On pace' : `Landing ${fmtMonthName(row.projectedDate!)}`,
    detail: `${money(g.monthly)} a month clears ${money(row.remaining)}${
      row.monthsLeft !== null ? ` by ${fmtMonthName(g.targetDate!)}` : ''
    }, and leaves ${money(cap.free ?? 0)} a month unspoken for.`,
    cuts: [],
  };
}

function fmtMonthName(key: DateKey): string {
  const d = fromKey(key);
  return d.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
}

/** The follow-up questions for a goal: the preset's, minus the ones already
 *  answered. */
export function openQuestions(g: SavingGoal): string[] {
  const preset = presetById(g.preset) ?? presetById('custom')!;
  const answered = new Set((g.answers ?? []).map((a) => a.question));
  return preset.questions.filter((q) => !answered.has(q));
}
