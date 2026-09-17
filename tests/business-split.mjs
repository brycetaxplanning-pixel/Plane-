import { chromium } from 'playwright';
const BASE = process.env.PLANE_URL ?? 'http://localhost:4173';
const problems = [];
const ok = (l) => console.log('  PASS ' + l);
const bad = (l, d) => { problems.push(`${l}: ${d}`); console.log('  FAIL ' + l + ' — ' + d); };

const browser = await chromium.launch();
async function seeded(width = 1100) {
  const ctx = await browser.newContext({ viewport: { width, height: 950 } });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => problems.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') problems.push('console: ' + m.text()); });
  await page.goto(BASE + '#/settings', { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Load sample data' }).click();
  await page.getByRole('button', { name: 'Load it' }).click();
  await page.waitForTimeout(700);
  return { ctx, page };
}
const read = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('plane.state.v1') || '{}'));

console.log('\n1. The module opens on its businesses, the way the app opens on its modules');
{
  const { ctx, page } = await seeded();
  await page.goto(BASE + '#/planning', { waitUntil: 'networkidle' });
  await page.waitForTimeout(600);
  const cards = await page.locator('.mtile-name').allInnerTexts();
  cards.some((t) => /Bryce Tax Planning/i.test(t)) && cards.some((t) => /Flaxseed gel/i.test(t))
    ? ok('both businesses are cards') : bad('cards', cards.join(' | '));
  cards.some((t) => /Business ideas/i.test(t)) ? ok('ideas is a card of its own') : bad('ideas', cards.join(' | '));
  cards.some((t) => /Add a business/i.test(t)) ? ok('and so is adding another') : bad('add', cards.join(' | '));
  // Nothing is open until one is picked, which is what makes it a picker.
  (await page.locator('.counter').count()) === 0
    ? ok('nothing is opened for you') : bad('preopened', 'a business was already showing');
  await ctx.close();
}

console.log('\n2. Each business shows only its own outreach and pipeline');
{
  const { ctx, page } = await seeded();
  await page.goto(BASE + '#/planning', { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
  await page.locator('.mtile').filter({ hasText: /Bryce Tax Planning/i }).first().click();
  await page.waitForTimeout(500);
  const primary = await page.locator('main').innerText();
  /24\/50/.test(primary) || /of 50/.test(primary) ? ok('the tax business shows its 50-a-week counter') : bad('counter', primary.slice(0, 200));
  /Dana Whitfield/.test(primary) ? ok('and its own deals') : bad('deals', 'missing');
  /Wholesale trial/.test(primary) ? bad('leak', 'the other pipeline is showing') : ok('and not the other pipeline');

  await page.getByRole('button', { name: 'Back' }).click();
  await page.waitForTimeout(400);
  await page.locator('.mtile').filter({ hasText: /Flaxseed gel/i }).first().click();
  await page.waitForTimeout(500);
  const flax = await page.locator('main').innerText();
  /Wholesale trial/.test(flax) ? ok('switching shows the other pipeline') : bad('switch', flax.slice(0, 200));
  /Dana Whitfield/.test(flax) ? bad('leak', 'tax deals leaked across') : ok('and not the tax deals');
  await ctx.close();
}

console.log('\n3. A business with no outreach target hides the counter');
{
  const { ctx, page } = await seeded();
  await page.goto(BASE + '#/planning', { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
  await page.locator('.mtile').filter({ hasText: /Flaxseed gel/i }).first().click();
  await page.waitForTimeout(500);
  const flax = await page.locator('main').innerText();
  /No outreach target set/.test(flax) ? ok('it says so rather than showing 0 of 0') : bad('zero target', flax.slice(0, 200));
  /of 0/.test(flax) ? bad('zero target', 'showed a 0-of-0 ring') : ok('no meaningless ring');
  // No outreach target is not the same as nothing to show: it still has deals,
  // and they used to be hidden behind the same guard as the charts.
  /Wholesale trial/.test(flax) ? ok('but its pipeline is still there') : bad('pipeline', flax.slice(0, 200));
  await ctx.close();
}

// Section 4 tested that a logged contact was filed under the business you
// were looking at. Logging contacts by name is gone — outreach is a count —
// so what replaces it is section 8, which checks each business counts its own.

console.log('\n5. Adding a business');
{
  const { ctx, page } = await seeded();
  await page.goto(BASE + '#/planning', { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
  // Adding one is a card on the picker, beside the businesses it will join.
  await page.locator('.mtile').filter({ hasText: /Add a business/i }).first().click();
  await page.waitForTimeout(400);
  await page.getByPlaceholder('Flaxseed gel').fill('Consulting');
  await page.locator('.modal-body input[type="number"]').fill('10');
  await page.getByRole('button', { name: 'Save' }).click();
  await page.waitForTimeout(600);
  const st = await read(page);
  st.planning.businesses.length === 3 ? ok('a third business is stored') : bad('add', `${st.planning.businesses.length}`);
  const cards = await page.locator('.mtile-name').allInnerTexts();
  cards.some((t) => /Consulting/i.test(t)) ? ok('and gets its own card') : bad('card', cards.join(' | '));
  await page.locator('.mtile').filter({ hasText: /Consulting/i }).first().click();
  await page.waitForTimeout(500);
  const body = await page.locator('main').innerText();
  /of 10/.test(body) ? ok('opening it shows its own target') : bad('switch', body.slice(0, 160));
  await ctx.close();
}

console.log('\n6. An older save is migrated into the new shape');
{
  const ctx = await browser.newContext({ viewport: { width: 1100, height: 950 } });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => problems.push('pageerror: ' + e.message));
  await page.goto(BASE, { waitUntil: 'networkidle' });
  // The outreach log renders the current week, so a literal date silently
  // stops being visible the moment the week rolls over — this asserted
  // 2026-08-31 and passed until Sep 7. Today is always in this week.
  const thisWeek = new Date().toISOString().slice(0, 10);
  await page.evaluate((date) => localStorage.setItem('plane.state.v1', JSON.stringify({
    version: 1,
    planning: {
      weeklyTarget: 40,
      outreach: [{ id: 'o1', date, name: 'Old contact', channel: 'Call', outcome: 'Conversation' }],
      deals: [{ id: 'd1', name: 'Old deal', stage: 'Lead', value: 1000, createdAt: '2026-08-01' }],
    },
    // Written when Business was one thing, so it names the module and nothing
    // finer. With two businesses it would otherwise show in both.
    reminders: { items: [{ id: 'r1', title: 'Old business to-do', repeat: 'Once', module: 'planning', done: false, createdAt: '2026-08-01' }] },
  })), thisWeek);
  await page.goto(BASE + '#/planning', { waitUntil: 'networkidle' });
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(700);
  const st = await read(page);
  st.planning.businesses.length === 1 ? ok('a business is created for the orphaned data') : bad('migration', JSON.stringify(st.planning.businesses));
  st.planning.businesses[0].weeklyTarget === 40 ? ok('it inherits the old shared target') : bad('target', JSON.stringify(st.planning.businesses[0]));
  st.planning.outreach[0].businessId === st.planning.businesses[0].id ? ok('old outreach is assigned to it') : bad('outreach', JSON.stringify(st.planning.outreach[0]));
  st.planning.deals[0].businessId === st.planning.businesses[0].id ? ok('and old deals') : bad('deals', JSON.stringify(st.planning.deals[0]));
  st.reminders.items[0].sub === st.planning.businesses[0].id
    ? ok('and a business to-do written before the split') : bad('todo migration', JSON.stringify(st.reminders.items[0]));
  // "Old contact" used to be checked here, in the week's table of logged
  // contacts. Outreach is a count now and that table is gone, so what proves
  // the migrated data renders is the business it was given appearing and
  // opening on its inherited target.
  const cards = await page.locator('.mtile-name').allInnerTexts();
  cards.length > 0 ? ok('the migrated business appears as a card') : bad('render', 'no cards');
  await page.locator('.mtile').first().click();
  await page.waitForTimeout(500);
  const body = await page.locator('main').innerText();
  /of 40/.test(body) ? ok('and opens on the target it inherited') : bad('render', body.slice(0, 200));
  await ctx.close();
}

console.log('\n8. The week is a number you can step, and each business keeps its own');
{
  const ctx = await browser.newContext({ viewport: { width: 430, height: 950 } });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => problems.push('pageerror: ' + e.message));
  await page.goto(BASE + '#/settings', { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Load sample data' }).click();
  await page.getByRole('button', { name: 'Load it' }).click();
  await page.waitForTimeout(800);
  await page.goto(BASE + '#/planning', { waitUntil: 'networkidle' });
  await page.waitForTimeout(900);
  const pop = page.locator('.pop button').first();
  if (await pop.count()) await pop.click().catch(() => {});
  await page.waitForTimeout(300);
  // The module opens on its businesses now; the counter lives inside one.
  await page.locator('.mtile').filter({ hasText: /Bryce Tax Planning/i }).first().click();
  await page.waitForTimeout(600);

  const val = page.getByLabel('Outreach this week');
  const start = Number(await val.inputValue());

  // The number shown is the week's number, not the hand-counted part of it —
  // a counter reading 0 beside a ring reading 24 is two answers to one question.
  const ringText = await page.locator('.card', { hasText: 'outreach' }).first().innerText();
  new RegExp(`\\b${start}\\b`).test(ringText)
    ? ok(`the counter and the ring agree (${start})`) : bad('agree', ringText.slice(0, 120));

  await page.getByLabel('One more').click();
  await page.waitForTimeout(350);
  await page.getByLabel('One more').click();
  await page.waitForTimeout(350);
  Number(await val.inputValue()) === start + 2 ? ok('plus steps it up') : bad('plus', await val.inputValue());
  await page.getByLabel('One fewer').click();
  await page.waitForTimeout(350);
  Number(await val.inputValue()) === start + 1 ? ok('minus steps it down') : bad('minus', await val.inputValue());

  await val.fill(String(start + 96));
  await val.blur();
  await page.waitForTimeout(500);
  Number(await val.inputValue()) === start + 96 ? ok('and a whole week can be typed in at once') : bad('type', await val.inputValue());

  // Each business counts its own week.
  await page.getByRole('button', { name: 'Back' }).click();
  await page.waitForTimeout(500);
  const other = page.locator('.mtile').filter({ hasText: /Flaxseed gel/i }).first();
  if (await other.count()) {
    await other.click();
    await page.waitForTimeout(700);
    const theirs = page.getByLabel('Outreach this week');
    if (await theirs.count()) {
      Number(await theirs.inputValue()) !== start + 96
        ? ok('the other business has a count of its own') : bad('bleed', 'the count carried across');
    } else ok('the other business runs no outreach, so it has no counter');
  }

  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(900);
  await ctx.close();
}

console.log('\n9. One way back, and a to-do list per business');
{
  const { ctx, page } = await seeded(393);
  const backs = () => page.locator('.backlink');
  const badge = () => page.locator('.modtodo-btn').nth(1);

  await page.goto(BASE + '#/planning', { waitUntil: 'networkidle' });
  await page.waitForTimeout(700);
  const pop = page.locator('.pop button').first();
  if (await pop.count()) await pop.click().catch(() => {});
  await page.waitForTimeout(300);

  // There used to be two: one pinned above the card that left the module, and
  // one inside the module for its own depth.
  (await backs().count()) === 1 ? ok('a module screen has exactly one back control') : bad('backs', `${await backs().count()} of them`);
  (await backs().first().innerText()).trim() === 'Back' ? ok('and it just says Back') : bad('label', await backs().first().innerText());

  await page.locator('.mtile').filter({ hasText: 'Bryce Tax Planning' }).click();
  await page.waitForTimeout(500);
  (await backs().count()) === 1 ? ok('still one inside a business') : bad('backs', `${await backs().count()} of them`);
  (await badge().innerText()).trim() === '2' ? ok("Bryce Tax Planning carries the module's two to-dos") : bad('bryce todos', await badge().innerText());

  // The first press steps out of the business, not out of the module.
  await backs().first().click();
  await page.waitForTimeout(400);
  (await page.locator('.mtile-name').allInnerTexts()).some((t) => /Flaxseed/i.test(t))
    ? ok('back from a business lands on the businesses') : bad('back', 'did not return to the picker');

  await page.locator('.mtile').filter({ hasText: 'Flaxseed gel' }).click();
  await page.waitForTimeout(500);
  (await badge().innerText()).trim() === '' ? ok('and the second business starts on none of them') : bad('flax todos', await badge().innerText());

  // Written in here, it belongs in here.
  await page.locator('.modtodo-btn').first().click();
  await page.waitForTimeout(300);
  await page.getByLabel('What you need to do').fill('Order more xanthan gum');
  await page.getByRole('button', { name: 'Save' }).click();
  await page.waitForTimeout(500);
  (await badge().innerText()).trim() === '1' ? ok('one added in here shows in here') : bad('add', await badge().innerText());
  const st = await read(page);
  const added = st.reminders.items.find((r) => r.title === 'Order more xanthan gum');
  added?.sub === 'biz_flax' ? ok('stamped with the business, not just the module') : bad('stamp', JSON.stringify(added));

  await backs().first().click();
  await page.waitForTimeout(400);
  await page.locator('.mtile').filter({ hasText: 'Bryce Tax Planning' }).click();
  await page.waitForTimeout(500);
  (await badge().innerText()).trim() === '2' ? ok('and never leaks into the other one') : bad('leak', await badge().innerText());

  // Above the businesses, the list is all of them.
  await backs().first().click();
  await page.waitForTimeout(400);
  (await badge().innerText()).trim() === '3' ? ok("at the module's own level it is all three") : bad('module level', await badge().innerText());

  // The second press is the one that leaves.
  await backs().first().click();
  await page.waitForTimeout(500);
  (await page.locator('.launch-grid .mtile-name').count()) > 5
    ? ok('back again leaves for all the modules') : bad('leave', 'did not reach the launcher');
  await ctx.close();
}

await browser.close();
console.log(problems.length ? `\n${problems.length} PROBLEM(S):\n` + problems.join('\n') : '\nAll checks passed.');
process.exit(problems.length ? 1 : 0);
