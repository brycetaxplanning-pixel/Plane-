import type { Split, Transaction, VendorRule } from './schema';
import { looksLikeOFX, parseOFX } from './ofx';
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
  /** The bank's own id for the transaction, when the file carries one. It is
   *  the only reliable way to know you have imported this row before. */
  fitid?: string;
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
/**
 * Finds the row that is actually the header.
 *
 * Bank of America's export opens with a summary block — a few lines of
 * "Beginning balance as of ..." — then a blank line, then the real header.
 * Taking row zero on faith reads that preamble as column names and every
 * subsequent row as junk.
 */
function headerRow(table: string[][]): number {
  for (let i = 0; i < Math.min(table.length, 12); i += 1) {
    const row = table[i].map((c) => c.toLowerCase());
    const hasDate = row.some((c) => /\bdate\b|posted/.test(c));
    const hasMoney = row.some((c) => /amount|debit|credit|withdrawal/.test(c));
    if (hasDate && hasMoney) return i;
  }
  return 0;
}

/**
 * Which way round the amounts run.
 *
 * Chase and Bank of America sign their exports: spending is negative. American
 * Express does not: every charge is positive, and the occasional payment is the
 * negative one. Guessing from the bank name would need a list of every bank;
 * guessing from the data needs only the data.
 *
 * Both shapes carry a minority of the opposite sign, so the presence of
 * negatives settles nothing — the *majority* does. A statement is mostly
 * spending either way, so whichever sign dominates is the spending.
 */
function signedExport(values: number[]): boolean {
  const negatives = values.filter((n) => n < 0).length;
  return negatives > values.length / 2;
}

export function parseTransactionsCSV(text: string): { rows: ParsedRow[]; skipped: number } {
  const table = parseCSV(text);
  if (table.length < 2) return { rows: [], skipped: 0 };

  const head = headerRow(table);
  const header = table[head];
  const body = table.slice(head + 1);

  const iDate = findCol(header, ['transaction date', 'date', 'posted date', 'posted']);
  const iVendor = findCol(header, ['description', 'vendor', 'merchant', 'name', 'payee', 'memo']);
  const iAmount = findCol(header, ['amount']);
  const iDebit = findCol(header, ['debit', 'withdrawal']);
  const iCredit = findCol(header, ['credit', 'deposit']);

  const money = (raw: string | undefined): number =>
    Number(String(raw ?? '').replace(/[$,\s]/g, '').replace(/^\((.*)\)$/, '-$1'));

  // Read the amount column once to work out its convention before using it.
  const amounts = iAmount >= 0
    ? body.map((l) => money(l[iAmount])).filter((n) => Number.isFinite(n) && n !== 0)
    : [];
  const signed = signedExport(amounts);

  const rows: ParsedRow[] = [];
  let skipped = 0;

  for (const line of body) {
    const date = normalizeDate(line[iDate >= 0 ? iDate : 0] ?? '');
    const vendor = (line[iVendor >= 0 ? iVendor : 1] ?? '').trim();

    let spend: number;
    if (iDebit >= 0 && String(line[iDebit] ?? '').trim() !== '') {
      // A separate debit column, as Capital One writes it: positive is spending.
      spend = Math.abs(money(line[iDebit]));
    } else if (iDebit >= 0 && iCredit >= 0) {
      // The row is a credit, which is not spending.
      skipped += 1;
      continue;
    } else {
      const amount = money(line[iAmount >= 0 ? iAmount : 2]);
      if (!Number.isFinite(amount)) { skipped += 1; continue; }
      spend = signed ? -amount : amount;
    }

    if (!date || !vendor || !Number.isFinite(spend) || spend <= 0) { skipped += 1; continue; }
    rows.push({ date, vendor: vendor.replace(/\s+/g, ' '), amount: Math.round(spend * 100) / 100 });
  }

  return { rows, skipped };
}

/** Reads whichever of the two formats the file turns out to be. */
export function parseStatement(text: string): { rows: ParsedRow[]; skipped: number; format: 'ofx' | 'csv' } {
  if (looksLikeOFX(text)) {
    const out = parseOFX(text);
    return { rows: out.rows, skipped: out.skipped, format: 'ofx' };
  }
  return { ...parseTransactionsCSV(text), format: 'csv' };
}

/**
 * Which of these rows are not already in the log.
 *
 * The bank's own id settles it where there is one. Where there is not, a row
 * is treated as the same transaction if the date, the vendor and the amount
 * all match — which is what re-downloading last month's statement produces,
 * and is rare enough to be a coincidence otherwise. Two genuinely identical
 * charges on one day are the cost of this, and are reported rather than
 * silently dropped.
 */
export function newRows(rows: ParsedRow[], existing: Transaction[]): { fresh: ParsedRow[]; duplicates: number } {
  const seen = new Set<string>();
  for (const t of existing) {
    if (t.fitid) seen.add(`id:${t.fitid}`);
    seen.add(`k:${t.date}|${t.vendor.toLowerCase()}|${t.amount.toFixed(2)}`);
  }

  const fresh: ParsedRow[] = [];
  let duplicates = 0;

  for (const r of rows) {
    const byId = r.fitid ? `id:${r.fitid}` : null;
    const byShape = `k:${r.date}|${r.vendor.toLowerCase()}|${r.amount.toFixed(2)}`;
    if ((byId && seen.has(byId)) || seen.has(byShape)) { duplicates += 1; continue; }
    if (byId) seen.add(byId);
    seen.add(byShape);
    fresh.push(r);
  }

  return { fresh, duplicates };
}
