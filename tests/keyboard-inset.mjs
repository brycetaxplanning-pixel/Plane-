import { chromium } from 'playwright';
const BASE = process.env.PLANE_URL ?? 'http://localhost:4173';
const problems = [];
const ok = (l) => console.log('  PASS ' + l);
const bad = (l, d) => { problems.push(`${l}: ${d}`); console.log('  FAIL ' + l + ' — ' + d); };

const browser = await chromium.launch();
const KB = 336; // about what an iPhone puts on screen

/**
 * A visual viewport that shrinks without moving the page, which is what iOS
 * does when the keyboard opens and is the whole reason this exists. Playwright
 * has no on-screen keyboard, so the platform behaviour is modelled rather than
 * summoned.
 */
const IOS = () => {
  const t = new EventTarget();
  Object.defineProperties(t, {
    height: { get: () => window.__vvHeight ?? window.innerHeight },
    width: { get: () => window.innerWidth },
    offsetTop: { get: () => window.__vvTop ?? 0 },
    offsetLeft: { get: () => 0 },
    scale: { get: () => 1 },
  });
  Object.defineProperty(window, 'visualViewport', { get: () => t, configurable: true });
  window.__keyboard = (px) => {
    window.__vvHeight = window.innerHeight - px;
    t.dispatchEvent(new Event('resize'));
  };
};

async function open({ ios = true } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 393, height: 852 } });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => problems.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') problems.push('console: ' + m.text()); });
  if (ios) await page.addInitScript(IOS);
  else await page.addInitScript(() => { Object.defineProperty(window, 'visualViewport', { get: () => undefined, configurable: true }); });
  await page.goto(BASE + '#/reminders', { waitUntil: 'networkidle' });
  await page.waitForTimeout(600);
  const pop = page.locator('.pop button').first();
  if (await pop.count()) await pop.click().catch(() => {});
  await page.waitForTimeout(200);
  await page.getByLabel('Add a to-do').click();
  await page.waitForTimeout(400);
  return { ctx, page };
}

const geo = (page) => page.evaluate(() => {
  const m = document.querySelector('.modal')?.getBoundingClientRect();
  const i = document.querySelector('.askline-input')?.getBoundingClientRect();
  return {
    kb: getComputedStyle(document.documentElement).getPropertyValue('--kb').trim(),
    modalBottom: m ? Math.round(m.bottom) : null,
    modalTop: m ? Math.round(m.top) : null,
    inputBottom: i ? Math.round(i.bottom) : null,
    page: window.innerHeight,
  };
});

console.log('\n1. With no keyboard the sheet sits on the bottom of the screen');
{
  const { ctx, page } = await open();
  const g = await geo(page);
  g.kb === '0px' ? ok('nothing is claimed') : bad('kb', g.kb);
  Math.abs(g.modalBottom - g.page) <= 1 ? ok('and the sheet reaches the bottom') : bad('sheet', JSON.stringify(g));
  await ctx.close();
}

console.log('\n2. The keyboard opening lifts the sheet clear of it');
{
  const { ctx, page } = await open();
  await page.evaluate((px) => window.__keyboard(px), KB);
  await page.waitForTimeout(400);
  const g = await geo(page);

  g.kb === `${KB}px` ? ok('the covered strip is measured') : bad('kb', g.kb);
  // This is the bug: the sheet used to stay at the bottom of the layout
  // viewport, which iOS does not shrink, so it sat underneath the keyboard.
  Math.abs(g.modalBottom - (g.page - KB)) <= 1
    ? ok('the sheet now ends where the keyboard starts') : bad('sheet', JSON.stringify(g));
  g.inputBottom <= g.page - KB
    ? ok('and the field you are typing into is on screen') : bad('field', JSON.stringify(g));
  g.modalTop >= 0 ? ok('without being pushed off the top') : bad('top', JSON.stringify(g));

  // Both buttons have to stay reachable, or Save is behind the keyboard.
  const save = await page.getByRole('button', { name: 'Save' }).boundingBox();
  Math.round(save.y + save.height) <= g.page - KB
    ? ok('and so is Save') : bad('save', JSON.stringify(save));
  await ctx.close();
}

console.log('\n3. Putting it away puts the sheet back');
{
  const { ctx, page } = await open();
  await page.evaluate((px) => window.__keyboard(px), KB);
  await page.waitForTimeout(300);
  await page.evaluate(() => window.__keyboard(0));
  await page.waitForTimeout(400);
  const g = await geo(page);
  g.kb === '0px' && Math.abs(g.modalBottom - g.page) <= 1
    ? ok('back to the bottom of the screen') : bad('restore', JSON.stringify(g));
  await ctx.close();
}

console.log('\n4. A URL bar is not a keyboard');
{
  const { ctx, page } = await open();
  // Safari's toolbars come and go by a few tens of pixels; treating that as a
  // keyboard would make the sheet twitch while you scroll.
  await page.evaluate(() => window.__keyboard(18));
  await page.waitForTimeout(300);
  const g = await geo(page);
  g.kb === '0px' ? ok('a small change is ignored') : bad('twitch', g.kb);
  await ctx.close();
}

console.log('\n5. A browser with no visual viewport is left alone');
{
  const { ctx, page } = await open({ ios: false });
  const g = await geo(page);
  g.kb === '0px' ? ok('nothing is claimed') : bad('kb', g.kb);
  Math.abs(g.modalBottom - g.page) <= 1 ? ok('and the sheet is where it always was') : bad('sheet', JSON.stringify(g));
  await ctx.close();
}

await browser.close();
console.log(problems.length ? `\n${problems.length} PROBLEM(S):\n` + problems.join('\n') : '\nAll checks passed.');
process.exit(problems.length ? 1 : 0);
