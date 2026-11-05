import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { openDb } from '../server/db.js';
import { seed } from '../server/seed.js';
import { createRevolutPay, verifyMerchantWebhook, orderState, isRevolutDeposit } from '../server/revolutpay.js';

// A database, a player and a fake Revolut Merchant API that keeps its orders in memory.
function setup() {
  const db = openDb(':memory:');
  seed(db);
  const userId = Number(db.prepare(`INSERT INTO users (email, name, birthdate, password_hash, created_at) VALUES ('rv@example.com', 'Rv', '1990-01-01', 'x', ?)`).run(new Date().toISOString()).lastInsertRowid);
  const orders = new Map();
  const calls = [];
  let n = 0;
  let t3ds = false;
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    const body = init.body ? JSON.parse(init.body) : null;
    if (init.method === 'POST' && url.endsWith('/api/1.0/customers')) return { ok: true, status: 201, json: async () => ({ id: 'cus-1', email: body.email }) };
    if (init.method === 'GET' && url.endsWith('/api/1.0/customers/cus-1/payment-methods')) return { ok: true, status: 200, json: async () => [{ id: 'pm-1', type: 'CARD', method_details: { brand: 'VISA', last4: '4242', expiry_month: 4, expiry_year: 2029 } }] };
    const pay = /\/api\/orders\/([^/]+)\/payments$/.exec(url);
    if (init.method === 'POST' && pay && orders.has(pay[1])) {
      const o = orders.get(pay[1]);
      if (body.saved_payment_method?.id === 'pm-1') o.state = t3ds ? 'pending' : 'completed';
      return { ok: true, status: 200, json: async () => (t3ds ? { state: 'authentication_challenge', authentication_challenge: { type: 'three_ds' } } : { state: 'completed' }) };
    }
    if (init.method === 'POST' && url.endsWith('/api/orders')) {
      const o = { id: `ord-${++n}`, token: `tok-${n}`, state: 'pending', amount: body.amount, currency: body.currency, checkout_url: `https://sandbox-checkout.revolut.com/payment-link/tok-${n}`, ...body };
      orders.set(o.id, o);
      return { ok: true, status: 201, json: async () => o };
    }
    const id = decodeURIComponent(url.split('/api/orders/')[1] || '');
    if (init.method === 'PATCH' && orders.has(id)) { Object.assign(orders.get(id), { amount: body.amount }); return { ok: true, status: 200, json: async () => orders.get(id) }; }
    if (init.method === 'GET' && orders.has(id)) return { ok: true, status: 200, json: async () => orders.get(id) };
    return { ok: false, status: 404, json: async () => ({ message: 'not found' }) };
  };
  const secret = 'wsk_test_secret';
  const rp = createRevolutPay(db, { secretKey: 'sk_test', webhookSecret: secret, publicUrl: 'https://bet62.pt', fetchImpl });
  const balance = () => db.prepare('SELECT balance_cents FROM users WHERE id = ?').get(userId).balance_cents;
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  const sign = (raw, ts = Date.now()) => ({ sig: `v1=${createHmac('sha256', secret).update(`v1.${ts}.${raw}`).digest('hex')}`, ts: String(ts) });
  return { db, rp, orders, calls, user, userId, balance, sign, setThreeDs: (v) => { t3ds = v; } };
}

test('a Revolut deposit: an order, the player sent to Revolut\'s page and back to the wallet', async () => {
  const t = setup();
  const r = await t.rp.createDeposit(t.user, 2000, { method: 'applepay', promo: 'none' });
  assert.ok(isRevolutDeposit(r.id));
  assert.equal(r.status, 'pending');
  assert.match(r.redirectUrl, /^https:\/\/sandbox-checkout\.revolut\.com\//);
  const orderCall = t.calls.find((c) => c.url.endsWith('/api/orders'));
  const sent = JSON.parse(orderCall.init.body);
  assert.equal(orderCall.init.headers.Authorization, 'Bearer sk_test');
  // The order belongs to the player's Revolut customer (kept on the user), so a saved card is theirs.
  assert.deepEqual(sent.customer, { id: 'cus-1' });
  assert.equal(t.db.prepare('SELECT revolut_customer_id FROM users WHERE id = ?').get(t.userId).revolut_customer_id, 'cus-1');
  assert.equal(r.token, 'tok-1');
  assert.equal(sent.amount, 2000);
  assert.equal(sent.currency, 'EUR');
  assert.equal(sent.redirect_url, `https://bet62.pt/#/perfil/carteira?deposito=${r.id}`);
  assert.equal(sent.merchant_order_data.reference, r.id);
  await assert.rejects(t.rp.createDeposit(t.user, 2000, { method: 'mbway' }), /inválido/);
});

test('credited once, only when Revolut says the order is completed with the same amount', async () => {
  const t = setup();
  const r = await t.rp.createDeposit(t.user, 2500, { method: 'cartao', promo: 'none' });
  const orderId = [...t.orders.keys()][0];
  // Still pending at Revolut: nothing credited, whatever the webhook claims.
  const raw = JSON.stringify({ event: 'ORDER_COMPLETED', order_id: orderId });
  const s = t.sign(raw);
  assert.equal((await t.rp.handleWebhook(raw, s.sig, s.ts)).status, 'pending');
  assert.equal(t.balance(), 0);
  t.orders.get(orderId).state = 'completed';
  const done = await t.rp.handleWebhook(raw, s.sig, s.ts);
  assert.equal(done.credited, true);
  assert.equal(t.balance(), 2500);
  // Again (webhook retry, the player's page, the sweep): no second credit.
  await t.rp.handleWebhook(raw, s.sig, s.ts);
  assert.equal((await t.rp.refresh(r.id, t.userId)).status, 'paid');
  assert.equal((await t.rp.sweep()).credited, 0);
  assert.equal(t.balance(), 2500);
  assert.equal(t.db.prepare("SELECT COUNT(*) AS n FROM transactions WHERE type = 'deposit'").get().n, 1);
});

test('a different amount is not credited; a cancelled order fails; the sweep credits a missed webhook', async () => {
  const t = setup();
  await t.rp.createDeposit(t.user, 1000, { method: 'cartao', promo: 'none' });
  const [a] = [...t.orders.keys()];
  Object.assign(t.orders.get(a), { state: 'completed', amount: 100 });
  assert.equal(t.rp.applyOrder(t.orders.get(a)).status, 'mismatch');
  const b = await t.rp.createDeposit(t.user, 1500, { method: 'googlepay', promo: 'none' });
  const bOrder = [...t.orders.values()].find((o) => o.merchant_order_data.reference === b.id);
  bOrder.state = 'cancelled';
  assert.equal((await t.rp.refresh(b.id, t.userId)).status, 'failed');
  const c = await t.rp.createDeposit(t.user, 3000, { method: 'cartao', promo: 'none' });
  [...t.orders.values()].find((o) => o.merchant_order_data.reference === c.id).state = 'completed';
  assert.equal((await t.rp.sweep()).credited, 1);
  assert.equal(t.balance(), 3000);
});

test('the webhook signature: right secret, recent timestamp, v1 HMAC of v1.timestamp.body', () => {
  const t = setup();
  const raw = '{"event":"ORDER_COMPLETED","order_id":"x"}';
  const s = t.sign(raw);
  assert.equal(verifyMerchantWebhook(raw, s.sig, s.ts, 'wsk_test_secret'), true);
  assert.equal(verifyMerchantWebhook(raw, `v1=00,${s.sig}`, s.ts, 'wsk_test_secret'), true);
  assert.equal(verifyMerchantWebhook(raw + ' ', s.sig, s.ts, 'wsk_test_secret'), false);
  assert.equal(verifyMerchantWebhook(raw, s.sig, s.ts, 'other'), false);
  const old = t.sign(raw, Date.now() - 10 * 60_000);
  assert.equal(verifyMerchantWebhook(raw, old.sig, old.ts, 'wsk_test_secret'), false);
  assert.deepEqual(['completed', 'authorised', 'cancelled', 'failed', 'pending'].map(orderState), ['completed', 'processing', 'failed', 'failed', 'pending']);
});

test('the admin can test the Merchant key and register the deposits webhook (its secret shown once)', async () => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    if (url.endsWith('/api/1.0/orders?limit=1')) return { ok: true, status: 200, json: async () => [] };
    if (url.endsWith('/api/1.0/webhooks')) return { ok: true, status: 201, json: async () => ({ id: 'wh', url: JSON.parse(init.body).url, signing_secret: 'wsk_1' }) };
    return { ok: false, status: 401, json: async () => ({ message: 'Unauthorized' }) };
  };
  const db = openDb(':memory:');
  const rp = createRevolutPay(db, { secretKey: 'sk_x', environment: 'production', fetchImpl });
  assert.equal(await rp.check(), true);
  assert.match(calls[0].url, /^https:\/\/merchant\.revolut\.com\/api\/1\.0\/orders/);
  const wh = await rp.registerWebhook('https://bet62.plus/api/revolut/merchant/webhook');
  assert.deepEqual(wh, { id: 'wh', url: 'https://bet62.plus/api/revolut/merchant/webhook', signingSecret: 'wsk_1' });
  assert.ok(JSON.parse(calls[1].init.body).events.includes('ORDER_COMPLETED'));
  const bad = createRevolutPay(db, { secretKey: 'sk_wrong', fetchImpl: async () => ({ ok: false, status: 401, json: async () => ({ message: 'Unauthorized' }) }) });
  await assert.rejects(bad.check(), /Unauthorized/);
});

test('a saved card pays the next deposit without typing it; a bank check (3-D Secure) falls back to the card form', async () => {
  const t = setup();
  const a = await t.rp.createDeposit(t.user, 2000, { method: 'cartao', promo: 'none' });
  assert.deepEqual(await t.rp.savedCards(t.user), [{ id: 'pm-1', brand: 'VISA', last4: '4242', expiry: '04/29' }]);
  const paid = await t.rp.payWithSavedCard(t.user, a.id, 'pm-1');
  assert.deepEqual([paid.status, paid.fallback, t.balance()], ['paid', false, 2000]);
  // Only a card of the player's own.
  const b = await t.rp.createDeposit(t.user, 1000, { method: 'cartao', promo: 'none' });
  await assert.rejects(t.rp.payWithSavedCard(t.user, b.id, 'pm-other'), /Cartão não encontrado/);
  t.setThreeDs(true);
  const c = await t.rp.payWithSavedCard(t.user, b.id, 'pm-1');
  assert.deepEqual([c.status, c.fallback, t.balance()], ['pending', true, 2000]);
});

test('card in one step: a draft order opens the card form; paying sets it to the amount and promotion chosen', async () => {
  const t = setup();
  const r = await t.rp.createDeposit(t.user, 2000, { method: 'cartao', promo: 'freebet', draft: true });
  assert.equal(r.status, 'draft');
  // Not a deposit waiting (limits) nor swept until the player pays.
  assert.equal((await t.rp.sweep()).checked, 0);
  const u = await t.rp.updateDeposit(t.user, r.id, 5000, 'none');
  assert.equal(u.status, 'pending');
  assert.equal(t.orders.get('ord-1').amount, 5000);
  const patch = t.calls.find((c) => c.init.method === 'PATCH');
  assert.equal(JSON.parse(patch.init.body).amount, 5000);
  // The same amount again: nothing sent to Revolut.
  await t.rp.updateDeposit(t.user, r.id, 5000, 'none');
  assert.equal(t.calls.filter((c) => c.init.method === 'PATCH').length, 1);
  t.orders.get('ord-1').state = 'completed';
  assert.equal((await t.rp.refresh(r.id, t.userId)).status, 'paid');
  assert.equal(t.balance(), 5000);
  await assert.rejects(t.rp.updateDeposit(t.user, r.id, 1000, 'none'), /já não pode ser alterado/);
  await assert.rejects(t.rp.updateDeposit({ ...t.user, id: t.userId + 1 }, r.id, 1000, 'none'), /não encontrado/);
});
