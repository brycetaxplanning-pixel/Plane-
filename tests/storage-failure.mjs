import { chromium } from 'playwright';
const BASE = process.env.PLANE_URL ?? 'http://localhost:4173';
const problems = [];
const ok = (l) => console.log('  PASS ' + l);
const bad = (l, d) => { problems.push(`${l}: ${d}`); console.log('  FAIL ' + l + ' — ' + d); };

const browser = await chromium.launch();

/** Whatever the real quota is, this is what hitting it looks like. */
const failWrites = () => {
  const real = Storage.prototype.setItem;
  Storage.prototype.setItem = function (k, v) {
    if (k === 'plane.state.v1' && window.__failWrites) {
      throw new DOMException('quota exceeded', 'QuotaExceededError');
    }
    return real.call(this, k, v);
  };
};

async function open(seed = false) {
  const ctx = await browser.newContext({ viewport: { width: 1100, height: 950 }, acceptDownloads: true });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  await page.addInitScript(failWrites);
  await page.goto(BASE + '#/settings', { waitUntil: 'networkidle' });
  if (seed) {
    await page.getByRole('button', { name: 'Load sample data' }).click();
    await page.getByRole('button', { name: 'Load it' }).click();
    await page.waitForTimeout(600);
  }
  return { ctx, page, errs };
}

console.log('\n1. A failed write is visible, not silent');
{
  const { ctx, page, errs } = await open(true);
  await page.goto(BASE + '#/notes', { waitUntil: 'networkidle' });
  await page.waitForTimeout(400);
  await page.evaluate(() => { window.__failWrites = true; });

  await page.getByRole('button', { name: /Write one/ }).first().click();
  const form = page.getByRole('dialog');
  await form.getByLabel(/Title/i).first().fill('WRITTEN WHILE FULL');
  await form.getByRole('button', { name: /Save/ }).first().click();
  await page.waitForTimeout(1200);

  const bar = page.locator('.savebar');
  (await bar.count()) === 1 ? ok('a banner appears') : bad('banner', 'nothing shown');
  const text = await bar.innerText();
  /storage is full/i.test(text) ? ok('and says the storage is full') : bad('copy', text.slice(0, 140));
  /only in memory/i.test(text) ? ok('and that what is on screen is not stored') : bad('copy2', text.slice(0, 200));
  errs.length === 0 ? ok('and no unhandled rejection is thrown') : bad('unhandled', errs.slice(0, 2).join(' | '));
  await ctx.close();
}

console.log('\n2. It says what is taking the space');
{
  const { ctx, page } = await open(true);
  await page.goto(BASE + '#/notes', { waitUntil: 'networkidle' });
  await page.waitForTimeout(400);
  await page.evaluate(() => { window.__failWrites = true; });
  await page.getByRole('button', { name: /Write one/ }).first().click();
  const form = page.getByRole('dialog');
  await form.getByLabel(/Title/i).first().fill('anything at all');
  await form.getByRole('button', { name: /Save/ }).first().click();
  await page.waitForTimeout(1200);
  const text = await page.locator('.savebar').innerText();
  /Most of the space is/.test(text) ? ok('it names the biggest parts') : bad('breakdown', text.slice(0, 200));
  /\d+ (kB|MB)/.test(text) ? ok('with sizes') : bad('sizes', text.slice(0, 200));
  await ctx.close();
}

console.log('\n3. The backup button works when storage does not');
{
  const { ctx, page } = await open(true);
  await page.evaluate(() => { window.__failWrites = true; });
  await page.goto(BASE + '#/notes', { waitUntil: 'networkidle' });
  await page.waitForTimeout(400);
  await page.getByRole('button', { name: /Write one/ }).first().click();
  const form = page.getByRole('dialog');
  await form.getByLabel(/Title/i).first().fill('RESCUE ME');
  await form.getByRole('button', { name: /Save/ }).first().click();
  await page.waitForTimeout(1200);

  const download = page.waitForEvent('download');
  await page.locator('.savebar').getByRole('button', { name: /Download a backup now/ }).click();
  const file = await download;
  const path = await file.path();
  const text = await (await import('node:fs/promises')).readFile(path, 'utf8');
  /RESCUE ME/.test(text)
    ? ok('the backup contains the change that could not be stored') : bad('rescue', 'the unsaved change is missing');
  await ctx.close();
}

console.log('\n4. It clears itself once a write succeeds');
{
  const { ctx, page } = await open(true);
  await page.evaluate(() => { window.__failWrites = true; });
  await page.goto(BASE + '#/notes', { waitUntil: 'networkidle' });
  await page.waitForTimeout(400);
  await page.getByRole('button', { name: /Write one/ }).first().click();
  let form = page.getByRole('dialog');
  await form.getByLabel(/Title/i).first().fill('ONE');
  await form.getByRole('button', { name: /Save/ }).first().click();
  await page.waitForTimeout(1200);
  (await page.locator('.savebar').count()) === 1 ? ok('the banner is up') : bad('up', 'not shown');

  await page.evaluate(() => { window.__failWrites = false; });
  await page.getByRole('button', { name: /Write one|New note|\+ Note/ }).first().click();
  form = page.getByRole('dialog');
  await form.getByLabel(/Title/i).first().fill('TWO');
  await form.getByRole('button', { name: /Save/ }).first().click();
  await page.waitForTimeout(1200);
  (await page.locator('.savebar').count()) === 0 ? ok('and gone once a write lands') : bad('stuck', 'still shown');

  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(600);
  const body = await page.locator('body').innerText();
  /ONE/.test(body) && /TWO/.test(body)
    ? ok('and the retry carried the earlier change too') : bad('recovered', 'the first note was lost');
  await ctx.close();
}

console.log('\n5. Nothing appears when storage is fine');
{
  const { ctx, page } = await open(true);
  await page.goto(BASE + '#/notes', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  (await page.locator('.savebar').count()) === 0 ? ok('no banner on a healthy browser') : bad('false alarm', 'shown wrongly');
  await ctx.close();
}

await browser.close();
console.log(problems.length ? `\n${problems.length} PROBLEM(S):\n` + problems.join('\n') : '\nAll checks passed.');
process.exit(problems.length ? 1 : 0);
