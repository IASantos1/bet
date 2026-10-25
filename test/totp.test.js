import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../server/db.js';
import { seed } from '../server/seed.js';
import { createApp } from '../server/app.js';
import { codeAt, verifyCode, base32, fromBase32 } from '../server/totp.js';

test('authenticator codes: the RFC 6238 test vector, one step either side', () => {
  const secret = base32(Buffer.from('12345678901234567890'));
  assert.equal(fromBase32(secret).toString(), '12345678901234567890');
  assert.equal(codeAt(secret, Math.floor(59 / 30)), '287082'); // RFC 6238 (SHA-1, 8 digits 94287082)
  const now = 1_700_000_000_000;
  const step = Math.floor(now / 30_000);
  assert.ok(verifyCode(secret, codeAt(secret, step), now));
  assert.ok(verifyCode(secret, codeAt(secret, step - 1), now));
  assert.ok(!verifyCode(secret, codeAt(secret, step + 3), now));
  assert.ok(!verifyCode(secret, 'abcdef', now));
});

async function start(db) {
  const server = createApp(db, { loginAttempts: 1000, registrations: 1000 }).listen(0);
  await new Promise((r) => server.once('listening', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  let cookie = '';
  const call = async (method, path, body) => {
    const res = await fetch(base + path, { method, headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}) }, body: body ? JSON.stringify(body) : undefined });
    const set = res.headers.get('set-cookie');
    if (set) cookie = set.split(';')[0];
    return { status: res.status, body: res.status === 204 ? null : await res.json() };
  };
  return { server, call };
}

test('an administrator turns on two-step sign-in; then signing in needs the app\'s code', async () => {
  const db = openDb(':memory:');
  seed(db);
  const a = await start(db);
  try {
    const login = { email: 'admin@classicbet.local', password: 'admin12345' };
    assert.equal((await a.call('POST', '/api/auth/login', login)).status, 200);
    const { secret } = (await a.call('POST', '/api/admin/2fa/setup', {})).body;
    assert.equal((await a.call('POST', '/api/admin/2fa/enable', { code: '000000' })).status, 400);
    const code = () => codeAt(secret, Math.floor(Date.now() / 30_000));
    assert.equal((await a.call('POST', '/api/admin/2fa/enable', { code: code() })).status, 200);
    const b = await start(db);
    try {
      const noCode = await b.call('POST', '/api/auth/login', login);
      assert.equal(noCode.status, 401);
      assert.equal(noCode.body.need2fa, true);
      assert.equal((await b.call('POST', '/api/auth/login', { ...login, code: '123456' === code() ? '654321' : '123456' })).status, 401);
      assert.equal((await b.call('POST', '/api/auth/login', { ...login, code: code() })).status, 200);
      assert.ok(!JSON.stringify((await b.call('GET', '/api/me')).body).includes(secret)); // the secret never leaves
    } finally { b.server.close(); }
  } finally { a.server.close(); }
});
