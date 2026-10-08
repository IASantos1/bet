import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb, nowIso, tx } from '../server/db.js';
import { seed } from '../server/seed.js';
import { createApp } from '../server/app.js';
import { placeBets, settleEvent } from '../server/betting.js';
import { postTransaction } from '../server/wallet.js';
import {
  onDeposit, savePromoConfig, expireDue, runCashback, onChargeback, weekOf, bonusBalanceCents, freebetCents, playerPromos,
} from '../server/promotions.js';
import { setLimits, currentLimits, checkBet } from '../server/limits.js';

let seq = 0;
function setup() {
  const db = openDb(':memory:');
  return db;
}
function player(db, extra = {}) {
  seq += 1;
  const id = Number(db.prepare(`INSERT INTO users (email, name, birthdate, password_hash, created_at, phone) VALUES (?, 'Ana', '1990-01-01', 'x', ?, ?)`)
    .run(`p${seq}@ex.com`, nowIso(), extra.phone ?? null).lastInsertRowid);
  return id;
}
const user = (db, id) => db.prepare('SELECT * FROM users WHERE id = ?').get(id);
/** A real deposit credited, then the promotion decision (as the payment providers do). */
function deposit(db, userId, euros, { ref = `t${++seq}`, optIn = true } = {}) {
  return tx(db, () => {
    postTransaction(db, userId, euros * 100, 'deposit', 'Depósito');
    return onDeposit(db, { userId, amountCents: euros * 100, ref, method: 'mbway', optIn });
  });
}
function match(db, odds = 200) {
  const id = Number(db.prepare(`INSERT INTO events (sport, competition, home, away, start_time, status, created_at, updated_at)
    VALUES ('futebol', 'Liga', 'A', 'B', ?, 'scheduled', ?, ?)`).run(new Date(Date.now() + 3600_000).toISOString(), nowIso(), nowIso()).lastInsertRowid);
  const sel = (code, o) => Number(db.prepare("INSERT INTO selections (event_id, market, code, odds_x100) VALUES (?, '1x2', ?, ?)").run(id, code, o).lastInsertRowid);
  return { id, home: sel('1', odds), draw: sel('X', 300), away: sel('2', 400), odds };
}
function bet(db, userId, m, stakeEuros, { pick = 'home', freebetId = null } = {}) {
  const odds = pick === 'home' ? m.odds : pick === 'draw' ? 300 : 400;
  const [id] = tx(db, () => placeBets(db, user(db, userId), { mode: 'single', stakeCents: Math.round(stakeEuros * 100), picks: [{ selectionId: m[pick], odds: odds / 100 }], freebetId }));
  return db.prepare('SELECT * FROM bets WHERE id = ?').get(id);
}
function finish(db, m, home, away) {
  tx(db, () => {
    db.prepare("UPDATE events SET status = 'finished', home_score = ?, away_score = ? WHERE id = ?").run(home, away, m.id);
    settleEvent(db, m.id);
  });
}
const bonus = (db, userId) => db.prepare('SELECT * FROM bonuses WHERE user_id = ? ORDER BY id DESC LIMIT 1').get(userId);
const balance = (db, userId) => user(db, userId).balance_cents;

test('welcome: 100% up to €100, once per deposit, rollover 5× (deposit + bonus), €5 / 10% counted per bet', () => {
  const db = setup();
  const u = player(db);
  const b = deposit(db, u, 50, { ref: 'pi_1' });
  assert.equal(b.kind, 'welcome');
  assert.equal(b.amount_cents, 5000);
  assert.equal(b.rollover_target_cents, 50000);
  assert.equal(b.max_count_cents, 500);
  assert.equal(b.min_odds_x100, 150);
  // The same deposit processed again: nothing more.
  assert.equal(tx(db, () => onDeposit(db, { userId: u, amountCents: 5000, ref: 'pi_1', method: 'mbway' })), null);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM bonuses').get().n, 1);
  // The bonus is never in the real (withdrawable) balance.
  assert.equal(balance(db, u), 5000);
  assert.equal(bonusBalanceCents(db, u), 5000);
  // A €300 deposit: capped at €100.
  const v = player(db);
  assert.equal(deposit(db, v, 300).amount_cents, 10000);
});

test('welcome: not below €10, then on the first eligible deposit only; declined = nothing; one deposit promotion at a time', () => {
  const db = setup();
  const u = player(db);
  assert.equal(deposit(db, u, 5), null);
  assert.equal(deposit(db, u, 20).kind, 'welcome');
  // With the welcome running, no reload.
  assert.equal(deposit(db, u, 40), null);
  assert.match(db.prepare('SELECT reason FROM promo_log WHERE user_id = ? ORDER BY id DESC').get(u).reason, /ativa/);
  // Declined on the first eligible deposit: the welcome is gone; later deposits get the reload.
  const v = player(db);
  assert.equal(deposit(db, v, 20, { optIn: false }), null);
  assert.equal(deposit(db, v, 40).kind, 'reload');
  // A player who deposited before promotions existed: no welcome.
  const w = player(db);
  tx(db, () => postTransaction(db, w, 3000, 'deposit', 'antigo'));
  assert.equal(deposit(db, w, 40).kind, 'reload');
});

test('reload: 25% up to €25 from €20, once a week, after the welcome', () => {
  const db = setup();
  const u = player(db);
  const w = deposit(db, u, 10);
  tx(db, () => db.prepare("UPDATE bonuses SET status = 'completed' WHERE id = ?").run(w.id));
  assert.equal(deposit(db, u, 15), null); // below €20
  const r = deposit(db, u, 200);
  assert.equal(r.kind, 'reload');
  assert.equal(r.amount_cents, 2500);
  assert.equal(r.period, weekOf(Date.now()).key);
  tx(db, () => db.prepare("UPDATE bonuses SET status = 'completed' WHERE id = ?").run(r.id));
  assert.equal(deposit(db, u, 50), null); // already used this week
});

test('bets: real money first, bonus for the rest; winnings back in the same shares; rollover counts at most €5 and only at odds ≥ 1.50', () => {
  const db = setup();
  seed(db);
  const u = player(db);
  deposit(db, u, 50); // real 50, bonus 50
  const m = match(db, 200);
  const b = bet(db, u, m, 80);
  assert.equal(b.real_stake_cents, 5000);
  assert.equal(b.bonus_stake_cents, 3000);
  assert.equal(balance(db, u), 0);
  assert.equal(bonusBalanceCents(db, u), 2000);
  finish(db, m, 2, 0); // 80 × 2 = 160: 100 real, 60 bonus
  assert.equal(balance(db, u), 10000);
  assert.equal(bonusBalanceCents(db, u), 8000);
  assert.equal(bonus(db, u).rollover_progress_cents, 500); // capped at €5
  // Odds below 1.50: no rollover.
  const low = match(db, 140);
  bet(db, u, low, 10);
  finish(db, low, 0, 1);
  assert.equal(bonus(db, u).rollover_progress_cents, 500);
  // A void bet does not count either.
  const v = match(db, 200);
  bet(db, u, v, 10);
  tx(db, () => { db.prepare("UPDATE events SET status = 'cancelled' WHERE id = ?").run(v.id); settleEvent(db, v.id); });
  assert.equal(bonus(db, u).rollover_progress_cents, 500);
});

test('rollover met: the bonus left becomes real money (bonus_convert)', () => {
  const db = setup();
  const u = player(db);
  deposit(db, u, 10); // bonus 10, target 100, cap 1 (10% of the bonus)
  tx(db, () => db.prepare('UPDATE bonuses SET rollover_target_cents = 300, max_count_cents = NULL').run());
  const m = match(db, 200);
  bet(db, u, m, 3); // real
  finish(db, m, 0, 1);
  const b = bonus(db, u);
  assert.equal(b.status, 'completed');
  assert.equal(b.balance_cents, 0);
  assert.equal(balance(db, u), 700 + 1000);
  assert.ok(db.prepare("SELECT 1 FROM transactions WHERE user_id = ? AND type = 'bonus_convert'").get(u));
});

test('expiry: status EXPIRED, only the promotional money removed', () => {
  const db = setup();
  const u = player(db);
  deposit(db, u, 20);
  tx(db, () => expireDue(db, new Date(Date.now() + 31 * 86_400_000).toISOString()));
  assert.equal(bonus(db, u).status, 'expired');
  assert.equal(bonusBalanceCents(db, u), 0);
  assert.equal(balance(db, u), 2000);
  assert.ok(db.prepare("SELECT 1 FROM promo_ledger WHERE user_id = ? AND type = 'bonus_expiry'").get(u));
});

test('first bet protection: the first real bet ≥ €5 at ≥ 1.50 lost → free bet up to €10 (7 days), once; a free bet pays only its winnings', () => {
  const db = setup();
  const u = player(db);
  tx(db, () => postTransaction(db, u, 5000, 'deposit', 'x'));
  const small = match(db, 200);
  assert.equal(bet(db, u, small, 2).protected, 0); // below €5
  const m = match(db, 160);
  const first = bet(db, u, m, 20);
  assert.equal(first.protected, 1);
  finish(db, m, 0, 1); // lost
  assert.equal(freebetCents(db, u), 1000); // capped at €10
  const again = match(db, 200);
  assert.equal(bet(db, u, again, 10).protected, 0);
  // The free bet: the stake is the token's (whatever the page sends) and is not paid back.
  const f = db.prepare('SELECT * FROM freebets WHERE user_id = ?').get(u);
  assert.ok(Date.parse(f.expires_at) - Date.now() > 6.9 * 86_400_000);
  const before = balance(db, u);
  const fm = match(db, 300);
  const fb = bet(db, u, fm, 999, { freebetId: f.id });
  assert.equal(fb.stake_cents, 1000);
  assert.equal(fb.freebet_stake_cents, 1000);
  assert.equal(balance(db, u), before); // nothing paid
  finish(db, fm, 1, 0); // 10 × 3 = 30 → 20 net
  assert.equal(balance(db, u), before + 2000);
  assert.equal(db.prepare('SELECT status FROM freebets WHERE id = ?').get(f.id).status, 'used');
  // Used: cannot be used again.
  assert.throws(() => bet(db, u, match(db, 200), 10, { freebetId: f.id }), /free bet/i);
});

test('cashback: 5% of last week\'s real net loss (≥ €20), up to €25, once a week, as a bonus with 3× rollover', () => {
  const db = setup();
  const u = player(db);
  const lastWeek = weekOf(Date.parse(weekOf(Date.now()).start) - 1);
  const at = new Date(Date.parse(lastWeek.start) + 86_400_000).toISOString();
  const add = (stake, payout, status) => db.prepare(`INSERT INTO bets (user_id, type, stake_cents, total_odds, potential_cents, status, payout_cents, created_at, settled_at, real_stake_cents, real_payout_cents)
    VALUES (?, 'single', ?, 2, ?, ?, ?, ?, ?, ?, ?)`).run(u, stake, stake * 2, status, payout, at, at, stake, payout);
  add(30000, 0, 'lost'); add(20000, 0, 'lost'); add(10000, 15000, 'won'); // loss 450 → 5% = 22.50
  db.prepare(`INSERT INTO bets (user_id, type, stake_cents, total_odds, potential_cents, status, payout_cents, created_at, settled_at, freebet_stake_cents)
    VALUES (?, 'single', 5000, 2, 10000, 'lost', 0, ?, ?, 5000)`).run(u, at, at); // a free bet: left out
  assert.equal(tx(db, () => runCashback(db)), 1);
  const b = bonus(db, u);
  assert.equal(b.kind, 'cashback');
  assert.equal(b.amount_cents, 2250);
  assert.equal(b.rollover_target_cents, 6750);
  assert.equal(tx(db, () => runCashback(db)), 0); // once
  // Below €20 of loss: nothing.
  const v = player(db);
  db.prepare(`INSERT INTO bets (user_id, type, stake_cents, total_odds, potential_cents, status, payout_cents, created_at, settled_at, real_stake_cents, real_payout_cents)
    VALUES (?, 'single', 1500, 2, 3000, 'lost', 0, ?, ?, 1500, 0)`).run(v, at, at);
  tx(db, () => runCashback(db));
  assert.equal(bonus(db, v), undefined);
});

test('chargeback: deposit taken back, promotions cancelled with the reason, player blocked from new ones', () => {
  const db = setup();
  const u = player(db);
  deposit(db, u, 50, { ref: 'pi_x' });
  assert.ok(tx(db, () => onChargeback(db, { userId: u, amountCents: 5000, ref: 'pi_x' })));
  assert.equal(tx(db, () => onChargeback(db, { userId: u, amountCents: 5000, ref: 'pi_x' })), false); // once
  assert.equal(balance(db, u), 0);
  const b = bonus(db, u);
  assert.equal(b.status, 'cancelled');
  assert.equal(b.cancel_reason, 'chargeback');
  assert.equal(user(db, u).promo_blocked, 1);
  assert.equal(deposit(db, u, 50), null);
});

test('no promotion for a duplicate account (same phone) or when the campaign is inactive', () => {
  const db = setup();
  player(db, { phone: '+351 912 345 678' });
  const dup = player(db, { phone: '912345678' });
  assert.equal(deposit(db, dup, 50), null);
  assert.match(db.prepare('SELECT reason FROM promo_log WHERE user_id = ?').get(dup).reason, /duplicada/);
  savePromoConfig(db, { welcome: { active: false } });
  const u = player(db);
  assert.equal(deposit(db, u, 50), null);
  assert.throws(() => savePromoConfig(db, { welcome: { percent: 0 } }), /inválido/);
});

test('limits: stricter at once, looser after 24 h; stake and weekly loss enforced', () => {
  const db = setup();
  const u = player(db);
  tx(db, () => postTransaction(db, u, 10000, 'deposit', 'x'));
  setLimits(db, user(db, u), { betMax: 20, lossWeek: 30 });
  assert.equal(currentLimits(db, user(db, u)).betMax, 2000);
  assert.throws(() => bet(db, u, match(db, 200), 25), /aposta máxima/);
  bet(db, u, match(db, 200), 20);
  assert.throws(() => bet(db, u, match(db, 200), 15), /perda semanal/);
  // Raising it waits a day.
  const l = setLimits(db, user(db, u), { betMax: 100 });
  assert.equal(l.betMax, 2000);
  assert.equal(l.pending.betMax.value, 10000);
  assert.equal(currentLimits(db, user(db, u), Date.now() + 25 * 3600_000).betMax, 10000);
  assert.doesNotThrow(() => checkBet(db, user(db, u), { stakeCents: 5000, realCents: 0 }));
});

test('API: deposit offer, withdrawal with an active bonus asks first, self-exclusion cancels promotions, admin config', async () => {
  const db = openDb(':memory:');
  seed(db);
  const server = createApp(db, { loginAttempts: 1000, registrations: 1000 }).listen(0);
  await new Promise((r) => server.once('listening', r));
  let cookie = '';
  const call = async (method, path, body, ck = cookie) => {
    const res = await fetch(`http://127.0.0.1:${server.address().port}${path}`, { method, headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(ck ? { Cookie: ck } : {}) }, body: body ? JSON.stringify(body) : undefined });
    const set = res.headers.get('set-cookie');
    if (set && ck === cookie) cookie = set.split(';')[0];
    return { status: res.status, body: await res.json() };
  };
  try {
    assert.equal((await call('POST', '/api/auth/register', { name: 'Rui Sousa', email: 'rui@example.com', password: 'segredo123', birthdate: '1990-05-10', acceptTerms: true })).status, 201);
    const offer = await call('GET', '/api/promotions/offer?amount=40');
    assert.equal(offer.body.campaign, 'welcome');
    assert.equal(offer.body.bonus, 40);
    const d = await call('POST', '/api/wallet/deposit', { amount: 40, method: 'mbway' });
    assert.equal(d.status, 201);
    assert.equal(d.body.user.bonus, 40);
    assert.equal(d.body.user.balance, 40);
    const mine = await call('GET', '/api/promotions');
    assert.equal(mine.body.mine.active[0].rolloverTarget, 400);
    assert.equal(mine.body.campaigns.length, 5);
    // Withdrawal: asked first (409), then the bonus is cancelled and the real money withdrawn.
    const w = await call('POST', '/api/wallet/withdraw', { amount: 20, iban: 'PT50000201231234567890154' });
    assert.equal(w.status, 409);
    assert.equal(w.body.bonusActive, true);
    assert.equal((await call('POST', '/api/wallet/withdraw', { amount: 20, iban: 'PT50000201231234567890154', forfeitBonus: true })).status, 201);
    assert.equal((await call('GET', '/api/me')).body.user.bonus, 0);
    // Limits through the API.
    const lim = await call('PUT', '/api/me/limits', { depositDay: 50 });
    assert.equal(lim.body.limits.depositDay, 50);
    assert.equal((await call('POST', '/api/wallet/deposit', { amount: 20, method: 'mbway' })).status, 403); // 40 + 20 > 50
    // Admin: the configuration is the server's; players cannot reach it.
    assert.equal((await call('PUT', '/api/admin/promotions/config', { welcome: { percent: 50 } })).status, 403);
    const admin = '';
    const login = await fetch(`http://127.0.0.1:${server.address().port}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'admin@classicbet.local', password: 'admin12345' }) });
    const ac = login.headers.get('set-cookie').split(';')[0] || admin;
    const saved = await call('PUT', '/api/admin/promotions/config', { welcome: { percent: 50, maxBonus: 80 }, cashback: { active: false } }, ac);
    assert.equal(saved.status, 200, JSON.stringify(saved.body));
    assert.equal(saved.body.config.welcome.percent, 50);
    const list = await call('GET', '/api/admin/promotions', undefined, ac);
    assert.equal(list.body.bonuses[0].status, 'cancelled');
    assert.match(list.body.bonuses[0].cancelReason, /levantamento/);
    // Self-exclusion ends promotions.
    tx(db, () => db.prepare("INSERT INTO freebets (user_id, amount_cents, source, ref, expires_at, created_at) SELECT id, 500, 'admin', 'x1', ?, ? FROM users WHERE email = 'rui@example.com'")
      .run(new Date(Date.now() + 86_400_000).toISOString(), nowIso()));
    assert.equal((await call('POST', '/api/me/self-exclusion', { days: 3 })).status, 200);
    assert.equal(playerPromos(db, db.prepare("SELECT id FROM users WHERE email = 'rui@example.com'").get().id).freebetBalance, 0);
  } finally {
    server.close();
    db.close();
  }
});
