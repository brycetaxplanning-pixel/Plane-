import { chromium } from 'playwright';
const BASE = process.env.PLANE_URL ?? 'http://localhost:4173';
const problems = [];
const ok = (l) => console.log('  PASS ' + l);
const bad = (l, d) => { problems.push(`${l}: ${d}`); console.log('  FAIL ' + l + ' — ' + d); };

const browser = await chromium.launch();
async function fresh(at) {
  const ctx = await browser.newContext({ viewport: { width: 430, height: 950 } });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => problems.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') problems.push('console: ' + m.text()); });
  if (at) await page.clock.setFixedTime(new Date(at));
  await page.goto(BASE + '#/bucket', { waitUntil: 'networkidle' });
  await page.waitForTimeout(600);
  const pop = page.locator('.pop button').first();
  if (await pop.count()) await pop.click().catch(() => {});
  await page.waitForTimeout(200);
  return { ctx, page };
}
const read = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('plane.state.v1') || '{}'));

console.log('\n1. A fresh install opens on a list, not an empty page');
{
  const { ctx, page } = await fresh();
  const titles = await page.locator('.todo-title').allInnerTexts();
  const want = ['Kitesurfing', 'Visit Asia', 'Go to a UFC event'];
  want.every((w) => titles.some((t) => t.trim() === w))
    ? ok('the three it ships with are there') : bad('seed', titles.join(' | '));
  (await page.locator('.bucket-line').count()) === 1
    ? ok('and the module says something at the top') : bad('line', 'no line');

  // Emptied is emptied. The default fills a slice that is missing, not one
  // you have cleared.
  await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('plane.state.v1'));
    s.bucket.items = [];
    localStorage.setItem('plane.state.v1', JSON.stringify(s));
  });
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(600);
  (await read(page)).bucket.items.length === 0
    ? ok('clearing the list keeps it clear') : bad('refill', 'the defaults came back');
  /Nothing on the list/.test(await page.locator('#main').innerText())
    ? ok('and it says so rather than looking broken') : bad('empty', (await page.locator('#main').innerText()).slice(0, 160));
  await ctx.close();
}

console.log('\n2. Adding, detailing, crossing off and putting back');
{
  const { ctx, page } = await fresh();
  const xp = async () => ((await read(page)).xp ?? []).reduce((n, e) => n + e.amount, 0);
  const before = await xp();

  await page.getByLabel('Add something to the list').click();
  await page.waitForTimeout(250);
  let form = page.getByRole('dialog');
  await form.getByLabel('What you want to do').fill('Learn to free dive');
  // One line is the whole job; the rest is behind one press.
  (await form.getByLabel('Notes').count()) === 0
    ? ok('the sheet opens as one line') : bad('fold', 'the detail was open from the start');
  await form.getByRole('button', { name: /Add more detail/ }).click();
  await form.getByLabel('Roughly when').fill('Before 35');
  await form.getByLabel('Notes').fill('Bali, with a course');
  await form.getByRole('button', { name: 'Save' }).click();
  await page.waitForTimeout(500);

  let st = await read(page);
  const added = st.bucket.items.find((i) => i.title === 'Learn to free dive');
  added?.when === 'Before 35' && added?.notes === 'Bali, with a course'
    ? ok('it saves with the detail put on it') : bad('save', JSON.stringify(added));
  (await page.locator('.todo-row', { hasText: 'Learn to free dive' }).innerText()).includes('Before 35')
    ? ok('and the row says when') : bad('row', await page.locator('.todo-row', { hasText: 'Learn to free dive' }).innerText());

  const row = page.locator('.todo-row').filter({ hasText: 'Learn to free dive' });
  await row.getByLabel('Cross off Learn to free dive').click();
  await page.waitForTimeout(500);
  st = await read(page);
  const crossed = st.bucket.items.find((i) => i.title === 'Learn to free dive');
  crossed?.done === true && Boolean(crossed?.doneAt)
    ? ok('crossing it off records the day') : bad('cross', JSON.stringify(crossed));
  (await xp()) - before === 90 ? ok('and pays for it — 90 XP') : bad('xp', `${(await xp()) - before}`);
  // The heading is uppercased by CSS, which innerText reflects, so this reads
  // the sub line instead of guessing the case.
  /you actually did/.test(await page.locator('#main').innerText())
    ? ok('it moves to a section of its own') : bad('done section', 'no Done section');

  // Ticked off by accident is worse than never written down.
  await page.locator('.todo-row').filter({ hasText: 'Learn to free dive' })
    .getByLabel('Put Learn to free dive back on the list').click();
  await page.waitForTimeout(400);
  (await read(page)).bucket.items.find((i) => i.title === 'Learn to free dive')?.done
    ? bad('uncross', 'still crossed off') : ok('and it can be put back');
  await ctx.close();
}

console.log('\n3. The line at the top turns over once a day');
{
  const a = await fresh('2026-09-18T12:00:00');
  const first = await a.page.locator('.bucket-line').innerText();
  await a.ctx.close();

  // Same day, a different hour: it must not reshuffle while you are reading it.
  const b = await fresh('2026-09-18T22:30:00');
  const same = await b.page.locator('.bucket-line').innerText();
  await b.ctx.close();
  same === first ? ok('the same line all day') : bad('stable', `${first} / ${same}`);

  const c = await fresh('2026-09-19T12:00:00');
  const next = await c.page.locator('.bucket-line').innerText();
  await c.ctx.close();
  next !== first ? ok('and a different one tomorrow') : bad('rotate', `both days said "${first}"`);

  // Fourteen lines, so a fortnight apart must come round to the same one.
  const d = await fresh('2026-10-02T12:00:00');
  const later = await d.page.locator('.bucket-line').innerText();
  await d.ctx.close();
  later === first ? ok('fourteen of them, then round again') : bad('cycle', `${first} / ${later}`);
}

console.log('\n4. The add control is above the list, not under it');
{
  const { ctx, page } = await fresh();
  const geo = await page.evaluate(() => {
    const tool = document.querySelector('.cardtool');
    const rows = document.querySelectorAll('.todo-row');
    if (!tool || !rows.length) return null;
    return { above: tool.getBoundingClientRect().bottom <= rows[0].getBoundingClientRect().top };
  });
  geo?.above ? ok('you do not scroll past the list to add to it') : bad('placement', JSON.stringify(geo));
  await ctx.close();
}

await browser.close();
console.log(problems.length ? `\n${problems.length} PROBLEM(S):\n` + problems.join('\n') : '\nAll checks passed.');
process.exit(problems.length ? 1 : 0);
