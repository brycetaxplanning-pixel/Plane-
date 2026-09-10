import { chromium } from 'playwright';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const BASE = process.env.PLANE_URL ?? 'http://localhost:4173';
const problems = [];
const ok = (l) => console.log('  PASS ' + l);
const bad = (l, d) => { problems.push(`${l}: ${d}`); console.log('  FAIL ' + l + ' — ' + d); };

const dir = mkdtempSync(join(tmpdir(), 'plane-outreach-'));
const write = (name, text) => { const p = join(dir, name); writeFileSync(p, text); return p; };

const browser = await chromium.launch();
async function fresh() {
  const ctx = await browser.newContext({ viewport: { width: 430, height: 950 } });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => problems.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') problems.push('console: ' + m.text()); });
  await page.goto(BASE + '#/planning', { waitUntil: 'networkidle' });
  await page.waitForTimeout(700);
  return { ctx, page };
}
const panel = (page) => page.locator('.card', { hasText: 'Import outreach' });
const count = (page) => page.evaluate(() =>
  (JSON.parse(localStorage.getItem('plane.state.v1') || '{}').planning?.outreach ?? []).length);

/* A real export names its columns its own way and dates them its own way. */
const HEADER = 'Profile URL,Full Name,Company,Industry,Job Title,Date Contacted,Status,Message';
const rows = (n, from = 0) => Array.from({ length: n }, (_, i) => {
  const k = i + from;
  return `https://linkedin.com/in/p-${k},Person ${k},Co ${k % 7},${['Dentistry', 'Construction', 'Logistics'][k % 3]},Owner,3/${(k % 28) + 1}/2026,${['Sent', 'Replied', 'Meeting booked'][k % 3]},Intro`;
}).join('\n');

console.log('\n1. An export becomes the log, whatever it calls its columns');
{
  const { ctx, page } = await fresh();
  const before = await count(page);
  await panel(page).locator('input[type=file]').setInputFiles(write('a.csv', `${HEADER}\n${rows(30)}`));
  await page.waitForTimeout(900);

  const dlg = page.getByRole('dialog');
  (await dlg.count()) > 0 ? ok('the file is shown back before anything is written') : bad('preview', 'no dialog');

  const chips = (await dlg.locator('.chip-static').allInnerTexts()).join(' ');
  /name ← Full Name/.test(chips) ? ok('it finds the name column under another name') : bad('name col', chips);
  /industry ← Industry/.test(chips) ? ok('and the industry') : bad('industry col', chips);
  /externalId ← Profile URL/.test(chips) ? ok('and the profile link it will recognise rows by') : bad('id col', chips);

  await dlg.getByRole('button', { name: /^Import / }).click();
  await page.waitForTimeout(1000);
  const after = await count(page);
  after === before + 30 ? ok('30 contacts land in the log') : bad('import', `${before} -> ${after}`);

  const one = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('plane.state.v1')).planning.outreach.find((o) => o.name === 'Person 0'));
  one?.industry === 'Dentistry' ? ok('carrying the industry') : bad('industry', JSON.stringify(one));
  one?.company === 'Co 0' ? ok('and the company') : bad('company', JSON.stringify(one));
  one?.date === '2026-03-01' ? ok('with a US-style date read correctly') : bad('date', one?.date);
  one?.channel === 'LinkedIn' ? ok('and LinkedIn inferred from the profile link column') : bad('channel', one?.channel);
  await ctx.close();
}

console.log('\n2. The same export dropped in again changes nothing');
{
  const { ctx, page } = await fresh();
  const file = write('b.csv', `${HEADER}\n${rows(25)}`);
  await panel(page).locator('input[type=file]').setInputFiles(file);
  await page.waitForTimeout(900);
  await page.getByRole('dialog').getByRole('button', { name: /^Import / }).click();
  await page.waitForTimeout(1000);
  const once = await count(page);

  // A daily export repeats nearly everything from the day before. Counting a
  // person twice would inflate every number built on the log.
  await panel(page).locator('input[type=file]').setInputFiles(file);
  await page.waitForTimeout(900);
  const dlg = page.getByRole('dialog');
  const said = (await dlg.locator('p.t-sm').first().innerText()).replace(/\s+/g, ' ');
  /0 new contacts/.test(said) ? ok('it reports nothing new') : bad('dupes', said);
  /25 already logged/.test(said) ? ok('and says how many it already had') : bad('dupe count', said);
  await dlg.getByRole('button', { name: /^Import / }).isDisabled()
    ? ok('with nothing to import, importing is not offered') : bad('button', 'still enabled');
  await dlg.getByRole('button', { name: 'Cancel' }).click();
  await page.waitForTimeout(400);
  (await count(page)) === once ? ok('and the log is untouched') : bad('log', 'changed');
  await ctx.close();
}

console.log('\n3. An overlapping export adds only what is new');
{
  const { ctx, page } = await fresh();
  await panel(page).locator('input[type=file]').setInputFiles(write('c1.csv', `${HEADER}\n${rows(20)}`));
  await page.waitForTimeout(900);
  await page.getByRole('dialog').getByRole('button', { name: /^Import / }).click();
  await page.waitForTimeout(1000);
  const first = await count(page);

  // Tomorrow's file: the same twenty, plus five more.
  await panel(page).locator('input[type=file]').setInputFiles(write('c2.csv', `${HEADER}\n${rows(25)}`));
  await page.waitForTimeout(900);
  const said = (await page.getByRole('dialog').locator('p.t-sm').first().innerText()).replace(/\s+/g, ' ');
  /5 new contacts/.test(said) ? ok('only the five new ones are offered') : bad('overlap', said);
  await page.getByRole('dialog').getByRole('button', { name: /^Import / }).click();
  await page.waitForTimeout(1000);
  (await count(page)) === first + 5 ? ok('and only those five are added') : bad('overlap add', `${first} -> ${await count(page)}`);
  await ctx.close();
}

console.log('\n4. The long view is what the log is for');
{
  const { ctx, page } = await fresh();
  await panel(page).locator('input[type=file]').setInputFiles(write('d.csv', `${HEADER}\n${rows(60)}`));
  await page.waitForTimeout(900);
  await page.getByRole('dialog').getByRole('button', { name: /^Import / }).click();
  await page.waitForTimeout(1200);

  const text = await panel(page).innerText();
  /people reached out to/.test(text) ? ok('a lifetime total is shown') : bad('lifetime', text.slice(0, 200));
  /replied/.test(text) && /meetings/.test(text) ? ok('with reply and meeting counts') : bad('rates', text.slice(0, 240));
  /WHICH ROOMS ANSWER/i.test(text) ? ok('and a breakdown by industry') : bad('industry', text.slice(0, 240));

  // Contacts nobody labelled are not an industry, so they must not head a
  // chart about which industries answer.
  const firstIndustry = await panel(page).locator('.indrow-name').first().innerText();
  firstIndustry.trim() !== 'Unsorted'
    ? ok('unlabelled contacts are kept out of the ranking') : bad('unsorted', firstIndustry);
  await ctx.close();
}

console.log('\n5. A file it cannot read says so instead of importing nothing quietly');
{
  const { ctx, page } = await fresh();
  await panel(page).locator('input[type=file]').setInputFiles(write('junk.csv', 'alpha,beta\n1,2\n3,4'));
  await page.waitForTimeout(900);
  (await page.getByRole('dialog').count()) === 0 ? ok('no import is offered') : bad('junk', 'offered anyway');
  const text = await panel(page).innerText();
  /column for the person/i.test(text) ? ok('and it says what the file needs') : bad('message', text.slice(0, 200));
  await ctx.close();
}

await browser.close();
console.log(problems.length ? `\n${problems.length} PROBLEM(S):\n` + problems.join('\n') : '\nAll checks passed.');
process.exit(problems.length ? 1 : 0);
