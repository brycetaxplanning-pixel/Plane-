import type { Split, Transaction, VendorRule } from './schema';
import { monthKey, type DateKey } from './date';

/** Seed rules cover the vendors that categorise themselves. Anything that
 *  can be many different things (Amazon, Target, Venmo) is deliberately
 *  marked `alwaysAsk` so it lands in the review queue instead of being
 *  guessed wrong. */
export const SEED_RULES: Omit<VendorRule, 'id'>[] = [
  { pattern: 'whole foods', category: 'Groceries' },
  { pattern: 'trader joe', category: 'Groceries' },
  { pattern: 'safeway', category: 'Groceries' },
  { pattern: 'kroger', category: 'Groceries' },
  { pattern: 'butcher', category: 'Meat' },
  { pattern: 'meat', category: 'Meat' },
  { pattern: 'butcherbox', category: 'Meat' },
  { pattern: 'doordash', category: 'Restaurants' },
  { pattern: 'uber eats', category: 'Restaurants' },
  { pattern: 'chipotle', category: 'Restaurants' },
  { pattern: 'starbucks', category: 'Restaurants' },
  { pattern: 'netflix', category: 'Subscriptions' },
  { pattern: 'spotify', category: 'Subscriptions' },
  { pattern: 'youtube', category: 'Subscriptions' },
  { pattern: 'italki', category: 'Education' },
  { pattern: 'babbel', category: 'Education' },
  { pattern: 'amc', category: 'Entertainment' },
  { pattern: 'ticketmaster', category: 'Entertainment' },
  { pattern: 'steam', category: 'Entertainment' },
  { pattern: 'uber', category: 'Transport' },
  { pattern: 'lyft', category: 'Transport' },
  { pattern: 'shell', category: 'Transport' },
  { pattern: 'chevron', category: 'Transport' },
  { pattern: 'gym', category: 'Fitness' },
  { pattern: 'crossfit', category: 'Fitness' },
  { pattern: 'jiu', category: 'Fitness' },
  { pattern: 'rent', category: 'Housing' },
  { pattern: 'mortgage', category: 'Housing' },
  { pattern: 'comcast', category: 'Utilities' },
  { pattern: 'pg&e', category: 'Utilities' },
  { pattern: 'cvs', category: 'Health' },
  { pattern: 'walgreens', category: 'Health' },
  { pattern: 'delta air', category: 'Travel' },
  { pattern: 'airbnb', category: 'Travel' },
  { pattern: 'amazon', category: 'Shopping', alwaysAsk: true },
  { pattern: 'target', category: 'Shopping', alwaysAsk: true },
  { pattern: 'walmart', category: 'Shopping', alwaysAsk: true },
  { pattern: 'costco', category: 'Groceries', alwaysAsk: true },
  { pattern: 'venmo', category: 'Other', alwaysAsk: true },
  { pattern: 'paypal', category: 'Other', alwaysAsk: true },
];

export interface RuleMatch {
  rule: VendorRule;
  category: string;
  alwaysAsk: boolean;
}

/** Longest matching pattern wins, so "uber eats" beats "uber". */
export function matchRule(vendor: string, rules: VendorRule[]): RuleMatch | null {
  const v = vendor.toLowerCase();
  let best: VendorRule | null = null;
  for (const r of rules) {
    const p = r.pattern.toLowerCase().trim();
    if (p && v.includes(p) && (!best || p.length > best.pattern.trim().length)) best = r;
  }
  return best ? { rule: best, category: best.category, alwaysAsk: !!best.alwaysAsk } : null;
}

/** Applies rules to a new transaction. A vendor flagged `alwaysAsk` gets a
 *  suggested category but stays unreviewed so it surfaces the question
 *  "what was this actually for?". */
export function autoCategorize(
  tx: Pick<Transaction, 'vendor' | 'category'>,
  rules: VendorRule[],
): { category?: string; reviewed: boolean } {
  if (tx.category) return { category: tx.category, reviewed: true };
  const m = matchRule(tx.vendor, rules);
  if (!m) return { category: undefined, reviewed: false };
  return { category: m.category, reviewed: !m.alwaysAsk };
}

export const splitsTotal = (splits: Split[] = []): number =>
  splits.reduce((s, x) => s + x.amount, 0);

/** A transaction's contribution to each category — splits when present,
 *  otherwise the whole amount on its single category. */
export function categoryAmounts(tx: Transaction): { category: string; amount: number }[] {
  if (tx.splits?.length) {
    return tx.splits.map((s) => ({ category: s.category, amount: s.amount }));
  }
  return [{ category: tx.category ?? 'Uncategorised', amount: tx.amount }];
}

export function spendByCategory(txs: Transaction[], month?: string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const tx of txs) {
    if (month && monthKey(tx.date) !== month) continue;
    for (const { category, amount } of categoryAmounts(tx)) {
      out[category] = (out[category] ?? 0) + amount;
    }
  }
  return out;
}

export function spendForVendor(txs: Transaction[], query: string, month?: string): number {
  const q = query.toLowerCase();
  return txs
    .filter((t) => t.vendor.toLowerCase().includes(q) && (!month || monthKey(t.date) === month))
    .reduce((s, t) => s + t.amount, 0);
}

export const monthTotal = (txs: Transaction[], month: string): number =>
  txs.filter((t) => monthKey(t.date) === month).reduce((s, t) => s + t.amount, 0);

export function needsReview(txs: Transaction[]): Transaction[] {
  return txs.filter((t) => !t.reviewed).sort((a, b) => b.date.localeCompare(a.date));
}

export function fmtMoney(n: number, currency = 'USD'): string {
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency', currency, maximumFractionDigits: n % 1 === 0 ? 0 : 2,
    }).format(n);
  } catch {
    return `$${n.toFixed(2)}`;
  }
}

/* ------------------------------------------------------------------ */
/* CSV import                                                          */
/* ------------------------------------------------------------------ */

export interface ParsedRow {
  date: DateKey;
  vendor: string;
  amount: number;
}

/** Handles quoted fields and escaped quotes — bank exports have commas in
 *  the description far more often than not. */
export function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') { cell += '"'; i++; }
        else quoted = false;
      } else cell += c;
      continue;
    }
    if (c === '"') { quoted = true; continue; }
    if (c === ',') { row.push(cell); cell = ''; continue; }
    if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); cell = '';
      if (row.some((x) => x.trim() !== '')) rows.push(row);
      row = [];
      continue;
    }
    cell += c;
  }
  row.push(cell);
  if (row.some((x) => x.trim() !== '')) rows.push(row);
  return rows;
}

const findCol = (header: string[], names: string[]) =>
  header.findIndex((h) => names.some((n) => h.toLowerCase().trim().includes(n)));

function normalizeDate(raw: string): DateKey | null {
  const s = raw.trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (m) {
    const [, mo, d, y] = m;
    const year = y.length === 2 ? `20${y}` : y;
    return `${year}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  const parsed = new Date(s);
  if (!Number.isNaN(parsed.getTime())) {
    return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, '0')}-${String(parsed.getDate()).padStart(2, '0')}`;
  }
  return null;
}

/** Reads the common bank-export shapes: a single signed Amount column, or
 *  separate Debit/Credit columns. Credits (money in) are skipped — this is
 *  a spending tracker. */
export function parseTransactionsCSV(text: string): { rows: ParsedRow[]; skipped: number } {
  const table = parseCSV(text);
  if (table.length < 2) return { rows: [], skipped: 0 };

  const header = table[0];
  const iDate = findCol(header, ['date', 'posted', 'transaction date']);
  const iVendor = findCol(header, ['description', 'vendor', 'merchant', 'name', 'payee', 'memo']);
  const iAmount = findCol(header, ['amount']);
  const iDebit = findCol(header, ['debit', 'withdrawal']);

  const rows: ParsedRow[] = [];
  let skipped = 0;

  for (const line of table.slice(1)) {
    const date = normalizeDate(line[iDate >= 0 ? iDate : 0] ?? '');
    const vendor = (line[iVendor >= 0 ? iVendor : 1] ?? '').trim();
    const rawAmount = iAmount >= 0 ? line[iAmount] : iDebit >= 0 ? line[iDebit] : '';
    const amount = Number(String(rawAmount ?? '').replace(/[$,\s]/g, '').replace(/^\((.*)\)$/, '-$1'));

    if (!date || !vendor || !Number.isFinite(amount) || amount === 0) { skipped++; continue; }
    // A signed export uses negatives for spending; a debit column uses positives.
    const spend = iAmount >= 0 && iDebit < 0 ? -amount : Math.abs(amount);
    if (spend <= 0) { skipped++; continue; }
    rows.push({ date, vendor, amount: Math.round(spend * 100) / 100 });
  }
  return { rows, skipped };
}
