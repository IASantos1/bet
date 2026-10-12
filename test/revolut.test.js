import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { openDb, nowIso, tx } from '../server/db.js';
import { createApp } from '../server/app.js';
import { postTransaction } from '../server/wallet.js';
import { hashPassword } from '../server/security.js';
import { createRevolut, payoutState } from '../server/revolut.js';

test('revolut client: signed client assertion, counterparty reused or created, idempotent pay, webhook signature', async () => {
  const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  const pem = privateKey.export({ type: 'pkcs8', format: 'pem' });
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    calls.push({ url, init });
    const json = (body) => ({ ok: true, status: 200, text: async () => JSON.stringify(body) });
    if (url.endsWith('/auth/token')) {
      const p = new URLSearchParams(init.body);
      const [h, b, sig] = p.get('client_assertion').split('.');
      const ok = crypto.verify('RSA-SHA256', Buffer.from(`${h}.${b}`), publicKey, Buffer.from(sig.replace(/-/g, '+').replace(/_/g, '/'), 'base64'));
      assert.ok(ok, 'assertion signed with the private key');
      assert.equal(JSON.parse(Buffer.from(b, 'base64').toString()).sub, 'cid');
      assert.equal(p.get('refresh_token'), 'rt');
      return json({ access_token: 'at', expires_in: 2400 });
    }
    if (url.includes('/counterparties?iban=')) return json(url.includes('PT50000') ? [{ id: 'cp-old', state: 'created' }] : []);
    if (url.endsWith('/counterparty')) return json({ id: 'cp-new' });
    if (url.endsWith('/pay')) return json({ id: 'tx-1', state: 'pending' });
    return { ok: false, status: 404, text: async () => '{}' };
  };
  const rv = createRevolut({ clientId: 'cid', issuer: 'bet62.plus', privateKey: pem, refreshToken: 'rt', accountId: 'acc', webhookSecret: 'whs', fetchImpl });
  assert.ok(rv.configured);
  assert.deepEqual([rv.autoPays(1999), rv.autoPays(2000), rv.autoPays(20000), rv.autoPays(20001)], [false, true, true, false]);
  const p = await rv.payOut({ iban: 'DE89370400440532013000', holderName: 'Rita Sousa Lopes', amountCents: 5000, reference: 'BET62 #1', requestId: 'withdrawal-1' });
  assert.deepEqual(p, { id: 'tx-1', state: 'pending' });
  const created = JSON.parse(calls.find((c) => c.url.endsWith('/counterparty')).init.body);
  assert.deepEqual([created.individual_name, created.bank_country], [{ first_name: 'Rita', last_name: 'Sousa Lopes' }, 'DE']);
  const pay = JSON.parse(calls.find((c) => c.url.endsWith('/pay')).init.body);
  assert.deepEqual([pay.request_id, pay.account_id, pay.amount, pay.receiver.counterparty_id], ['withdrawal-1', 'acc', 50, 'cp-new']);
  await rv.payOut({ iban: 'PT50000201231234567890154', holderName: 'Rui', amountCents: 2000, reference: 'x', requestId: 'withdrawal-2' });
  assert.equal(JSON.parse(calls.filter((c) => c.url.endsWith('/pay'))[1].init.body).receiver.counterparty_id, 'cp-old'); // reused
  assert.equal(calls.filter((c) => c.url.endsWith('/auth/token')).length, 1);                                         // token cached
  // Webhook signature.
  const ts = String(Date.now());
  const body = '{"event":"TransactionStateChanged"}';
  const sig = crypto.createHmac('sha256', 'whs').update(`v1.${ts}.${body}`).digest('hex');
  assert.ok(rv.verifyWebhook(body, `v1=${sig}`, ts));
  assert.ok(!rv.verifyWebhook(body, `v1=${'0'.repeat(64)}`, ts));
  assert.ok(!rv.verifyWebhook(body, `v1=${sig}`, String(Date.now() - 10 * 60_000)));
  assert.deepEqual(['pending', 'completed', 'declined', 'reverted', 'weird'].map(payoutState), ['processing', 'paid', 'failed', 'failed', null]);
});

test('withdrawals through Revolut: auto-paid in range, webhook marks paid, a failed payout goes back to the team', async () => {
  const db = openDb(':memory:');
  const user = (email, role = 'user') => Number(db.prepare(`INSERT INTO users (email, name, birthdate, password_hash, role, kyc_status, novo_can_withdraw, created_at)
    VALUES (?, 'Rita Sousa', '1990-01-01', ?, ?, 'approved', 1, ?)`).run(email, hashPassword('segredo123'), role, nowIso()).lastInsertRowid);
  const uid = user('rita@x.com');
  user('admin@x.com', 'admin');
  tx(db, () => postTransaction(db, uid, 100_000, 'admin_credit', 'saldo'));
  let fail = false;
  const paid = [];
  const revolut = {
    configured: true, environment: 'sandbox', autoMinCents: 2000, autoMaxCents: 20000, webhookSet: true,
    autoPays: (c) => c >= 2000 && c <= 20000,
    payOut: async (a) => { if (fail) throw new Error('saldo insuficiente na conta'); paid.push(a); return { id: `tx-${paid.length}`, state: 'pending' }; },
    verifyWebhook: (_raw, sig) => sig === 'ok',
  };
  const server = createApp(db, { revolut, loginAttempts: 100 }).listen(0);
  try {
    const base = `http://127.0.0.1:${server.address().port}`;
    const login = async (email) => (await fetch(`${base}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: 'segredo123' }) })).headers.get('set-cookie').split(';')[0];
    const [me, adm] = [await login('rita@x.com'), await login('admin@x.com')];
    const post = (cookie, path, body) => fetch(`${base}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', cookie }, body: JSON.stringify(body) }).then(async (r) => ({ status: r.status, j: await r.json() }));
    const iban = 'PT50000201231234567890154';
    // €50: paid at once (approved, sent to Revolut).
    let r = await post(me, '/api/wallet/withdraw', { amount: 50, iban });
    assert.deepEqual([r.status, r.j.status, r.j.payout], [201, 'approved', 'processing']);
    assert.deepEqual([paid[0].amountCents, paid[0].iban, paid[0].holderName, paid[0].requestId], [5000, iban, 'Rita Sousa', 'withdrawal-1']);
    // Revolut says completed → paid.
    const hook = (state, sig = 'ok') => fetch(`${base}/api/withdrawals/webhook/revolut`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'revolut-signature': sig, 'revolut-request-timestamp': String(Date.now()) }, body: JSON.stringify({ event: 'TransactionStateChanged', data: { id: 'tx-1', new_state: state } }) });
    assert.equal((await hook('completed', 'bad')).status, 401);
    assert.equal((await hook('completed')).status, 200);
    assert.equal(db.prepare('SELECT payout_status FROM withdrawals WHERE id = 1').get().payout_status, 'paid');
    // €500: above the range → for the team; approving it pays through Revolut; a failure brings it back.
    r = await post(me, '/api/wallet/withdraw', { amount: 500, iban });
    assert.deepEqual([r.j.status, r.j.payout], ['pending', null]);
    fail = true;
    r = await post(adm, '/api/admin/withdrawals/2/approve', {});
    assert.equal(r.status, 502);
    assert.match(r.j.error, /saldo insuficiente/);
    const w2 = db.prepare('SELECT status, payout_status FROM withdrawals WHERE id = 2').get();
    assert.deepEqual([w2.status, w2.payout_status], ['pending', 'failed']);
    // Paid by hand instead: approved, Revolut not used.
    r = await post(adm, '/api/admin/withdrawals/2/approve', { manual: true });
    assert.equal(r.status, 200);
    assert.equal(paid.length, 1);
    const list = await fetch(`${base}/api/admin/withdrawals`, { headers: { cookie: adm } }).then((x) => x.json());
    assert.deepEqual([list.revolut.configured, list.withdrawals.find((w) => w.id === 1).payout], [true, 'paid']);
  } finally { server.close(); }
});
