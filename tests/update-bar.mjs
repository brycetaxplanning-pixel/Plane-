import { chromium } from 'playwright';
const BASE = process.env.PLANE_URL ?? 'http://localhost:4173';
const problems = [];
const ok = (l) => console.log('  PASS ' + l);
const bad = (l, d) => { problems.push(`${l}: ${d}`); console.log('  FAIL ' + l + ' — ' + d); };

const browser = await chromium.launch();

/** The build the server claims to have. Swappable mid-test, which is the
 *  whole point: a deploy is exactly this figure changing under a running app. */
function server(page, build) {
  return page.route('**/version.json', (r) => r.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify({ build }),
  }));
}

/* The stub-driven tests block the worker, because a request it serves is a
   request Playwright cannot intercept — which is itself worth knowing, and is
   what section 5 checks with the worker left running. */
async function open(serviceWorkers = 'block') {
  const ctx = await browser.newContext({ viewport: { width: 430, height: 950 }, serviceWorkers });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => problems.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') problems.push('console: ' + m.text()); });
  return { ctx, page };
}

/** What the running bundle was built from, read the way the app reads it. */
const runningBuild = async (page) => page.evaluate(async () => {
  const res = await fetch('./version.json', { cache: 'no-store' });
  return (await res.json()).build;
});

console.log('\n1. A build that matches says nothing');
{
  const { ctx, page } = await open();
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  (await page.locator('.updatebar').count()) === 0
    ? ok('no bar when the server is serving what is running') : bad('bar', 'appeared with nothing to announce');
  await ctx.close();
}

console.log('\n2. A deploy under a running app is announced, not applied');
{
  const { ctx, page } = await open();
  await server(page, 'a-later-build');
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);

  const bar = page.locator('.updatebar');
  (await bar.count()) === 1 ? ok('the bar appears') : bad('bar', 'never appeared');
  /new version is ready/i.test(await bar.innerText()) ? ok('and says so in words') : bad('copy', await bar.innerText());

  // Never on its own: this app is mostly things being typed in, and a reload
  // underneath somebody mid-sentence loses them.
  const url = page.url();
  await page.waitForTimeout(1500);
  page.url() === url && (await bar.count()) === 1
    ? ok('and waits rather than reloading underneath you') : bad('auto', 'it reloaded on its own');

  await bar.getByRole('button', { name: 'Not now' }).click();
  await page.waitForTimeout(600);
  // It stayed up: dismissing re-ran the check, which found the same update.
  (await bar.count()) === 0 ? ok('it can be sent away') : bad('dismiss', 'still showing');
  await page.waitForTimeout(1200);
  (await bar.count()) === 0 ? ok('and stays away') : bad('dismiss', 'it came back on its own');

  // But coming back to the app is a fresh chance to be told.
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await page.waitForTimeout(800);
  (await bar.count()) === 1 ? ok('until the next time you come back to the app') : bad('return', 'never offered again');
  await ctx.close();
}

console.log('\n3. It asks again when the app comes back to the front');
{
  const { ctx, page } = await open();
  // Starts level with the server, so nothing is announced on load.
  const current = await (async () => { await page.goto(BASE, { waitUntil: 'networkidle' }); return runningBuild(page); })();
  await server(page, current);
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  (await page.locator('.updatebar').count()) === 0 ? ok('quiet on load') : bad('setup', 'bar showed with nothing to say');

  // A deploy happens while the app sits backgrounded on a phone.
  await page.unroute('**/version.json');
  await server(page, 'shipped-while-you-were-away');
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await page.waitForTimeout(1200);
  (await page.locator('.updatebar').count()) === 1
    ? ok('coming back to the app finds the new one') : bad('resume', 'nothing was noticed on resume');
  await ctx.close();
}

console.log('\n4. Reloading takes it, and clears what was cached');
{
  const { ctx, page } = await open();
  await server(page, 'a-later-build');
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  await page.evaluate(() => caches.open('plane-v2').then((c) => c.put('./index.html', new Response('<html>stale</html>', { headers: { 'content-type': 'text/html' } }))));
  (await page.evaluate(() => caches.keys())).includes('plane-v2')
    ? ok('a stale shell is sitting in the cache') : bad('setup', 'nothing cached to clear');

  // The server is level again, the way it is after a real reload.
  await page.unroute('**/version.json');
  await page.locator('.updatebar').getByRole('button', { name: 'Reload' }).click();
  await page.waitForTimeout(2000);

  (await page.evaluate(() => caches.keys().then((k) => k.filter((x) => x.startsWith('plane-'))))).length === 0
    ? ok('the cached shell is dropped on the way out') : bad('cache', 'the old shell survived the reload');
  (await page.locator('.updatebar').count()) === 0
    ? ok('and the app comes back with nothing left to announce') : bad('after', 'still announcing an update');
  (await page.locator('.launch-grid').count()) > 0
    ? ok('on a working app, not a blank page') : bad('render', 'the app did not come back');
  await ctx.close();
}

console.log('\n5. The worker never caches the file that says what the server has');
{
  // No stub here: the point is what the real worker does with a real request.
  const { ctx, page } = await open('allow');
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  // Let it register and take control, then ask again through it.
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  const controlled = await page.evaluate(() => Boolean(navigator.serviceWorker.controller));
  controlled ? ok('the worker is in the way of the request') : bad('setup', 'no worker took control');

  await page.evaluate(() => fetch('./version.json', { cache: 'no-store' }).then((r) => r.json()));
  await page.waitForTimeout(400);
  // Cached once, it would answer with the running build forever and no deploy
  // would ever be noticed.
  const cached = await page.evaluate(async () => {
    for (const key of await caches.keys()) {
      const c = await caches.open(key);
      for (const req of await c.keys()) if (req.url.includes('version.json')) return req.url;
    }
    return null;
  });
  cached === null ? ok('and it is not put in the cache') : bad('cached', cached);
  await ctx.close();
}

await browser.close();
console.log(problems.length ? `\n${problems.length} PROBLEM(S):\n` + problems.join('\n') : '\nAll checks passed.');
process.exit(problems.length ? 1 : 0);
