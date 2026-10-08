import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { openDb } from '../server/db.js';
import { seed } from '../server/seed.js';
import { createApp } from '../server/app.js';
import { config } from '../server/config.js';
import { createStripe, verifyWebhook, formEncode } from '../server/stripe.js';

const WHSEC = 'whsec_test123';
const sign = (body, t = Math.floor(Date.now() / 1000), secret = WHSEC) =>
  `t=${t},v1=${createHmac('sha256', secret).update(`${t}.${body}`).digest('hex')}`;

test('formEncode and webhook signature', () => {
  assert.equal(formEncode({ a: 1, line_items: [{ price_data: { unit_amount: 500 } }] }).toString(), 'a=1&line_items%5B0%5D%5Bprice_data%5D%5Bunit_amount%5D=500');
  const body = JSON.stringify({ id: 'evt_1', type: 'x' });
  assert.equal(verifyWebhook(body, sign(body), WHSEC).id, 'evt_1');
  assert.throws(() => verifyWebhook(body, sign(body, undefined, 'whsec_other'), WHSEC), /inválida/);
  assert.throws(() => verifyWebhook(body, sign(body, Math.floor(Date.now() / 1000) - 3600), WHSEC), /prazo/);
  assert.throws(() => verifyWebhook(`${body} `, sign(body), WHSEC), /inválida/);
});

test('Stripe deposit: Checkout page, webhook credits once, return check, wrong amount refused', async () => {
  const db = openDb(':memory:');
  seed(db);
  const stripeCalls = [];
  const sessions = new Map();
  let seq = 0;
  const fetchImpl = async (url, opts) => {
    stripeCalls.push({ url, opts });
    assert.equal(opts.headers.Authorization, 'Bearer sk_test_abc');
    if (opts.method === 'POST') {
      const p = new URLSearchParams(opts.body);
      const id = `cs_test_${++seq}`;
      const s = { id, object: 'checkout.session', url: `https://checkout.stripe.com/c/pay/${id}`, amount_total: Number(p.get('line_items[0][price_data][unit_amount]')), currency: p.get('line_items[0][price_data][currency]'), payment_status: 'unpaid', status: 'open', success: p.get('success_url') };
      sessions.set(id, s);
      return Response.json(s);
    }
    const id = decodeURIComponent(url.split('/').pop());
    return Response.json(sessions.get(id));
  };
  const stripe = createStripe(db, { secretKey: 'sk_test_abc', webhookSecret: WHSEC, fetchImpl });
  const prevMode = config.paymentsMode;
  config.paymentsMode = 'stripe';
  const server = createApp(db, { loginAttempts: 1000, registrations: 1000, stripe }).listen(0);
  await new Promise((r) => server.once('listening', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    let cookie = '';
    const call = async (method, path, body) => {
      const res = await fetch(base + path, { method, headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}) }, body: body ? JSON.stringify(body) : undefined });
      const set = res.headers.get('set-cookie');
      if (set) cookie = set.split(';')[0];
      return { status: res.status, body: await res.json() };
    };
    const reg = await call('POST', '/api/auth/register', { name: 'Ana Silva', email: 'ana@example.com', password: 'segredo123', birthdate: '1990-05-10', acceptTerms: true });
    assert.equal(reg.status, 201);

    const dep = await call('POST', '/api/wallet/deposit', { amount: 25 });
    assert.equal(dep.status, 201, JSON.stringify(dep.body));
    assert.match(dep.body.checkoutUrl, /^https:\/\/checkout\.stripe\.com\//);
    assert.equal(dep.body.balance, undefined);
    const s = sessions.get(dep.body.sessionId);
    assert.equal(s.amount_total, 2500);
    assert.match(s.success, /#\/perfil\/carteira\?deposito=\{CHECKOUT_SESSION_ID\}$/);
    assert.equal((await call('GET', '/api/wallet')).body.balance, 0);

    // Not paid yet.
    assert.equal((await call('GET', `/api/wallet/deposit/${s.id}`)).body.status, 'pending');

    // Webhook: bad signature refused; good one credits; a repeat does nothing.
    const paid = { ...s, status: 'complete', payment_status: 'paid', payment_intent: 'pi_1' };
    const evt = JSON.stringify({ id: 'evt_1', type: 'checkout.session.completed', data: { object: paid } });
    const hook = (body, sig) => fetch(`${base}/api/stripe/webhook`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Stripe-Signature': sig }, body });
    assert.equal((await hook(evt, sign(evt, undefined, 'whsec_bad'))).status, 400);
    assert.equal((await call('GET', '/api/wallet')).body.balance, 0);
    assert.equal((await hook(evt, sign(evt))).status, 200);
    assert.equal((await hook(evt, sign(evt))).status, 200);
    assert.equal((await call('GET', '/api/wallet')).body.balance, 25);
    const back = await call('GET', `/api/wallet/deposit/${s.id}`);
    assert.deepEqual([back.body.status, back.body.balance], ['paid', 25]);

    // Return before the webhook: the check with Stripe credits it (once).
    const dep2 = await call('POST', '/api/wallet/deposit', { amount: 10 });
    Object.assign(sessions.get(dep2.body.sessionId), { status: 'complete', payment_status: 'paid' });
    assert.equal((await call('GET', `/api/wallet/deposit/${dep2.body.sessionId}`)).body.balance, 35);
    const evt2 = JSON.stringify({ id: 'evt_2', type: 'checkout.session.completed', data: { object: sessions.get(dep2.body.sessionId) } });
    assert.equal((await hook(evt2, sign(evt2))).status, 200);
    assert.equal((await call('GET', '/api/wallet')).body.balance, 35);

    // Stripe reports a different amount than the page we created: not credited.
    const dep3 = await call('POST', '/api/wallet/deposit', { amount: 10 });
    const evt3 = JSON.stringify({ id: 'evt_3', type: 'checkout.session.completed', data: { object: { ...sessions.get(dep3.body.sessionId), payment_status: 'paid', amount_total: 99999 } } });
    assert.equal((await hook(evt3, sign(evt3))).status, 200);
    assert.equal((await call('GET', '/api/wallet')).body.balance, 35);
    assert.equal((await call('GET', `/api/wallet/deposit/${dep3.body.sessionId}`)).body.status, 'mismatch');

    // Someone else's session is not visible.
    assert.equal((await call('GET', '/api/wallet/deposit/cs_nope')).status, 404);
    // The secret key never reaches the browser.
    assert.ok(!JSON.stringify((await call('GET', '/api/config')).body).includes('sk_test'));
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM transactions WHERE type = 'deposit'").get().n, 2);
  } finally {
    config.paymentsMode = prevMode;
    server.close();
    db.close();
  }
});
