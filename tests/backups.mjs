import { chromium } from 'playwright';
const BASE = process.env.PLANE_URL ?? 'http://localhost:4173';
const problems = [];
const ok = (l) => console.log('  PASS ' + l);
const bad = (l, d) => { problems.push(`${l}: ${d}`); console.log('  FAIL ' + l + ' — ' + d); };

const browser = await chromium.launch();
async function open(seed = true) {
  const ctx = await browser.newContext({ viewport: { width: 1100, height: 950 }, acceptDownloads: true });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => problems.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') problems.push('console: ' + m.text()); });
  await page.goto(BASE + '#/settings', { waitUntil: 'networkidle' });
  if (seed) {
    await page.getByRole('button', { name: 'Load sample data' }).click();
    await page.getByRole('button', { name: 'Load it' }).click();
    await page.waitForTimeout(600);
  }
  return { ctx, page };
}
const read = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('plane.state.v1') || '{}'));

console.log('\n1. The backup card is honest about where the data lives');
{
  const { ctx, page } = await open();
  const card = page.locator('section.card').filter({ hasText: 'Backups' }).first();
  (await card.count()) === 1 ? ok('there is a backups card') : bad('card', 'missing');
  const text = await card.innerText();
  /evicts storage for sites you have not opened/.test(text)
    ? ok('and it names the failure mode people actually hit') : bad('eviction', text.slice(0, 200));
  /You have never taken a backup|No backup taken yet/i.test(text)
    ? ok('it says there has never been a backup') : bad('never', text.slice(0, 220));
  await ctx.close();
}

console.log('\n2. Taking one records that it happened');
{
  const { ctx, page } = await open();
  const card = page.locator('section.card').filter({ hasText: 'Backups' }).first();
  const download = page.waitForEvent('download');
  await card.getByRole('button', { name: 'Download a backup' }).click();
  const file = await download;
  /plane-backup-\d{4}-\d{2}-\d{2}\.json/.test(file.suggestedFilename())
    ? ok(`a dated file comes down (${file.suggestedFilename()})`) : bad('filename', file.suggestedFilename());
  await page.waitForTimeout(400);
  const st = await read(page);
  st.settings.lastExport ? ok('and the date is recorded') : bad('lastExport', 'not recorded');
  const after = await page.locator('section.card').filter({ hasText: 'Backups' }).first().innerText();
  /Last backup/.test(after) ? ok('the card now says when') : bad('card after', after.slice(0, 200));
  await ctx.close();
}

console.log('\n3. The warning appears only when there is something to lose');
{
  const { ctx, page } = await open(false);
  const card = page.locator('section.card').filter({ hasText: 'Backups' }).first();
  const empty = await card.innerText();
  !/You have never taken a backup/.test(empty)
    ? ok('an empty app is not nagged') : bad('nag', 'warned with no data');

  await page.goto(BASE + '#/settings', { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Load sample data' }).click();
  await page.getByRole('button', { name: 'Load it' }).click();
  await page.waitForTimeout(700);
  const seeded = await page.locator('section.card').filter({ hasText: 'Backups' }).first().innerText();
  /You have never taken a backup/.test(seeded) ? ok('a full one is') : bad('warn', seeded.slice(0, 220));
  /logged entries/.test(seeded) ? ok('and it counts what is at stake') : bad('count', seeded.slice(0, 220));
  await ctx.close();
}

console.log('\n4. A stale backup starts warning again');
{
  const { ctx, page } = await open();
  await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('plane.state.v1'));
    const d = new Date();
    d.setDate(d.getDate() - 3);
    s.settings.lastExport = d.toISOString().slice(0, 10);
    localStorage.setItem('plane.state.v1', JSON.stringify(s));
  });
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
  let text = await page.locator('section.card').filter({ hasText: 'Backups' }).first().innerText();
  !/days since your last backup/.test(text) ? ok('three days ago is fine') : bad('early warn', text.slice(0, 160));

  await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('plane.state.v1'));
    const d = new Date();
    d.setDate(d.getDate() - 40);
    s.settings.lastExport = d.toISOString().slice(0, 10);
    localStorage.setItem('plane.state.v1', JSON.stringify(s));
  });
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
  text = await page.locator('section.card').filter({ hasText: 'Backups' }).first().innerText();
  /40 days since your last backup/.test(text) ? ok('forty days is not') : bad('late warn', text.slice(0, 200));

  const st = await read(page);
  (st.notifications?.items ?? []).some((n) => /days since your last backup/.test(n.title))
    ? ok('and it reaches the notification log') : bad('notification', 'not raised');
  await ctx.close();
}

console.log('\n5. Storage health is reported, not assumed');
{
  const { ctx, page } = await open();
  const text = await page.locator('section.card').filter({ hasText: 'Backups' }).first().innerText();
  /(marked this storage persistent|not marked persistent|cannot promise)/.test(text)
    ? ok('it says whether the browser will keep the data') : bad('persisted', text.slice(0, 240));
  /Using \d+\.\d MB/.test(text) ? ok('and how much there is') : bad('usage', text.slice(0, 240));
  await ctx.close();
}

await browser.close();
console.log(problems.length ? `\n${problems.length} PROBLEM(S):\n` + problems.join('\n') : '\nAll checks passed.');
process.exit(problems.length ? 1 : 0);
