import { chromium } from 'playwright';
const BASE = process.env.PLANE_URL ?? 'http://localhost:4173';
const problems = [];
const ok = (l) => console.log('  PASS ' + l);
const bad = (l, d) => { problems.push(`${l}: ${d}`); console.log('  FAIL ' + l + ' — ' + d); };

const browser = await chromium.launch();
async function open(seed = true, width = 1100) {
  const ctx = await browser.newContext({ viewport: { width, height: 950 } });
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
const dismiss = async (page) => {
  const c = page.locator('.pop button[aria-label="Close"]').first();
  if (await c.count()) await c.click().catch(() => {});
};

console.log('\n1. Health is a module of its own');
{
  const { ctx, page } = await open();
  await page.goto(BASE + '#/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(400);
  await dismiss(page);
  const tile = page.locator('.mtile', { hasText: 'Health' }).first();
  (await tile.count()) === 1 ? ok('it has a launcher tile') : bad('tile', 'not on the launcher');
  await tile.click();
  await page.waitForTimeout(400);
  /#\/health/.test(page.url()) ? ok('and the tile opens it') : bad('route', page.url());
  await ctx.close();
}

console.log('\n2. Today shows food against the target');
{
  const { ctx, page } = await open();
  await page.goto(BASE + '#/health?tab=today', { waitUntil: 'networkidle' });
  await page.waitForTimeout(400);
  await dismiss(page);
  const body = await page.locator('.stack').first().innerText();
  /of 180g/.test(body) ? ok('the ring is against the protein target') : bad('ring', body.slice(0, 120));
  // Case-insensitive on purpose. innerText returns *rendered* text, so a
  // heading styled `text-transform: uppercase` comes back shouting even though
  // the DOM still says "Logged today". What this line is checking is that the
  // meals are listed, not how the heading above them is set.
  /logged today/i.test(body) ? ok('and today\'s meals are listed') : bad('meals', 'no list');
  /average across the \d+ days you logged/.test(body)
    ? ok('the average counts only the days with a log') : bad('average', 'wrong basis');
  await ctx.close();
}

console.log('\n3. Logging a meal');
{
  const { ctx, page } = await open();
  await page.goto(BASE + '#/health?tab=today', { waitUntil: 'networkidle' });
  await page.waitForTimeout(400);
  await dismiss(page);
  const before = (await read(page)).health.meals.length;
  await page.getByRole('button', { name: '+ Log food' }).click();
  const form = page.getByRole('dialog');
  await form.getByLabel('What was it').fill('Chipotle bowl');
  await form.getByLabel('Protein (g)').fill('55');
  await form.getByRole('button', { name: 'Save' }).click();
  await page.waitForTimeout(400);
  const st = await read(page);
  st.health.meals.length === before + 1 ? ok('it is stored') : bad('save', 'not stored');
  const m = st.health.meals.find((x) => x.name === 'Chipotle bowl');
  m && m.protein === 55 ? ok('with the protein it was given') : bad('protein', JSON.stringify(m));
  m && m.calories === undefined
    ? ok('and a field left blank stays blank, not zero') : bad('blank', `calories was ${m?.calories}`);
  st.xp.some((x) => /Chipotle bowl/.test(x.reason)) ? ok('and it earns XP') : bad('xp', 'none');
  await ctx.close();
}

console.log('\n4. A weigh-in and the trend');
{
  const { ctx, page } = await open();
  await page.goto(BASE + '#/health?tab=body', { waitUntil: 'networkidle' });
  await page.waitForTimeout(400);
  await dismiss(page);
  const text = await page.locator('.stack').first().innerText();
  /over the last month/.test(text) ? ok('the weight change is shown against a month') : bad('trend', text.slice(0, 140));
  /above your goal|below your goal/.test(text) ? ok('and measured against the goal weight') : bad('goal', 'not compared');

  await page.getByRole('button', { name: '+ Reading' }).click();
  const form = page.getByRole('dialog');
  await form.getByLabel(/Weight/).fill('179.2');
  await form.getByRole('button', { name: 'Save' }).click();
  await page.waitForTimeout(400);
  const st = await read(page);
  st.health.vitals.some((v) => v.weight === 179.2) ? ok('a new reading is stored') : bad('vitals', 'not stored');
  const v = st.health.vitals.find((x) => x.weight === 179.2);
  v.restingHr === undefined ? ok('and the untouched fields stay empty') : bad('empty', JSON.stringify(v));
  await ctx.close();
}

console.log('\n5. Bloodwork is compared to the range you entered, and nothing more');
{
  const { ctx, page } = await open();
  await page.goto(BASE + '#/health?tab=blood', { waitUntil: 'networkidle' });
  await page.waitForTimeout(400);
  await dismiss(page);
  const text = await page.locator('.stack').first().innerText();
  /logbook, not a diagnosis/.test(text) ? ok('it says plainly what it is not') : bad('disclaimer', 'missing');
  /Above range/.test(text) ? ok('an out-of-range marker is flagged') : bad('flag', text.slice(0, 200));
  /In range/.test(text) ? ok('and an in-range one says so') : bad('in range', 'not shown');
  const rows = await page.locator('table tbody tr').count();
  rows >= 8 ? ok(`every marker is listed (${rows} rows)`) : bad('rows', String(rows));
  await ctx.close();
}

console.log('\n6. One marker can be read across panels');
{
  const { ctx, page } = await open();
  await page.goto(BASE + '#/health?tab=blood', { waitUntil: 'networkidle' });
  await page.waitForTimeout(400);
  await dismiss(page);
  await page.getByRole('button', { name: 'Vitamin D (25-OH)' }).first().click();
  await page.waitForTimeout(300);
  const sheet = await page.getByRole('dialog').innerText();
  /22/.test(sheet) && /34/.test(sheet)
    ? ok('both readings are shown') : bad('history', sheet.slice(0, 160));
  /Below range/.test(sheet) && /In range/.test(sheet)
    ? ok('with the status each one had at the time') : bad('status', sheet.slice(0, 160));
  await ctx.close();
}

console.log('\n7. Adding a panel from the catalogue');
{
  const { ctx, page } = await open();
  await page.goto(BASE + '#/health?tab=blood', { waitUntil: 'networkidle' });
  await page.waitForTimeout(400);
  await dismiss(page);
  await page.getByRole('button', { name: '+ Add a panel' }).click();
  const form = page.getByRole('dialog');
  await form.getByRole('button', { name: '+ HbA1c' }).click();
  await page.waitForTimeout(200);
  const unit = await form.getByLabel('Unit').first().inputValue();
  unit === '%' ? ok('the unit is prefilled from the catalogue') : bad('unit', unit);
  const high = await form.getByLabel('Range high').first().inputValue();
  high === '5.7' ? ok('and so is a usual range you can overwrite') : bad('range', high);
  await form.getByLabel('Result').first().fill('6.1');
  await form.getByRole('button', { name: 'Save panel' }).click();
  await page.waitForTimeout(400);
  const st = await read(page);
  const p = st.health.panels.find((x) => x.markers.some((m) => m.name === 'HbA1c' && m.value === 6.1));
  p ? ok('the panel is stored') : bad('panel', 'not stored');
  const card = page.locator('section.card').filter({ hasText: 'HbA1c' }).first();
  /Above range/.test(await card.innerText()) ? ok('and 6.1 against 5.7 reads as above range') : bad('status', 'not flagged');
  await ctx.close();
}

console.log('\n8. The launcher and the coach both see it');
{
  const { ctx, page } = await open();
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(600);
  const st = await read(page);
  const n = (st.notifications?.items ?? []).find((x) => /outside range on your last panel/.test(x.title));
  n ? ok('the flagged marker is raised as a notification') : bad('notification', 'not raised');
  n && n.to === 'health' && n.tab === 'blood' ? ok('and deep-links to the bloodwork tab') : bad('deeplink', JSON.stringify(n));
  await page.goto(BASE + '#/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(400);
  const tile = await page.locator('.mtile', { hasText: 'Health' }).first().innerText();
  /outside range/.test(tile) ? ok('and the tile says so too') : bad('tile nudge', tile);
  await ctx.close();
}

console.log('\n9. An older save with no health data still loads');
{
  const { ctx, page } = await open(false);
  await page.evaluate(() => {
    localStorage.setItem('plane.state.v1', JSON.stringify({ version: 1, notes: { items: [] } }));
  });
  await page.goto(BASE + '#/health', { waitUntil: 'networkidle' });
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
  const st = await read(page);
  Array.isArray(st.health.meals) && Array.isArray(st.health.panels)
    ? ok('the health slice is filled in') : bad('migrate', JSON.stringify(st.health));
  const body = await page.locator('.stack').first().innerText();
  /Nothing logged yet today/.test(body) ? ok('and the empty state renders') : bad('empty', body.slice(0, 140));
  await ctx.close();
}

console.log('\n10. A second deep link switches tab even when already in the module');
{
  const { ctx, page } = await open();
  await page.goto(BASE + '#/health?tab=today', { waitUntil: 'networkidle' });
  // The module is code-split, so wait for it to be on screen before poking it.
  await page.getByRole('tab', { name: 'Today' }).waitFor();
  await page.evaluate(() => { window.location.hash = '#/health?tab=blood'; });
  await page.waitForTimeout(700);
  const selected = await page.locator('[role="tab"][aria-selected="true"]').innerText();
  /Bloodwork/.test(selected) ? ok('the tab follows the link') : bad('tab', selected);
  await ctx.close();
}

console.log('\n11. The idea coach offers first, and takes no for an answer');
{
  const { ctx, page } = await open();
  await page.goto(BASE + '#/planning?tab=ideas', { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
  await dismiss(page);
  const offer = page.locator('.insight', { hasText: 'Let me help you out' }).first();
  (await offer.count()) === 1 ? ok('one idea is offered, unprompted') : bad('offer', 'not shown');
  const text = await offer.innerText();
  /Clips channel/.test(text) ? ok('and it is the oldest one still sitting at Spark') : bad('pick', text.slice(0, 120));
  /ago and nothing has happened since/.test(text) ? ok('with how long it has been sitting') : bad('age', text.slice(0, 120));

  await offer.getByRole('button', { name: 'Not now' }).click();
  await page.waitForTimeout(400);
  const st = await read(page);
  const parked = st.planning.ideas.find((i) => /Clips channel/.test(i.title));
  parked.snoozedUntil > new Date().toISOString().slice(0, 10)
    ? ok('"not now" parks it for a fortnight') : bad('snooze', JSON.stringify(parked.snoozedUntil));
  const next = await page.locator('.insight', { hasText: 'Let me help you out' }).first().innerText();
  !/Clips channel/.test(next) ? ok('and it moves on to the next one') : bad('rotate', next.slice(0, 100));
  await ctx.close();
}

await browser.close();
console.log(problems.length ? `\n${problems.length} PROBLEM(S):\n` + problems.join('\n') : '\nAll checks passed.');
process.exit(problems.length ? 1 : 0);
