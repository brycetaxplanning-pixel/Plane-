import { readFileSync } from 'node:fs';
import { chromium } from 'playwright';
const BASE = process.env.PLANE_URL ?? 'http://localhost:4173';
const FIX = new URL('./fixtures/', import.meta.url).pathname;
const problems = [];
const ok = (l) => console.log('  PASS ' + l);
const bad = (l, d) => { problems.push(`${l}: ${d}`); console.log('  FAIL ' + l + ' — ' + d); };

const browser = await chromium.launch();
async function open() {
  const ctx = await browser.newContext({ viewport: { width: 1100, height: 950 } });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => problems.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') problems.push('console: ' + m.text()); });
  await page.goto(BASE + '#/finance?tab=transactions', { waitUntil: 'networkidle' });
  await page.waitForTimeout(400);
  const pop = page.locator('.pop button[aria-label="Close"]').first();
  if (await pop.count()) await pop.click().catch(() => {});
  return { ctx, page };
}
const read = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('plane.state.v1') || '{}'));

async function importFile(page, name) {
  await page.getByRole('button', { name: /Import/ }).first().click();
  const form = page.getByRole('dialog');
  await form.locator('input[type=file]').setInputFiles(`${FIX}${name}`);
  await page.waitForTimeout(500);
  return form;
}

const CASES = [
  ['bofa.csv', 'Bank of America CSV, with its summary preamble', ['WHOLE FOODS MKT 342', 'SHELL OIL 574', 'GRACIE JIU JITSU ACADEMY'], ['PAYROLL']],
  ['amex.csv', 'an Amex CSV, where a charge is a positive number', ['AMAZON MKTPL*RT4YZ', 'DOORDASH*THAI HOUSE', 'NETFLIX.COM'], ['ONLINE PAYMENT']],
  ['chase.csv', 'a Chase CSV, where a charge is negative', ['TRADER JOES #118', 'CHIPOTLE 2210'], ['Payment Thank You']],
  ['capitalone.csv', 'a Capital One CSV with separate debit and credit columns', ['COSTCO WHSE #443', 'SPOTIFY USA'], ['AUTOPAY']],
  ['bofa.qfx', 'a Quicken QFX in the old SGML dialect', ['WHOLE FOODS MKT 342', 'SHELL OIL 574', 'GRACIE JIU JITSU ACADEMY'], ['PAYROLL']],
  ['card.ofx', 'an OFX in the newer XML dialect', ['AMAZON MKTPL*RT4YZ'], ['ONLINE PAYMENT']],
];

console.log('\n1. Every bank\'s own export shape');
for (const [file, label, expect, reject] of CASES) {
  const { ctx, page } = await open();
  const form = await importFile(page, file);
  await form.getByRole('button', { name: /^Import \d/ }).click();
  await page.waitForTimeout(500);
  const txs = (await read(page)).finance.transactions;
  const vendors = txs.map((t) => t.vendor).join(' | ');

  const gotAll = expect.every((v) => vendors.includes(v));
  const keptNone = reject.every((v) => !vendors.includes(v));
  const positive = txs.every((t) => t.amount > 0);

  gotAll && keptNone && positive
    ? ok(`${label} — ${txs.length} charges, no credits, all positive`)
    : bad(file, `${txs.length} rows: ${vendors.slice(0, 160)}`);
  await ctx.close();
}

console.log('\n2. Amounts survive the round trip');
{
  const { ctx, page } = await open();
  const form = await importFile(page, 'bofa.csv');
  await form.getByRole('button', { name: /^Import \d/ }).click();
  await page.waitForTimeout(500);
  const txs = (await read(page)).finance.transactions;
  const wf = txs.find((t) => /WHOLE FOODS/.test(t.vendor));
  wf?.amount === 96.4 ? ok('a signed CSV amount lands as a positive 96.40') : bad('amount', JSON.stringify(wf));
  wf?.date === '2026-08-29' ? ok('and the US date is normalised') : bad('date', wf?.date);
  await ctx.close();
}

console.log('\n3. Re-importing the same statement adds nothing');
{
  const { ctx, page } = await open();
  let form = await importFile(page, 'bofa.qfx');
  await form.getByRole('button', { name: /^Import \d/ }).click();
  await page.waitForTimeout(500);
  const first = (await read(page)).finance.transactions.length;
  first === 3 ? ok(`the first import brings in ${first}`) : bad('first', String(first));

  form = await importFile(page, 'bofa.qfx');
  const text = await form.innerText();
  /0 new, 3 already imported/.test(text)
    ? ok('the second says everything is already there') : bad('duplicates', text.slice(0, 200));
  const disabled = await form.getByRole('button', { name: /^Import \d/ }).isDisabled();
  disabled ? ok('and there is nothing to import') : bad('button', 'still enabled');
  await form.getByRole('button', { name: 'Cancel' }).click();
  (await read(page)).finance.transactions.length === first ? ok('the log is unchanged') : bad('grew', 'duplicated');
  await ctx.close();
}

console.log('\n4. An overlapping month brings in only what is new');
{
  const { ctx, page } = await open();
  // The same statement with one extra transaction, as next month's download
  // would look.
  const base = readFileSync(`${FIX}bofa.qfx`, 'utf8');
  const extra = base.replace(
    '</BANKTRANLIST>',
    '<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20260830120000[-4:EDT]<TRNAMT>-42.00<FITID>2026083000001<NAME>NEW CHARGE LTD</STMTTRN>\n</BANKTRANLIST>',
  );
  let form = await importFile(page, 'bofa.qfx');
  await form.getByRole('button', { name: /^Import \d/ }).click();
  await page.waitForTimeout(500);

  await page.getByRole('button', { name: /Import/ }).first().click();
  form = page.getByRole('dialog');
  await form.getByRole('textbox').last().fill(extra);
  await page.waitForTimeout(500);
  const text = await form.innerText();
  /1 new, 3 already imported/.test(text) ? ok('one new, three known') : bad('overlap', text.slice(0, 200));
  await form.getByRole('button', { name: /^Import 1/ }).click();
  await page.waitForTimeout(500);
  const txs = (await read(page)).finance.transactions;
  txs.length === 4 && txs.some((t) => /NEW CHARGE/.test(t.vendor))
    ? ok('and only the new one is added') : bad('result', String(txs.length));
  await ctx.close();
}

console.log('\n5. The bank id is kept, so a renamed vendor is still recognised');
{
  const { ctx, page } = await open();
  const form = await importFile(page, 'bofa.qfx');
  await form.getByRole('button', { name: /^Import \d/ }).click();
  await page.waitForTimeout(500);
  const txs = (await read(page)).finance.transactions;
  txs.every((t) => t.fitid) ? ok('every imported row carries its bank id') : bad('fitid', JSON.stringify(txs[0]));

  await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('plane.state.v1'));
    s.finance.transactions = s.finance.transactions.map((t) => ({ ...t, vendor: t.vendor + ' (renamed)', amount: t.amount + 1 }));
    localStorage.setItem('plane.state.v1', JSON.stringify(s));
  });
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(400);
  const form2 = await importFile(page, 'bofa.qfx');
  /0 new/.test(await form2.innerText())
    ? ok('and it still knows them after the vendor and amount change') : bad('id dedupe', (await form2.innerText()).slice(0, 160));
  await ctx.close();
}

console.log('\n6. A CSV without ids falls back to the shape of the row');
{
  const { ctx, page } = await open();
  let form = await importFile(page, 'chase.csv');
  await form.getByRole('button', { name: /^Import \d/ }).click();
  await page.waitForTimeout(500);
  form = await importFile(page, 'chase.csv');
  /0 new, 2 already imported/.test(await form.innerText())
    ? ok('date, vendor and amount together are enough') : bad('csv dedupe', (await form.innerText()).slice(0, 160));
  await ctx.close();
}

console.log('\n7. Junk is refused rather than half-read');
{
  const { ctx, page } = await open();
  await page.getByRole('button', { name: /Import/ }).first().click();
  const form = page.getByRole('dialog');
  await form.getByRole('textbox').last().fill('this is not a statement, it is a sentence');
  await page.waitForTimeout(400);
  const disabled = await form.getByRole('button', { name: /^Import \d/ }).isDisabled();
  disabled ? ok('nothing to import from prose') : bad('junk', 'it thought it found rows');
  await ctx.close();
}

await browser.close();
console.log(problems.length ? `\n${problems.length} PROBLEM(S):\n` + problems.join('\n') : '\nAll checks passed.');
process.exit(problems.length ? 1 : 0);
