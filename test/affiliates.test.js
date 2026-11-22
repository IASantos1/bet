import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../server/db.js';
import { seed } from '../server/seed.js';
import { saveAffiliateConfig, affiliateConfig, ensureProfile, attribute, onReferredDeposit } from '../server/affiliates.js';
import { previewRevshare, simulateRevshare } from '../server/affiliate-revshare.js';

function setup() {
  const db = openDb(':memory:');
  seed(db);
  const admin = db.prepare("SELECT id FROM users WHERE role = 'admin'").get().id;
  saveAffiliateConfig(db, { revshareMode: 'test', rateBps: 2000 }, { actor: admin, reason: 'ativar testes de Revenue Share' });
  let n = 0;
  const user = (name = `Jogador ${++n}`) => Number(db.prepare(
    "INSERT INTO users (email,name,birthdate,password_hash,created_at) VALUES (?,?,'1990-01-01','x',?)"
  ).run(`revshare${n}@example.test`, name, new Date().toISOString()).lastInsertRowid);
  return { db, admin, user };
}

function addBet(db, userId, { stake, payout, status = 'lost', realStake = stake, realPayout = payout, bonus = 0, free = 0, at = '2026-03-15T12:00:00.000Z' }) {
  db.prepare(`INSERT INTO bets
    (user_id,type,stake_cents,total_odds,potential_cents,status,payout_cents,created_at,settled_at,
     real_stake_cents,bonus_stake_cents,freebet_stake_cents,real_payout_cents)
    VALUES (?,'single',?,2.0,? ,?,?,?, ?,?,?,?,?)`).run(
      userId, stake, payout, status, payout, at, at, realStake, bonus, free, realPayout);
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
  attribute(s.db, { referredUserId: referred, code });
  addBet(s.db, referred, { stake: 10000, payout: 3000, status: 'lost' });
  addBet(s.db, referred, { stake: 5000, payout: 2000, realStake: 3000, realPayout: 1200, bonus: 2000, status: 'won' });
  addBet(s.db, referred, { stake: 9000, payout: 9000, status: 'void' });
  addCasinoMove(s.db, referred, 'casino-real-bet', -5000);
  addCasinoMove(s.db, referred, 'casino-real-win', 1000);
  addCasinoMove(s.db, referred, 'casino-free-spin-bet', -2000, 77);
  addCasinoMove(s.db, referred, 'casino-free-spin-win', 6000, 77);
  const before = s.db.prepare('SELECT balance_cents FROM users WHERE id = ?').get(affiliate).balance_cents;
  const report = simulateRevshare(s.db, { period: '2026-03', actor: s.admin });
  const row = report.rows.find((x) => x.affiliateUserId === affiliate);
  // Sports: €100 stake - €30 payout + €30 real stake - €12 real payout (real-money slice).
  // Casino: €50 stake - €10 payout. Free Spins and void tickets do not count.
  assert.equal(row.ggr, 12800);
  assert.equal(row.ngr, 12800);
  assert.equal(row.commission, 2560);
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
  attribute(s.db, { referredUserId: referred, code });
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
