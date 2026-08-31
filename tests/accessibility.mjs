import { chromium } from 'playwright';
const BASE = process.env.PLANE_URL ?? 'http://localhost:4173';
const problems = [];
const ok = (l) => console.log('  PASS ' + l);
const bad = (l, d) => { problems.push(`${l}: ${d}`); console.log('  FAIL ' + l + ' — ' + d); };

const browser = await chromium.launch();
async function open(route = '#/', seed = true) {
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
  await page.goto(BASE + route, { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
  const pop = page.locator('.pop button[aria-label="Close"]').first();
  if (await pop.count()) await pop.click().catch(() => {});
  return { ctx, page };
}
const focused = (page) => page.evaluate(() => {
  const el = document.activeElement;
  return el ? { tag: el.tagName, text: (el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 30), cls: el.className } : null;
});

console.log('\n1. Tabs behave like tabs');
{
  const { ctx, page } = await open('#/finance');
  const shape = await page.evaluate(() => {
    const tabs = [...document.querySelectorAll('[role="tab"]')];
    const panel = document.querySelector('[role="tabpanel"]');
    return {
      list: Boolean(document.querySelector('[role="tablist"][aria-label]')),
      stops: tabs.filter((t) => t.getAttribute('tabindex') === '0').length,
      controls: tabs.every((t) => t.getAttribute('aria-controls')),
      panelId: panel?.id,
      selectedControls: tabs.find((t) => t.getAttribute('aria-selected') === 'true')?.getAttribute('aria-controls'),
      labelled: panel?.getAttribute('aria-labelledby'),
    };
  });
  shape.list ? ok('the row is a named tablist') : bad('tablist', 'unnamed or missing');
  shape.stops === 1 ? ok('exactly one tab is a tab stop') : bad('roving tabindex', `${shape.stops} stops`);
  shape.controls ? ok('every tab names the panel it controls') : bad('aria-controls', 'missing');
  shape.panelId && shape.panelId === shape.selectedControls
    ? ok('and that panel exists and is the selected one') : bad('panel', JSON.stringify(shape));
  shape.labelled ? ok('the panel points back at its tab') : bad('labelledby', 'missing');

  await page.locator('[role="tab"][aria-selected="true"]').focus();
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(300);
  let now = await focused(page);
  /Saving/.test(now.text) ? ok('arrow right moves to the next tab') : bad('arrow', JSON.stringify(now));
  await page.keyboard.press('End');
  await page.waitForTimeout(300);
  now = await page.locator('[role="tab"][aria-selected="true"]').innerText();
  /Rules/.test(now) ? ok('End goes to the last one') : bad('End', now);
  await page.keyboard.press('Home');
  await page.waitForTimeout(300);
  now = await page.locator('[role="tab"][aria-selected="true"]').innerText();
  /Overview/.test(now) ? ok('and Home to the first') : bad('Home', now);
  await ctx.close();
}

console.log('\n2. Every tabbed module got the same treatment');
for (const [route, name] of [
  ['#/health', 'Health'], ['#/coach', 'Life Coach'], ['#/fitness', 'Fitness'],
  ['#/spanish', 'Spanish'], ['#/tracker', 'Tracker'], ['#/planning', 'Business'],
]) {
  const { ctx, page } = await open(route);
  const shape = await page.evaluate(() => {
    const tabs = [...document.querySelectorAll('[role="tab"]')];
    return {
      named: Boolean(document.querySelector('[role="tablist"][aria-label]')),
      stops: tabs.filter((t) => t.getAttribute('tabindex') === '0').length,
      panel: Boolean(document.querySelector('[role="tabpanel"]')),
    };
  });
  shape.named && shape.stops === 1 && shape.panel
    ? ok(`${name}`) : bad(name, JSON.stringify(shape));
  await ctx.close();
}

console.log('\n3. A dialog holds focus and gives it back');
{
  const { ctx, page } = await open('#/goals');
  const opener = page.locator('.goal-cover').first();
  await opener.focus();
  const before = await focused(page);
  await opener.click();
  await page.waitForTimeout(400);

  (await page.evaluate(() => Boolean(document.activeElement?.closest('[role="dialog"]'))))
    ? ok('focus moves into the dialog') : bad('focus in', 'stayed outside');

  let escaped = false;
  for (let i = 0; i < 30; i++) {
    await page.keyboard.press('Tab');
    if (!(await page.evaluate(() => Boolean(document.activeElement?.closest('[role="dialog"]'))))) { escaped = true; break; }
  }
  !escaped ? ok('tabbing thirty times never leaves it') : bad('trap', 'focus escaped to the page behind');

  for (let i = 0; i < 5; i++) await page.keyboard.press('Shift+Tab');
  (await page.evaluate(() => Boolean(document.activeElement?.closest('[role="dialog"]'))))
    ? ok('nor does shift-tabbing backwards') : bad('trap back', 'escaped backwards');

  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
  const after = await focused(page);
  after?.cls === before?.cls && /goal-cover/.test(after?.cls ?? '')
    ? ok('and closing puts it back on what opened it') : bad('restore', JSON.stringify(after));
  await ctx.close();
}

console.log('\n4. The keyboard can get past the navigation');
{
  const { ctx, page } = await open('#/habits');
  await page.keyboard.press('Tab');
  const first = await focused(page);
  /Skip to content/.test(first?.text ?? '') ? ok('the first stop is a skip link') : bad('skip link', JSON.stringify(first));
  const visible = await page.locator('.skip-link').isVisible();
  visible ? ok('and it is visible once focused') : bad('visible', 'still off screen');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(300);
  (await page.evaluate(() => document.activeElement?.id === 'main' || Boolean(document.activeElement?.closest('main'))))
    ? ok('following it lands in the content') : bad('target', JSON.stringify(await focused(page)));
  await ctx.close();
}

console.log('\n5. Every page has exactly one first-level heading');
for (const route of ['#/', '#/finance', '#/health', '#/settings', '#/goals']) {
  const { ctx, page } = await open(route);
  const n = await page.locator('h1').count();
  n === 1 ? ok(`${route} has one h1`) : bad(route, `${n} h1 elements`);
  await ctx.close();
}

console.log('\n6. Announcements reach a screen reader');
{
  const { ctx, page } = await open('#/habits');
  const box = page.locator('input.checkbox').first();
  if (await box.count()) { await box.click(); await page.waitForTimeout(400); }
  const live = await page.evaluate(() => {
    const el = document.querySelector('[aria-live]');
    return el ? { polite: el.getAttribute('aria-live'), text: el.textContent?.trim().slice(0, 40) } : null;
  });
  live?.polite ? ok(`a toast is announced politely ("${live.text}")`) : bad('live region', 'toasts are silent');
  await ctx.close();
}

await browser.close();
console.log(problems.length ? `\n${problems.length} PROBLEM(S):\n` + problems.join('\n') : '\nAll checks passed.');
process.exit(problems.length ? 1 : 0);
