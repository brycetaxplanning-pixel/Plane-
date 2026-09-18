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

console.log('\n12. Habits can be put in the order you want them');
{
  const { ctx, page } = await seeded(430);
  await page.goto(BASE + '#/habits', { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  const pop = page.locator('.pop button').first();
  if (await pop.count()) await pop.click().catch(() => {});
  await page.waitForTimeout(400);

  const daily = () => page.locator('.card', { hasText: 'Every day' });
  const titles = async (which) => page.locator('.card', { hasText: which })
    .locator('.sortable-item .habit-main .t-bold').allInnerTexts();

  const before = await titles('Every day');
  const weeklyBefore = await titles('Every week');
  before.length >= 3 ? ok(`${before.length} daily habits to order`) : bad('setup', JSON.stringify(before));

  const rows = daily().locator('.sortable-item');
  const a = await rows.nth(0).boundingBox();
  const c = await rows.nth(2).boundingBox();
  const x = a.x + 40;
  const y0 = a.y + a.height / 2;

  // A flick is a scroll, not a reorder. Nothing may move before the hold lands.
  await page.mouse.move(x, y0);
  await page.mouse.down();
  for (let d = 0; d <= 90; d += 15) await page.mouse.move(x, y0 + d);
  await page.mouse.up();
  await page.waitForTimeout(400);
  JSON.stringify(await titles('Every day')) === JSON.stringify(before)
    ? ok('a quick drag scrolls and leaves the order alone') : bad('flick', 'the list reordered on a scroll');

  // Hold, then slide it down two places.
  await page.mouse.move(x, y0);
  await page.mouse.down();
  await page.waitForTimeout(430);
  const far = (c.y - a.y) + 20;
  for (let d = 0; d <= far; d += 12) { await page.mouse.move(x, y0 + d); await page.waitForTimeout(10); }
  await page.mouse.move(x, y0 + far);
  await page.waitForTimeout(80);
  await page.mouse.up();
  await page.waitForTimeout(600);

  const after = await titles('Every day');
  after[2] === before[0] ? ok('holding a row and sliding it moves it where you put it') : bad('drag', JSON.stringify(after));

  // Two lists share one array, so ordering one must not disturb the other.
  JSON.stringify(await titles('Every week')) === JSON.stringify(weeklyBefore)
    ? ok('and the weekly list is untouched') : bad('weekly', JSON.stringify(await titles('Every week')));

  // A keyboard can do it without any pointer at all.
  const grip = daily().locator('.grip').first();
  await grip.focus();
  const kbBefore = await titles('Every day');
  await page.keyboard.press('ArrowDown');
  await page.waitForTimeout(450);
  const kbAfter = await titles('Every day');
  kbAfter[1] === kbBefore[0] ? ok('arrow keys move a row too') : bad('keyboard', JSON.stringify(kbAfter));

  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(900);
  JSON.stringify(await titles('Every day')) === JSON.stringify(kbAfter)
    ? ok('and the order survives a reload') : bad('persist', JSON.stringify(await titles('Every day')));
  await ctx.close();
}

console.log('\n9. A habit can be swiped away, and brought back');
{
  const { ctx, page } = await seeded(390);
  // Added from Fitness, which is also the check that the mobility buttons
  // toggle rather than latch: tapping one twice must leave nothing behind.
  await page.goto(BASE + '#/fitness?tab=physique', { waitUntil: 'networkidle' });
  await page.waitForTimeout(700);
  // The seed raises an insight popup and a toast; both sit over the page and
  // will happily swallow the click we are trying to make.
  const close = page.locator('.pop button[aria-label="Close"]').first();
  if (await close.count()) await close.click().catch(() => {});
  await page.locator('.toast-wrap .toast').first()
    .waitFor({ state: 'detached', timeout: 6000 }).catch(() => {});
  const chip = page.locator('.mob-chip', { hasText: 'Thoracic extension' }).first();
  await chip.scrollIntoViewIfNeeded();
  await chip.click();
  await page.waitForTimeout(400);
  const added = await read(page);
  added.habits.items.some((h) => h.title === 'Thoracic extension')
    ? ok('a mobility button adds a daily habit') : bad('add', 'not added');
  (await chip.getAttribute('aria-pressed')) === 'true'
    ? ok('and the button reads as on') : bad('pressed', 'not marked pressed');

  await chip.click();
  await page.waitForTimeout(400);
  (await read(page)).habits.items.some((h) => h.title === 'Thoracic extension')
    ? bad('toggle off', 'tapping again did not remove it') : ok('tapping it again takes it off');

  await chip.click();
  await page.locator('.toast-wrap .toast').first()
    .waitFor({ state: 'detached', timeout: 6000 }).catch(() => {});
  await page.goto(BASE + '#/habits', { waitUntil: 'networkidle' });
  await page.waitForTimeout(700);
  const before = (await read(page)).habits.items.length;

  const box = await page.locator('.swipe').first().boundingBox();
  await page.mouse.move(box.x + box.width - 30, box.y + box.height / 2);
  await page.mouse.down();
  for (let x = 0; x <= 110; x += 22) {
    await page.mouse.move(box.x + box.width - 30 - x, box.y + box.height / 2);
    await page.waitForTimeout(25);
  }
  await page.mouse.up();
  await page.waitForTimeout(400);
  (await page.locator('.swipe.is-open').count()) > 0
    ? ok('dragging a row left reveals Delete') : bad('swipe', 'the row did not open');

  await page.locator('.swipe.is-open .swipe-delete').first().click();
  await page.waitForTimeout(600);
  const after = (await read(page)).habits.items.length;
  after === before - 1 ? ok('and it deletes the habit') : bad('delete', `${before} -> ${after}`);

  // The Undo has to be reachable: the toast is click-through by design, so
  // the button inside it has to opt back into pointer events or the way back
  // is only theoretical.
  await page.locator('.toast-action').first().click({ timeout: 5000 });
  await page.waitForTimeout(600);
  (await read(page)).habits.items.length === before
    ? ok('and Undo in the toast brings it back') : bad('undo', 'not restored');
  await ctx.close();
}

console.log('\n13. Adding habits from the list, and the five-a-day recommendation');
{
  const { ctx, page } = await seeded(430);
  await page.goto(BASE + '#/habits', { waitUntil: 'networkidle' });
  await page.waitForTimeout(700);
  const pop = page.locator('.pop button').first();
  if (await pop.count()) await pop.click().catch(() => {});
  await page.waitForTimeout(300);

  const daily = page.locator('.card', { hasText: 'Every day' }).first();
  const tools = daily.locator('.cardtool');
  (await tools.count()) === 2 ? ok('the daily list carries two corner controls') : bad('tools', `${await tools.count()}`);
  // One in each corner, above the heading: settings left, add right.
  const geo = await daily.evaluate((card) => {
    const [a, b] = [...card.querySelectorAll('.cardtool')].map((e) => e.getBoundingClientRect());
    const head = card.querySelector('.card-head').getBoundingClientRect();
    return { leftFirst: a.left < b.left, aboveHead: b.bottom <= head.top + 1 };
  });
  geo.leftFirst && geo.aboveHead ? ok('one in each top corner, above the heading') : bad('corners', JSON.stringify(geo));

  await daily.getByLabel('Habit settings').click();
  await page.waitForTimeout(300);
  /When a new day starts/.test(await page.getByRole('dialog').innerText())
    ? ok('the left one opens the settings popup') : bad('settings', 'no settings popup');
  await page.getByRole('dialog').getByRole('button', { name: 'Done' }).click();
  await page.waitForTimeout(300);

  const countDaily = async () => (await read(page)).habits.items.filter((h) => !h.archived && h.cadence === 'daily').length;
  const was = await countDaily();

  const addDaily = async (title) => {
    await daily.getByLabel('Add a daily habit').click();
    await page.waitForTimeout(250);
    const form = page.getByRole('dialog');
    await form.getByLabel('Habit', { exact: true }).fill(title);
    await form.getByRole('button', { name: 'Save' }).click();
    await page.waitForTimeout(400);
  };

  // The sample log runs five daily habits, so the next one is the sixth.
  await addDaily('Read ten pages');
  const warn = page.getByRole('dialog');
  /more than five/i.test(await warn.innerText())
    ? ok('the sixth daily habit is met with the recommendation') : bad('warning', (await warn.innerText()).slice(0, 160));
  /harder to finish/.test(await warn.innerText())
    ? ok('which says why, not just that') : bad('reason', (await warn.innerText()).slice(0, 200));

  await warn.getByRole('button', { name: 'Not now' }).click();
  await page.waitForTimeout(400);
  (await countDaily()) === was ? ok('backing out does not add it') : bad('not now', `${await countDaily()} vs ${was}`);

  await addDaily('Read ten pages');
  await page.getByRole('dialog').getByRole('button', { name: 'Add it anyway' }).click();
  await page.waitForTimeout(500);
  // Recommended, not enforced. It is his list.
  (await countDaily()) === was + 1 ? ok('and nothing is actually blocked') : bad('anyway', `${await countDaily()} vs ${was + 1}`);

  // Only new daily ones. Editing the sixth is not the moment to be told.
  await page.locator('.habit-main').filter({ hasText: 'Read ten pages' }).click();
  await page.waitForTimeout(300);
  await page.getByRole('dialog').getByRole('button', { name: 'Save' }).click();
  await page.waitForTimeout(400);
  (await page.locator('.modal').count()) === 0
    ? ok('and editing one you already have says nothing') : bad('edit', 'warned on an edit');
  await ctx.close();
}

console.log('\n14. A ceiling is tallied as it happens');
{
  const { ctx, page } = await seeded(430);
  await page.goto(BASE + '#/habits', { waitUntil: 'networkidle' });
  await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('plane.state.v1'));
    s.habits.items = s.habits.items.filter((h) => !(h.cadence === 'daily' && h.kind === 'under'));
    s.habits.items.push({ id: 'cap1', title: 'Open Instagram', cadence: 'daily', kind: 'under', target: 3, unit: '×', createdAt: '2026-09-01' });
    localStorage.setItem('plane.state.v1', JSON.stringify(s));
  });
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(700);
  const pop = page.locator('.pop button').first();
  if (await pop.count()) await pop.click().catch(() => {});
  await page.waitForTimeout(300);

  const row = page.locator('.habit').filter({ hasText: 'Open Instagram' });
  const xp = () => page.evaluate(() => JSON.parse(localStorage.getItem('plane.state.v1')).xp.length);
  const before = await xp();

  // Nothing tapped and it already counts: "no more than three" is satisfied
  // at zero, and the day is in progress.
  /Under the cap/.test(await row.innerText()) ? ok('a ceiling starts the day met') : bad('start', await row.innerText());
  (await row.locator('.tally > b').innerText()).startsWith('0')
    ? ok('with nothing on the tally') : bad('tally', await row.locator('.tally > b').innerText());

  for (let i = 0; i < 3; i += 1) { await row.getByLabel('One more').click(); await page.waitForTimeout(220); }
  (await row.locator('.tally > b').innerText()).startsWith('3') ? ok('three taps count three') : bad('count', await row.locator('.tally > b').innerText());
  /Under the cap/.test(await row.innerText()) ? ok('and at the cap it is still met') : bad('at cap', await row.innerText());

  await row.getByLabel('One more').click();
  await page.waitForTimeout(300);
  /Over the cap today/.test(await row.innerText())
    ? ok('one past it says so, in those words') : bad('over', await row.innerText());
  // Not "missed 17 days running", which is true and is not the question.
  !/Missed \d+ days/.test(await row.innerText())
    ? ok('rather than reporting the streak instead') : bad('label', await row.innerText());

  // A counter that pays per press is a counter that gets pressed.
  (await xp()) === before ? ok('and tapping it pays no XP') : bad('farm', `${await xp()} vs ${before}`);

  await row.getByLabel('One fewer').click();
  await page.waitForTimeout(300);
  /Under the cap/.test(await row.innerText()) ? ok('stepping back down puts it right') : bad('down', await row.innerText());
  await ctx.close();
}

console.log('\n15. The habit day turns over at four in the morning');
{
  const ctx = await browser.newContext({ viewport: { width: 430, height: 950 } });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => problems.push('pageerror: ' + e.message));

  // Half past one in the morning: still the night before, as far as habits go.
  // setFixedTime rather than install: install pauses timers too, and the app
  // needs its own to settle.
  await page.clock.setFixedTime(new Date('2026-09-18T01:30:00'));
  await page.goto(BASE + '#/habits', { waitUntil: 'networkidle' });
  await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('plane.state.v1'));
    s.habits.items = [{ id: 'h1', title: 'Pray', cadence: 'daily', kind: 'check', createdAt: '2026-09-01' }];
    s.habits.logs = [];
    localStorage.setItem('plane.state.v1', JSON.stringify(s));
  });
  // Reloaded, not navigated: a hash change leaves the running app holding the
  // state it already had, and it writes that straight back over this.
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(700);
  const pop = page.locator('.pop button').first();
  if (await pop.count()) await pop.click().catch(() => {});
  await page.waitForTimeout(300);

  await page.locator('.habit').filter({ hasText: 'Pray' }).getByRole('button', { name: 'Done', exact: true }).click();
  await page.waitForTimeout(500);
  let st = await read(page);
  st.habits.logs[0]?.date === '2026-09-17'
    ? ok('something logged at 01:30 belongs to the day before') : bad('day', JSON.stringify(st.habits.logs[0]));

  // Put the seam back to midnight and the same moment is the next day.
  await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('plane.state.v1'));
    s.habits.dayStartHour = 0;
    s.habits.logs = [];
    localStorage.setItem('plane.state.v1', JSON.stringify(s));
  });
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(700);
  const pop2 = page.locator('.pop button').first();
  if (await pop2.count()) await pop2.click().catch(() => {});
  await page.waitForTimeout(300);
  await page.locator('.habit').filter({ hasText: 'Pray' }).getByRole('button', { name: 'Done', exact: true }).click();
  await page.waitForTimeout(500);
  st = await read(page);
  st.habits.logs[0]?.date === '2026-09-18'
    ? ok('and at midnight it is the new day again') : bad('midnight', JSON.stringify(st.habits.logs[0]));
  await ctx.close();
}

await browser.close();
console.log(problems.length ? `\n${problems.length} PROBLEM(S):\n` + problems.join('\n') : '\nAll checks passed.');
process.exit(problems.length ? 1 : 0);
