// Reopening a settled ticket (admin undo): the payout is reversed and the ticket returns to open.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb, nowIso, tx } from '../server/db.js';
import { placeBets, settleBet, reopenBet } from '../server/betting.js';
import { postTransaction } from '../server/wallet.js';

function setup() {
  const db = openDb(':memory:');
  const u = Number(db.prepare("INSERT INTO users (email,name,birthdate,password_hash,created_at) VALUES ('r@x','R','1990-01-01','x',?)").run(nowIso()).lastInsertRowid);
  tx(db, () => postTransaction(db, u, 10000, 'deposit', 'd'));
  return { db, u };
}
function match(db, odds = 200) {
  const id = Number(db.prepare(`INSERT INTO events (sport,competition,home,away,start_time,status,created_at,updated_at)
    VALUES ('futebol','Liga','A','B',?,'scheduled',?,?)`).run(new Date(Date.now() + 3600_000).toISOString(), nowIso(), nowIso()).lastInsertRowid);
  const sel = Number(db.prepare("INSERT INTO selections (event_id,market,code,odds_x100) VALUES (?, '1x2','1',?)").run(id, odds).lastInsertRowid);
  return { id, sel };
}
const bal = (db, u) => db.prepare('SELECT balance_cents FROM users WHERE id=?').get(u).balance_cents;
const brow = (db, id) => db.prepare('SELECT * FROM bets WHERE id=?').get(id);
const place = (db, u) => { const m = match(db); return tx(db, () => placeBets(db, { id: u }, { mode: 'single', stakeCents: 1000, picks: [{ selectionId: m.sel, odds: 2 }] }))[0]; };

test('reopen a won ticket: the €20 payout is taken back, the ticket returns to open and can be re-settled', () => {
  const { db, u } = setup();
  const id = place(db, u);
  assert.equal(bal(db, u), 9000); // staked €10
  db.prepare("UPDATE bet_legs SET status='won' WHERE bet_id=?").run(id);
  tx(db, () => settleBet(db, id));
  assert.equal(brow(db, id).status, 'won');
  assert.equal(bal(db, u), 11000); // + €20 payout

  const r = tx(db, () => reopenBet(db, id, { actor: 1, note: 'engano' }));
  assert.equal(r.reversed, 2000);
  assert.equal(bal(db, u), 9000); // payout taken back
  const b = brow(db, id);
  assert.equal(b.status, 'open');
  assert.equal(b.payout_cents, 0);
  assert.equal(b.settled_at, null);
  assert.equal(db.prepare('SELECT status FROM bet_legs WHERE bet_id=?').get(id).status, 'open');

  // Now it can be settled again — this time lost.
  db.prepare("UPDATE bet_legs SET status='lost' WHERE bet_id=?").run(id);
  tx(db, () => settleBet(db, id));
  assert.equal(brow(db, id).status, 'lost');
  assert.equal(bal(db, u), 9000);
});

test('reopen a lost ticket: nothing to reverse, back to open', () => {
  const { db, u } = setup();
  const id = place(db, u);
  db.prepare("UPDATE bet_legs SET status='lost' WHERE bet_id=?").run(id);
  tx(db, () => settleBet(db, id));
  assert.equal(brow(db, id).status, 'lost');
  const r = tx(db, () => reopenBet(db, id, { actor: 1 }));
  assert.equal(r.reversed, 0);
  assert.equal(brow(db, id).status, 'open');
  assert.equal(bal(db, u), 9000);
});

test('reopen refuses an already-open ticket, and one whose winnings were already spent (nothing changes)', () => {
  const { db, u } = setup();
  const id = place(db, u);
  assert.throws(() => tx(db, () => reopenBet(db, id, {})), /já está em aberto/);
  db.prepare("UPDATE bet_legs SET status='won' WHERE bet_id=?").run(id);
  tx(db, () => settleBet(db, id));
  // The player withdrew everything, so the payout can no longer be taken back.
  tx(db, () => postTransaction(db, u, -bal(db, u), 'withdrawal', 'w'));
  assert.throws(() => tx(db, () => reopenBet(db, id, {})), /já gastou/);
  assert.equal(brow(db, id).status, 'won'); // the failed reopen rolled back
});
