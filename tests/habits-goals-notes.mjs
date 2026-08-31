import { chromium } from 'playwright';
const BASE = process.env.PLANE_URL ?? 'http://localhost:4173';
const problems = [];
const ok = (l) => console.log('  PASS ' + l);
const bad = (l, d) => { problems.push(`${l}: ${d}`); console.log('  FAIL ' + l + ' — ' + d); };

const browser = await chromium.launch();
async function seeded(width = 1180) {
  const ctx = await browser.newContext({ viewport: { width, height: 950 } });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => problems.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') problems.push('console: ' + m.text()); });
  await page.goto(BASE + '#/settings', { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Load sample data' }).click();
  await page.getByRole('button', { name: 'Load it' }).click();
  await page.waitForTimeout(700);
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(700);
  return { ctx, page };
}
const read = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('plane.state.v1') || '{}'));

console.log('\n1. Conditions in the data become notifications');
let firstKeys = [];
{
  const { ctx, page } = await seeded();
  const st = await read(page);
  const items = st.notifications?.items ?? [];
  items.length > 0 ? ok(`${items.length} raised from the sample log`) : bad('generation', 'none raised');
  firstKeys = items.map((n) => n.key);
  items.every((n) => n.read === false) ? ok('all start unread') : bad('unread', 'some pre-read');
  new Set(firstKeys).size === firstKeys.length ? ok('no duplicate keys') : bad('keys', 'duplicates present');
  items.some((n) => n.module === 'habits') ? ok('a slipping habit raised one') : bad('habit source', JSON.stringify(items.map((n) => n.key)));

  // Reopening must not raise the same conditions again.
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  const after = (await read(page)).notifications.items;
  after.length === items.length ? ok('opening the app again raises nothing new') : bad('idempotence', `${items.length} → ${after.length}`);
  await ctx.close();
}

console.log('\n2. The bell, its count, and the hover panel');
{
  const { ctx, page } = await seeded();
  const badge = page.locator('.bell-dot').first();
  (await badge.count()) > 0 ? ok('the bell carries an unread count') : bad('badge', 'missing');
  await page.locator('.bell').first().hover();
  await page.waitForTimeout(400);
  (await page.locator('.bell-pop').count()) > 0 ? ok('hovering opens the panel') : bad('hover', 'did not open');
  const listed = await page.locator('.bell-pop .ntf').count();
  listed > 0 && listed <= 10 ? ok(`shows ${listed} recent, capped at ten`) : bad('list', `${listed} shown`);
  (await page.locator('.bell-foot').count()) > 0 ? ok('offers the full list at the bottom') : bad('footer', 'missing');
  await ctx.close();
}

console.log('\n3. Module tiles flag their own unread items');
{
  const { ctx, page } = await seeded(402);
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForTimeout(600);
  const flags = await page.locator('.mtile-flag').count();
  flags > 0 ? ok(`${flags} module tiles show a flag`) : bad('tile flags', 'none');
  const st = await read(page);
  const modules = new Set(st.notifications.items.filter((n) => !n.read && n.module).map((n) => n.module));
  flags === modules.size ? ok('one flag per module with something unread') : bad('flag count', `${flags} flags vs ${modules.size} modules`);
  await ctx.close();
}

console.log('\n4. Opening one marks it read and lands on the right tab');
{
  const { ctx, page } = await seeded();
  const before = (await read(page)).notifications.items.filter((n) => !n.read).length;
  // Pick one that deep-links into a tab.
  const target = (await read(page)).notifications.items.find((n) => n.tab);
  if (!target) { bad('deep link', 'no notification carries a tab'); }
  else {
    await page.goto(BASE + '#/notifications', { waitUntil: 'networkidle' });
    await page.waitForTimeout(400);
    await page.locator('.ntf-row', { hasText: target.title.slice(0, 30) }).first().click();
    await page.waitForTimeout(700);
    const url = page.url();
    url.includes(`tab=${target.tab}`) ? ok(`link carries ?tab=${target.tab}`) : bad('deep link', url);
    const selected = await page.locator('[role="tab"][aria-selected="true"]').first().innerText();
    selected.length > 0 ? ok(`the module opened on the "${selected.trim()}" tab`) : bad('tab', 'none selected');
    const after = (await read(page)).notifications.items.filter((n) => !n.read).length;
    after === before - 1 ? ok('opening it marks exactly one read') : bad('read', `${before} → ${after}`);
  }
  await ctx.close();
}

console.log('\n5. Mark all, filter, and clear');
{
  const { ctx, page } = await seeded();
  await page.goto(BASE + '#/notifications', { waitUntil: 'networkidle' });
  await page.waitForTimeout(400);
  await page.getByRole('button', { name: /^Unread/ }).click();
  await page.waitForTimeout(300);
  const unreadShown = await page.locator('.ntf-row').count();
  const total = (await read(page)).notifications.items.length;
  unreadShown === total ? ok('the unread filter shows them all while none are read') : bad('filter', `${unreadShown}/${total}`);
  await page.getByRole('button', { name: 'Mark all read' }).click();
  await page.waitForTimeout(400);
  (await read(page)).notifications.items.every((n) => n.read) ? ok('mark all works') : bad('mark all', 'some still unread');
  (await page.locator('.bell-dot').count()) === 0 ? ok('the bell badge clears') : bad('badge', 'still showing');
  await page.getByRole('button', { name: /^All/ }).click();
  await page.getByRole('button', { name: 'Clear' }).click();
  await page.waitForTimeout(400);
  (await read(page)).notifications.items.length === 0 ? ok('clearing empties the log') : bad('clear', 'items remain');
  await ctx.close();
}

console.log('\n6. A worsening habit escalates rather than repeating daily');
{
  const { ctx, page } = await seeded();
  const st = await read(page);
  const habitKeys = st.notifications.items.filter((n) => n.kind === 'habit').map((n) => n.key);
  const streaks = habitKeys.map((k) => Number(k.split(':').pop()));
  streaks.every((n) => [2, 3, 5, 7, 10, 14, 21].includes(n))
    ? ok('habit alerts only fire at widening intervals') : bad('escalation', JSON.stringify(habitKeys));
  await ctx.close();
}

await browser.close();
console.log(problems.length ? `\n${problems.length} PROBLEM(S):\n` + problems.join('\n') : '\nAll checks passed.');
process.exit(problems.length ? 1 : 0);
