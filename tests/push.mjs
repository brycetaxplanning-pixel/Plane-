import { chromium } from 'playwright';
const BASE = process.env.PLANE_URL ?? 'http://localhost:4173';
const problems = [];
const ok = (l) => console.log('  PASS ' + l);
const bad = (l, d) => { problems.push(`${l}: ${d}`); console.log('  FAIL ' + l + ' — ' + d); };

const browser = await chromium.launch();
async function open(seed = true) {
  const ctx = await browser.newContext({ viewport: { width: 1100, height: 950 } });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => problems.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) problems.push('console: ' + m.text()); });
  await page.goto(BASE + '#/settings', { waitUntil: 'networkidle' });
  if (seed) {
    await page.getByRole('button', { name: 'Load sample data' }).click();
    await page.getByRole('button', { name: 'Load it' }).click();
    await page.waitForTimeout(600);
  }
  return { ctx, page };
}
const read = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('plane.state.v1') || '{}'));

console.log('\n1. The wording lives on the device, the times go to the server');
{
  const { ctx, page } = await open();
  const out = await page.evaluate(async () => {
    const m = await import('/assets/' + [...performance.getEntriesByType('resource')]
      .map((e) => e.name.split('/').pop())
      .find((n) => /^index-.*\.js$/.test(n)));
    return typeof m;
  }).catch(() => null);
  // The module graph is not reachable from the page, so exercise the same rule
  // through the UI's own summary line instead.
  await page.goto(BASE + '#/settings', { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
  const card = page.locator('section.card').filter({ hasText: 'Notifications with the app closed' }).first();
  (await card.count()) === 1 ? ok('the push card is in Settings') : bad('card', 'missing');
  const text = await card.innerText();
  /no titles, no module names and no record ids/.test(text)
    ? ok('and it states plainly what the server is told') : bad('claim', text.slice(0, 200));
  /\d+ things? would be scheduled right now/.test(text)
    ? ok('and how many wakes the current data would produce') : bad('count', text.slice(0, 200));
  void out;
  await ctx.close();
}

console.log('\n2. The notification builder');
{
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.addScriptTag({ url: './notify-core.js' });

  const r = await page.evaluate(() => {
    const N = window.PlaneNotify;
    const now = 1_000_000_000_000;
    const wake = (at, title, extra = {}) => ({ at, tag: 't' + at, title, body: 'b', ...extra });
    return {
      none: N.buildNotification([], now),
      old: N.buildNotification([wake(now - 6 * 3600 * 1000, 'Ancient')], now),
      one: N.buildNotification([wake(now - 60_000, 'Haircut', { to: 'tracker', tab: 'reminders' })], now),
      two: N.buildNotification([wake(now - 60_000, 'Haircut'), wake(now + 10 * 60_000, 'Call Dana')], now),
      many: N.buildNotification([
        wake(now - 60_000, 'Haircut'), wake(now, 'Call Dana'), wake(now + 60_000, 'Oil change'),
      ], now),
      url: N.urlFor({ to: 'tracker', tab: 'reminders' }, 'https://x.test/app/'),
      urlHome: N.urlFor({ to: 'launcher', tab: null }, 'https://x.test/app/'),
      ahead: N.pickWakes([wake(now + 3 * 3600 * 1000, 'Later')], now).length,
    };
  });

  r.none === null ? ok('nothing due means no notification') : bad('empty', JSON.stringify(r.none));
  r.old === null ? ok('a wake six hours stale is dropped, not shown late') : bad('grace', JSON.stringify(r.old));
  r.one?.title === 'Haircut' && r.one.body === 'b'
    ? ok('one due thing is shown as itself') : bad('single', JSON.stringify(r.one));
  r.one?.data?.to === 'tracker' && r.one?.data?.tab === 'reminders'
    ? ok('carrying where it should open') : bad('deeplink', JSON.stringify(r.one?.data));
  r.two?.body === 'and Call Dana'
    ? ok('two due things arrive as one buzz naming both') : bad('two', JSON.stringify(r.two));
  /and 2 other things due/.test(r.many?.body ?? '')
    ? ok('three or more become a count') : bad('many', JSON.stringify(r.many));
  r.many?.data?.to === 'tracker' ? ok('and the digest opens the timeline') : bad('digest link', JSON.stringify(r.many?.data));
  r.url === 'https://x.test/app/#/tracker?tab=reminders' ? ok('the tap target is a deep link') : bad('url', r.url);
  r.urlHome === 'https://x.test/app/#/' ? ok('and the launcher is the bare hash') : bad('url home', r.urlHome);
  r.ahead === 0 ? ok('something three hours out is not pulled forward') : bad('lookahead', String(r.ahead));
  await ctx.close();
}

console.log('\n3. The schedule is built from real data');
{
  const { ctx, page } = await open();
  const plan = await page.evaluate(async () => {
    // Read it the way the UI does: the count is rendered into the card.
    const el = [...document.querySelectorAll('section.card')].find((c) => /app closed/.test(c.textContent));
    return el ? /(\d+) things? would be scheduled/.exec(el.textContent)?.[1] : null;
  });
  Number(plan) > 0 ? ok(`the sample data produces ${plan} wakes`) : bad('plan', String(plan));

  await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('plane.state.v1'));
    s.reminders.items = [];
    s.work.projects = [];
    s.fitness.race = { name: 'x', distanceKm: 5 };
    s.habits.items = [];
    s.habits.logs = [];
    localStorage.setItem('plane.state.v1', JSON.stringify(s));
  });
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(600);
  const empty = await page.evaluate(() => {
    const el = [...document.querySelectorAll('section.card')].find((c) => /app closed/.test(c.textContent));
    return /(\d+) things? would be scheduled/.exec(el.textContent)?.[1];
  });
  empty === '0' ? ok('and nothing at all produces none') : bad('empty plan', String(empty));
  await ctx.close();
}

console.log('\n4. Turning it on talks to the server it is given');
{
  const { ctx, page } = await open();
  let subscribed = null;
  let scheduleBody = null;
  await page.route('https://push.test/**', async (route) => {
    const url = route.request().url();
    if (url.endsWith('/health')) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, vapid: 'BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8' }) });
    }
    if (url.endsWith('/subscribe')) {
      subscribed = route.request().postDataJSON();
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ deviceId: 'dev1', secret: 's3cret' }) });
    }
    if (url.endsWith('/schedule')) {
      scheduleBody = route.request().postDataJSON();
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ stored: scheduleBody.wakes.length }) });
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
  });
  await ctx.grantPermissions(['notifications'], { origin: BASE });
  // Headless Chromium has no push service behind it, so `subscribe` always
  // fails here with "permission denied". Everything after that call is what
  // this app is responsible for, so it is stubbed to return what a real
  // browser returns. The one thing this cannot cover is the browser's own
  // subscribe, which needs a real device.
  await page.addInitScript(() => {
    const fake = {
      endpoint: 'https://fcm.googleapis.com/fcm/send/FAKE-ENDPOINT',
      expirationTime: null,
      keys: {
        p256dh: 'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4',
        auth: 'BTBZMqHH6r4Tts7J_aSIgg',
      },
    };
    const sub = { ...fake, toJSON: () => fake, unsubscribe: async () => true };
    // Patch the prototype: the registration object is handed out later, and
    // patching an instance races with that.
    PushManager.prototype.subscribe = async () => sub;
    PushManager.prototype.getSubscription = async () => null;
  });

  // A reload, not a goto: the URL already ends in #/settings, so a goto would
  // be a same-document navigation and the init script above would not re-run.
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(700);
  const card = page.locator('section.card').filter({ hasText: 'Notifications with the app closed' }).first();
  await card.getByLabel('Server address').fill('https://push.test');
  await card.getByRole('button', { name: 'Turn on notifications' }).click();
  await page.waitForTimeout(2500);
  const shownError = await card.locator('.t-crit').innerText().catch(() => '');
  if (shownError) console.log('    (error shown in the UI: ' + shownError + ')');

  const st = await read(page);
  st.push?.deviceId === 'dev1' ? ok('the device registration is stored') : bad('register', JSON.stringify(st.push));
  subscribed?.subscription?.endpoint ? ok('a real push subscription was sent up') : bad('subscription', JSON.stringify(subscribed));
  subscribed?.subscription?.keys?.auth ? ok('with its keys') : bad('keys', 'missing');

  if (scheduleBody) {
    const keys = [...new Set(scheduleBody.wakes.flatMap((w) => Object.keys(w)))].sort();
    JSON.stringify(keys) === JSON.stringify(['at'])
      ? ok('the schedule carries times and nothing else') : bad('schedule shape', JSON.stringify(keys));
    // Not just names: the tags used to carry module names and record ids, which
    // is the same promise broken a subtler way.
    const body = JSON.stringify(scheduleBody);
    !/Haircut|Halvorsen|protein|Dana/i.test(body)
      ? ok('no names go with it') : bad('leak', 'a name was uploaded');
    !/reminder|work|habits|race|hab_|proj_|rem_/i.test(body)
      ? ok('and no module names or record ids either') : bad('tag leak', body.slice(0, 200));
    // Whatever is left after the two structural keys and the digits should be
    // nothing at all.
    const residue = body.replace(/["{}\[\],:]|wakes|at|\d/g, '').trim();
    residue === '' ? ok('what leaves the device is timestamps and nothing else') : bad('shape', residue.slice(0, 80));
  } else {
    bad('schedule', 'nothing was sent');
  }

  const stored = await page.evaluate(() => new Promise((resolve) => {
    const req = indexedDB.open('plane-wakes', 1);
    req.onsuccess = () => {
      const db = req.result;
      const all = db.transaction('wakes', 'readonly').objectStore('wakes').getAll();
      all.onsuccess = () => resolve(all.result);
    };
    req.onerror = () => resolve([]);
  }));
  stored.length > 0 ? ok(`the wording is kept on the device (${stored.length} rows)`) : bad('mirror', 'nothing stored');
  stored.every((w) => w.title) ? ok('with titles the service worker can show') : bad('titles', JSON.stringify(stored[0]));
  await ctx.close();
}

console.log('\n5. Turning it off again');
{
  const { ctx, page } = await open();
  await page.route('https://push.test/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, vapid: 'BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8', deviceId: 'dev1', secret: 's' }) }));
  await ctx.grantPermissions(['notifications'], { origin: BASE });
  await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('plane.state.v1'));
    s.push = { server: 'https://push.test', deviceId: 'dev1', secret: 's' };
    localStorage.setItem('plane.state.v1', JSON.stringify(s));
  });
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(700);
  const card = page.locator('section.card').filter({ hasText: 'Notifications with the app closed' }).first();
  /Registered with/.test(await card.innerText()) ? ok('it shows as on') : bad('state', 'not shown as registered');
  await card.getByRole('button', { name: 'Turn off' }).click();
  await page.waitForTimeout(800);
  (await read(page)).push === null ? ok('and turning it off clears the registration') : bad('off', 'still registered');
  await ctx.close();
}

console.log('\n6. A browser without push says so instead of failing');
{
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.addInitScript(() => { delete window.PushManager; });
  await page.goto(BASE + '#/settings', { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
  const card = page.locator('section.card').filter({ hasText: 'app closed' }).first();
  /no Push API/.test(await card.innerText()) ? ok('it explains why, and mentions the iPhone rule') : bad('unsupported', (await card.innerText()).slice(0, 160));
  await ctx.close();
}

await browser.close();
console.log(problems.length ? `\n${problems.length} PROBLEM(S):\n` + problems.join('\n') : '\nAll checks passed.');
process.exit(problems.length ? 1 : 0);
