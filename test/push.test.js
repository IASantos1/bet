// Won bets: the notification on the phone (once each) and the full-screen celebration (until seen).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb, nowIso, getSetting } from '../server/db.js';
import { createPush, ensurePushTables, unseenWins, markWinsSeen, winMessage } from '../server/push.js';

function setup() {
  const db = openDb(':memory:');
  ensurePushTables(db);
  const uid = Number(db.prepare("INSERT INTO users (email, name, birthdate, password_hash, created_at) VALUES ('a@x.pt', 'A', '1990-01-01', 'x', ?)").run(nowIso()).lastInsertRowid);
  const ev = Number(db.prepare(`INSERT INTO events (sport, competition, home, away, start_time, status, created_at, updated_at)
    VALUES ('futebol', 'Liga', 'Sporting Clube de Portugal', 'SL Benfica', ?, 'finished', ?, ?)`).run(nowIso(), nowIso(), nowIso()).lastInsertRowid);
  const sel = Number(db.prepare("INSERT INTO selections (event_id, market, code, odds_x100) VALUES (?, '1x2', '1', 225)").run(ev).lastInsertRowid);
  const bet = (status, settledAgoH = 0) => {
    const at = new Date(Date.now() - settledAgoH * 3_600_000).toISOString();
    const id = Number(db.prepare(`INSERT INTO bets (user_id, type, stake_cents, total_odds, potential_cents, status, payout_cents, created_at, settled_at)
      VALUES (?, 'single', 2000, 2.25, 4500, ?, ?, ?, ?)`).run(uid, status, status === 'won' ? 4500 : 0, at, at).lastInsertRowid);
    db.prepare("INSERT INTO bet_legs (bet_id, event_id, selection_id, code, odds_x100, status) VALUES (?, ?, ?, '1', 225, ?)").run(id, ev, sel, status === 'won' ? 'won' : 'lost');
    return id;
  };
  return { db, uid, bet };
}

test('a won bet waits for its celebration until seen; lost and old ones never do', () => {
  const { db, uid, bet } = setup();
  const won = bet('won');
  bet('lost');
  bet('won', 60);
  assert.deepEqual(unseenWins(db, uid).map((b) => b.id), [won]);
  markWinsSeen(db, uid, [won]);
  assert.deepEqual(unseenWins(db, uid), []);
});

test('the notification names the match by its short names and the amount paid', () => {
  const m = winMessage({ id: 7, payout_cents: 4500 }, [{ sport: 'futebol', home: 'Sporting Clube de Portugal', away: 'SL Benfica' }]);
  assert.equal(m.title, '🏆 A sua aposta ganhou!');
  assert.equal(m.body, 'Sporting CP – SL Benfica · +€45,00 creditados no seu saldo.');
  assert.equal(winMessage({ id: 8, payout_cents: 1000 }, [{}, {}, {}]).body, 'Múltipla de 3 seleções · +€10,00 creditados no seu saldo.');
});

test('keys made once and kept; a subscription is checked; each win announced once', async () => {
  const { db, uid, bet } = setup();
  const push = createPush(db);
  assert.equal(getSetting(db, 'push.vapid').publicKey, push.publicKey);
  assert.equal(createPush(db).publicKey, push.publicKey);
  assert.equal(push.subscribe(uid, { endpoint: 'http://x', keys: { p256dh: 'a', auth: 'b' } }), false);
  bet('won');
  // No phone signed up: nothing sent, but the win is marked as announced (not tried again).
  assert.equal(await push.notifyWins(), 0);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM win_notices WHERE pushed_at IS NOT NULL').get().n, 1);
  assert.equal(await push.notifyWins(), 0);
  // Still celebrated in the app.
  assert.equal(unseenWins(db, uid).length, 1);
});

test('push campaigns: only to players who accepted promotions on the phone and have one signed up', async () => {
  const { createCampaigns } = await import('../server/campaigns.js');
  const { db, uid } = setup();
  const sent = [];
  const push = { sendTo: async (id, m) => { sent.push([id, m]); return 1; } };
  const camp = createCampaigns(db, { push });
  assert.equal(camp.audience({ channel: 'push' }).length, 0);
  db.prepare("UPDATE users SET prefs = ? WHERE id = ?").run(JSON.stringify({ notifyPushPromos: true }), uid);
  assert.equal(camp.audience({ channel: 'push' }).length, 0); // no phone signed up yet
  db.prepare("INSERT INTO push_subs (user_id, endpoint, p256dh, auth, vapid, created_at) VALUES (?, 'https://p/1', 'k', 'a', 'v', ?)").run(uid, nowIso());
  assert.equal(camp.audience({ channel: 'push' }).length, 1);
  assert.throws(() => camp.start({ channel: 'push', subject: 'x', body: 'Olá' }, {}), /título/);
  assert.throws(() => camp.start({ channel: 'push', subject: 'Free Spins', body: 'x'.repeat(181) }, {}), /longa/);
  const realHours = (await import('../server/campaigns.js')).smsHours();
  if (!realHours) return; // outside 09:00–21:00 Lisbon the start is refused, as it should
  const r = camp.start({ channel: 'push', subject: '🎰 {nome}, Free Spins', body: 'Tem 50 Free Spins à espera.', ctaUrl: '/#/casino' }, { by: 'admin' });
  await r.done;
  assert.equal(sent.length, 1);
  assert.equal(sent[0][1].title, '🎰 A, Free Spins');
  assert.equal(sent[0][1].url, '/#/casino');
  assert.equal(db.prepare('SELECT channel, sent FROM campaigns').get().channel, 'push');
});
