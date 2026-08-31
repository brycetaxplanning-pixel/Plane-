import { chromium } from 'playwright';
const BASE = process.env.PLANE_URL ?? 'http://localhost:4173';
const problems = [];
const ok = (l) => console.log('  PASS ' + l);
const bad = (l, d) => { problems.push(`${l}: ${d}`); console.log('  FAIL ' + l + ' — ' + d); };

const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
async function open(width = 430) {
  const ctx = await browser.newContext({ viewport: { width, height: 950 } });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => problems.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') problems.push('console: ' + m.text()); });
  await page.goto(BASE + '#/settings', { waitUntil: 'networkidle' });
  return { ctx, page };
}

console.log('\n1. The Late Night Set skin is pickable and holds');
{
  const { ctx, page } = await open();
  const pick = page.getByRole('button', { name: /Late Night Set/ }).first();
  await pick.scrollIntoViewIfNeeded();
  await pick.click();
  await page.waitForTimeout(400);
  const skin = await page.evaluate(() => document.documentElement.getAttribute('data-skin'));
  skin === 'latenight' ? ok('the skin is applied') : bad('skin', String(skin));
  const bg = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--surface-1').trim());
  bg === '#12101d' ? ok('and its own surface is in force') : bad('surface', bg);
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(300);
  const after = await page.evaluate(() => document.documentElement.getAttribute('data-skin'));
  after === 'latenight' ? ok('and it survives a reload') : bad('persist', String(after));
  await ctx.close();
}

console.log('\n2. The cat deck shows on the launcher, and only for this skin');
{
  const { ctx, page } = await open();
  await page.goto(BASE + '#/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(400);
  (await page.locator('.catdeck').count()) === 0 ? ok('not there on the default skin') : bad('leak', 'shown on classic');

  await page.goto(BASE + '#/settings', { waitUntil: 'networkidle' });
  const pick = page.getByRole('button', { name: /Late Night Set/ }).first();
  await pick.scrollIntoViewIfNeeded();
  await pick.click();
  await page.goto(BASE + '#/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(400);
  (await page.locator('.catdeck').count()) === 1 ? ok('there on Late Night Set') : bad('missing', 'no deck');
  const label = await page.locator('.catdeck svg').getAttribute('aria-label');
  /cat/i.test(label ?? '') ? ok('and the drawing is described for a screen reader') : bad('a11y', String(label));
  await ctx.close();
}

console.log('\n3. The beat starts from a click and stops again');
{
  const { ctx, page } = await open();
  await page.goto(BASE + '#/settings', { waitUntil: 'networkidle' });
  const pick = page.getByRole('button', { name: /Late Night Set/ }).first();
  await pick.scrollIntoViewIfNeeded();
  await pick.click();
  await page.goto(BASE + '#/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(300);
  const btn = page.getByRole('button', { name: /Drop the beat/ });
  await btn.click();
  await page.waitForTimeout(600);
  const pressed = await page.locator('.catdeck button').getAttribute('aria-pressed');
  pressed === 'true' ? ok('it reports as playing') : bad('aria-pressed', String(pressed));
  (await page.locator('.catdeck.is-playing').count()) === 1
    ? ok('and the animation switches to tempo') : bad('tempo', 'class not applied');
  await page.getByRole('button', { name: /Stop the beat/ }).click();
  await page.waitForTimeout(300);
  const after = await page.locator('.catdeck button').getAttribute('aria-pressed');
  after === 'false' ? ok('and it stops again') : bad('stop', String(after));
  await ctx.close();
}

console.log('\n4. Nothing is fetched to draw or play it');
{
  const ctx = await browser.newContext({ viewport: { width: 430, height: 950 } });
  const page = await ctx.newPage();
  const external = [];
  page.on('request', (r) => {
    const u = r.url();
    if (!u.startsWith(BASE) && !u.startsWith('data:') && !u.startsWith('blob:')) external.push(u);
  });
  await page.goto(BASE + '#/settings', { waitUntil: 'networkidle' });
  const pick = page.getByRole('button', { name: /Late Night Set/ }).first();
  await pick.scrollIntoViewIfNeeded();
  await pick.click();
  await page.goto(BASE + '#/', { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: /Drop the beat/ }).click();
  await page.waitForTimeout(800);
  external.length === 0 ? ok('no request leaves the app') : bad('network', external.join(', '));
  await ctx.close();
}

console.log('\n5. Reduced motion stops the animation');
{
  const ctx = await browser.newContext({ viewport: { width: 430, height: 950 }, reducedMotion: 'reduce' });
  const page = await ctx.newPage();
  await page.goto(BASE + '#/settings', { waitUntil: 'networkidle' });
  const pick = page.getByRole('button', { name: /Late Night Set/ }).first();
  await pick.scrollIntoViewIfNeeded();
  await pick.click();
  await page.goto(BASE + '#/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(400);
  const anim = await page.evaluate(() => getComputedStyle(document.querySelector('.catdeck .cat')).animationName);
  anim === 'none' ? ok('the cat holds still') : bad('reduced motion', anim);
  await ctx.close();
}

console.log('\n6. Every skin still paints its own palette');
{
  const { ctx, page } = await open(1100);
  const names = ['Holo', 'Neon Miami', 'Arcade Brawler', 'Shinobi', 'Deployment', 'Ringworld', 'Late Night Set'];
  const seen = new Set();
  for (const n of names) {
    const b = page.getByRole('button', { name: new RegExp(n) }).first();
    await b.scrollIntoViewIfNeeded();
    await b.click();
    await page.waitForTimeout(220);
    const s1 = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--series-1').trim());
    seen.add(`${n}:${s1}`);
  }
  seen.size === names.length ? ok('all seven skins resolve to a palette') : bad('skins', [...seen].join(' | '));
  await ctx.close();
}

console.log('\n7. No skin has a light ground, whatever the device is set to');
{
  // The app used to follow the device's light/dark setting and open on a white
  // page. There is one ground now — holo black — and this is the guard on it.
  const names = ['Holo', 'Neon Miami', 'Arcade Brawler', 'Shinobi', 'Deployment', 'Ringworld', 'Late Night Set'];
  const lum = ([r, g, b]) => {
    const f = (c) => (c / 255 <= 0.03928 ? c / 255 / 12.92 : ((c / 255 + 0.055) / 1.055) ** 2.4);
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };

  for (const scheme of ['light', 'dark']) {
    const ctx = await browser.newContext({ viewport: { width: 430, height: 1100 }, colorScheme: scheme });
    const page = await ctx.newPage();
    await page.goto(BASE + '#/settings', { waitUntil: 'networkidle' });
    const bright = [];
    for (const n of names) {
      const b = page.getByRole('button', { name: new RegExp(n) }).first();
      await b.scrollIntoViewIfNeeded();
      await b.click();
      await page.waitForTimeout(220);
      const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
      const rgb = bg.match(/[\d.]+/g).slice(0, 3).map(Number);
      if (lum(rgb) > 0.06) bright.push(`${n} ${bg}`);
    }
    bright.length === 0
      ? ok(`every skin stays dark with the device on ${scheme}`)
      : bad(`ground on ${scheme}`, bright.join(' | '));
    await ctx.close();
  }
}

await browser.close();
console.log(problems.length ? `\n${problems.length} PROBLEM(S):\n` + problems.join('\n') : '\nAll checks passed.');
process.exit(problems.length ? 1 : 0);
