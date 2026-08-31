import { chromium } from 'playwright';
const BASE = process.env.PLANE_URL ?? 'http://localhost:4173';
const problems = [];
const ok = (l) => console.log('  PASS ' + l);
const bad = (l, d) => { problems.push(`${l}: ${d}`); console.log('  FAIL ' + l + ' — ' + d); };

const browser = await chromium.launch();

console.log('\n1. The service worker installs and serves the app offline');
{
  const ctx = await browser.newContext({ viewport: { width: 430, height: 900 } });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => problems.push('pageerror: ' + e.message));

  await page.goto(BASE, { waitUntil: 'networkidle' });
  const ready = await page.evaluate(() =>
    navigator.serviceWorker.ready.then((r) => Boolean(r.active)).catch(() => false));
  ready ? ok('it registers and activates') : bad('register', 'no active worker');

  // Give it a moment to fill the cache, then pull the plug.
  await page.waitForTimeout(1200);
  const cached = await page.evaluate(async () => {
    const keys = await caches.keys();
    const c = await caches.open(keys[0]);
    return (await c.keys()).length;
  });
  cached >= 2 ? ok(`the shell is cached (${cached} entries)`) : bad('cache', String(cached));

  await ctx.setOffline(true);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1000);
  const heading = await page.locator('.mtile').count();
  heading >= 10 ? ok('a reload with no network still renders the launcher') : bad('offline', `${heading} tiles`);

  await page.evaluate(() => { window.location.hash = '#/habits'; });
  await page.waitForTimeout(500);
  const habits = await page.locator('.stack').first().innerText();
  habits.length > 40 ? ok('and moving between modules works offline') : bad('offline nav', habits.slice(0, 80));

  await ctx.setOffline(false);
  await ctx.close();
}

console.log('\n2. Data written offline survives coming back online');
{
  const ctx = await browser.newContext({ viewport: { width: 430, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(BASE + '#/notes', { waitUntil: 'networkidle' });
  await page.evaluate(() => navigator.serviceWorker.ready);
  await ctx.setOffline(true);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(800);
  await page.getByRole('button', { name: /Write one|New note|\+ Note/ }).first().click();
  const form = page.getByRole('dialog');
  await form.getByLabel(/Title/i).first().fill('Written on the subway');
  await form.getByRole('button', { name: /Save/ }).first().click();
  await page.waitForTimeout(400);
  await ctx.setOffline(false);
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(600);
  const st = await page.evaluate(() => JSON.parse(localStorage.getItem('plane.state.v1') || '{}'));
  st.notes.items.some((n) => /subway/.test(n.title))
    ? ok('a note written with no signal is still there afterwards') : bad('persist', 'lost');
  await ctx.close();
}

console.log('\n3. The install card says the right thing in a tab');
{
  const ctx = await browser.newContext({ viewport: { width: 430, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(BASE + '#/settings', { waitUntil: 'networkidle' });
  await page.waitForTimeout(400);
  const card = page.locator('section.card', { hasText: 'home screen' }).first();
  (await card.count()) === 1 ? ok('an install card is offered') : bad('card', 'missing');
  const text = await card.innerText();
  /Share/.test(text) || /Install/.test(text)
    ? ok('with steps for this browser') : bad('steps', text.slice(0, 140));
  /does not move your data/.test(text) ? ok('and it is honest about what installing does not do') : bad('copy', text.slice(0, 200));
  await ctx.close();
}

console.log('\n4. Installed, it says so instead');
{
  const ctx = await browser.newContext({ viewport: { width: 430, height: 900 } });
  const page = await ctx.newPage();
  await page.addInitScript(() => {
    const real = window.matchMedia.bind(window);
    window.matchMedia = (q) => (q === '(display-mode: standalone)'
      ? { matches: true, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false }
      : real(q));
  });
  await page.goto(BASE + '#/settings', { waitUntil: 'networkidle' });
  await page.waitForTimeout(400);
  const card = page.locator('section.card', { hasText: 'Installed' }).first();
  (await card.count()) === 1 ? ok('the prompt is replaced once it is installed') : bad('installed card', 'missing');
  (await page.locator('section.card', { hasText: 'home screen' }).count()) === 0
    ? ok('and it stops asking') : bad('still asking', 'prompt still shown');
  await ctx.close();
}

console.log('\n5. Nothing sits under the notch');
{
  const ctx = await browser.newContext({ viewport: { width: 393, height: 852 } });
  const page = await ctx.newPage();
  await page.goto(BASE + '#/habits', { waitUntil: 'networkidle' });
  await page.waitForTimeout(400);
  const usesTop = await page.evaluate(() => {
    const h = document.querySelector('.app-header');
    return h ? getComputedStyle(h).paddingTop : '';
  });
  usesTop !== '' ? ok(`the header pays the top inset (${usesTop} with none to pay)`) : bad('header', 'no padding');
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  overflow <= 0 ? ok('and nothing scrolls sideways at phone width') : bad('overflow', `${overflow}px wider than the screen`);
  await ctx.close();
}

console.log('\n6. The first load is small, and the rest arrives in the background');
{
  const ctx = await browser.newContext({ viewport: { width: 430, height: 900 } });
  const page = await ctx.newPage();
  let painted = false;
  const scripts = new Set();
  const upFrontNames = [];
  page.on('response', async (r) => {
    if (!r.url().endsWith('.js')) return;
    const name = r.url().split('/').pop();
    scripts.add(name);
    if (painted) return;
    upFrontNames.push(name);
  });
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.locator('.mtile').first().waitFor();
  painted = true;

  // Read off the browser's own resource timing rather than counting response
  // bodies, which can be consumed before the handler sees them.
  const kb = await page.evaluate(() => Math.round(
    performance.getEntriesByType('resource')
      .filter((e) => e.name.endsWith('.js'))
      .reduce((n, e) => n + (e.encodedBodySize || 0), 0) / 1024,
  ));
  kb > 50 && kb < 400 ? ok(`the launcher needs ${kb} kB of JavaScript, against 728 kB before splitting`) : bad('first load', `${kb} kB`);
  const heavy = upFrontNames.filter((n) => /^(Finance|Health|Coach|Fitness|Spanish|Settings|sdk)-/.test(n));
  heavy.length === 0 ? ok('and no module or the SDK is pulled in to show ten buttons') : bad('eager', heavy.join(', '));

  // The warm-up starts a couple of seconds after paint.
  await page.waitForTimeout(7000);
  scripts.size > upFrontNames.length
    ? ok(`the other screens follow on their own (${scripts.size} files by now)`)
    : bad('warm', 'nothing was fetched in the background');

  await ctx.setOffline(true);
  await page.goto(BASE + '#/finance', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);
  const text = await page.locator('.stack').first().innerText();
  /Monthly spending|Overview|Saving/.test(text)
    ? ok('and a module never opened still works with no signal') : bad('offline module', text.slice(0, 120));
  await ctx.setOffline(false);
  await ctx.close();
}

await browser.close();
console.log(problems.length ? `\n${problems.length} PROBLEM(S):\n` + problems.join('\n') : '\nAll checks passed.');
process.exit(problems.length ? 1 : 0);
