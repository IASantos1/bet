import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb, tx } from '../server/db.js';
import { seed } from '../server/seed.js';
import { createApp } from '../server/app.js';
import { config } from '../server/config.js';
import { createStripe } from '../server/stripe.js';
import { postTransaction } from '../server/wallet.js';
import {
  ensureProfile, attribute, eligibility, onReferredDeposit, payCommission, reviewCommission, reverseCommission, setAffiliateStatus,
  saveAffiliateConfig, affiliateConfig, affiliateStats, affiliateReferrals, recover, reconcile, CODE_RE, maskName,
} from '../server/affiliates.js';

// A database with the programme on, and a Stripe whose payments the test confirms by hand.
function setup() {
  const db = openDb(':memory:');
  seed(db);
  const admin = db.prepare("SELECT id FROM users WHERE role = 'admin'").get()?.id ?? null;
  saveAffiliateConfig(db, { enabled: true }, { actor: admin, reason: 'testes automáticos' });
  const stripe = createStripe(db, { secretKey: 'sk_test_x', fetchImpl: async () => { throw new Error('sem rede'); } });
  let n = 0;
  const user = (name = `Jogador ${n}`, extra = {}) => {
    n += 1;
    const id = Number(db.prepare(`INSERT INTO users (email, name, birthdate, phone, password_hash, created_at) VALUES (?, ?, '1990-01-01', ?, 'x', ?)`)
      .run(`u${n}@example.com`, name, extra.phone || null, new Date().toISOString()).lastInsertRowid);
    return id;
  };
  let pi = 0;
  // A Stripe deposit: pending row, then "succeeded" (as the webhook would bring it).
  const pending = (userId, cents) => {
    const id = `pi_aff_${++pi}`;
    db.prepare("INSERT INTO stripe_payments (session_id, user_id, amount_cents, currency, status, method, created_at) VALUES (?, ?, ?, 'eur', 'pending', 'cartao', ?)")
      .run(id, userId, cents, new Date().toISOString());
    return { id, object: 'payment_intent', status: 'succeeded', amount: cents, amount_received: cents, currency: 'eur' };
  };
  const deposit = (userId, cents) => { const intent = pending(userId, cents); stripe.applyIntent(intent); return intent; };
  const commissionOf = (referred) => db.prepare('SELECT * FROM affiliate_commissions WHERE referred_user_id = ?').get(referred);
  const balance = (id) => db.prepare('SELECT balance_cents FROM users WHERE id = ?').get(id).balance_cents;
  return { db, admin, stripe, user, pending, deposit, commissionOf, balance };
}

// An active affiliate: own €10 confirmed deposit, €10 balance.
function activeAffiliate(s, name = 'Gabriel Afonso') {
  const id = s.user(name);
  s.deposit(id, 1000);
  const p = ensureProfile(s.db, id);
  return { id, code: p.referral_code };
}

test('codes are unique, in the format, and the profile is created once', () => {
  const s = setup();
  const codes = new Set();
  for (let i = 0; i < 200; i++) {
    const p = ensureProfile(s.db, s.user());
    assert.match(p.referral_code, CODE_RE);
    codes.add(p.referral_code);
  }
  assert.equal(codes.size, 200);
  const id = s.user();
  assert.equal(ensureProfile(s.db, id).referral_code, ensureProfile(s.db, id).referral_code);
  assert.equal(maskName('Ana Maria Silva'), 'Ana M.');
});

test('attribution: once, never replaced, no self-referral, unknown codes ignored, programme off ignored', () => {
  const s = setup();
  const a = activeAffiliate(s);
  const b = activeAffiliate(s, 'Beatriz Costa');
  const r = s.user('Rui Lopes');
  assert.equal(attribute(s.db, { referredUserId: r, code: a.code.toLowerCase(), ip: '10.0.0.1' }).affiliate_user_id, a.id);
  // A second code later does not move the player (no multi-attribution).
  assert.equal(attribute(s.db, { referredUserId: r, code: b.code }).affiliate_user_id, a.id);
  assert.equal(s.db.prepare('SELECT COUNT(*) AS n FROM referral_attributions WHERE referred_user_id = ?').get(r).n, 1);
  // Self-referral refused (and the database refuses it too).
  assert.equal(attribute(s.db, { referredUserId: a.id, code: a.code }), null);
  assert.throws(() => s.db.prepare("INSERT INTO referral_attributions (affiliate_user_id, referred_user_id, referral_code, attributed_at) VALUES (?, ?, 'X', 'now')").run(a.id, a.id), /CHECK/);
  assert.equal(attribute(s.db, { referredUserId: s.user(), code: 'ZZZ999' }), null);
  assert.equal(attribute(s.db, { referredUserId: s.user(), code: 'not-a-code' }), null);
  saveAffiliateConfig(s.db, { enabled: false }, { actor: s.admin, reason: 'pausa do programa' });
  assert.equal(attribute(s.db, { referredUserId: s.user(), code: a.code }), null);
});

test('activation: €10 own deposit activates, less does not; low eligible balance suspends; bonus money is not counted', () => {
  const s = setup();
  const low = s.user();
  s.deposit(low, 999);
  assert.equal(eligibility(s.db, low).state, 'pending');
  const ok = s.user();
  s.deposit(ok, 1000);
  assert.equal(eligibility(s.db, ok).state, 'active');
  // Admin credits are not deposits.
  const credited = s.user();
  postTransaction(s.db, credited, 5000, 'admin_credit', 'crédito manual');
  assert.equal(eligibility(s.db, credited).state, 'pending');
  // Spending under €10 of eligible balance suspends earning; back above, active again.
  postTransaction(s.db, ok, -500, 'bet', 'aposta');
  assert.equal(eligibility(s.db, ok).state, 'suspended_balance');
  postTransaction(s.db, ok, 600, 'payout', 'ganho');
  assert.equal(eligibility(s.db, ok).state, 'active');
  // Bonus / free bets live outside balance_cents: a player with only bonus money has no eligible balance.
  const bonusOnly = s.user();
  s.deposit(bonusOnly, 1000);
  postTransaction(s.db, bonusOnly, -1000, 'bet', 'aposta');
  s.db.prepare("INSERT INTO freebets (user_id, amount_cents, source, ref, status, expires_at, created_at) VALUES (?, 5000, 'admin', 'fb-test', 'active', '2999-01-01', 'now')").run(bonusOnly);
  assert.equal(eligibility(s.db, bonusOnly).state, 'suspended_balance');
  // A demonstration deposit never activates unless the operator counts them.
  const demo = s.user();
  postTransaction(s.db, demo, 2000, 'deposit', 'demo');
  assert.equal(eligibility(s.db, demo).state, 'pending');
  assert.equal(eligibility(s.db, demo, { ...affiliateConfig(s.db), countDemoDeposits: true }).state, 'active');
});

test('commission: 10% of the first confirmed deposit, once; later deposits, failed payments and repeated webhooks add nothing', () => {
  const s = setup();
  const a = activeAffiliate(s);
  const r1 = s.user('Rui Lopes');
  attribute(s.db, { referredUserId: r1, code: a.code });
  // A failed / pending payment credits nothing and earns nothing.
  const failed = s.pending(r1, 3000);
  s.stripe.applyIntent({ ...failed, status: 'canceled' });
  assert.equal(s.commissionOf(r1), undefined);
  const first = s.deposit(r1, 1000);
  let c = s.commissionOf(r1);
  assert.deepEqual([c.deposit_cents, c.commission_cents, c.rate_bps, c.status], [1000, 100, 1000, 'approved']); // €1 on €10
  // The same webhook again, and a second deposit: nothing more.
  s.stripe.applyIntent(first);
  s.stripe.handleEvent({ type: 'payment_intent.succeeded', data: { object: first } });
  s.deposit(r1, 5000);
  assert.equal(s.db.prepare('SELECT COUNT(*) AS n FROM affiliate_commissions WHERE affiliate_user_id = ?').get(a.id).n, 1);
  // €5 on €50.
  const r2 = s.user('Sara Dias');
  attribute(s.db, { referredUserId: r2, code: a.code });
  s.deposit(r2, 5000);
  assert.equal(s.commissionOf(r2).commission_cents, 500);
  // Paying is a ledger entry, once.
  const before = s.balance(a.id);
  c = payCommission(s.db, s.commissionOf(r1).id, { actor: s.admin });
  assert.equal(c.status, 'paid');
  payCommission(s.db, c.id, { actor: s.admin });
  assert.equal(s.balance(a.id), before + 100);
  assert.equal(s.db.prepare("SELECT COUNT(*) AS n FROM transactions WHERE type = 'affiliate_commission' AND ref = ?").get(`affiliate:${c.id}`).n, 1);
  // Commissions received do not count as eligible balance.
  assert.equal(eligibility(s.db, a.id).eligibleBalance, s.balance(a.id) - 100);
  const st = affiliateStats(s.db, a.id);
  assert.deepEqual([st.referrals, st.qualified, st.commissions.paid.amount, st.commissions.approved.amount], [2, 2, '1.00', '5.00']);
  const refs = affiliateReferrals(s.db, a.id, { size: 1 });
  assert.deepEqual([refs.total, refs.items.length, refs.items[0].name], [2, 1, 'Sara D.']);
  assert.equal(refs.items[0].email, undefined);
  assert.ok(reconcile(s.db).ok);
});

test('an affiliate who is not eligible at deposit time: commission kept for review, not paid', () => {
  const s = setup();
  const aff = s.user('Sem Depósito');
  const { referral_code: code } = ensureProfile(s.db, aff);
  const r = s.user();
  attribute(s.db, { referredUserId: r, code });
  s.deposit(r, 2000);
  const c = s.commissionOf(r);
  assert.equal(c.status, 'pending');
  assert.match(c.review_reason, /inelegível/);
  assert.throws(() => payCommission(s.db, c.id, { actor: s.admin }), /aprovadas/);
  // A blocked affiliate gets nothing at all.
  const b = activeAffiliate(s, 'Bloqueado');
  setAffiliateStatus(s.db, b.id, { actor: s.admin, status: 'blocked', reason: 'fraude confirmada' });
  const r2 = s.user();
  assert.equal(attribute(s.db, { referredUserId: r2, code: b.code }), null);
});

test('fraud signals: shared phone rejects as self-referral; shared address only sends to review', () => {
  const s = setup();
  const aId = s.user('Ana', { phone: '912345678' });
  s.deposit(aId, 1000);
  const { referral_code: code } = ensureProfile(s.db, aId);
  const twin = s.user('Ana 2', { phone: '+351 912 345 678' });
  attribute(s.db, { referredUserId: twin, code });
  s.deposit(twin, 1000);
  assert.equal(s.commissionOf(twin).status, 'rejected');
  // Same IP as one of the affiliate's sessions: review, not a block.
  const shared = s.user('Vizinho');
  const att = attribute(s.db, { referredUserId: shared, code, ip: '10.1.1.1' });
  s.db.prepare("INSERT INTO sessions (token_hash, user_id, expires_at, created_at, ip_hash) VALUES ('t1', ?, '2999-01-01', 'now', ?)").run(aId, att.ip_hash);
  s.deposit(shared, 1000);
  assert.equal(s.commissionOf(shared).status, 'pending');
  assert.match(s.commissionOf(shared).review_reason, /mesmo endereço/);
  const ok = reviewCommission(s.db, s.commissionOf(shared).id, { actor: s.admin, decision: 'approve', reason: '' });
  assert.equal(ok.status, 'approved');
});

test('chargebacks and refunds: unpaid commission reversed; paid one flagged and reversed through the ledger', () => {
  const s = setup();
  const a = activeAffiliate(s);
  const r1 = s.user();
  attribute(s.db, { referredUserId: r1, code: a.code });
  const d1 = s.deposit(r1, 2000);
  s.stripe.handleEvent({ type: 'charge.refunded', data: { object: { payment_intent: d1.id, refunded: true } } });
  assert.equal(s.commissionOf(r1).status, 'reversed');
  assert.throws(() => payCommission(s.db, s.commissionOf(r1).id, { actor: s.admin }), /aprovadas/);

  const r2 = s.user();
  attribute(s.db, { referredUserId: r2, code: a.code });
  const d2 = s.deposit(r2, 3000);
  assert.equal(s.commissionOf(r2).status, 'approved', s.commissionOf(r2).review_reason);
  const paid = payCommission(s.db, s.commissionOf(r2).id, { actor: s.admin });
  const bal = s.balance(a.id);
  s.stripe.handleEvent({ type: 'charge.dispute.created', data: { object: { payment_intent: d2.id } } });
  assert.equal(s.commissionOf(r2).status, 'paid');
  assert.match(s.commissionOf(r2).review_reason, /revertido/);
  const rev = reverseCommission(s.db, paid.id, { actor: s.admin, reason: 'chargeback' });
  assert.deepEqual([rev.status, rev.reversed_cents], ['reversed', 300]);
  assert.equal(s.balance(a.id), bal - 300);
  assert.throws(() => reverseCommission(s.db, paid.id, { actor: s.admin, reason: 'outra vez' }), /pagas/);
  assert.ok(reconcile(s.db).ok);
});

test('concurrent deliveries and a crash between deposit and commission: one commission, recovered later', async () => {
  const s = setup();
  const a = activeAffiliate(s);
  const r = s.user();
  attribute(s.db, { referredUserId: r, code: a.code });
  const intent = s.pending(r, 1000);
  await Promise.all(Array.from({ length: 10 }, () => Promise.resolve().then(() => s.stripe.applyIntent(intent))));
  assert.equal(s.db.prepare('SELECT COUNT(*) AS n FROM affiliate_commissions').get().n, 1);
  // The same deposit offered again directly (another worker): refused by the UNIQUE keys.
  const txId = s.commissionOf(r).deposit_tx_id;
  assert.equal(tx(s.db, () => onReferredDeposit(s.db, { userId: r, amountCents: 1000, txId, ref: `stripe:${intent.id}` })), null);
  assert.throws(() => s.db.prepare(`INSERT INTO affiliate_commissions (affiliate_user_id, referred_user_id, deposit_tx_id, deposit_ref, deposit_cents, rate_bps, commission_cents, status, created_at, updated_at)
    VALUES (?, ?, ?, 'x', 1, 1, 1, 'pending', 'now', 'now')`).run(a.id, r, txId), /UNIQUE/);

  // Programme switched off while a referred player deposits; switched back on: recovery creates it once.
  const r2 = s.user();
  attribute(s.db, { referredUserId: r2, code: a.code });
  saveAffiliateConfig(s.db, { enabled: false }, { actor: s.admin, reason: 'manutenção' });
  s.deposit(r2, 4000);
  assert.equal(s.commissionOf(r2), undefined);
  saveAffiliateConfig(s.db, { enabled: true }, { actor: s.admin, reason: 'fim da manutenção' });
  assert.deepEqual(recover(s.db), { created: 1 });
  assert.deepEqual(recover(s.db), { created: 0 });
  assert.equal(s.commissionOf(r2).commission_cents, 400);
});

test('dual approval, configuration audit and an append-only audit log', () => {
  const s = setup();
  assert.throws(() => saveAffiliateConfig(s.db, { rateBps: 2000 }, { actor: s.admin, reason: '' }), /justificação/);
  assert.throws(() => saveAffiliateConfig(s.db, { rateBps: 99999 }, { actor: s.admin, reason: 'valor absurdo' }), /inválido/);
  saveAffiliateConfig(s.db, { dualApprovalCents: 100 }, { actor: s.admin, reason: 'dupla aprovação' });
  const last = s.db.prepare("SELECT * FROM affiliate_audit WHERE action = 'config.update' ORDER BY id DESC").get();
  assert.deepEqual(JSON.parse(last.metadata), { reason: 'dupla aprovação', before: { dualApprovalCents: 0 }, after: { dualApprovalCents: 100 } });
  const a = activeAffiliate(s);
  const r = s.user();
  attribute(s.db, { referredUserId: r, code: a.code });
  s.deposit(r, 2000);
  const c = reviewCommission(s.db, s.commissionOf(r).id, { actor: s.admin, decision: 'approve' });
  assert.throws(() => payCommission(s.db, c.id, { actor: s.admin }), /outro administrador/);
  const other = s.user('Admin 2');
  assert.equal(payCommission(s.db, c.id, { actor: other }).status, 'paid');
  assert.throws(() => s.db.prepare('UPDATE affiliate_audit SET result = ?').run('x'), /append-only|só de leitura|abort/i);
  assert.throws(() => s.db.prepare('DELETE FROM affiliate_audit').run(), /append-only|só de leitura|abort/i);
  assert.ok(s.db.prepare('SELECT COUNT(*) AS n FROM affiliate_audit').get().n > 5);
});

test('HTTP: referral link, registration attribution, player API, admin API protected', async () => {
  const s = setup();
  const prevMode = config.paymentsMode;
  config.paymentsMode = 'demo';
  const server = createApp(s.db, { loginAttempts: 1000, registrations: 1000 }).listen(0);
  await new Promise((r) => server.once('listening', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const client = () => {
    let cookie = '';
    return async (method, path, body, { raw = false } = {}) => {
      const res = await fetch(base + path, { method, redirect: 'manual', headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}) }, body: body ? JSON.stringify(body) : undefined });
      for (const c of res.headers.getSetCookie?.() || []) {
        const [kv] = c.split(';');
        const jar = Object.fromEntries(cookie ? cookie.split('; ').map((x) => x.split('=')) : []);
        const [k, v] = kv.split('=');
        if (v) jar[k] = v; else delete jar[k];
        cookie = Object.entries(jar).map(([a, b]) => `${a}=${b}`).join('; ');
      }
      return raw ? res : { status: res.status, body: await res.json().catch(() => null) };
    };
  };
  const reg = (call, email, extra = {}) => call('POST', '/api/auth/register', { name: 'Teste Silva', email, password: 'segredo123', birthdate: '1990-05-10', acceptTerms: true, ...extra });
  try {
    const aff = client();
    assert.equal((await aff('GET', '/api/affiliates/me')).status, 401);
    await reg(aff, 'aff@example.com');
    const me = (await aff('GET', '/api/affiliates/me')).body;
    assert.match(me.referralCode, CODE_RE);
    assert.equal(me.referralUrl.endsWith(`/${me.referralCode}`), true);
    assert.equal(me.status, 'pending');
    // Activation needs a confirmed deposit; demo money only if counted.
    saveAffiliateConfig(s.db, { countDemoDeposits: true }, { actor: s.admin, reason: 'servidor de testes' });
    await aff('POST', '/api/wallet/deposit', { amount: 20, method: 'cartao' });
    const act = await aff('POST', '/api/affiliates/me/activate', {});
    assert.equal(act.body.status, 'active', JSON.stringify(act));

    // The link: counted, cookie kept, redirect to the site.
    const visitor = client();
    const res = await visitor('GET', `/${me.referralCode}`, null, { raw: true });
    assert.equal(res.status, 302);
    assert.equal(res.headers.get('location'), `/?ref=${me.referralCode}`);
    assert.notEqual((await visitor('GET', '/ABC12', null, { raw: true })).status, 302); // not a code: no redirect
    await reg(visitor, 'friend@example.com');
    const friendId = s.db.prepare("SELECT id FROM users WHERE email = 'friend@example.com'").get().id;
    assert.equal(s.db.prepare('SELECT affiliate_user_id FROM referral_attributions WHERE referred_user_id = ?').get(friendId).affiliate_user_id,
      s.db.prepare("SELECT id FROM users WHERE email = 'aff@example.com'").get().id);
    // A code in the body works too; a self code at registration is impossible (the account is new).
    const other = client();
    await reg(other, 'other@example.com', { ref: me.referralCode.toLowerCase() });
    await other('POST', '/api/wallet/deposit', { amount: 50, method: 'mbway', phone: '912345678' });
    await visitor('POST', '/api/wallet/deposit', { amount: 10, method: 'cartao' });
    await visitor('POST', '/api/wallet/deposit', { amount: 100, method: 'cartao' });

    const stats = (await aff('GET', '/api/affiliates/me/stats')).body;
    assert.deepEqual([stats.clicks, stats.referrals, stats.qualified], [1, 2, 2]);
    // Everyone here comes from 127.0.0.1, like the affiliate: kept for review, never blocked outright.
    assert.deepEqual([stats.commissions.pending.amount, stats.commissions.pending.count], ['6.00', 2]);
    const coms = (await aff('GET', '/api/affiliates/me/commissions')).body.items;
    assert.deepEqual(coms.map((c) => c.amount).sort(), ['1.00', '5.00']);
    assert.deepEqual((await aff('GET', '/api/affiliates/me/referrals')).body.items.map((r) => r.name), ['Teste S.', 'Teste S.']);
    assert.equal((await aff('POST', '/api/affiliates/track', { code: me.referralCode })).body.ok, true);

    // A player cannot reach the admin API.
    assert.equal((await aff('GET', '/api/admin/affiliates')).status, 403);
    assert.equal((await aff('POST', `/api/admin/affiliates/commissions/${coms[0].id}/payout`, {})).status, 403);
    assert.equal((await aff('PUT', '/api/admin/affiliates/config', { config: { rateBps: 5000 }, reason: 'quero mais' })).status, 403);
    assert.equal(affiliateConfig(s.db).rateBps, 1000);

    // The administrator: approve, pay, see the reconciliation; changing the config needs a reason.
    const adm = client();
    const login = await adm('POST', '/api/auth/login', { email: config.adminEmail || 'admin@classicbet.local', password: config.adminPassword || 'admin12345' });
    assert.equal(login.status, 200);
    {
      const id = coms.find((c) => c.amount === '5.00').id;
      assert.equal((await adm('POST', `/api/admin/affiliates/commissions/${id}/review`, { decision: 'approve', reason: '' })).body.commission.status, 'approved');
      assert.equal((await adm('POST', `/api/admin/affiliates/commissions/${id}/payout`, {})).body.commission.status, 'paid');
      const list = (await adm('GET', '/api/admin/affiliates')).body;
      assert.equal(list.reconciliation.ok, true);
      assert.equal(list.affiliates[0].paid, '5.00');
      assert.equal((await adm('PUT', '/api/admin/affiliates/config', { config: { rateBps: 500 } })).status, 400);
      assert.equal((await adm('PUT', '/api/admin/affiliates/config', { config: { rateBps: 500 }, reason: 'nova tabela' })).body.config.rateBps, 500);
      assert.ok((await adm('GET', '/api/admin/affiliates/audit')).body.items.some((a) => a.action === 'commission.pay'));
    }
  } finally {
    server.close();
    config.paymentsMode = prevMode;
  }
});
