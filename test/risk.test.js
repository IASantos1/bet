// Risk management: player profiles, liability ceilings per selection and per game, alerts.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb, nowIso, tx } from '../server/db.js';
import { placeBets, settleEvent } from '../server/betting.js';
import { postTransaction } from '../server/wallet.js';
import { saveRiskConfig, setRiskProfile, riskAlerts, exposure, logRefusal, riskOverview } from '../server/risk.js';

function setup() {
  const db = openDb(':memory:');
  const user = (email) => {
    const id = Number(db.prepare("INSERT INTO users (email, name, birthdate, password_hash, created_at) VALUES (?, 'P', '1990-01-01', 'x', ?)").run(email, nowIso()).lastInsertRowid);
    tx(db, () => postTransaction(db, id, 500_000, 'deposit', `d${id}`));
    return id;
  };
  const ev = Number(db.prepare(`INSERT INTO events (sport, competition, home, away, start_time, status, created_at, updated_at)
    VALUES ('futebol', 'Liga', 'A', 'B', ?, 'scheduled', ?, ?)`).run(new Date(Date.now() + 3600_000).toISOString(), nowIso(), nowIso()).lastInsertRowid);
  const sel = (code, odds) => Number(db.prepare("INSERT INTO selections (event_id, market, code, odds_x100) VALUES (?, '1x2', ?, ?)").run(ev, code, odds).lastInsertRowid);
  const s1 = sel('1', 300);
  const s2 = sel('2', 300);
  // As the route does: the bet in a transaction, a risk refusal kept after it rolls back.
  const bet = (u, selectionId, stakeCents) => {
    try { return tx(db, () => placeBets(db, { id: u }, { mode: 'single', stakeCents, picks: [{ selectionId, odds: 3 }] })); }
    catch (err) { logRefusal(db, u, err); throw err; }
  };
  return { db, user, ev, s1, s2, bet };
}

test('liability per selection: a bet that would pass the ceiling is refused with the most still accepted', () => {
  const t = setup();
  tx(t.db, () => saveRiskConfig(t.db, { selectionLiability: 1000, eventLiability: 5000 }));
  const a = t.user('a@x');
  t.bet(a, t.s1, 30_000); // €300 at 3.00: €600 to lose
  assert.throws(() => t.bet(a, t.s1, 30_000), /aposta máxima aceite €200,00/); // €400 left → €200 at 3.00
  t.bet(a, t.s1, 20_000);
  assert.throws(() => t.bet(a, t.s1, 100), /atingiu o limite/);
  // The other side of the game is still open, up to the game's ceiling (€5 000).
  t.bet(a, t.s2, 50_000);
  const [e] = exposure(t.db);
  assert.deepEqual([e.bets, e.liability, e.pct], [3, 2000, 40]);
  assert.equal(riskOverview(t.db).events.filter((x) => x.kind === 'liability').length, 2); // kept though the bets rolled back
});

test('liability per game across its selections', () => {
  const t = setup();
  tx(t.db, () => saveRiskConfig(t.db, { selectionLiability: 10_000, eventLiability: 1000 }));
  const a = t.user('a@x');
  t.bet(a, t.s1, 40_000); // €800
  assert.throws(() => t.bet(a, t.s2, 20_000), /aposta máxima aceite €100,00/);
});

test('profiles: limited players get a fraction of the maximum stake, blocked ones none; changes are logged', () => {
  const t = setup();
  const a = t.user('a@x');
  tx(t.db, () => setRiskProfile(t.db, a, 'limited', { note: 'apostador profissional', adminId: 1 }));
  assert.throws(() => t.bet(a, t.s1, 30_000), /Aposta máxima aceite: €250,00/); // €1 000 × 0.25
  t.bet(a, t.s1, 25_000);
  tx(t.db, () => setRiskProfile(t.db, a, 'blocked'));
  assert.throws(() => t.bet(a, t.s1, 100), /não é possível aceitar apostas/);
  tx(t.db, () => setRiskProfile(t.db, a, 'vip'));
  t.bet(a, t.s2, 150_000); // €1 500: above the normal €1 000
  assert.throws(() => setRiskProfile(t.db, a, 'xyz'), /inválido/);
  const o = riskOverview(t.db);
  assert.deepEqual(o.profiled.map((u) => u.profile), ['vip']);
  assert.ok(o.events.some((e) => e.kind === 'profile' && /Normal → Limitado · apostador profissional/.test(e.detail)));
});

test('alerts: a player winning a lot, a withdrawal barely played, limits hit often', () => {
  const t = setup();
  tx(t.db, () => saveRiskConfig(t.db, { alertMinBets: 2, alertProfit: 100, alertRoiPct: 25, alertRefusals: 2, selectionLiability: 100_000, eventLiability: 100_000 }));
  const sharp = t.user('sharp@x');
  t.bet(sharp, t.s1, 10_000);
  t.bet(sharp, t.s1, 10_000);
  t.db.prepare("UPDATE events SET status = 'finished', home_score = 1, away_score = 0 WHERE id = ?").run(t.ev);
  tx(t.db, () => settleEvent(t.db, t.ev));
  const quick = t.user('quick@x');
  t.db.prepare("INSERT INTO withdrawals (user_id, amount_cents, iban, created_at) VALUES (?, 400000, 'PT50', ?)").run(quick, nowIso());
  const alerts = riskAlerts(t.db);

  assert.match(alerts.find((x) => x.userId === sharp).reasons[0], /Lucro €400,00 em 2 apostas \(retorno 200 %\)/);
  assert.match(alerts.find((x) => x.userId === quick).reasons[0], /Levantamento de €4000,00 com apostas de €0,00 para depósitos de €5000,00/);
  const busy = t.user('busy@x');
  tx(t.db, () => setRiskProfile(t.db, busy, 'restricted'));
  const open = Number(t.db.prepare(`INSERT INTO events (sport, competition, home, away, start_time, status, created_at, updated_at)
    VALUES ('futebol', 'Liga', 'C', 'D', ?, 'scheduled', ?, ?)`).run(new Date(Date.now() + 3600_000).toISOString(), nowIso(), nowIso()).lastInsertRowid);
  const s3 = Number(t.db.prepare("INSERT INTO selections (event_id, market, code, odds_x100) VALUES (?, '1x2', '1', 300)").run(open).lastInsertRowid);
  for (let i = 0; i < 2; i += 1) assert.throws(() => t.bet(busy, s3, 10_000), /Aposta máxima aceite: €50,00/);
  assert.match(riskAlerts(t.db).find((x) => x.userId === busy).reasons.at(-1), /2 apostas recusadas por limite/);
});

test('anti money laundering: deposits over the total need the identity verified; deposit and IBAN alerts', async () => {
  const { checkKycDeposit } = await import('../server/risk.js');
  const t = setup();
  tx(t.db, () => saveRiskConfig(t.db, { kycDeposit: 6000, alertBigDeposit: 4000, alertDeposits24h: 3 }));
  const a = t.user('a@x'); // €5 000 deposited
  checkKycDeposit(t.db, { id: a }, 100_000);
  assert.throws(() => checkKycDeposit(t.db, { id: a }, 100_100), /exigem a verificação da identidade.*no máximo €1000,00/);
  t.db.prepare("UPDATE users SET kyc_status = 'pending' WHERE id = ?").run(a);
  assert.throws(() => checkKycDeposit(t.db, { id: a }, 200_000), /em análise/);
  t.db.prepare("UPDATE users SET kyc_status = 'approved' WHERE id = ?").run(a);
  checkKycDeposit(t.db, { id: a }, 900_000);
  tx(t.db, () => saveRiskConfig(t.db, { kycDeposit: 0 }));
  const b = t.user('b@x');
  checkKycDeposit(t.db, { id: b }, 900_000); // off
  // Many deposits in a day, one big one, the same IBAN on two accounts.
  for (let i = 0; i < 2; i += 1) tx(t.db, () => postTransaction(t.db, b, 1000, 'deposit', `x${i}`));
  for (const u of [a, b]) t.db.prepare("INSERT INTO withdrawals (user_id, amount_cents, iban, status, created_at) VALUES (?, 1000, 'PT50 0002 0123', 'approved', ?)").run(u, nowIso());
  const why = (u) => riskAlerts(t.db).find((x) => x.userId === u).reasons.join(' | ');
  assert.match(why(b), /3 depósitos em 24 h/);
  assert.match(why(b), /depósito\(s\) de €4000,00 ou mais \(maior €5000,00\)/);
  assert.match(why(a), new RegExp(`IBAN PT50…0123 usado por 2 contas \\(#${a}, #${b}\\)`));
});
