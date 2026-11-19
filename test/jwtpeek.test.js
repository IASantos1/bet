import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decodeJwt, maskTokens } from '../server/jwtpeek.js';

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const jwt = (h, p) => `${b64(h)}.${b64(p)}.signaturepart`;

test('decodeJwt: reads header and claims without verifying, and flags expiry', () => {
  const t = jwt({ alg: 'ES256', typ: 'JWT' }, { sub: 'abc', exp: 1795899328, iat: 1795036431 });
  const d = decodeJwt(t);
  assert.equal(d.header.alg, 'ES256');
  assert.equal(d.payload.sub, 'abc');
  assert.equal(d.parts, 3);
  assert.equal(typeof d.expired, 'boolean');
  assert.ok(d.expiresAt && d.issuedAt, 'exp/iat are surfaced as ISO dates');
});

test('decodeJwt: a far-future token is not expired; a past one is', () => {
  const future = jwt({ alg: 'HS256' }, { exp: Math.floor(Date.now() / 1000) + 3600 });
  const past = jwt({ alg: 'HS256' }, { exp: Math.floor(Date.now() / 1000) - 3600 });
  assert.equal(decodeJwt(future).expired, false);
  assert.equal(decodeJwt(past).expired, true);
});

test('decodeJwt: non-JWT input returns null', () => {
  assert.equal(decodeJwt('not-a-jwt'), null);
  assert.equal(decodeJwt(''), null);
  assert.equal(decodeJwt(null), null);
  assert.equal(decodeJwt('only.two'), null); // neither part is valid JSON
});

test('maskTokens: token-like keys are shortened, other fields kept', () => {
  const out = maskTokens({ ok: true, token: 'abcdefghijklmnopqrstuvwxyz', username: 'joe', nested: { apiKey: 'ABCDEFGHIJKLMNOP', tenant: 'bet62' } });
  assert.equal(out.ok, true);
  assert.equal(out.username, 'joe');
  assert.equal(out.nested.tenant, 'bet62');
  assert.match(out.token, /…\(\d+ chars\)$/);
  assert.match(out.nested.apiKey, /…\(\d+ chars\)$/);
});
