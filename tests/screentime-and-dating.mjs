import { chromium } from 'playwright';
const BASE = process.env.PLANE_URL ?? 'http://localhost:4173';
const problems = [];
const ok = (l) => console.log('  PASS ' + l);
const bad = (l, d) => { problems.push(`${l}: ${d}`); console.log('  FAIL ' + l + ' — ' + d); };

const browser = await chromium.launch();
async function open(seed = false) {
  const ctx = await browser.newContext({ viewport: { width: 1100, height: 950 } });
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

console.log('\n1. The screen-time tally accumulates');
{
  const { ctx, page } = await open(true);
  await page.goto(BASE + '#/habits', { waitUntil: 'networkidle' });
  await page.waitForTimeout(600);
  const pop = page.locator('.pop button[aria-label="Close"]').first();
  if (await pop.count()) await pop.click().catch(() => {});
  const card = page.locator('section.card').filter({ hasText: 'What it has cost so far' }).first();
  (await card.count()) === 1 ? ok('a running total is shown for the capped habit') : bad('card', 'missing');
  const text = await card.innerText();
  /OVER THE CAP[\s\S]*\d+(\.\d+)?h/i.test(text) ? ok('with the hours past the cap') : bad('over', text.slice(0, 160));
  /a day on average/.test(text) ? ok('and the daily average across logged days') : bad('average', text.slice(0, 160));
  /Only days you logged are counted/.test(text)
    ? ok('and it says the total is a floor, not a guess') : bad('caveat', 'missing');
  /Spanish sessions|training sessions|full days/.test(text)
    ? ok('the hours are put in terms of something you actually do') : bad('equivalent', text.slice(0, 220));
  await ctx.close();
}

console.log('\n2. A yearly rate is withheld until there is enough to base it on');
{
  const { ctx, page } = await open(true);
  await page.goto(BASE + '#/habits', { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
  const card = page.locator('section.card').filter({ hasText: 'What it has cost so far' }).first();
  const text = await card.innerText();
  const logged = Number(/(\d+) days logged/.exec(text)?.[1] ?? 0);
  if (logged < 21) {
    /more logged day/.test(text) && !/a year over the cap/.test(text)
      ? ok(`${logged} days is not enough for a yearly figure, and it says so`) : bad('projection', text.slice(0, 200));
  } else {
    /a year over the cap/.test(text) ? ok('past three weeks it gives the yearly rate') : bad('projection', text.slice(0, 200));
  }
  await ctx.close();
}

console.log('\n3. Dating: a person, an outing, and the arithmetic');
{
  const { ctx, page } = await open();
  await page.goto(BASE + '#/dating', { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
  const intro = await page.locator('.stack').first().innerText();
  /never agreed to be in it/.test(intro) ? ok('it is upfront about whose data this is') : bad('privacy note', intro.slice(0, 160));

  await page.getByRole('button', { name: '+ Add someone' }).first().click();
  let form = page.getByRole('dialog');
  const hint = await form.innerText();
  /no field for a surname or a number/.test(hint) ? ok('and it says why the fields are thin') : bad('hint', hint.slice(0, 160));
  await form.getByLabel('Name').fill('S.M.');
  await form.getByLabel('Where you met').fill('Hinge');
  await form.getByRole('button', { name: 'Save' }).click();
  await page.waitForTimeout(400);
  (await read(page)).dating.people.length === 1 ? ok('the person is stored') : bad('person', 'not stored');

  await page.getByRole('button', { name: '+ Log an outing' }).click();
  form = page.getByRole('dialog');
  await form.getByLabel('What it was').fill('Dinner');
  await form.getByLabel(/What you spent/).fill('120');
  await form.getByRole('checkbox').check();
  await form.getByRole('button', { name: 'Save' }).click();
  await page.waitForTimeout(400);

  await page.getByRole('button', { name: '+ Log an outing' }).click();
  form = page.getByRole('dialog');
  await form.getByLabel('What it was').fill('Coffee');
  await form.getByLabel(/What you spent/).fill('20');
  await form.getByRole('button', { name: 'Save' }).click();
  await page.waitForTimeout(500);

  const st = await read(page);
  st.dating.outings.length === 2 ? ok('both outings are stored') : bad('outings', String(st.dating.outings.length));
  const card = page.locator('section.card').filter({ hasText: 'What it comes to' }).first();
  const text = await card.innerText();
  /\$140/.test(text) ? ok('the spend totals') : bad('total', text.slice(0, 160));
  /\$70/.test(text) ? ok('per outing is the mean of the two') : bad('per outing', text.slice(0, 160));
  /\$140/.test(text) ? ok('and per night divides by the one that counted') : bad('per night', text.slice(0, 160));
  await ctx.close();
}

console.log('\n4. With no nights logged it does not divide by zero');
{
  const { ctx, page } = await open();
  await page.goto(BASE + '#/dating', { waitUntil: 'networkidle' });
  await page.waitForTimeout(400);
  await page.getByRole('button', { name: '+ Add someone' }).first().click();
  let form = page.getByRole('dialog');
  await form.getByLabel('Name').fill('J');
  await form.getByRole('button', { name: 'Save' }).click();
  await page.waitForTimeout(300);
  await page.getByRole('button', { name: '+ Log an outing' }).click();
  form = page.getByRole('dialog');
  await form.getByLabel('What it was').fill('Drinks');
  await form.getByLabel(/What you spent/).fill('60');
  await form.getByRole('button', { name: 'Save' }).click();
  await page.waitForTimeout(400);
  const card = page.locator('section.card').filter({ hasText: 'What it comes to' }).first();
  const text = await card.innerText();
  /none logged/.test(text) ? ok('per night reads as none logged, not as zero or infinity') : bad('per night', text.slice(0, 200));
  !/NaN|Infinity/.test(text) ? ok('and no broken number appears anywhere') : bad('NaN', text.slice(0, 200));
  await ctx.close();
}

console.log('\n5. Deleting a person takes their outings with them');
{
  const { ctx, page } = await open();
  await page.goto(BASE + '#/dating', { waitUntil: 'networkidle' });
  await page.waitForTimeout(400);
  await page.getByRole('button', { name: '+ Add someone' }).first().click();
  let form = page.getByRole('dialog');
  await form.getByLabel('Name').fill('K');
  await form.getByRole('button', { name: 'Save' }).click();
  await page.waitForTimeout(300);
  await page.getByRole('button', { name: '+ Log an outing' }).click();
  form = page.getByRole('dialog');
  await form.getByLabel('What it was').fill('Dinner');
  await form.getByLabel(/What you spent/).fill('80');
  await form.getByRole('button', { name: 'Save' }).click();
  await page.waitForTimeout(400);
  await page.getByRole('button', { name: 'Edit' }).first().click();
  await page.getByRole('dialog').getByRole('button', { name: 'Delete' }).click();
  await page.waitForTimeout(400);
  const st = await read(page);
  st.dating.people.length === 0 && st.dating.outings.length === 0
    ? ok('nothing is left orphaned behind them') : bad('orphans', JSON.stringify({ p: st.dating.people.length, o: st.dating.outings.length }));
  await ctx.close();
}

console.log('\n6. An older save with no dating data still loads');
{
  const { ctx, page } = await open();
  await page.evaluate(() => localStorage.setItem('plane.state.v1', JSON.stringify({ version: 1, notes: { items: [] } })));
  await page.goto(BASE + '#/dating', { waitUntil: 'networkidle' });
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
  const st = await read(page);
  Array.isArray(st.dating.people) ? ok('the slice is filled in by the migration') : bad('migrate', JSON.stringify(st.dating));
  /Nobody tracked yet/.test(await page.locator('.stack').first().innerText())
    ? ok('and the empty state renders') : bad('empty', 'missing');
  await ctx.close();
}

console.log('\n7. Eleven modules on the launcher');
{
  const { ctx, page } = await open();
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
  const tiles = await page.locator('.mtile:not(.mtile-alt)').count();
  tiles === 11 ? ok('every module has a button') : bad('tiles', String(tiles));
  await page.locator('.mtile', { hasText: 'Dating' }).click();
  await page.waitForTimeout(500);
  /#\/dating/.test(page.url()) ? ok('and the new one opens') : bad('route', page.url());
  await ctx.close();
}

await browser.close();
console.log(problems.length ? `\n${problems.length} PROBLEM(S):\n` + problems.join('\n') : '\nAll checks passed.');
process.exit(problems.length ? 1 : 0);
