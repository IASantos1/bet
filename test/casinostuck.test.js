import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb, nowIso } from '../server/db.js';
import { createBigBang, signMove, playerToken } from '../server/bigbang.js';

const KEY = 'ek_live_test_key'; // not ek_test_ → real-money path (sandbox would fake the balance)

function setup(startCents = 10000) {
  const db = openDb(':memory:');
  const userId = Number(db.prepare(
    "INSERT INTO users (email, name, birthdate, password_hash, balance_cents, created_at) VALUES ('p@x.pt','P','1990-01-01','x',?,?)"
  ).run(startCents, nowIso()).lastInsertRowid);
  const bb = createBigBang(db, { apiKey: KEY });
  const balance = () => db.prepare('SELECT balance_cents FROM users WHERE id = ?').get(userId).balance_cents;
  // Send a signed balance_change (a bet is a negative euro amount, a win positive).
  const move = ({ txId, euros, round, roundEnd, type = 'bet' }) => {
    const p = {
      username: playerToken(userId), amount: euros, game: 'Slot X', game_category: 'slot',
      transaction_id: txId, round_id: round, type, game_id: 1,
      ...(roundEnd === undefined ? {} : { round_end: roundEnd }),
    };
    p.signature = signMove(p, KEY);
    const r = bb.walletChange(p);
    assert.equal(r.status, 200, `move ${txId}: ${JSON.stringify(r.body)}`);
  };
  // Pretend a round's moves happened long ago, so they are past the grace.
  const age = (round, minutes = 120) => {
    const old = new Date(Date.now() - minutes * 60_000).toISOString();
    db.prepare('UPDATE casino_moves SET created_at = ? WHERE round_id = ?').run(old, round);
  };
  return { db, bb, userId, balance, move, age };
}

test('crashed round (opened, never closed, silent) is refunded exactly its net debit', () => {
  const { bb, balance, move, age } = setup();
  move({ txId: 't1', euros: -5, round: 'R1', roundEnd: 0 }); // bet €5, provider marks round open
  assert.equal(balance(), 9500);
  age('R1');
  const out = bb.refundStuckRounds({ graceMinutes: 30 });
  assert.equal(out.refunded, 1);
  assert.equal(out.cents, 500);
  assert.equal(balance(), 10000); // stake back
});

test('is idempotent — a second sweep refunds nothing', () => {
  const { bb, balance, move, age } = setup();
  move({ txId: 't1', euros: -5, round: 'R1', roundEnd: 0 });
  age('R1');
  bb.refundStuckRounds({ graceMinutes: 30 });
  const again = bb.refundStuckRounds({ graceMinutes: 30 });
  assert.equal(again.refunded, 0);
  assert.equal(balance(), 10000);
});

test('an ordinary loss (round closed, round_end=1) is NEVER refunded', () => {
  const { bb, balance, move, age } = setup();
  move({ txId: 't1', euros: -5, round: 'R2', roundEnd: 1 }); // settled loss
  assert.equal(balance(), 9500);
  age('R2');
  const out = bb.refundStuckRounds({ graceMinutes: 30 });
  assert.equal(out.refunded, 0);
  assert.equal(balance(), 9500); // stays lost
});

test('a round with no round_end marker at all is left alone (safe against providers that never mark)', () => {
  const { bb, balance, move, age } = setup();
  move({ txId: 't1', euros: -5, round: 'R4' }); // round_end undefined → null
  age('R4');
  const out = bb.refundStuckRounds({ graceMinutes: 30 });
  assert.equal(out.refunded, 0);
  assert.equal(balance(), 9500);
});

test('an open round still within the grace is not refunded yet', () => {
  const { bb, balance, move } = setup();
  move({ txId: 't1', euros: -5, round: 'R3', roundEnd: 0 }); // recent, not aged
  const out = bb.refundStuckRounds({ graceMinutes: 30 });
  assert.equal(out.refunded, 0);
  assert.equal(balance(), 9500);
});

test('a crashed round that partially paid out refunds only the net amount still down', () => {
  const { bb, balance, move, age } = setup();
  move({ txId: 't1', euros: -10, round: 'R5', roundEnd: 0, type: 'bet' }); // bet €10
  move({ txId: 't2', euros: 4, round: 'R5', roundEnd: 0, type: 'win' }); // partial €4, then crash
  assert.equal(balance(), 9400);
  age('R5');
  const out = bb.refundStuckRounds({ graceMinutes: 30 });
  assert.equal(out.refunded, 1);
  assert.equal(out.cents, 600); // net down was €6
  assert.equal(balance(), 10000);
});

test('a round that ended net positive (won) is not refunded even if a round_end=1 is missing', () => {
  const { bb, balance, move, age } = setup();
  move({ txId: 't1', euros: -5, round: 'R6', roundEnd: 0, type: 'bet' });
  move({ txId: 't2', euros: 12, round: 'R6', roundEnd: 0, type: 'win' }); // net +7, never closed
  assert.equal(balance(), 10700);
  age('R6');
  const out = bb.refundStuckRounds({ graceMinutes: 30 });
  assert.equal(out.refunded, 0); // player is up, nothing to give back
  assert.equal(balance(), 10700);
});
