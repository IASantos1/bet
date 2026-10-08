import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { openDb } from '../server/db.js';
import { seed } from '../server/seed.js';
import { createApp } from '../server/app.js';
import { config } from '../server/config.js';
import { createStripe, verifyWebhook, formEncode, ptPhone } from '../server/stripe.js';

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

test('ptPhone', () => {
  assert.equal(ptPhone('912 345 678'), '+351912345678');
  assert.equal(ptPhone('+351 912345678'), '+351912345678');
  assert.equal(ptPhone('00351912345678'), '+351912345678');
  assert.equal(ptPhone('212345678'), '');
  assert.equal(ptPhone('12'), '');
});

test('Stripe deposits inside the site: MB WAY, Multibanco, card; credited once by webhook / status / sweep', async () => {
  const db = openDb(':memory:');
  seed(db);
  const intents = new Map();
  let seq = 0;
  const posted = [];
  const fetchImpl = async (url, opts) => {
    assert.equal(opts.headers.Authorization, 'Bearer sk_test_abc');
    assert.ok(opts.headers['Stripe-Version']);
    if (opts.method === 'POST') {
      const p = new URLSearchParams(opts.body);
      posted.push(p);
      const type = p.get('payment_method_types[0]');
      const id = `pi_test_${++seq}`;
      const pi = {
        id, object: 'payment_intent', amount: Number(p.get('amount')), currency: p.get('currency'), client_secret: `${id}_secret_x`,
        status: type === 'card' ? 'requires_payment_method' : type === 'multibanco' ? 'requires_action' : 'processing',
        next_action: type === 'multibanco' ? { type: 'multibanco_display_details', multibanco_display_details: { entity: '12345', reference: '123456789', expires_at: 1900000000, hosted_voucher_url: 'https://v' } } : null,
      };
      intents.set(id, pi);
      return Response.json(pi);
    }
    return Response.json(intents.get(decodeURIComponent(url.split('/').pop())));
  };
  const stripe = createStripe(db, { secretKey: 'sk_test_abc', publishableKey: 'pk_test_xyz', webhookSecret: WHSEC, fetchImpl });
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
    const balance = async () => (await call('GET', '/api/wallet')).body.balance;
    const hook = (obj, type = 'payment_intent.succeeded', secret = WHSEC) => {
      const body = JSON.stringify({ id: `evt_${obj.id}`, type, data: { object: obj } });
      return fetch(`${base}/api/stripe/webhook`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Stripe-Signature': sign(body, undefined, secret) }, body });
    };
    assert.equal((await call('POST', '/api/auth/register', { name: 'Ana Silva', email: 'ana@example.com', password: 'segredo123', birthdate: '1990-05-10', acceptTerms: true })).status, 201);

    // MB WAY: phone required; confirmed by the server with the phone.
    assert.equal((await call('POST', '/api/wallet/deposit', { amount: 25, method: 'mbway', phone: '12' })).status, 400);
    const mb = await call('POST', '/api/wallet/deposit', { amount: 25, method: 'mbway', phone: '912 345 678' });
    assert.equal(mb.status, 201, JSON.stringify(mb.body));
    assert.deepEqual([mb.body.payment.method, mb.body.payment.status, mb.body.payment.amount], ['mbway', 'processing', 25]);
    const p1 = posted.at(-1);
    assert.deepEqual([p1.get('payment_method_types[0]'), p1.get('confirm'), p1.get('payment_method_data[type]'), p1.get('payment_method_data[billing_details][phone]')], ['mb_way', 'true', 'mb_way', '+351912345678']);
    assert.equal(await balance(), 0);
    // Webhook: bad signature refused; good one credits; a repeat does nothing.
    const paid1 = { ...intents.get(mb.body.payment.id), status: 'succeeded', amount_received: 2500 };
    assert.equal((await hook(paid1, undefined, 'whsec_bad')).status, 400);
    assert.equal(await balance(), 0);
    assert.equal((await hook(paid1)).status, 200);
    assert.equal((await hook(paid1)).status, 200);
    assert.equal(await balance(), 25);
    assert.equal((await call('GET', `/api/wallet/deposit/${mb.body.payment.id}`)).body.status, 'paid');

    // Multibanco: entity + reference on our page.
    const ref = await call('POST', '/api/wallet/deposit', { amount: 10, method: 'multibanco' });
    assert.deepEqual([ref.body.payment.entity, ref.body.payment.reference, ref.body.payment.status], ['12345', '123456789', 'pending']);
    assert.equal(posted.at(-1).get('payment_method_types[0]'), 'multibanco');
    // Paid at the ATM, webhook lost: the sweep credits it.
    Object.assign(intents.get(ref.body.payment.id), { status: 'succeeded', amount_received: 1000 });
    assert.deepEqual(await stripe.sweep(), { checked: 1, credited: 1 });
    assert.equal(await balance(), 35);

    // Card: a client secret for the Payment Element, not confirmed by the server.
    const card = await call('POST', '/api/wallet/deposit', { amount: 10, method: 'cartao' });
    assert.equal(card.body.publishableKey, 'pk_test_xyz');
    assert.match(card.body.clientSecret, /^pi_test_\d+_secret_/);
    assert.equal(posted.at(-1).get('confirm'), null);
    assert.equal((await call('GET', `/api/wallet/deposit/${card.body.payment.id}`)).body.status, 'pending');
    // A declined card stays open (it can be tried again); then the status check credits it.
    Object.assign(intents.get(card.body.payment.id), { last_payment_error: { code: 'card_declined' } });
    assert.equal((await call('GET', `/api/wallet/deposit/${card.body.payment.id}`)).body.status, 'pending');
    Object.assign(intents.get(card.body.payment.id), { status: 'succeeded', amount_received: 1000, last_payment_error: null });
    assert.equal((await call('GET', `/api/wallet/deposit/${card.body.payment.id}`)).body.balance, 45);
    assert.equal((await hook(intents.get(card.body.payment.id))).status, 200);
    assert.equal(await balance(), 45);

    // Stripe reports a different amount: not credited.
    const odd = await call('POST', '/api/wallet/deposit', { amount: 10, method: 'cartao' });
    assert.equal((await hook({ ...intents.get(odd.body.payment.id), status: 'succeeded', amount_received: 99999 })).status, 200);
    assert.equal(await balance(), 45);
    assert.equal((await call('GET', `/api/wallet/deposit/${odd.body.payment.id}`)).body.status, 'mismatch');

    // MB WAY refused in the app: failed.
    const mb2 = await call('POST', '/api/wallet/deposit', { amount: 10, method: 'mbway', phone: '912345678' });
    assert.equal((await hook({ ...intents.get(mb2.body.payment.id), status: 'requires_payment_method', last_payment_error: { code: 'payment_intent_payment_attempt_failed' } }, 'payment_intent.payment_failed')).status, 200);
    assert.equal((await call('GET', `/api/wallet/deposit/${mb2.body.payment.id}`)).body.status, 'failed');

    // Someone else's payment is not visible; keys never reach the browser except the publishable one.
    assert.equal((await call('GET', '/api/wallet/deposit/pi_nope')).status, 404);
    assert.ok(!JSON.stringify((await call('GET', '/api/config')).body).includes('sk_test'));
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM transactions WHERE type = 'deposit'").get().n, 3);
  } finally {
    config.paymentsMode = prevMode;
    server.close();
    db.close();
  }
});

test('Stripe: a paid deposit gets its bonus once; a chargeback takes the money back and cancels it', () => {
  const db = openDb(':memory:');
  seed(db);
  const uid = Number(db.prepare("INSERT INTO users (email, name, birthdate, password_hash, created_at) VALUES ('cb@ex.com', 'Cb', '1990-01-01', 'x', ?)").run(new Date().toISOString()).lastInsertRowid);
  db.prepare("INSERT INTO stripe_payments (session_id, user_id, amount_cents, currency, status, method, created_at) VALUES ('pi_cb', ?, 3000, 'eur', 'pending', 'mbway', ?)").run(uid, new Date().toISOString());
  const stripe = createStripe(db, { secretKey: 'sk_test_abc', fetchImpl: async () => { throw new Error('no network'); } });
  const pi = { id: 'pi_cb', object: 'payment_intent', status: 'succeeded', amount: 3000, amount_received: 3000, currency: 'eur' };
  assert.equal(stripe.handleEvent({ type: 'payment_intent.succeeded', data: { object: pi } }).bonus.amount_cents, 3000);
  stripe.handleEvent({ type: 'payment_intent.succeeded', data: { object: pi } }); // again: nothing more
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM bonuses').get().n, 1);
  assert.equal(db.prepare('SELECT balance_cents FROM users WHERE id = ?').get(uid).balance_cents, 3000);
  const r = stripe.handleEvent({ type: 'charge.dispute.created', data: { object: { object: 'dispute', payment_intent: 'pi_cb' } } });
  assert.equal(r.reversed, true);
  assert.equal(stripe.handleEvent({ type: 'charge.dispute.created', data: { object: { object: 'dispute', payment_intent: 'pi_cb' } } }).reversed, undefined);
  assert.equal(db.prepare('SELECT balance_cents FROM users WHERE id = ?').get(uid).balance_cents, 0);
  assert.equal(db.prepare('SELECT status FROM bonuses').get().status, 'cancelled');
  assert.ok(db.prepare("SELECT 1 FROM transactions WHERE type = 'chargeback'").get());
});
