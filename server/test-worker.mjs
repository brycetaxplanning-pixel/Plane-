/**
 * Exercises the Worker against an in-memory stand-in for D1 and a fake push
 * service. The stand-in understands only the handful of statements the Worker
 * actually issues, which is the point: if the Worker starts issuing a
 * different one, this fails loudly rather than silently passing.
 */
import worker, { fireDue } from './worker.mjs';

let failed = 0;
const check = (label, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) console.log('  PASS ' + label);
  else { failed += 1; console.log(`  FAIL ${label}\n    expected ${JSON.stringify(want)}\n    got      ${JSON.stringify(got)}`); }
};

/* ---------------- the stand-in ---------------- */

function makeDB() {
  const devices = new Map();
  const wakes = [];
  let nextWakeId = 1;

  const run = (sql, args) => {
    const s = sql.replace(/\s+/g, ' ').trim();

    if (s.startsWith('SELECT * FROM devices WHERE id')) return { first: devices.get(args[0]) ?? null };
    if (s.startsWith('INSERT INTO devices')) {
      const [id, secret, endpoint, p256dh, auth, created_at] = args;
      devices.set(id, { id, secret, endpoint, p256dh, auth, created_at });
      return {};
    }
    if (s.startsWith('DELETE FROM devices WHERE id')) { devices.delete(args[0]); return {}; }
    if (s.startsWith('DELETE FROM wakes WHERE device_id')) {
      for (let i = wakes.length - 1; i >= 0; i -= 1) if (wakes[i].device_id === args[0]) wakes.splice(i, 1);
      return {};
    }
    if (s.startsWith('INSERT INTO wakes')) {
      wakes.push({ id: nextWakeId++, device_id: args[0], fire_at: args[1] });
      return {};
    }
    if (s.startsWith('DELETE FROM wakes WHERE id IN')) {
      for (const id of args) {
        const i = wakes.findIndex((w) => w.id === id);
        if (i >= 0) wakes.splice(i, 1);
      }
      return {};
    }
    if (s.startsWith('SELECT w.id AS wake_id')) {
      const now = args[0];
      const results = wakes
        .filter((w) => w.fire_at <= now)
        .sort((a, b) => a.fire_at - b.fire_at)
        .slice(0, 500)
        .map((w) => ({ wake_id: w.id, ...devices.get(w.device_id) }))
        .filter((r) => r.id);
      return { all: { results } };
    }
    throw new Error('the stand-in does not know this statement: ' + s);
  };

  const prepare = (sql) => {
    let args = [];
    const stmt = {
      bind: (...a) => { args = a; return stmt; },
      first: async () => run(sql, args).first ?? null,
      run: async () => run(sql, args),
      all: async () => run(sql, args).all ?? { results: [] },
      _apply: () => run(sql, args),
    };
    return stmt;
  };

  return {
    prepare,
    batch: async (stmts) => stmts.map((s) => s._apply()),
    _devices: devices,
    _wakes: wakes,
  };
}

const VAPID = {
  VAPID_PUBLIC_KEY: 'BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8',
  VAPID_PRIVATE_KEY: 'yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw',
  VAPID_SUBJECT: 'mailto:me@example.com',
  ALLOWED_ORIGINS: 'https://example.github.io',
};

const SUB = {
  endpoint: 'https://fcm.googleapis.com/fcm/send/abc',
  keys: {
    p256dh: 'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4',
    auth: 'BTBZMqHH6r4Tts7J_aSIgg',
  },
};

let pushes = [];
let pushStatus = 201;
globalThis.fetch = async (url, init) => {
  pushes.push({ url: String(url), headers: init.headers, body: init.body });
  return new Response(globalThis.__body ?? '', { status: pushStatus });
};

const post = (path, body, auth) =>
  worker.fetch(
    new Request('https://api.example.com' + path, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'https://example.github.io', ...(auth ? { authorization: `Bearer ${auth}` } : {}) },
      body: JSON.stringify(body),
    }),
    { DB: db, ...VAPID },
  );

let db = makeDB();

console.log('\n1. Subscribing');
{
  const res = await post('/subscribe', { subscription: SUB });
  const out = await res.json();
  check('a device id and secret come back', [typeof out.deviceId, typeof out.secret], ['string', 'string']);
  check('and the subscription is stored', db._devices.size, 1);
  check('CORS names the configured origin', res.headers.get('access-control-allow-origin'), 'https://example.github.io');

  const bad = await post('/subscribe', { subscription: { endpoint: 'x' } });
  check('an incomplete subscription is refused', bad.status, 400);

  globalThis.__auth = `${out.deviceId}:${out.secret}`;
  globalThis.__id = out.deviceId;
}

console.log('\n2. Only the device that owns a schedule can set it');
{
  const now = Date.now();
  const wrong = await post('/schedule', { wakes: [{ at: now + 60_000 }] }, `${globalThis.__id}:wrongsecret`);
  check('a wrong secret is rejected', wrong.status, 401);
  const none = await post('/schedule', { wakes: [] }, 'nobody:nothing');
  check('and an unknown device is rejected', none.status, 401);
}

console.log('\n3. Setting a schedule');
{
  const now = Date.now();
  const res = await post('/schedule', {
    wakes: [
      { at: now + 60_000, tag: 'reminder' },
      { at: now - 60_000, tag: 'in the past' },
      { at: now + 500 * 86_400_000, tag: 'a year and a half out' },
      { at: 'nonsense', tag: 'junk' },
    ],
  }, globalThis.__auth);
  const out = await res.json();
  check('only the sane future times are kept', out.stored, 1);
  check('and the row is a device and a time, nothing else', Object.keys(db._wakes[0]).sort(), ['device_id', 'fire_at', 'id']);

  await post('/schedule', { wakes: [{ at: now + 120_000 }] }, globalThis.__auth);
  check('a second schedule replaces the first rather than adding to it', db._wakes.length, 1);
}

console.log('\n4. Firing what is due');
{
  pushes = [];
  const now = Date.now();
  // Scheduled just ahead, then time is moved past them: the API refuses to
  // store a wake that is already in the past, which is itself the point.
  await post('/schedule', { wakes: [{ at: now + 1000 }, { at: now + 2000 }, { at: now + 86_400_000 }] }, globalThis.__auth);
  const out = await fireDue({ DB: db, ...VAPID }, now + 5000);
  check('both due wakes are seen', out.due, 2);
  check('but the device is only woken once', out.sent, 1);
  check('the future one is left alone', db._wakes.length, 1);

  const sent = pushes[0];
  check('the push goes to the subscription endpoint', sent.url, SUB.endpoint);
  check('with no body at all', sent.body, undefined);
  check('and no content-encoding, because there is nothing to encode', sent.headers['Content-Encoding'], undefined);
  check('the VAPID header is present', String(sent.headers.Authorization).startsWith('vapid t='), true);
  check('and it is addressed to the push origin', JSON.parse(atob(String(sent.headers.Authorization).split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).aud, 'https://fcm.googleapis.com');
}

console.log('\n5. A subscription the browser has thrown away is cleaned up');
{
  pushStatus = 410;
  const now = Date.now();
  await post('/schedule', { wakes: [{ at: now + 1000 }] }, globalThis.__auth);
  await fireDue({ DB: db, ...VAPID }, now + 5000);
  check('the device is dropped', db._devices.size, 0);
  check('and its wakes go with it', db._wakes.length, 0);
  pushStatus = 201;
}

console.log('\n6. Unsubscribing');
{
  db = makeDB();
  const out = await (await post('/subscribe', { subscription: SUB })).json();
  const auth = `${out.deviceId}:${out.secret}`;
  await post('/schedule', { wakes: [{ at: Date.now() + 60_000 }] }, auth);
  await post('/unsubscribe', {}, auth);
  check('the device is gone', db._devices.size, 0);
  check('and so is its schedule', db._wakes.length, 0);
}

console.log('\n7. The endpoint has to be a real push service');
{
  db = makeDB();
  const refused = [
    'https://attacker.example.com/collect',
    'http://fcm.googleapis.com/fcm/send/abc',   // not https
    'https://169.254.169.254/latest/meta-data', // link-local, the classic probe
    'https://127.0.0.1:8080/admin',
    'https://[::1]/admin',
    'https://fcm.googleapis.com.evil.example/x',
    'file:///etc/passwd',
    'not a url at all',
  ];
  let allRefused = true;
  for (const endpoint of refused) {
    const res = await post('/subscribe', { subscription: { endpoint, keys: { p256dh: 'x', auth: 'y' } } });
    if (res.status !== 400) { allRefused = false; console.log('    accepted: ' + endpoint); }
  }
  check('an endpoint that is not a push service is refused', allRefused, true);
  check('and nothing is stored for it', db._devices.size, 0);

  const allowed = [
    'https://fcm.googleapis.com/fcm/send/abc',
    'https://updates.push.services.mozilla.com/wpush/v2/abc',
    'https://web.push.apple.com/abc',
    'https://sin.notify.windows.com/w/?token=abc',
  ];
  let allAccepted = true;
  for (const endpoint of allowed) {
    const res = await post('/subscribe', { subscription: { endpoint, keys: { p256dh: 'x', auth: 'y' } } });
    if (res.status !== 200) { allAccepted = false; console.log('    refused: ' + endpoint); }
  }
  check('every real push service is accepted', allAccepted, true);
}

console.log('\n8. The test route does not reflect what the push service said');
{
  db = makeDB();
  const out = await (await post('/subscribe', { subscription: SUB })).json();
  const auth = `${out.deviceId}:${out.secret}`;
  pushStatus = 403;
  globalThis.__body = 'SECRET-BODY-FROM-UPSTREAM';
  const res = await post('/test', {}, auth);
  const seen = JSON.stringify(await res.json());
  check('the body is not passed back to the caller', seen.includes('SECRET-BODY'), false);
  check('only a status is', Object.keys(JSON.parse(seen)).sort(), ['ok', 'status']);
  pushStatus = 201;
}

console.log(failed ? `\n${failed} FAILURE(S)` : '\nAll checks passed.');
process.exit(failed ? 1 : 0);
