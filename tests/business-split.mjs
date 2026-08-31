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

console.log('\n1. Two businesses, each with its own tab');
{
  const { ctx, page } = await seeded();
  await page.goto(BASE + '#/planning', { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
  const tabs = await page.locator('[role="tab"]').allInnerTexts();
  tabs.some((t) => /Bryce Tax Planning/.test(t)) && tabs.some((t) => /Flaxseed gel/.test(t))
    ? ok('both businesses are tabs') : bad('tabs', tabs.join(' | '));
  tabs.some((t) => /Ideas/.test(t)) ? ok('ideas is still its own tab') : bad('ideas', tabs.join(' | '));
  await ctx.close();
}

console.log('\n2. Each business shows only its own outreach and pipeline');
{
  const { ctx, page } = await seeded();
  await page.goto(BASE + '#/planning', { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
  const primary = await page.locator('main').innerText();
  /24\/50/.test(primary) || /of 50/.test(primary) ? ok('the tax business shows its 50-a-week counter') : bad('counter', primary.slice(0, 200));
  /Dana Whitfield/.test(primary) ? ok('and its own deals') : bad('deals', 'missing');
  /Wholesale trial/.test(primary) ? bad('leak', 'the other pipeline is showing') : ok('and not the other pipeline');

  await page.getByRole('tab', { name: /Flaxseed gel/ }).click();
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
  await page.getByRole('tab', { name: /Flaxseed gel/ }).click();
  await page.waitForTimeout(500);
  const flax = await page.locator('main').innerText();
  /No outreach target set/.test(flax) ? ok('it says so rather than showing 0 of 0') : bad('zero target', flax.slice(0, 200));
  /of 0/.test(flax) ? bad('zero target', 'showed a 0-of-0 ring') : ok('no meaningless ring');
  await ctx.close();
}

console.log('\n4. New outreach lands on the business you are looking at');
{
  const { ctx, page } = await seeded();
  await page.goto(BASE + '#/planning', { waitUntil: 'networkidle' });
  await page.getByRole('tab', { name: /Flaxseed gel/ }).click();
  await page.waitForTimeout(400);
  await page.getByRole('button', { name: /Log a contact anyway/ }).click();
  await page.getByPlaceholder('Name or business').fill('Salon on 4th');
  await page.getByRole('button', { name: 'Log it' }).click();
  await page.waitForTimeout(600);
  const st = await read(page);
  const logged = st.planning.outreach.find((o) => o.name === 'Salon on 4th');
  logged?.businessId === 'biz_flax' ? ok('it is filed under the active business') : bad('assignment', JSON.stringify(logged));
  await ctx.close();
}

console.log('\n5. Adding a business');
{
  const { ctx, page } = await seeded();
  await page.goto(BASE + '#/planning', { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
  await page.getByRole('button', { name: '+ Add another business' }).click();
  await page.getByPlaceholder('Flaxseed gel').fill('Consulting');
  await page.locator('.modal-body input[type="number"]').fill('10');
  await page.getByRole('button', { name: 'Save' }).click();
  await page.waitForTimeout(600);
  const st = await read(page);
  st.planning.businesses.length === 3 ? ok('a third business is stored') : bad('add', `${st.planning.businesses.length}`);
  const tabs = await page.locator('[role="tab"]').allInnerTexts();
  tabs.some((t) => /Consulting/.test(t)) ? ok('and gets its own tab') : bad('tab', tabs.join(' | '));
  const body = await page.locator('main').innerText();
  /of 10/.test(body) ? ok('and switches to it with its own target') : bad('switch', body.slice(0, 160));
  await ctx.close();
}

console.log('\n6. An older save is migrated into the new shape');
{
  const ctx = await browser.newContext({ viewport: { width: 1100, height: 950 } });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => problems.push('pageerror: ' + e.message));
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.evaluate(() => localStorage.setItem('plane.state.v1', JSON.stringify({
    version: 1,
    planning: {
      weeklyTarget: 40,
      outreach: [{ id: 'o1', date: '2026-08-31', name: 'Old contact', channel: 'Call', outcome: 'Conversation' }],
      deals: [{ id: 'd1', name: 'Old deal', stage: 'Lead', value: 1000, createdAt: '2026-08-01' }],
    },
  })));
  await page.goto(BASE + '#/planning', { waitUntil: 'networkidle' });
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(700);
  const st = await read(page);
  st.planning.businesses.length === 1 ? ok('a business is created for the orphaned data') : bad('migration', JSON.stringify(st.planning.businesses));
  st.planning.businesses[0].weeklyTarget === 40 ? ok('it inherits the old shared target') : bad('target', JSON.stringify(st.planning.businesses[0]));
  st.planning.outreach[0].businessId === st.planning.businesses[0].id ? ok('old outreach is assigned to it') : bad('outreach', JSON.stringify(st.planning.outreach[0]));
  st.planning.deals[0].businessId === st.planning.businesses[0].id ? ok('and old deals') : bad('deals', JSON.stringify(st.planning.deals[0]));
  const body = await page.locator('main').innerText();
  /Old contact/.test(body) ? ok('and it all still renders') : bad('render', body.slice(0, 160));
  await ctx.close();
}

await browser.close();
console.log(problems.length ? `\n${problems.length} PROBLEM(S):\n` + problems.join('\n') : '\nAll checks passed.');
process.exit(problems.length ? 1 : 0);
