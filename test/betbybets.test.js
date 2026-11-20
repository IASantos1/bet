import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb, nowIso } from '../server/db.js';
import { createBetbyBets } from '../server/betbybets.js';

function setup() {
  const db = openDb(':memory:');
  const userId = Number(db.prepare(
    "INSERT INTO users (email, name, birthdate, password_hash, balance_cents, created_at) VALUES ('p@x.pt','P','1990-01-01','x',10000,?)"
  ).run(nowIso()).lastInsertRowid);
  const mkEvent = (status = 'scheduled') => {
    const ts = nowIso();
    return Number(db.prepare(
      `INSERT INTO events (sport, competition, home, away, start_time, status, source, created_at, updated_at)
       VALUES ('futebol','Liga','Benfica','Porto',?,?,'manual',?,?)`
    ).run(ts, status, ts, ts).lastInsertRowid);
  };
  const user = () => db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  const balance = () => user().balance_cents;
  return { db, userId, user, balance, mkEvent };
}

// A GOAL API stub: matchReport returns the given players (or null for "no data").
const goalApiWith = (players) => ({ enabled: true, matchReport: async () => (players ? { home: {}, away: {}, players } : null) });

test('place debits the wallet and records the bet', () => {
  const { db, user, balance, mkEvent } = setup();
  const bets = createBetbyBets(db, { goalApi: goalApiWith([]), betby: null });
  const ev = mkEvent();
  const id = bets.place(user(), { eventId: ev, marketKind: 'anytime_scorer', marketName: 'Marcador', player: 'Di María', side: 'home', odds: 8, stakeCents: 500 });
  assert.equal(balance(), 9500); // 10000 - 500 stake
  assert.equal(db.prepare('SELECT status, odds_x100 FROM betby_bets WHERE id = ?').get(id).odds_x100, 800);
});

test('settles a winning scorer bet and pays stake*odds', async () => {
  const { db, user, balance, mkEvent } = setup();
  const bets = createBetbyBets(db, { goalApi: goalApiWith([{ id: 'p1', name: 'Di María', team: 'home', goals: 1, assists: 0, yellow: 0, red: 0 }]), betby: null });
  const ev = mkEvent();
  const id = bets.place(user(), { eventId: ev, marketKind: 'anytime_scorer', player: 'Di María', side: 'home', odds: 8, stakeCents: 500 });
  db.prepare("UPDATE events SET status = 'finished' WHERE id = ?").run(ev);
  await bets.settleOpen();
  assert.equal(db.prepare('SELECT status FROM betby_bets WHERE id = ?').get(id).status, 'won');
  assert.equal(balance(), 9500 + 4000); // payout 500 * 8.00
});

test('settles a losing bet: no payout', async () => {
  const { db, user, balance, mkEvent } = setup();
  const bets = createBetbyBets(db, { goalApi: goalApiWith([{ id: 'p2', name: 'Otamendi', team: 'home', goals: 0, assists: 0, yellow: 0, red: 0 }]), betby: null });
  const ev = mkEvent();
  bets.place(user(), { eventId: ev, marketKind: 'anytime_scorer', player: 'Di María', side: 'home', odds: 8, stakeCents: 500 });
  db.prepare("UPDATE events SET status = 'finished' WHERE id = ?").run(ev);
  await bets.settleOpen();
  assert.equal(balance(), 9500); // stake kept, no payout
  assert.equal(db.prepare("SELECT status FROM betby_bets").get().status, 'lost');
});

test('no GOAL data after the grace -> void and refund', async () => {
  const { db, user, balance, mkEvent } = setup();
  const bets = createBetbyBets(db, { goalApi: goalApiWith(null), betby: null });
  const ev = mkEvent();
  bets.place(user(), { eventId: ev, marketKind: 'anytime_scorer', player: 'Di María', side: 'home', odds: 8, stakeCents: 500 });
  // Finished 4 h ago (past the 3 h grace).
  const old = new Date(Date.now() - 4 * 3600_000).toISOString();
  db.prepare("UPDATE events SET status = 'finished', updated_at = ? WHERE id = ?").run(old, ev);
  await bets.settleOpen();
  assert.equal(db.prepare("SELECT status FROM betby_bets").get().status, 'void');
  assert.equal(balance(), 10000); // fully refunded
});

test('no GOAL data within the grace -> waits (stays open)', async () => {
  const { db, user, mkEvent } = setup();
  const bets = createBetbyBets(db, { goalApi: goalApiWith(null), betby: null });
  const ev = mkEvent();
  bets.place(user(), { eventId: ev, marketKind: 'anytime_scorer', player: 'Di María', side: 'home', odds: 8, stakeCents: 500 });
  db.prepare("UPDATE events SET status = 'finished', updated_at = ? WHERE id = ?").run(nowIso(), ev); // just finished
  await bets.settleOpen();
  assert.equal(db.prepare("SELECT status FROM betby_bets").get().status, 'open'); // still waiting for data
});
