import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../server/db.js';
import { createEupago } from '../server/eupago.js';

function makeDb() {
  const db = openDb(':memory:');
  db.prepare(`INSERT INTO users (email, name, birthdate, password_hash, created_at)
    VALUES ('player@example.test', 'Test Player', '1990-01-01', 'unused', '2026-01-01T00:00:00.000Z')`).run();
  return db;
}

test('Eupago MB WAY deposit is credited only once after an authenticated matching callback', async () => {
  const db = makeDb();
  const eupago = createEupago(db, {
    apiKey: 'api-key-test',
    environment: 'sandbox',
    fetchImpl: async (url, options) => {
      assert.equal(url, 'https://sandbox.eupago.pt/api/v1.02/mbway/create');
      assert.equal(options.headers.Authorization, 'ApiKey api-key-test');
      const body = JSON.parse(options.body);
      assert.equal(body.payment.amount, 10);
      assert.equal(body.payment.currency, 'EUR');
      assert.match(body.payment.identifier, /^B62-1-/);
      assert.equal(body.payment.customerPhone, '912345678');
      assert.equal(body.payment.countryCode, '351');
      return Response.json({ transactionID: 'provider-1', status: 'pending' }, { status: 201 });
    },
  });
  const payment = await eupago.createDeposit({ id: 1, email: 'player@example.test' }, 1000, {
    method: 'mbway', phone: '912 345 678', promo: 'none',
  });
  assert.equal(payment.status, 'pending');
  assert.equal(payment.method, 'mbway');

  assert.deepEqual(eupago.handleWebhook({
    chave_api: 'wrong-key', identificador: payment.id, valor: '10.00', mp: 'MW:PT',
  }), { accepted: false, reason: 'authentication' });
  assert.deepEqual(eupago.handleWebhook({
    chave_api: 'api-key-test', identificador: payment.id, valor: '10.00', mp: 'MW:PT', transacao: 'provider-1',
  }), { accepted: true, credited: true });
  assert.deepEqual(eupago.handleWebhook({
    chave_api: 'api-key-test', identificador: payment.id, valor: '10.00', mp: 'MW:PT', transacao: 'provider-1',
  }), { accepted: true, duplicate: true });

  assert.equal(db.prepare('SELECT balance_cents FROM users WHERE id = 1').get().balance_cents, 1000);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM transactions WHERE user_id = 1 AND type = 'deposit'").get().n, 1);
  db.close();
});

test('Eupago Multibanco returns the entity and reference for display', async () => {
  const db = makeDb();
  const eupago = createEupago(db, {
    apiKey: 'api-key-test',
    environment: 'sandbox',
    fetchImpl: async (url, options) => {
      assert.equal(url, 'https://sandbox.eupago.pt/clientes/rest_api/multibanco/create');
      const body = JSON.parse(options.body);
      assert.equal(body.chave, 'api-key-test');
      assert.equal(body.per_dup, 0);
      return Response.json({ entidade: '12345', referencia: '123456789', estado: 'ok' });
    },
  });
  const payment = await eupago.createDeposit({ id: 1, email: 'player@example.test' }, 2500, {
    method: 'multibanco', promo: 'none',
  });
  assert.equal(payment.status, 'pending');
  assert.equal(payment.entity, '12345');
  assert.equal(payment.reference, '123456789');
  assert.equal(db.prepare('SELECT balance_cents FROM users WHERE id = 1').get().balance_cents, 0);
  db.close();
});


test('Eupago credit card creates a secure checkout URL and credits only after callback', async () => {
  const db = makeDb();
  const eupago = createEupago(db, {
    apiKey: 'api-key-test',
    environment: 'sandbox',
    fetchImpl: async (url, options) => {
      assert.equal(url, 'https://sandbox.eupago.pt/api/v1.02/creditcard/create');
      assert.equal(options.headers.Authorization, 'ApiKey api-key-test');
      const body = JSON.parse(options.body);
      assert.equal(body.payment.amount, 25);
      assert.equal(body.payment.currency, 'EUR');
      assert.match(body.payment.identifier, /^B62-1-/);
      assert.equal(body.payment.lang, 'PT');
      assert.equal(body.customer.email, 'player@example.test');
      return Response.json({ transactionID: 'card-provider-1', redirectUrl: 'https://sandbox.eupago.pt/checkout/example', status: 'pending' }, { status: 200 });
    },
  });
  const payment = await eupago.createDeposit({ id: 1, email: 'player@example.test' }, 2500, {
    method: 'cartao', promo: 'none',
  });
  assert.equal(payment.status, 'pending');
  assert.equal(payment.method, 'cartao');
  assert.equal(payment.redirectUrl, 'https://sandbox.eupago.pt/checkout/example');
  assert.equal(db.prepare('SELECT balance_cents FROM users WHERE id = 1').get().balance_cents, 0);
  assert.deepEqual(eupago.handleWebhook({
    chave_api: 'api-key-test', identificador: payment.id, valor: '25.00', mp: 'CC:PT', transacao: 'card-provider-1',
  }), { accepted: true, credited: true });
  assert.equal(db.prepare('SELECT balance_cents FROM users WHERE id = 1').get().balance_cents, 2500);
  db.close();
});
