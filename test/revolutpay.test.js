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
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    const body = init.body ? JSON.parse(init.body) : null;
    if (init.method === 'POST' && url.endsWith('/api/orders')) {
      const o = { id: `ord-${++n}`, token: `tok-${n}`, state: 'pending', amount: body.amount, currency: body.currency, checkout_url: `https://sandbox-checkout.revolut.com/payment-link/tok-${n}`, ...body };
      orders.set(o.id, o);
      return { ok: true, status: 201, json: async () => o };
    }
    const id = decodeURIComponent(url.split('/api/orders/')[1] || '');
    if (init.method === 'GET' && orders.has(id)) return { ok: true, status: 200, json: async () => orders.get(id) };
    return { ok: false, status: 404, json: async () => ({ message: 'not found' }) };
  };
  const secret = 'wsk_test_secret';
  const rp = createRevolutPay(db, { secretKey: 'sk_test', webhookSecret: secret, publicUrl: 'https://bet62.pt', fetchImpl });
  const balance = () => db.prepare('SELECT balance_cents FROM users WHERE id = ?').get(userId).balance_cents;
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  const sign = (raw, ts = Date.now()) => ({ sig: `v1=${createHmac('sha256', secret).update(`v1.${ts}.${raw}`).digest('hex')}`, ts: String(ts) });
  return { db, rp, orders, calls, user, userId, balance, sign };
}

test('a Revolut deposit: an order, the player sent to Revolut\'s page and back to the wallet', async () => {
  const t = setup();
  const r = await t.rp.createDeposit(t.user, 2000, { method: 'applepay', promo: 'none' });
  assert.ok(isRevolutDeposit(r.id));
  assert.equal(r.status, 'pending');
  assert.match(r.redirectUrl, /^https:\/\/sandbox-checkout\.revolut\.com\//);
  const sent = JSON.parse(t.calls[0].init.body);
  assert.equal(t.calls[0].url, 'https://sandbox-merchant.revolut.com/api/orders');
  assert.equal(t.calls[0].init.headers.Authorization, 'Bearer sk_test');
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
