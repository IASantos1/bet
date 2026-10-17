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

test('provider markets: a set / half winner or total read from the period scores; the unreadable ones voided 2 h after the end', async () => {
  const { specialOutcome } = await import('../server/markets.js');
  // Pure reading.
  const sets = [[4, 6], [6, 3], [3, 6]];
  assert.equal(specialOutcome('11~1.º set - Vencedor~2', { periods: sets }), 'won');
  assert.equal(specialOutcome('11~1.º set - Vencedor~1', { periods: sets }), 'lost');
  assert.equal(specialOutcome('12~2.º set - Total de jogos~Mais (8.5)', { periods: sets }), 'won');
  assert.equal(specialOutcome('13~1st half winner~X', { periods: [[1, 1], [0, 2]] }), 'won');
  assert.equal(specialOutcome('14~2.º tempo - Total~Menos (1.5)', { periods: [[1, 1], [0, 2]] }), 'lost');
  assert.equal(specialOutcome('15~Vencedor~Casa', { home: 2, away: 1, homeName: 'Casa' }), 'won');
  assert.equal(specialOutcome('11~1.º set - Vencedor~2', { periods: null }), null); // no set scores: waits
  assert.equal(specialOutcome('16~Marcador do primeiro golo~Ronaldo', {}), null);    // cannot be read

  const { db, event, bet, balance } = setup();
  const add = (id, code) => db.prepare("INSERT INTO selections (event_id, market, code, odds_x100) VALUES (?, 'x', ?, 134)").run(id, code);
  // Tennis: the tracker kept each set's games; the "1.º set - Vencedor 2" ticket wins at the end.
  const t = event();
  db.prepare("UPDATE events SET sport = 'tenis' WHERE id = ?").run(t);
  add(t, '11~1.º set - Vencedor~2');
  bet(t, 'x', '11~1.º set - Vencedor~2', 1.34);
  db.prepare("UPDATE events SET status = 'finished', home_score = 1, away_score = 2, live_detail = ? WHERE id = ?").run(JSON.stringify({ sets }), t);
  tx(db, () => settleEvent(db, t, { source: 'feed' }));
  assert.equal(balance(), 10_000 - 1_000 + 1_340);
  // Football: a market nobody can read waits, then is voided (stake back) 2 h after the end.
  const f = event();
  add(f, '16~Marcador do primeiro golo~Ronaldo');
  bet(f, 'x', '16~Marcador do primeiro golo~Ronaldo', 1.34);
  db.prepare("UPDATE events SET status = 'finished', home_score = 1, away_score = 0, updated_at = ? WHERE id = ?").run(iso(-1 * H), f);
  tx(db, () => settleEvent(db, f, { source: 'feed' }));
  const engine = createSettlementEngine(db);
  engine.runOnce();
  assert.equal(db.prepare("SELECT status FROM bets ORDER BY id DESC").get().status, 'open'); // only 1 h ago
  db.prepare('UPDATE events SET updated_at = ? WHERE id = ?').run(iso(-3 * H), f);
  engine.runOnce();
  assert.equal(db.prepare("SELECT status FROM bets ORDER BY id DESC").get().status, 'void');
  assert.equal(balance(), 10_000 - 1_000 + 1_340);
  db.close();
});

test('tennis: set and games markets read from complete sets only; anything partial waits', async () => {
  const { tennisOutcome, completeSets } = await import('../server/markets.js');
  const sets = [[6, 4], [3, 6], [7, 5]]; // 2-1 in sets; games 16-15 (31)
  const r = (code, extra = {}) => tennisOutcome(code, { sets, home: 2, away: 1, ...extra });
  // Set markets, on the final score in sets.
  assert.equal(r('1079~Apostas por Set~2:1'), 'won');
  assert.equal(r('1079~Apostas por Set~2:0'), 'lost');
  assert.equal(r('2721~Menos / Mais sets~Mais de 2.5'), 'won');
  assert.equal(r('2721~Menos / Mais sets~Menos de 2.5'), 'lost');
  assert.equal(r('1874~Handicap Asiático de Set~1 (-1.5)'), 'lost');
  assert.equal(r('1874~Handicap Asiático de Set~2 (1.5)'), 'won');
  // A set's winner.
  assert.equal(r('1081~1.º set - Vencedor~1'), 'won');
  assert.equal(r('1082~2° Set - Vencedor~1'), 'lost');
  // Games markets, on every set.
  assert.equal(r('1080~Total de Jogos - Mais/Menos~Mais de 21.5'), 'won');
  assert.equal(r('1080~Total de Jogos - Mais/Menos~Menos de (31.0)'), 'void'); // whole line hit
  assert.equal(r('1279~Total de Jogos - Ímpar / Par~Ímpar'), 'won');
  assert.equal(r('1279~Total de Jogos - Ímpar / Par~Par'), 'lost');
  assert.equal(r('1881~Handicap asiático de Jogos~1 (-1.5)'), 'lost'); // 16 - 1.5 < 15
  assert.equal(r('1881~Handicap asiático de Jogos~1 (-0.5)'), 'won');
  assert.equal(r('1881~Handicap asiático de Jogos~2 (1.0)'), 'void');  // 15 + 1 = 16
  assert.equal(r('1881~Handicap asiático de Jogos~1 (-0.25)'), null);  // quarter line: operator
  assert.equal(r('1872~Jogador 1 - Total de Jogos - Mais/Menos~Mais de 15.5'), 'won');
  assert.equal(r('1878~Jogador 2 - Total de Jogos - Mais/Menos~Mais de 15.5'), 'lost');
  // Partial or inconsistent sets: the games markets wait (a set still running, a missing set, sets
  // that do not add up to the final score); a finished set still settles its winner.
  const running = { sets: [[6, 4], [3, 6], [5, 4]] };
  assert.equal(r('1080~Total de Jogos - Mais/Menos~Mais de 21.5', running), null);
  assert.equal(r('1081~1.º set - Vencedor~1', running), 'won');
  assert.equal(r('1080~Total de Jogos - Mais/Menos~Mais de 21.5', { sets: [[6, 4], [3, 6]] }), null);
  assert.equal(r('1080~Total de Jogos - Mais/Menos~Mais de 21.5', { sets: null }), null);
  assert.equal(r('1082~2° Set - Vencedor~1', { sets: [[6, 4], [6, 6]] }), null);
  assert.equal(completeSets([[6, 4], [7, 7]], 2, 0), null);
  // A retirement: only a finished set's winner stands.
  assert.equal(r('1079~Apostas por Set~2:1', { retired: true }), null);
  assert.equal(r('1080~Total de Jogos - Mais/Menos~Mais de 21.5', { retired: true }), null);
  assert.equal(r('1081~1.º set - Vencedor~1', { retired: true }), 'won');
  // Labels it does not understand wait too.
  assert.equal(r('1079~Apostas por Set~Outro'), null);

  // Settled by the engine on a finished match (sets from the tracker in live_detail).
  const { db, event, bet, balance } = setup();
  const add = (id, code) => db.prepare("INSERT INTO selections (event_id, market, code, odds_x100) VALUES (?, 'x', ?, 200)").run(id, code);
  const t = event();
  db.prepare("UPDATE events SET sport = 'tenis' WHERE id = ?").run(t);
  add(t, '1079~Apostas por Set~2:1');
  bet(t, 'x', '1079~Apostas por Set~2:1', 2);
  db.prepare("UPDATE events SET status = 'finished', home_score = 2, away_score = 1, live_detail = ? WHERE id = ?").run(JSON.stringify({ sets }), t);
  tx(db, () => settleEvent(db, t, { source: 'feed' }));
  assert.equal(balance(), 10_000 - 1_000 + 2_000);
  db.close();
});
