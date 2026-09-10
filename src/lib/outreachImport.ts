import { CHANNELS, OUTCOMES, type Channel, type Outcome, type Outreach } from './schema';
import { parseCSV } from './finance';
import { todayKey, type DateKey } from './date';

/**
 * Reading an outreach export into the log.
 *
 * The bot doing the reaching out is the thing that knows who was contacted,
 * and it cannot hand that over directly: this app has no server, so nothing
 * outside the phone can write to it. What every such tool can do is export a
 * spreadsheet, so that is the seam — you drop the file in and it becomes the
 * log, with the names, the companies and the industries kept.
 *
 * Two things make dropping in a file repeatedly safe, which matters because a
 * daily export overlaps yesterday's almost entirely:
 *
 *   - a row is recognised by whatever the export calls its own id — a profile
 *     URL, usually — and failing that by name and date together;
 *   - recognised rows are counted and skipped rather than added, so the same
 *     file imported twice changes nothing the second time.
 */

export interface ParsedContact {
  date: DateKey;
  name: string;
  channel: Channel;
  outcome: Outcome;
  company?: string;
  industry?: string;
  role?: string;
  notes?: string;
  externalId?: string;
}

export interface OutreachImport {
  rows: ParsedContact[];
  /** Already in the log, so not offered again. */
  duplicates: number;
  /** Rows with nothing usable in them — no name at all. */
  skipped: number;
  /** Which column each field was read from, so the screen can show its work. */
  columns: Record<string, string>;
}

/** Header names seen in the wild, lowercased. First match wins. */
const FIELDS: Record<string, string[]> = {
  name: ['name', 'full name', 'fullname', 'contact', 'contact name', 'person', 'lead', 'prospect', 'first name'],
  company: ['company', 'organisation', 'organization', 'employer', 'account', 'company name'],
  industry: ['industry', 'sector', 'vertical', 'category'],
  role: ['title', 'role', 'job title', 'position', 'headline'],
  date: ['date', 'contacted', 'contacted at', 'contacted on', 'sent', 'sent at', 'timestamp', 'created', 'created at', 'day'],
  outcome: ['outcome', 'status', 'result', 'response', 'reply', 'stage'],
  channel: ['channel', 'platform', 'source', 'medium', 'via'],
  notes: ['notes', 'note', 'message', 'comment', 'comments', 'summary'],
  externalId: ['id', 'profile', 'profile url', 'url', 'link', 'linkedin', 'linkedin url', 'profile link'],
};

const norm = (s: string) => s.trim().toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ');

function mapColumns(header: string[]): Record<string, number> {
  const cleaned = header.map(norm);
  const out: Record<string, number> = {};
  for (const [field, names] of Object.entries(FIELDS)) {
    // Exact header first, then a contains match, so "Date contacted (UTC)"
    // still finds the date without "candidate id" stealing the id column.
    let at = cleaned.findIndex((h) => names.includes(h));
    if (at === -1) at = cleaned.findIndex((h) => names.some((n) => h.includes(n)));
    if (at !== -1) out[field] = at;
  }
  return out;
}

/**
 * A date in any of the shapes exports use. Returns null rather than guessing
 * when it cannot tell — an unreadable date becomes "today", which is honest
 * about when it was imported instead of inventing a day it was not sent.
 */
export function readDate(raw: string): DateKey | null {
  const t = raw.trim();
  if (!t) return null;

  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(t);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

  // US-style, which is what most exports produce.
  const slash = /^(\d{1,2})[/](\d{1,2})[/](\d{2,4})/.exec(t);
  if (slash) {
    const [, m, d, y] = slash;
    const year = y.length === 2 ? `20${y}` : y;
    return `${year}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }

  const parsed = new Date(t);
  if (!Number.isNaN(parsed.getTime())) {
    return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, '0')}-${String(parsed.getDate()).padStart(2, '0')}`;
  }
  return null;
}

/** What the export called the result, in the words this app uses. */
export function readOutcome(raw: string): Outcome {
  const t = norm(raw);
  if (!t) return 'No answer';
  const exact = OUTCOMES.find((o) => norm(o) === t);
  if (exact) return exact;
  if (/(meeting|call booked|demo|scheduled|booked)/.test(t)) return 'Meeting booked';
  if (/(replied|response|responded|answered|interested|positive|conversation|connected|accepted)/.test(t)) return 'Conversation';
  if (/(not interested|declined|rejected|no thanks|unsubscribed|not a fit|unqualified)/.test(t)) return 'Not a fit';
  if (/(closed|won|signed|client)/.test(t)) return 'Closed';
  return 'No answer';
}

function readChannel(raw: string, fallback: Channel): Channel {
  const t = norm(raw);
  if (!t) return fallback;
  const exact = CHANNELS.find((c) => norm(c) === t);
  if (exact) return exact;
  if (t.includes('linkedin') || t.includes('inmail')) return 'LinkedIn';
  if (t.includes('mail')) return 'Email';
  if (t.includes('phone') || t.includes('call') || t.includes('dial')) return 'Call';
  if (t.includes('sms') || t.includes('text') || t.includes('whatsapp')) return 'Text';
  return fallback;
}

/** How an already-logged contact is recognised on the next import. */
export const contactKey = (o: { externalId?: string; name: string; date: DateKey }): string =>
  o.externalId?.trim() ? `id:${o.externalId.trim().toLowerCase()}` : `nd:${o.name.trim().toLowerCase()}|${o.date}`;

export function parseOutreachCSV(
  text: string,
  existing: Outreach[],
  defaultChannel: Channel = 'LinkedIn',
): OutreachImport {
  const table = parseCSV(text);
  if (table.length < 2) return { rows: [], duplicates: 0, skipped: 0, columns: {} };

  const header = table[0];
  const col = mapColumns(header);
  if (col.name === undefined) return { rows: [], duplicates: 0, skipped: table.length - 1, columns: {} };

  const seen = new Set(existing.map(contactKey));
  const rows: ParsedContact[] = [];
  let duplicates = 0;
  let skipped = 0;

  const cell = (row: string[], field: string): string =>
    col[field] === undefined ? '' : (row[col[field]] ?? '').trim();

  for (const row of table.slice(1)) {
    const name = cell(row, 'name');
    if (!name) { skipped += 1; continue; }

    const contact: ParsedContact = {
      name,
      date: readDate(cell(row, 'date')) ?? todayKey(),
      channel: readChannel(cell(row, 'channel'), defaultChannel),
      outcome: readOutcome(cell(row, 'outcome')),
      company: cell(row, 'company') || undefined,
      industry: cell(row, 'industry') || undefined,
      role: cell(row, 'role') || undefined,
      notes: cell(row, 'notes') || undefined,
      externalId: cell(row, 'externalId') || undefined,
    };

    const key = contactKey(contact);
    // Guards against repeats inside one file as well as against the log.
    if (seen.has(key)) { duplicates += 1; continue; }
    seen.add(key);
    rows.push(contact);
  }

  const columns: Record<string, string> = {};
  for (const [field, at] of Object.entries(col)) columns[field] = header[at] ?? '';

  return { rows, duplicates, skipped, columns };
}

/* ------------------------------------------------------------------ */
/* Reading the log back                                                */
/* ------------------------------------------------------------------ */

/** Contacts whose industry nobody filled in. */
export const UNSORTED = 'Unsorted';

export interface OutreachStats {
  total: number;
  conversations: number;
  meetings: number;
  /** Of everyone contacted, the share who said something back. */
  replyRate: number;
  meetingRate: number;
  byIndustry: { industry: string; n: number; meetings: number; replyRate: number }[];
  byMonth: { month: string; n: number }[];
  firstContact: DateKey | null;
}

/** The long view: what the whole log adds up to, and which rooms it worked in. */
export function outreachStats(items: Outreach[]): OutreachStats {
  const total = items.length;
  const replied = (o: Outreach) => o.outcome === 'Conversation' || o.outcome === 'Meeting booked';
  const conversations = items.filter(replied).length;
  const meetings = items.filter((o) => o.outcome === 'Meeting booked').length;

  const industries = new Map<string, Outreach[]>();
  for (const o of items) {
    const key = o.industry?.trim() || UNSORTED;
    const list = industries.get(key);
    if (list) list.push(o); else industries.set(key, [o]);
  }

  const months = new Map<string, number>();
  for (const o of items) {
    const m = o.date.slice(0, 7);
    months.set(m, (months.get(m) ?? 0) + 1);
  }

  return {
    total,
    conversations,
    meetings,
    replyRate: total ? conversations / total : 0,
    meetingRate: total ? meetings / total : 0,
    byIndustry: [...industries.entries()]
      .map(([industry, list]) => ({
        industry,
        n: list.length,
        meetings: list.filter((o) => o.outcome === 'Meeting booked').length,
        replyRate: list.length ? list.filter(replied).length / list.length : 0,
      }))
      // Contacts with no industry go last however many there are. They are not
      // a room that answers well or badly, they are the ones nobody labelled,
      // and letting them head a chart called "which rooms answer" makes the
      // chart say something untrue.
      .sort((a, b) => (a.industry === UNSORTED ? 1 : 0) - (b.industry === UNSORTED ? 1 : 0) || b.n - a.n),
    byMonth: [...months.entries()].map(([month, n]) => ({ month, n })).sort((a, b) => a.month.localeCompare(b.month)),
    firstContact: items.length ? items.map((o) => o.date).sort()[0] : null,
  };
}
