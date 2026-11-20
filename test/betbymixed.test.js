import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb, nowIso, tx } from '../server/db.js';
import { placeBets, settleEvent, settleBetbyLegs } from '../server/betting.js';
import { gradePlayerMarket } from '../server/playermarkets.js';

// A mixed multiple: one WinHouse selection + one BETBY player market, in the same ticket.
function setup() {
  const db = openDb(':memory:');
  const userId = Number(db.prepare(
    "INSERT INTO users (email, name, birthdate, password_hash, balance_cents, created_at) VALUES ('p@x.pt','P','1990-01-01','x',100000,?)"
  ).run(nowIso()).lastInsertRowid);
  const ts = nowIso();
  const start = new Date(Date.now() + 2 * 3600_000).toISOString();
  const evWh = Number(db.prepare(`INSERT INTO events (sport, competition, home, away, start_time, status, source, created_at, updated_at)
    VALUES ('futebol','Liga','Sporting','Braga',?, 'scheduled','manual',?,?)`).run(start, ts, ts).lastInsertRowid);
  db.prepare("INSERT INTO selections (event_id, market, code, odds_x100) VALUES (?, '1x2', '1', 200)").run(evWh);
  const evBb = Number(db.prepare(`INSERT INTO events (sport, competition, home, away, start_time, status, source, created_at, updated_at)
    VALUES ('futebol','Liga','Benfica','Porto',?, 'scheduled','manual',?,?)`).run(start, ts, ts).lastInsertRowid);
  const user = () => db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  const balance = () => user().balance_cents;
  const sel = db.prepare("SELECT id FROM selections WHERE event_id = ?").get(evWh).id;
  return { db, user, balance, evWh, evBb, sel };
}

const goalApi = (players) => ({ enabled: true, matchReport: async () => ({ players }) });

test('mixed multiple: combined odds multiply WinHouse and BETBY legs, pays when both win', async () => {
  const { db, user, balance, evWh, evBb, sel } = setup();
  const betId = tx(db, () => placeBets(db, user(), {
    mode: 'multiple', stakeCents: 1000,
    picks: [
      { selectionId: sel, odds: 2 },                                   // Sporting win @2.00
      { betby: { eventId: evBb, kind: 'anytime_scorer', player: 'Di María', marketId: '40', side: 'home' }, odds: 3 }, // Di María scores @3.00
    ],
  }))[0];
  assert.equal(balance(), 99000); // 1000 stake debited
  const bet = db.prepare('SELECT type, total_odds FROM bets WHERE id = ?').get(betId);
  assert.equal(bet.type, 'multiple');
  assert.equal(bet.total_odds, 6); // 2.00 * 3.00

  // WinHouse leg settles first (Sporting won). Ticket still open (BETBY leg pending).
  tx(db, () => { db.prepare("UPDATE events SET status='finished', home_score=1, away_score=0 WHERE id=?").run(evWh); settleEvent(db, evWh); });
  assert.equal(db.prepare('SELECT status FROM bets WHERE id = ?').get(betId).status, 'open');

  // BETBY leg settles (Di María scored) -> ticket pays 1000 * 6.00 = 6000.
  db.prepare("UPDATE events SET status='finished' WHERE id=?").run(evBb);
  await settleBetbyLegs(db, { goalApi: goalApi([{ id: 'p1', name: 'Di María', team: 'home', goals: 1, assists: 0, yellow: 0, red: 0 }]), grade: gradePlayerMarket });
  const done = db.prepare('SELECT status, payout_cents FROM bets WHERE id = ?').get(betId);
  assert.equal(done.status, 'won');
  assert.equal(done.payout_cents, 6000);
  assert.equal(balance(), 99000 + 6000);
});

test('mixed multiple: a losing BETBY leg loses the whole ticket', async () => {
  const { db, user, balance, evWh, evBb, sel } = setup();
  const betId = tx(db, () => placeBets(db, user(), {
    mode: 'multiple', stakeCents: 1000,
    picks: [{ selectionId: sel, odds: 2 }, { betby: { eventId: evBb, kind: 'anytime_scorer', player: 'Di María', marketId: '40', side: 'home' }, odds: 3 }],
  }))[0];
  tx(db, () => { db.prepare("UPDATE events SET status='finished', home_score=1, away_score=0 WHERE id=?").run(evWh); settleEvent(db, evWh); });
  db.prepare("UPDATE events SET status='finished' WHERE id=?").run(evBb);
  // Di María did NOT score.
  await settleBetbyLegs(db, { goalApi: goalApi([{ id: 'x', name: 'Otamendi', team: 'home', goals: 0, assists: 0, yellow: 0, red: 0 }]), grade: gradePlayerMarket });
  assert.equal(db.prepare('SELECT status FROM bets WHERE id = ?').get(betId).status, 'lost');
  assert.equal(balance(), 99000); // stake kept, no payout
});
