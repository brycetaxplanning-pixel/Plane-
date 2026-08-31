/**
 * OFX and QFX, the format behind every bank's "Download for Quicken" button.
 *
 * There are two dialects in the wild. Version 1 is SGML: headers as key:value
 * lines, then tags that are frequently never closed. Version 2 is real XML.
 * Both are handled the same way here — by scanning for the transaction blocks
 * and reading the fields out — because a strict parser falls over on the first
 * unclosed tag, and every real file has hundreds of them.
 */

import type { ParsedRow } from './finance';

export interface OfxResult {
  rows: ParsedRow[];
  skipped: number;
  /** What the file says the account is, when it says. */
  account?: string;
  /** 'CREDITCARD' or a bank account type, used to read the sign correctly. */
  kind?: 'credit' | 'bank';
}

const tag = (block: string, name: string): string | undefined => {
  // Closed form first, then the unclosed SGML form: <NAME>value up to the next tag.
  const closed = new RegExp(`<${name}>([\\s\\S]*?)</${name}>`, 'i').exec(block);
  if (closed) return closed[1].trim();
  const open = new RegExp(`<${name}>([^<\\r\\n]*)`, 'i').exec(block);
  return open ? open[1].trim() : undefined;
};

/** OFX stamps are `YYYYMMDDHHMMSS[.sss][-5:EST]`; only the day matters here. */
export function ofxDate(raw: string | undefined): string | null {
  if (!raw) return null;
  const m = /^(\d{4})(\d{2})(\d{2})/.exec(raw.trim());
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

export const looksLikeOFX = (text: string): boolean =>
  /<OFX>/i.test(text) || /^OFXHEADER:/im.test(text);

export function parseOFX(text: string): OfxResult {
  const kind = /<CREDITCARDMSGSRSV1|<CCSTMTRS/i.test(text) ? 'credit' : 'bank';
  const account =
    tag(text, 'ACCTID') ??
    undefined;

  const blocks = text.match(/<STMTTRN>[\s\S]*?<\/STMTTRN>/gi) ?? [];
  const rows: ParsedRow[] = [];
  let skipped = 0;

  for (const block of blocks) {
    const date = ofxDate(tag(block, 'DTPOSTED') ?? tag(block, 'DTUSER'));
    // NAME is the merchant; MEMO is often the fuller version of the same thing.
    const name = tag(block, 'NAME') ?? '';
    const memo = tag(block, 'MEMO') ?? '';
    const vendor = (name.length >= memo.length ? name : memo).trim() || memo.trim() || name.trim();
    const amount = Number(tag(block, 'TRNAMT'));
    const fitid = tag(block, 'FITID');

    if (!date || !vendor || !Number.isFinite(amount) || amount === 0) { skipped += 1; continue; }

    // Money leaving is negative in OFX, on both bank and card accounts. A
    // positive figure is a refund, a payment or a deposit — none of which is
    // spending, so none of which belongs in a spend log.
    if (amount > 0) { skipped += 1; continue; }

    rows.push({
      date,
      vendor: vendor.replace(/\s+/g, ' '),
      amount: Math.round(Math.abs(amount) * 100) / 100,
      fitid,
    });
  }

  return { rows, skipped, account, kind };
}
