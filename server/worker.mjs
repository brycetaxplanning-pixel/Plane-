/**
 * The whole backend: hold a push subscription per device, hold the times that
 * device wants waking, and wake it.
 *
 * What it deliberately does not hold: what the notification says. Pushes are
 * sent with an empty body — the service worker on the device works out the
 * wording from data that never left the phone. So this server, its logs, its
 * database and the push service in the middle all know exactly one thing about
 * you: that something was due at some time. Nothing about what.
 */

import { sendPush } from './push.mjs';

const json = (data, status = 200, origin = '*') =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json',
      'access-control-allow-origin': origin,
      'access-control-allow-headers': 'content-type, authorization',
      'access-control-allow-methods': 'POST, OPTIONS',
    },
  });

const allowedOrigin = (request, env) => {
  const origin = request.headers.get('origin') ?? '';
  const allowed = (env.ALLOWED_ORIGINS ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  if (allowed.length === 0) return '*';
  return allowed.includes(origin) ? origin : allowed[0];
};

const randomId = () => {
  const b = crypto.getRandomValues(new Uint8Array(16));
  return [...b].map((n) => n.toString(16).padStart(2, '0')).join('');
};

/** Constant-time-ish compare, so a wrong secret cannot be found a byte at a
 *  time by timing the response. */
function sameSecret(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function authorise(request, env) {
  const auth = request.headers.get('authorization') ?? '';
  const [id, secret] = auth.replace(/^Bearer\s+/i, '').split(':');
  if (!id || !secret) return null;
  const row = await env.DB.prepare('SELECT * FROM devices WHERE id = ?').bind(id).first();
  return row && sameSecret(row.secret, secret) ? row : null;
}

export default {
  async fetch(request, env) {
    const origin = allowedOrigin(request, env);
    if (request.method === 'OPTIONS') return json({}, 204, origin);

    const url = new URL(request.url);

    if (url.pathname === '/health') {
      return json({ ok: true, vapid: env.VAPID_PUBLIC_KEY ?? null }, 200, origin);
    }

    if (request.method !== 'POST') return json({ error: 'not found' }, 404, origin);

    let body;
    try {
      body = await request.json();
    } catch {
      return json({ error: 'expected JSON' }, 400, origin);
    }

    /* Register a browser's push subscription and get an id back. */
    if (url.pathname === '/subscribe') {
      const sub = body.subscription;
      if (!sub?.endpoint || !sub?.keys?.p256dh || !sub?.keys?.auth) {
        return json({ error: 'a full push subscription is required' }, 400, origin);
      }
      const id = randomId();
      const secret = randomId();
      await env.DB.prepare(
        'INSERT INTO devices (id, secret, endpoint, p256dh, auth, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      ).bind(id, secret, sub.endpoint, sub.keys.p256dh, sub.keys.auth, Date.now()).run();
      return json({ deviceId: id, secret }, 200, origin);
    }

    const device = await authorise(request, env);
    if (!device) return json({ error: 'unknown device' }, 401, origin);

    /* Replace this device's wake times. The client sends the whole list every
       time, so there is never a stale row to reconcile. */
    if (url.pathname === '/schedule') {
      const wakes = Array.isArray(body.wakes) ? body.wakes : [];
      const now = Date.now();
      const clean = wakes
        .map((w) => ({ at: Number(w.at), tag: String(w.tag ?? '').slice(0, 64) }))
        .filter((w) => Number.isFinite(w.at) && w.at > now && w.at < now + 400 * 86_400_000)
        .slice(0, 200);

      const stmts = [env.DB.prepare('DELETE FROM wakes WHERE device_id = ?').bind(device.id)];
      for (const w of clean) {
        stmts.push(
          env.DB.prepare('INSERT INTO wakes (device_id, fire_at, tag) VALUES (?, ?, ?)')
            .bind(device.id, Math.round(w.at), w.tag),
        );
      }
      await env.DB.batch(stmts);
      return json({ stored: clean.length }, 200, origin);
    }

    if (url.pathname === '/unsubscribe') {
      await env.DB.batch([
        env.DB.prepare('DELETE FROM wakes WHERE device_id = ?').bind(device.id),
        env.DB.prepare('DELETE FROM devices WHERE id = ?').bind(device.id),
      ]);
      return json({ ok: true }, 200, origin);
    }

    /* Sends one push to this device now — the button in Settings. */
    if (url.pathname === '/test') {
      const result = await push(device, env);
      return json(result, result.ok ? 200 : 502, origin);
    }

    return json({ error: 'not found' }, 404, origin);
  },

  /** Cron. Every run takes the wakes that have come due and fires them. */
  async scheduled(_event, env, ctx) {
    ctx.waitUntil(fireDue(env));
  },
};

async function push(device, env) {
  const vapid = {
    publicKey: env.VAPID_PUBLIC_KEY,
    privateKey: env.VAPID_PRIVATE_KEY,
    subject: env.VAPID_SUBJECT || 'mailto:nobody@example.com',
  };
  const subscription = {
    endpoint: device.endpoint,
    keys: { p256dh: device.p256dh, auth: device.auth },
  };
  // No payload: the wording is the device's business, not this server's.
  const res = await sendPush(subscription, null, vapid, { ttl: 3600, urgency: 'high' });

  // 404 and 410 mean the browser threw the subscription away. Anything else
  // might be transient, so the device is left alone.
  if (res.status === 404 || res.status === 410) {
    await env.DB.batch([
      env.DB.prepare('DELETE FROM wakes WHERE device_id = ?').bind(device.id),
      env.DB.prepare('DELETE FROM devices WHERE id = ?').bind(device.id),
    ]);
    return { ...res, dropped: true };
  }
  return res;
}

export async function fireDue(env, now = Date.now()) {
  const due = await env.DB.prepare(
    `SELECT w.id AS wake_id, d.* FROM wakes w
       JOIN devices d ON d.id = w.device_id
      WHERE w.fire_at <= ?
      ORDER BY w.fire_at
      LIMIT 500`,
  ).bind(now).all();

  const rows = due.results ?? [];
  // One push per device per run, however many of its wakes came due — the
  // device shows one notification listing everything either way.
  const seen = new Set();
  let sent = 0;

  for (const row of rows) {
    if (seen.has(row.id)) continue;
    seen.add(row.id);
    const res = await push(row, env);
    if (res.ok) sent += 1;
  }

  if (rows.length > 0) {
    await env.DB.prepare(
      `DELETE FROM wakes WHERE id IN (${rows.map(() => '?').join(',')})`,
    ).bind(...rows.map((r) => r.wake_id)).run();
  }

  return { due: rows.length, devices: seen.size, sent };
}
