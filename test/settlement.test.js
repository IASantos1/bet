import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb, nowIso, tx } from '../server/db.js';
import { createSettlementEngine } from '../server/settlement.js';
import { placeBets, settleEvent } from '../server/betting.js';
import { postTransaction } from '../server/wallet.js';

const H = 3_600_000;
const iso = (ms) => new Date(Date.now() + ms).toISOString();

function setup() {
  const db = openDb(':memory:');
  const { lastInsertRowid } = db.prepare(
    "INSERT INTO users (email, name, birthdate, password_hash, created_at) VALUES ('p@x.pt', 'P', '1990-01-01', 'x', ?)"
  ).run(nowIso());
  const userId = Number(lastInsertRowid);
  tx(db, () => postTransaction(db, userId, 10_000, 'deposit', 'teste'));
  const event = (fields = {}) => {
    const f = { status: 'scheduled', start: iso(2 * H), source: 'manual', ...fields };
    const ts = nowIso();
    const id = Number(db.prepare(
      `INSERT INTO events (sport, competition, home, away, start_time, status, source, created_at, updated_at)
       VALUES ('futebol', 'Liga', 'Casa', 'Fora', ?, ?, ?, ?, ?)`
    ).run(f.start, f.status, f.source, ts, ts).lastInsertRowid);
    db.prepare("INSERT INTO selections (event_id, market, code, odds_x100) VALUES (?, '1x2', '1', 200), (?, 'ou', 'O2.5', 190)").run(id, id);
    return id;
  };
  const bet = (eventId, market = '1x2', code = '1', odds = 2) => {
    const sel = db.prepare('SELECT id FROM selections WHERE event_id = ? AND market = ? AND code = ?').get(eventId, market, code);
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
    return tx(db, () => placeBets(db, user, { mode: 'single', stakeCents: 1_000, picks: [{ selectionId: sel.id, odds }] }))[0];
  };
  const balance = () => db.prepare('SELECT balance_cents FROM users WHERE id = ?').get(userId).balance_cents;
  return { db, event, bet, balance };
}

test('every settlement is logged with source, result, bets and payout', () => {
  const { db, event, bet } = setup();
  const id = event();
  bet(id, '1x2', '1', 2);
  bet(id, 'ou', 'O2.5', 1.9);
  tx(db, () => {
    db.prepare("UPDATE events SET status = 'finished', home_score = 2, away_score = 1 WHERE id = ?").run(id);
    settleEvent(db, id, { source: 'admin', note: 'teste' });
  });
  const engine = createSettlementEngine(db);
  const [h] = engine.history();
  assert.equal(h.action, 'result');
  assert.equal(h.score, '2 - 1');
  assert.equal(h.betsSettled, 2);
  assert.equal(h.payout, 39); // 20,00 + 19,00
  assert.equal(h.source, 'admin');
  db.close();
});

test('safety net settles finished events that still have open bets', () => {
  const { db, event, bet, balance } = setup();
  const id = event();
  bet(id);
  // Result written without settling (e.g. the process stopped half-way).
  db.prepare("UPDATE events SET status = 'finished', home_score = 1, away_score = 0 WHERE id = ?").run(id);
  const engine = createSettlementEngine(db);
  assert.deepEqual(engine.runOnce(), { settled: 1, voided: 0 });
  assert.equal(db.prepare('SELECT status FROM bets').get().status, 'won');
  assert.equal(balance(), 11_000);
  assert.deepEqual(engine.runOnce(), { settled: 0, voided: 0 }, 'idempotent');
  assert.equal(engine.history()[0].source, 'engine');
  db.close();
});

test('postponed matches are voided after 48 h without a new date', () => {
  const { db, event, bet, balance } = setup();
  const recent = event({ source: 'bzzoiro' });
  const old = event({ source: 'bzzoiro' });
  bet(recent);
  bet(old);
  db.prepare('UPDATE events SET postponed_at = ? WHERE id = ?').run(iso(-2 * H), recent);
  db.prepare('UPDATE events SET postponed_at = ? WHERE id = ?').run(iso(-49 * H), old);
  const engine = createSettlementEngine(db);
  const queue = engine.queue();
  assert.equal(queue.length, 2);
  assert.match(queue.find((q) => q.id === recent).reason, /anulação automática em 46 h/);
  assert.deepEqual(engine.runOnce(), { settled: 0, voided: 1 });
  assert.equal(db.prepare('SELECT status FROM events WHERE id = ?').get(old).status, 'cancelled');
  assert.equal(balance(), 9_000, 'one stake refunded, one still open');
  assert.equal(engine.history()[0].action, 'void');
  db.close();
});

test('queue flags overdue and long-running live matches with what is at stake', () => {
  const { db, event, bet } = setup();
  const overdue = event({ start: iso(-5 * H) });
  const stuck = event({ status: 'live', start: iso(-6 * H) });
  event({ status: 'live', start: iso(-1 * H) }); // normal live match: not flagged
  db.prepare("UPDATE events SET start_time = ? WHERE id = ?").run(iso(2 * H), overdue);
  bet(overdue);
  db.prepare("UPDATE events SET start_time = ? WHERE id = ?").run(iso(-5 * H), overdue);
  const engine = createSettlementEngine(db);
  const q = engine.queue();
  assert.deepEqual(q.map((e) => e.id).sort(), [overdue, stuck].sort());
  const o = q.find((e) => e.id === overdue);
  assert.equal(o.openBets, 1);
  assert.equal(o.openStake, 10);
  assert.equal(o.openPotential, 20);
  assert.match(q.find((e) => e.id === stuck).reason, /Ao vivo há mais de 4 h/);
  const s = engine.summary();
  assert.equal(s.openBets, 1);
  assert.equal(s.maxLiability, 20);
  db.close();
});

test('no ticket stays open forever: legs without a result 72 h after the start are voided', () => {
  const { db, event, bet, balance } = setup();
  const neverLive = event();
  const review = event({ status: 'live' });
  const finished = event();
  const recent = event();
  db.prepare("INSERT INTO selections (event_id, market, code, odds_x100) VALUES (?, 'x', 'x|1500~Cantos~Mais de (8.5)', 180)").run(finished);
  bet(neverLive);
  bet(review);
  bet(finished, 'x', 'x|1500~Cantos~Mais de (8.5)', 1.8);
  bet(recent);
  db.prepare('UPDATE events SET start_time = ? WHERE id IN (?, ?, ?)').run(iso(-73 * H), neverLive, review, finished);
  db.prepare("UPDATE events SET review_reason = 'WinHouse: saiu do ao vivo ao minuto 80' WHERE id = ?").run(review);
  db.prepare("UPDATE events SET status = 'finished', home_score = 1, away_score = 0, start_time = ? WHERE id = ?").run(iso(-73 * H), finished);
  db.prepare('UPDATE events SET start_time = ? WHERE id = ?').run(iso(-10 * H), recent);
  const engine = createSettlementEngine(db);
  assert.match(engine.queue().find((q) => q.id === recent).reason, /anulação automática em 62 h/);
  assert.deepEqual(engine.runOnce(), { settled: 0, voided: 3 });
  assert.equal(balance(), 9_000, 'three stakes back, the recent one still open');
  assert.equal(db.prepare('SELECT status FROM events WHERE id = ?').get(neverLive).status, 'cancelled');
  assert.equal(db.prepare('SELECT status FROM events WHERE id = ?').get(finished).status, 'finished', 'a finished game keeps its result');
  assert.deepEqual(db.prepare("SELECT status FROM bets ORDER BY id").all().map((b) => b.status), ['void', 'void', 'void', 'open']);
  assert.deepEqual(engine.runOnce(), { settled: 0, voided: 0 }, 'idempotent');
  db.close();
});
