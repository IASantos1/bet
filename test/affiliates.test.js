import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb, setSetting } from '../server/db.js';
import { seed } from '../server/seed.js';
import { createApp } from '../server/app.js';
import { config } from '../server/config.js';
import { saveAffiliateConfig, affiliateConfig, ensureProfile, attribute, onReferredDeposit } from '../server/affiliates.js';
import { previewRevshare, simulateRevshare, closeRevsharePeriod, approveRevsharePeriod, payRevsharePeriod, saveRevshareCost, reconcileRevshare } from '../server/affiliate-revshare.js';

function setup() {
  const db = openDb(':memory:');
  seed(db);
  const admin = db.prepare("SELECT id FROM users WHERE role = 'admin'").get().id;
  saveAffiliateConfig(db, { revshareMode: 'test', rateBps: 2000 }, { actor: admin, reason: 'ativar testes de Revenue Share' });
  let n = 0;
  const user = (name = null) => { n += 1; return Number(db.prepare(
    "INSERT INTO users (email,name,birthdate,password_hash,created_at) VALUES (?,?,'1990-01-01','x',?)"
  ).run(`revshare${n}@example.test`, name || `Jogador ${n}`, new Date().toISOString()).lastInsertRowid); };
  return { db, admin, user };
}

function addBet(db, userId, { stake, payout, status = 'lost', realStake = stake, realPayout = payout, bonus = 0, free = 0, at = '2026-03-15T12:00:00.000Z' }) {
  db.prepare(`INSERT INTO bets
    (user_id,type,stake_cents,total_odds,potential_cents,status,payout_cents,created_at,settled_at,
     real_stake_cents,bonus_stake_cents,freebet_stake_cents,real_payout_cents)
    VALUES (?,'single',?,2.0,? ,?,?,?, ?,?,?,?,?)`).run(
      userId, stake, payout, status, payout, at, at, realStake, bonus, free, realPayout);
}

function attributeForHistoricalRevshareTest(db, referredUserId, code) {
  const result = attribute(db, { referredUserId, code });
  db.prepare("UPDATE referral_attributions SET effective_from = '2026-01-01T00:00:00.000Z' WHERE referred_user_id = ?").run(referredUserId);
  return result;
}

function addCasinoMove(db, userId, txId, amount, spinsId = null, at = '2026-03-15T12:00:00.000Z') {
  db.prepare(`INSERT INTO casino_moves
    (transaction_id,user_id,spins_id,amount_cents,balance_after_cents,round_id,type,round_end,game,created_at)
    VALUES (?,?,?, ?,0,'round-1','bet',1,'Demo Slot',?)`).run(txId, userId, spinsId, amount, at);
}

test('Revenue Share começa desativado, 20% fixos e o primeiro depósito já não cria comissão', () => {
  const s = setup();
  assert.equal(affiliateConfig(s.db).enabled, false);
  assert.equal(affiliateConfig(s.db).rateBps, 2000);
  const affiliate = s.user('Afiliado');
  const code = ensureProfile(s.db, affiliate).referral_code;
  const referred = s.user('Convidado');
  assert.ok(attribute(s.db, { referredUserId: referred, code }));
  assert.equal(onReferredDeposit(s.db, { userId: referred, amountCents: 5000, txId: 1, ref: 'demo:1' }), null);
  assert.equal(s.db.prepare('SELECT COUNT(*) AS n FROM affiliate_commissions').get().n, 0);
});

test('simulação calcula GGR/NGR a 20%, exclui bónus, Free Spins e não credita carteiras', () => {
  const s = setup();
  const affiliate = s.user('Afiliado');
  const code = ensureProfile(s.db, affiliate).referral_code;
  const referred = s.user('Convidado');
  attributeForHistoricalRevshareTest(s.db, referred, code);
  addBet(s.db, referred, { stake: 10000, payout: 3000, status: 'won' });
  addBet(s.db, referred, { stake: 5000, payout: 2000, realStake: 3000, realPayout: 1200, bonus: 2000, status: 'won' });
  addBet(s.db, referred, { stake: 9000, payout: 9000, status: 'void' });
  addCasinoMove(s.db, referred, 'casino-real-bet', -5000);
  addCasinoMove(s.db, referred, 'casino-real-win', 1000);
  addCasinoMove(s.db, referred, 'casino-free-spin-bet', -2000, 77);
  addCasinoMove(s.db, referred, 'casino-free-spin-win', 6000, 77);
  // An open round is not a settled casino result and must not count as a loss.
  s.db.prepare(`INSERT INTO casino_moves
    (transaction_id,user_id,spins_id,amount_cents,balance_after_cents,round_id,type,round_end,game,created_at)
    VALUES ('casino-open-round',?,NULL,-9000,0,'open-round','bet',0,'Demo Slot','2026-03-20T12:00:00.000Z')`).run(referred);
  // A round opened in February but closed in March belongs to the March settlement period.
  s.db.prepare(`INSERT INTO casino_moves
    (transaction_id,user_id,spins_id,amount_cents,balance_after_cents,round_id,type,round_end,game,created_at)
    VALUES ('casino-cross-month-bet',?,NULL,-4000,0,'cross-month','bet',0,'Demo Slot','2026-02-28T23:59:00.000Z')`).run(referred);
  s.db.prepare(`INSERT INTO casino_moves
    (transaction_id,user_id,spins_id,amount_cents,balance_after_cents,round_id,type,round_end,game,created_at)
    VALUES ('casino-cross-month-win',?,NULL,500,0,'cross-month','win',1,'Demo Slot','2026-03-01T00:01:00.000Z')`).run(referred);
  const before = s.db.prepare('SELECT balance_cents FROM users WHERE id = ?').get(affiliate).balance_cents;
  const report = simulateRevshare(s.db, { period: '2026-03', actor: s.admin });
  const row = report.rows.find((x) => x.affiliateUserId === affiliate);
  // Sports: €100 stake - €30 payout + €30 real stake - €12 real payout (real-money slice).
  // Casino: €50 stake - €10 payout, plus a €40/€5 round closed in March. Open rounds and Free Spins are excluded.
  assert.equal(row.ggr, 16300);
  assert.equal(row.ngr, 16300);
  assert.equal(row.commission, 3260);
  assert.equal(report.rateBps, 2000);
  assert.equal(s.db.prepare('SELECT balance_cents FROM users WHERE id = ?').get(affiliate).balance_cents, before);
  assert.equal(s.db.prepare('SELECT COUNT(*) AS n FROM transactions WHERE type = \'affiliate_commission\'').get().n, 0);
  assert.equal(s.db.prepare("SELECT status FROM affiliate_revshare_periods WHERE period='2026-03' AND mode='test'").get().status, 'simulated');
});

test('carryover negativo reduz a comissão do mês seguinte e a simulação é idempotente', () => {
  const s = setup();
  const affiliate = s.user('Afiliado');
  const code = ensureProfile(s.db, affiliate).referral_code;
  const referred = s.user('Convidado');
  attributeForHistoricalRevshareTest(s.db, referred, code);
  addBet(s.db, referred, { stake: 1000, payout: 6000, status: 'won', at: '2026-01-15T12:00:00.000Z' });
  const jan = simulateRevshare(s.db, { period: '2026-01', actor: s.admin });
  assert.equal(jan.rows.find((x) => x.affiliateUserId === affiliate).closingCarry, -5000);
  addBet(s.db, referred, { stake: 10000, payout: 0, status: 'lost', at: '2026-02-15T12:00:00.000Z' });
  const feb = simulateRevshare(s.db, { period: '2026-02', actor: s.admin });
  const row = feb.rows.find((x) => x.affiliateUserId === affiliate);
  assert.equal(row.openingCarry, -5000);
  assert.equal(row.ngr, 10000);
  assert.equal(row.commission, 1000); // (€100 - €50 carryover) × 20%
  simulateRevshare(s.db, { period: '2026-02', actor: s.admin });
  assert.equal(s.db.prepare("SELECT COUNT(*) AS n FROM affiliate_revshare_periods WHERE affiliate_user_id=? AND period='2026-02' AND mode='test'").get(affiliate).n, 1);
});

test('produção não pode ser ativada antes da validação', () => {
  const s = setup();
  assert.throws(() => saveAffiliateConfig(s.db, { revshareMode: 'live' }, { actor: s.admin, reason: 'tentar produção' }), /bloqueada/);
  assert.equal(affiliateConfig(s.db).revshareMode, 'test');
});

test('ajustes de custos são auditados e deduzidos do NGR antes dos 20%', () => {
  const s = setup();
  const affiliate = s.user('Afiliado');
  const code = ensureProfile(s.db, affiliate).referral_code;
  const referred = s.user('Convidado');
  attributeForHistoricalRevshareTest(s.db, referred, code);
  addBet(s.db, referred, { stake: 10000, payout: 0, status: 'lost' });
  saveRevshareCost(s.db, { affiliateUserId: affiliate, period: '2026-03', costCents: 2500, reason: 'custo contratual do fornecedor', actor: s.admin });
  const report = simulateRevshare(s.db, { period: '2026-03', actor: s.admin });
  const row = report.rows.find((x) => x.affiliateUserId === affiliate);
  assert.equal(row.ggr, 10000);
  assert.equal(row.ngr, 7500);
  assert.equal(row.commission, 1500);
  assert.ok(s.db.prepare("SELECT 1 FROM affiliate_audit WHERE action='revshare.cost.update' AND entity_id=?").get(String(affiliate)));
});

test('API administrativa disponibiliza simulação apenas em modo de teste e mantém produção bloqueada', async () => {
  const s = setup();
  const previous = config.paymentsMode;
  config.paymentsMode = 'demo';
  const server = createApp(s.db, { loginAttempts: 1000, registrations: 1000 }).listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  let cookie = '';
  const call = async (method, path, body) => {
    const response = await fetch(base + path, { method, headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}),
    }, body: body ? JSON.stringify(body) : undefined });
    const setCookies = response.headers.getSetCookie?.() || [];
    if (setCookies.length) cookie = setCookies.map((x) => x.split(';')[0]).join('; ');
    return { status: response.status, body: await response.json().catch(() => null) };
  };
  try {
    const login = await call('POST', '/api/auth/login', { email: config.adminEmail || 'admin@classicbet.local', password: config.adminPassword || 'admin12345' });
    assert.equal(login.status, 200);
    const configResponse = await call('GET', '/api/admin/affiliates');
    assert.equal(configResponse.body.config.revshareMode, 'test');
    const simulation = await call('POST', '/api/admin/affiliates/revshare/simulate', { period: '2026-03' });
    assert.equal(simulation.status, 200);
    assert.equal(simulation.body.mode, 'test');
    const production = await call('PUT', '/api/admin/affiliates/config', { config: { revshareMode: 'live' }, reason: 'ainda sem validação' });
    assert.equal(production.status, 409);
    assert.equal(affiliateConfig(s.db).revshareMode, 'test');
  } finally {
    server.close();
    config.paymentsMode = previous;
  }
});

test('Revenue Share usa o mês civil de Portugal e inclui rondas fechadas após a meia-noite local', () => {
  const s = setup();
  const affiliate = s.user('Afiliado');
  const code = ensureProfile(s.db, affiliate).referral_code;
  const referred = s.user('Convidado');
  attributeForHistoricalRevshareTest(s.db, referred, code);
  s.db.prepare(`INSERT INTO casino_moves
    (transaction_id,user_id,spins_id,amount_cents,balance_after_cents,round_id,type,round_end,game,created_at)
    VALUES ('lisbon-boundary-bet',?,NULL,-4000,0,'lisbon-boundary','bet',0,'Demo Slot','2026-03-31T23:30:00.000Z')`).run(referred);
  s.db.prepare(`INSERT INTO casino_moves
    (transaction_id,user_id,spins_id,amount_cents,balance_after_cents,round_id,type,round_end,game,created_at)
    VALUES ('lisbon-boundary-win',?,NULL,500,0,'lisbon-boundary','win',1,'Demo Slot','2026-03-31T23:40:00.000Z')`).run(referred);
  const report = simulateRevshare(s.db, { period: '2026-04', actor: s.admin });
  const row = report.rows.find((x) => x.affiliateUserId === affiliate);
  assert.equal(row.ggr, 3500);
  assert.equal(row.commission, 700);
});

test('período real exige aprovação manual e o pagamento é idempotente', () => {
  const s = setup();
  const affiliate = s.user('Afiliado');
  const code = ensureProfile(s.db, affiliate).referral_code;
  const referred = s.user('Convidado');
  attributeForHistoricalRevshareTest(s.db, referred, code);
  addBet(s.db, referred, { stake: 10000, payout: 0, status: 'lost', at: '2026-03-15T12:00:00.000Z' });
  setSetting(s.db, 'affiliate.config', { ...affiliateConfig(s.db), revshareMode: 'live' });
  const closed = closeRevsharePeriod(s.db, { period: '2026-03', actor: s.admin });
  assert.throws(() => saveRevshareCost(s.db, { affiliateUserId: affiliate, period: '2026-03', costCents: 100, reason: 'alterar após fecho', actor: s.admin }), /já foi fechado/);
  const period = s.db.prepare("SELECT * FROM affiliate_revshare_periods WHERE affiliate_user_id=? AND period='2026-03' AND mode='live'").get(affiliate);
  assert.equal(period.status, 'pending_approval');
  assert.equal(period.commission_cents, 2000);
  assert.throws(() => payRevsharePeriod(s.db, period.id, { actor: s.admin }), /aprovados/);
  approveRevsharePeriod(s.db, period.id, { actor: s.admin, reason: 'reconciliação confirmada' });
  const paid = payRevsharePeriod(s.db, period.id, { actor: s.admin });
  assert.equal(paid.status, 'paid');
  payRevsharePeriod(s.db, period.id, { actor: s.admin });
  assert.equal(s.db.prepare("SELECT balance_cents FROM users WHERE id=?").get(affiliate).balance_cents, 2000);
  assert.equal(s.db.prepare("SELECT COUNT(*) AS n FROM transactions WHERE ref=?").get(`affiliate-revshare:${period.id}`).n, 1);
  assert.equal(reconcileRevshare(s.db).ok, true);
  assert.equal(closed[0].status, 'pending_approval');
});


test('atribuição manual RevShare respeita a data efetiva e exclui atividade anterior', () => {
  const s = setup();
  const affiliate = s.user('Afiliado manual');
  const profile = ensureProfile(s.db, affiliate);
  const referred = s.user('Jogador associado manualmente');
  const assignedAt = '2026-11-22T12:00:00.000Z';
  const effectiveFrom = '2026-11-01T00:00:00.000Z';
  s.db.prepare(`INSERT INTO referral_attributions
    (affiliate_user_id, referred_user_id, referral_code, source, status, attributed_at, effective_from)
    VALUES (?, ?, ?, 'admin', 'pending', ?, ?)`).run(affiliate, referred, profile.referral_code, assignedAt, effectiveFrom);

  addBet(s.db, referred, { stake: 5000, payout: 0, at: '2026-10-31T23:59:00.000Z' });
  addBet(s.db, referred, { stake: 1200, payout: 0, at: '2026-11-01T00:01:00.000Z' });
  addCasinoMove(s.db, referred, 'manual-before-date', -3000, null, '2026-10-31T23:59:00.000Z');
  addCasinoMove(s.db, referred, 'manual-after-date', -700, null, '2026-11-01T00:02:00.000Z');

  const report = previewRevshare(s.db, { period: '2026-11', mode: 'test' });
  const row = report.rows.find((x) => x.affiliateUserId === affiliate);
  assert.equal(row.sportsStake, 1200);
  assert.equal(row.sportsPayout, 0);
  assert.equal(row.casinoStake, 700);
  assert.equal(row.casinoPayout, 0);
  assert.equal(row.referredPlayers, 1);
});
