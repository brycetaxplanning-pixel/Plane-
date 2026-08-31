import { chromium } from 'playwright';
const BASE = process.env.PLANE_URL ?? 'http://localhost:4173';
const FIX = new URL('./fixtures/', import.meta.url).pathname;
const problems = [];
const ok = (l) => console.log('  PASS ' + l);
const bad = (l, d) => { problems.push(`${l}: ${d}`); console.log('  FAIL ' + l + ' — ' + d); };

const browser = await chromium.launch();
async function open(seed = true) {
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
const dismiss = async (page) => {
  const c = page.locator('.pop button[aria-label="Close"]').first();
  if (await c.count()) await c.click().catch(() => {});
};
const openImport = async (page) => {
  await page.goto(BASE + '#/health?tab=body', { waitUntil: 'networkidle' });
  await page.waitForTimeout(400);
  await dismiss(page);
  await page.getByRole('button', { name: 'Import' }).click();
  return page.getByRole('dialog');
};

console.log('\n1. A Garmin-style CSV maps itself');
{
  const { ctx, page } = await open(false);
  const form = await openImport(page);
  await form.locator('input[type=file]').setInputFiles(FIX + 'garmin.csv');
  await page.waitForTimeout(500);
  const text = await form.innerText();
  /5 days of readings/.test(text) ? ok('five dated rows are read') : bad('rows', text.slice(0, 200));
  /1 row skipped/.test(text) ? ok('and the unreadable row is reported, not silently dropped') : bad('skipped', text.slice(0, 200));

  const weightCol = await form.getByLabel('Weight').inputValue();
  weightCol === '1' ? ok('the weight column is guessed from the header') : bad('guess weight', weightCol);
  const sleepCol = await form.getByLabel('Sleep (hours)').inputValue();
  sleepCol === '3' ? ok('and so is sleep') : bad('guess sleep', sleepCol);

  await form.getByRole('button', { name: 'Import' }).click();
  await page.waitForTimeout(500);
  const st = await read(page);
  st.health.vitals.length === 5 ? ok('all five days are stored') : bad('stored', String(st.health.vitals.length));
  const day = st.health.vitals.find((v) => v.date === '2026-08-20');
  day.weight === 183.4 && day.restingHr === 55 && day.sleepHours === 7.1 && day.systolic === 119
    ? ok('with every mapped column on the right day') : bad('values', JSON.stringify(day));
  const partial = st.health.vitals.find((v) => v.date === '2026-08-23');
  partial.weight === undefined ? ok('and an empty cell stays empty') : bad('empty cell', JSON.stringify(partial));
  await ctx.close();
}

console.log('\n2. A column can be remapped by hand');
{
  const { ctx, page } = await open(false);
  const form = await openImport(page);
  await form.locator('input[type=file]').setInputFiles(FIX + 'garmin.csv');
  await page.waitForTimeout(400);
  await form.getByLabel('Weight').selectOption('');
  await page.waitForTimeout(300);
  await form.getByRole('button', { name: 'Import' }).click();
  await page.waitForTimeout(500);
  const st = await read(page);
  st.health.vitals.every((v) => v.weight === undefined)
    ? ok('skipping a column leaves it out') : bad('remap', JSON.stringify(st.health.vitals[0]));
  st.health.vitals.some((v) => v.restingHr) ? ok('and the rest still come in') : bad('rest', 'lost');
  await ctx.close();
}

console.log('\n3. An import fills gaps but does not overwrite what you typed');
{
  const { ctx, page } = await open(false);
  await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('plane.state.v1'));
    s.health.vitals = [{ id: 'v1', date: '2026-08-20', weight: 999, notes: 'typed by hand' }];
    localStorage.setItem('plane.state.v1', JSON.stringify(s));
  });
  await page.reload({ waitUntil: 'networkidle' });
  const form = await openImport(page);
  await form.locator('input[type=file]').setInputFiles(FIX + 'garmin.csv');
  await page.waitForTimeout(500);
  const text = await form.innerText();
  /1 value that disagrees|1 value that disagree/.test(text)
    ? ok('the clash is counted before anything is saved') : bad('conflict count', text.slice(0, 260));
  await form.getByRole('button', { name: 'Import' }).click();
  await page.waitForTimeout(500);
  let st = await read(page);
  let day = st.health.vitals.find((v) => v.date === '2026-08-20');
  day.weight === 999 ? ok('the hand-typed value survives by default') : bad('overwrite', String(day.weight));
  day.restingHr === 55 ? ok('and the gaps around it are filled') : bad('fill', JSON.stringify(day));

  const form2 = await openImport(page);
  await form2.locator('input[type=file]').setInputFiles(FIX + 'garmin.csv');
  await page.waitForTimeout(500);
  await form2.getByRole('checkbox').first().check();
  await page.waitForTimeout(200);
  await form2.getByRole('button', { name: 'Import' }).click();
  await page.waitForTimeout(500);
  st = await read(page);
  day = st.health.vitals.find((v) => v.date === '2026-08-20');
  day.weight === 183.4 ? ok('and ticking the box replaces it') : bad('forced overwrite', String(day.weight));
  await ctx.close();
}

console.log('\n4. An Apple Health export');
{
  const { ctx, page } = await open(false);
  const form = await openImport(page);
  await form.getByRole('button', { name: 'Apple Health' }).click();
  await form.locator('input[type=file]').setInputFiles(FIX + 'apple.xml');
  await page.waitForTimeout(900);
  const text = await form.innerText();
  // 29, not 28: the nights end on the following morning, so the last one adds
  // a day of its own at the end of the range.
  /29 days of readings/.test(text) ? ok('every day is picked out of the file') : bad('days', text.slice(0, 220));
  /from \d+ records/.test(text) ? ok('and it says how many records it read') : bad('records', text.slice(0, 220));
  /days of food totals/.test(text) ? ok('dietary totals are offered separately') : bad('food', text.slice(0, 260));

  await form.getByRole('button', { name: 'Import' }).click();
  await page.waitForTimeout(700);
  const st = await read(page);
  st.health.vitals.length === 29 ? ok('the readings are stored') : bad('vitals', String(st.health.vitals.length));
  const d = st.health.vitals.find((v) => v.date === '2026-08-02');
  d.weight === 183.8 ? ok('weight lands on the right day') : bad('weight', JSON.stringify(d));
  Math.abs(d.sleepHours - 7.25) < 0.06
    ? ok('and a night that crosses midnight counts on the day you woke up') : bad('sleep', String(d.sleepHours));
  const meal = st.health.meals.find((m) => m.date === '2026-08-02');
  meal && meal.protein === 145 && meal.calories === 1200
    ? ok('the day\'s dietary records are summed into one entry') : bad('food row', JSON.stringify(meal));
  await ctx.close();
}

console.log('\n5. Food already logged by hand is left alone');
{
  const { ctx, page } = await open();
  const form = await openImport(page);
  await form.getByRole('button', { name: 'Apple Health' }).click();
  await form.locator('input[type=file]').setInputFiles(FIX + 'apple.xml');
  await page.waitForTimeout(900);
  const before = (await read(page)).health.meals.filter((m) => m.date === '2026-08-28').length;
  await form.getByRole('button', { name: 'Import' }).click();
  await page.waitForTimeout(700);
  const after = (await read(page)).health.meals.filter((m) => m.date === '2026-08-28');
  after.length === before && !after.some((m) => /Imported/.test(m.name))
    ? ok('a day with meals typed in is not doubled') : bad('double', JSON.stringify(after.map((m) => m.name)));
  const untouched = (await read(page)).health.meals.some((m) => /Imported from Apple Health/.test(m.name));
  untouched ? ok('but the days without any are brought in') : bad('none imported', 'nothing came in');
  await ctx.close();
}

console.log('\n6. A file with nothing usable says so');
{
  const { ctx, page } = await open(false);
  const form = await openImport(page);
  await form.getByRole('button', { name: 'Apple Health' }).click();
  await form.locator('input[type=file]').setInputFiles(FIX + 'garmin.csv');
  await page.waitForTimeout(600);
  const text = await form.innerText();
  /Nothing this app tracks was found/.test(text) ? ok('it explains what went wrong') : bad('error', text.slice(0, 200));
  const disabled = await form.getByRole('button', { name: 'Import' }).isDisabled();
  disabled ? ok('and there is nothing to import') : bad('button', 'still enabled');
  await ctx.close();
}

await browser.close();
console.log(problems.length ? `\n${problems.length} PROBLEM(S):\n` + problems.join('\n') : '\nAll checks passed.');
process.exit(problems.length ? 1 : 0);
