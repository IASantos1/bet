import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb, nowIso, tx } from '../server/db.js';
import { placeBets, settleEvent } from '../server/betting.js';
import { postTransaction } from '../server/wallet.js';
import { cashoutOffer, cashOut } from '../server/cashout.js';
import { config } from '../server/config.js';

function setup() {
  const db = openDb(':memory:');
  const u = Number(db.prepare("INSERT INTO users (email, name, birthdate, password_hash, created_at) VALUES ('c@x', 'C', '1990-01-01', 'x', ?)").run(nowIso()).lastInsertRowid);
  tx(db, () => postTransaction(db, u, 10000, 'deposit', 'd'));
  return { db, u };
}
function match(db, odds = 200) {
  const id = Number(db.prepare(`INSERT INTO events (sport, competition, home, away, start_time, status, created_at, updated_at)
    VALUES ('futebol', 'Liga', 'A', 'B', ?, 'scheduled', ?, ?)`).run(new Date(Date.now() + 3600_000).toISOString(), nowIso(), nowIso()).lastInsertRowid);
  const sel = Number(db.prepare("INSERT INTO selections (event_id, market, code, odds_x100) VALUES (?, '1x2', '1', ?)").run(id, odds).lastInsertRowid);
  return { id, sel };
}
const bal = (db, u) => db.prepare('SELECT balance_cents FROM users WHERE id = ?').get(u).balance_cents;
const row = (db, id) => db.prepare('SELECT * FROM bets WHERE id = ?').get(id);

test('cash out: stake × taken / current odds × factor; paid once; the bet is closed and later results do not pay it', () => {
  const { db, u } = setup();
  const m = match(db, 200);
  const [id] = tx(db, () => placeBets(db, { id: u }, { mode: 'single', stakeCents: 1000, picks: [{ selectionId: m.sel, odds: 2 }] }));
  // The price shortens to 1.25: worth 10 × 2 / 1.25 × factor.
  db.prepare('UPDATE selections SET odds_x100 = 125 WHERE id = ?').run(m.sel);
  const o = cashoutOffer(db, row(db, id));
  assert.equal(o.status, 'available');
  assert.equal(o.valueCents, Math.floor(1000 * (2 / 1.25) * config.cashout.factor));
  // A stale amount is refused with the new one.
  assert.throws(() => tx(db, () => cashOut(db, u, id, o.valueCents + 50)), /mudou/);
  const r = tx(db, () => cashOut(db, u, id, o.valueCents));
  assert.equal(bal(db, u), 9000 + o.valueCents);
  assert.equal(row(db, id).status, 'cashout');
  assert.throws(() => tx(db, () => cashOut(db, u, id, o.valueCents)), /indisponível|resolvida/);
  // The match ends with the bet winning: nothing more is paid.
  tx(db, () => { db.prepare("UPDATE events SET status = 'finished', home_score = 1, away_score = 0 WHERE id = ?").run(m.id); settleEvent(db, m.id); });
  assert.equal(bal(db, u), 9000 + r.valueCents);
  assert.ok(db.prepare("SELECT 1 FROM transactions WHERE type = 'cashout'").get());
});

test('cash out: suspended when a market is closed or a live price is old; unavailable for builders, free bets and lost legs', () => {
  const { db, u } = setup();
  const a = match(db, 150);
  const b = match(db, 180);
  const [multi] = tx(db, () => placeBets(db, { id: u }, { mode: 'multiple', stakeCents: 1000, picks: [{ selectionId: a.sel, odds: 1.5 }, { selectionId: b.sel, odds: 1.8 }] }));
  // One leg already won: only the other one's price counts.
  db.prepare("UPDATE bet_legs SET status = 'won' WHERE bet_id = ? AND selection_id = ?").run(multi, a.sel);
  assert.equal(cashoutOffer(db, row(db, multi)).valueCents, Math.floor(1000 * (1.5 * 1.8 / 1.8) * config.cashout.factor));
  db.prepare('UPDATE selections SET active = 0 WHERE id = ?').run(b.sel);
  assert.equal(cashoutOffer(db, row(db, multi)).status, 'suspended');
  db.prepare('UPDATE selections SET active = 1 WHERE id = ?').run(b.sel);
  // In play without a fresh live price: suspended.
  db.prepare("UPDATE events SET status = 'live', source = 'winhouse', live_odds_at = ? WHERE id = ?").run(new Date(Date.now() - 3600_000).toISOString(), b.id);
  assert.equal(cashoutOffer(db, row(db, multi)).status, 'suspended');
  db.prepare("UPDATE bet_legs SET status = 'lost' WHERE bet_id = ? AND selection_id = ?").run(multi, b.sel);
  assert.equal(cashoutOffer(db, row(db, multi)).status, 'unavailable');
  assert.equal(cashoutOffer(db, { ...row(db, multi), type: 'builder' }).status, 'unavailable');
  assert.equal(cashoutOffer(db, { ...row(db, multi), freebet_stake_cents: 500 }).status, 'unavailable');
});
