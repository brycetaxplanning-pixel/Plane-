/**
 * Checks the encryption against the test vector in RFC 8291 §5. The vector
 * fixes the salt and both key pairs, so the output is byte-for-byte
 * reproducible: if this passes, a real push service will decrypt what we send.
 */
import { encryptPayload, bytesToB64u, b64uToBytes, vapidHeader, generateVapidKeys } from './push.mjs';

const V = {
  plaintext: 'When I grow up, I want to be a watermelon',
  salt: 'DGv6ra1nlYgDCS1FRnbzlw',
  asPublic: 'BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8',
  asPrivate: 'yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw',
  uaPublic: 'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4',
  auth: 'BTBZMqHH6r4Tts7J_aSIgg',
  expected:
    'DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27ml' +
    'mlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPT' +
    'pK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN',
};

let failed = 0;
const check = (label, got, want) => {
  if (got === want) { console.log('  PASS ' + label); return; }
  failed += 1;
  console.log('  FAIL ' + label);
  console.log('    expected ' + want);
  console.log('    got      ' + got);
};

console.log('\nRFC 8291 §5 — aes128gcm payload encryption');
const body = await encryptPayload(V.plaintext, V.uaPublic, V.auth, {
  salt: b64uToBytes(V.salt),
  asPublic: V.asPublic,
  asPrivate: V.asPrivate,
  recordSize: 4096,
});
check('the encrypted body matches the RFC byte for byte', bytesToB64u(body), V.expected);

console.log('\nHeader framing');
check('the salt is the first 16 bytes', bytesToB64u(body.slice(0, 16)), V.salt);
check('the record size is 4096', new DataView(body.buffer, body.byteOffset + 16, 4).getUint32(0), 4096);
check('the sender key length byte is 65', body[20], 65);
check('and the sender key follows it', bytesToB64u(body.slice(21, 86)), V.asPublic);

console.log('\nVAPID');
const keys = await generateVapidKeys();
const header = await vapidHeader('https://fcm.googleapis.com', { ...keys, subject: 'mailto:me@example.com' });
check('the header names the scheme', header.slice(0, 8), 'vapid t=');
const jwt = header.slice(8, header.indexOf(','));
const [h, p, sig] = jwt.split('.');
const json = (s) => JSON.parse(new TextDecoder().decode(b64uToBytes(s)));
check('the JWT header is ES256', json(h).alg, 'ES256');
check('the audience is the push origin', json(p).aud, 'https://fcm.googleapis.com');
check('the subject is carried through', json(p).sub, 'mailto:me@example.com');
check('the signature is 64 raw bytes, not DER', b64uToBytes(sig).length, 64);
check('the key is published alongside', header.includes(`k=${keys.publicKey}`), true);

// The signature has to actually verify, or a push service will reject it.
const pub = b64uToBytes(keys.publicKey);
const verifyKey = await crypto.subtle.importKey(
  'jwk',
  { kty: 'EC', crv: 'P-256', x: bytesToB64u(pub.slice(1, 33)), y: bytesToB64u(pub.slice(33, 65)), ext: true },
  { name: 'ECDSA', namedCurve: 'P-256' },
  false,
  ['verify'],
);
const valid = await crypto.subtle.verify(
  { name: 'ECDSA', hash: 'SHA-256' },
  verifyKey,
  b64uToBytes(sig),
  new TextEncoder().encode(`${h}.${p}`),
);
check('and it verifies against the published key', valid, true);

console.log(failed ? `\n${failed} FAILURE(S)` : '\nAll checks passed.');
process.exit(failed ? 1 : 0);
