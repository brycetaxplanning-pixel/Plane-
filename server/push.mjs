/**
 * Web Push, from scratch: VAPID (RFC 8292) and aes128gcm payload encryption
 * (RFC 8291), on nothing but WebCrypto. Runs unchanged on Cloudflare Workers,
 * Deno, and Node 22+.
 *
 * The encryption here is checked against the test vector in RFC 8291 §5 by
 * `server/test-push.mjs`. If that test passes, the bytes are right.
 */

const enc = new TextEncoder();

/* ---------------- base64url ---------------- */

export function b64uToBytes(s) {
  const pad = s.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(pad + '='.repeat((4 - (pad.length % 4)) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

export function bytesToB64u(bytes) {
  let bin = '';
  for (const b of new Uint8Array(bytes)) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

const concat = (...parts) => {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let at = 0;
  for (const p of parts) { out.set(p, at); at += p.length; }
  return out;
};

/* ---------------- HKDF ---------------- */

async function hmac(key, data) {
  const k = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', k, data));
}

/** HKDF with a single output block, which is all Web Push ever needs. */
async function hkdf(salt, ikm, info, length) {
  const prk = await hmac(salt, ikm);
  const okm = await hmac(prk, concat(info, Uint8Array.of(1)));
  return okm.slice(0, length);
}

/* ---------------- EC keys ---------------- */

const P256 = { name: 'ECDH', namedCurve: 'P-256' };

/** An uncompressed P-256 point (0x04 ‖ X ‖ Y) as a public key. */
const importPublic = (raw) => crypto.subtle.importKey('raw', raw, P256, true, []);

/**
 * A raw private scalar plus its public point, as a JWK. WebCrypto will not
 * take a bare scalar, and the RFC's vectors give exactly these two things.
 */
function importPrivate(rawPrivate, rawPublic, usages = ['deriveBits']) {
  return crypto.subtle.importKey(
    'jwk',
    {
      kty: 'EC',
      crv: 'P-256',
      d: bytesToB64u(rawPrivate),
      x: bytesToB64u(rawPublic.slice(1, 33)),
      y: bytesToB64u(rawPublic.slice(33, 65)),
      ext: true,
    },
    P256,
    false,
    usages,
  );
}

/* ---------------- RFC 8291 ---------------- */

/**
 * Encrypts one push message for a subscription.
 *
 * `salt` and the sender key pair are generated fresh per message; they are
 * only parameters so the RFC's vector can be reproduced exactly.
 */
export async function encryptPayload(payload, uaPublicB64, authB64, opts = {}) {
  const uaPublic = b64uToBytes(uaPublicB64);
  const auth = b64uToBytes(authB64);
  const salt = opts.salt ?? crypto.getRandomValues(new Uint8Array(16));

  let asPublic;
  let asPrivateKey;
  if (opts.asPrivate && opts.asPublic) {
    asPublic = b64uToBytes(opts.asPublic);
    asPrivateKey = await importPrivate(b64uToBytes(opts.asPrivate), asPublic);
  } else {
    const pair = await crypto.subtle.generateKey(P256, true, ['deriveBits']);
    asPublic = new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey));
    asPrivateKey = pair.privateKey;
  }

  const shared = new Uint8Array(
    await crypto.subtle.deriveBits({ name: 'ECDH', public: await importPublic(uaPublic) }, asPrivateKey, 256),
  );

  // "WebPush: info" ‖ 0x00 ‖ ua_public ‖ as_public
  const authInfo = concat(enc.encode('WebPush: info'), Uint8Array.of(0), uaPublic, asPublic);
  const ikm = await hkdf(auth, shared, authInfo, 32);

  const cek = await hkdf(salt, ikm, concat(enc.encode('Content-Encoding: aes128gcm'), Uint8Array.of(0)), 16);
  const nonce = await hkdf(salt, ikm, concat(enc.encode('Content-Encoding: nonce'), Uint8Array.of(0)), 12);

  const key = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  // A single record, so the padding delimiter is 0x02.
  const record = concat(typeof payload === 'string' ? enc.encode(payload) : payload, Uint8Array.of(2));
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, key, record));

  const rs = opts.recordSize ?? 4096;
  const header = concat(
    salt,
    Uint8Array.of((rs >>> 24) & 255, (rs >>> 16) & 255, (rs >>> 8) & 255, rs & 255),
    Uint8Array.of(asPublic.length),
    asPublic,
  );

  return concat(header, ciphertext);
}

/* ---------------- RFC 8292 (VAPID) ---------------- */

/** DER-encoded ECDSA signatures are not what JWS wants; WebCrypto already
 *  gives the raw r‖s form, so nothing to unpack. */
export async function vapidHeader(audience, vapid, ttlSeconds = 12 * 3600) {
  const header = { typ: 'JWT', alg: 'ES256' };
  const claims = {
    aud: audience,
    exp: Math.floor(Date.now() / 1000) + ttlSeconds,
    sub: vapid.subject,
  };

  const signingInput = `${bytesToB64u(enc.encode(JSON.stringify(header)))}.${bytesToB64u(enc.encode(JSON.stringify(claims)))}`;

  const publicKey = b64uToBytes(vapid.publicKey);
  const key = await crypto.subtle.importKey(
    'jwk',
    {
      kty: 'EC',
      crv: 'P-256',
      d: vapid.privateKey,
      x: bytesToB64u(publicKey.slice(1, 33)),
      y: bytesToB64u(publicKey.slice(33, 65)),
      ext: true,
    },
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign'],
  );

  const sig = new Uint8Array(
    await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, enc.encode(signingInput)),
  );

  return `vapid t=${signingInput}.${bytesToB64u(sig)}, k=${vapid.publicKey}`;
}

/**
 * Sends one push. With no payload the body is empty — the push service and
 * anyone watching the wire learn only that this device was woken, never what
 * about. That is the mode this app uses by default.
 */
export async function sendPush(subscription, payload, vapid, opts = {}) {
  const url = new URL(subscription.endpoint);
  const headers = {
    TTL: String(opts.ttl ?? 3600),
    Urgency: opts.urgency ?? 'normal',
    Authorization: await vapidHeader(url.origin, vapid),
  };

  let body;
  if (payload !== null && payload !== undefined && payload !== '') {
    body = await encryptPayload(payload, subscription.keys.p256dh, subscription.keys.auth);
    headers['Content-Encoding'] = 'aes128gcm';
    headers['Content-Type'] = 'application/octet-stream';
    headers['Content-Length'] = String(body.length);
  } else {
    headers['Content-Length'] = '0';
  }

  const res = await fetch(subscription.endpoint, { method: 'POST', headers, body });
  return { status: res.status, ok: res.ok, text: res.ok ? '' : await res.text().catch(() => '') };
}

/** Generates a VAPID key pair, printed once and pasted into the Worker's
 *  secrets. */
export async function generateVapidKeys() {
  const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const jwk = await crypto.subtle.exportKey('jwk', pair.privateKey);
  const raw = new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey));
  return { publicKey: bytesToB64u(raw), privateKey: jwk.d };
}
