import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb, nowIso, tx } from '../server/db.js';
import { createLiveSocket } from '../server/livews.js';
import { createFeed } from '../server/feed.js';
import { placeBets } from '../server/betting.js';
import { postTransaction } from '../server/wallet.js';

const H = 3600_000;
const iso = (ms) => new Date(Date.now() + ms).toISOString();

/** In-memory stand-in for the provider's WebSocket. */
class FakeSocket {
  static all = [];
  constructor(url, protocols) {
    this.url = url;
    this.protocols = protocols;
    this.sent = [];
    FakeSocket.all.push(this);
    queueMicrotask(() => this.onopen?.());
  }
  send(msg) { this.sent.push(JSON.parse(msg)); }
  close() { this.onclose?.({ code: 1000 }); }
  push(frame) { this.onmessage?.({ data: JSON.stringify(frame) }); }
}
const tick = () => new Promise((r) => setImmediate(r));

function liveEvent(db, ext, { home = 0, away = 0 } = {}) {
  const ts = nowIso();
  const { lastInsertRowid } = db.prepare(
    `INSERT INTO events (sport, competition, home, away, start_time, status, home_score, away_score, source, external_id, created_at, updated_at)
     VALUES ('futebol', 'Liga', 'Casa', 'Fora', ?, 'live', ?, ?, 'bzzoiro', ?, ?, ?)`
  ).run(iso(-H), home, away, String(ext), ts, ts);
  return Number(lastInsertRowid);
}
const sels = (db, id) => db.prepare('SELECT code, odds_x100, active FROM selections WHERE event_id = ? ORDER BY code').all(id).map((r) => ({ ...r }));
const ev = (db, id) => db.prepare('SELECT * FROM events WHERE id = ?').get(id);

function player(db) {
  const { lastInsertRowid } = db.prepare(
    "INSERT INTO users (email, name, birthdate, password_hash, created_at) VALUES (?, 'P', '1990-01-01', 'x', ?)"
  ).run(`p${Math.random()}@x.pt`, nowIso());
  const id = Number(lastInsertRowid);
  tx(db, () => postTransaction(db, id, 10_000, 'deposit', 'teste'));
  return db.prepare('SELECT * FROM users WHERE id = ?').get(id);
}

test('subscribes with the token subprotocol, opens in-play prices and suspends on a goal', async () => {
  FakeSocket.all = [];
  const db = openDb(':memory:');
  const id = liveEvent(db, 223510);
  const live = createLiveSocket(db, { token: 'tok', WebSocketImpl: FakeSocket });
  live.track(['223510']);
  await tick();
  const sock = FakeSocket.all[0];
  assert.deepEqual(sock.protocols, ['token', 'tok']);
  assert.deepEqual(sock.sent, [{ action: 'subscribe', event_id: 223510 }]);

  sock.push({ type: 'subscribed', event_id: 223510, source: 'basic',
    event: { score: { home: 0, away: 0 }, time: { minute: 30, display: "30'", status: 'live' } },
    odds: { odds: { match_winner: { home: 2.1, draw: 3.2, away: 3.6 } } } });
  // First sight of a price with nothing to compare it with: remembered, not offered yet.
  assert.ok(sels(db, id).every((s) => s.active === 0));
  assert.equal(ev(db, id).live_odds_at, null);
  sock.push({ type: 'odds', event_id: 223510, odds: { match_winner: { home: 2.05, draw: 3.2, away: 3.7 } } });
  sock.push({ type: 'odds', event_id: 223510, odds: { match_winner: { home: 2.1, draw: 3.2, away: 3.6 } } });
  assert.deepEqual(sels(db, id), [{ code: '1', odds_x100: 210, active: 1 }, { code: '2', odds_x100: 360, active: 1 }, { code: 'X', odds_x100: 320, active: 1 }]);
  assert.ok(ev(db, id).live_odds_at);

  // A bet at the live price is accepted.
  const p = player(db);
  const sel1 = db.prepare("SELECT id FROM selections WHERE event_id = ? AND code = '1'").get(id).id;
  tx(db, () => placeBets(db, p, { mode: 'single', stakeCents: 500, picks: [{ selectionId: sel1, odds: 2.1 }] }));

  // Goal: every market closes until the next price arrives.
  sock.push({ type: 'event', event_id: 223510, score: { home: 1, away: 0 }, time: { minute: 67, display: "67'", status: 'live' } });
  assert.equal(ev(db, id).home_score, 1);
  assert.equal(ev(db, id).clock, "67'");
  assert.equal(ev(db, id).live_odds_at, null);
  assert.ok(sels(db, id).every((s) => s.active === 0));
  assert.throws(() => tx(db, () => placeBets(db, p, { mode: 'single', stakeCents: 500, picks: [{ selectionId: sel1, odds: 2.1 }] })), /Mercado fechado/);

  sock.push({ type: 'odds', event_id: 223510, odds: { match_winner: { home: 1.35, draw: 4.8, away: 9.5 } } });
  assert.equal(sels(db, id)[0].odds_x100, 135);
  assert.ok(sels(db, id).every((s) => s.active === 1));
  live.stop();
  db.close();
});

test('stale in-play prices are refused', () => {
  const db = openDb(':memory:');
  const id = liveEvent(db, 5);
  db.prepare("INSERT INTO selections (event_id, code, odds_x100) VALUES (?, '1', 200), (?, '2', 300)").run(id, id);
  db.prepare('UPDATE events SET live_odds_at = ? WHERE id = ?').run(iso(-10 * 60_000), id);
  const p = player(db);
  const sel1 = db.prepare("SELECT id FROM selections WHERE event_id = ? AND code = '1'").get(id).id;
  assert.throws(() => tx(db, () => placeBets(db, p, { mode: 'single', stakeCents: 500, picks: [{ selectionId: sel1, odds: 2 }] })), /Mercado fechado/);
  db.prepare('UPDATE events SET live_odds_at = ? WHERE id = ?').run(nowIso(), id);
  tx(db, () => placeBets(db, p, { mode: 'single', stakeCents: 500, picks: [{ selectionId: sel1, odds: 2 }] }));
  db.close();
});

test('spreads matches over sockets of 10 and stops following finished ones', async () => {
  FakeSocket.all = [];
  const db = openDb(':memory:');
  const live = createLiveSocket(db, { token: 'tok', WebSocketImpl: FakeSocket, maxSockets: 2 });
  live.track(Array.from({ length: 25 }, (_, i) => String(100 + i)));
  await tick();
  assert.equal(FakeSocket.all.length, 2);
  assert.equal(live.status().following, 20); // capped at 2 sockets × 10
  live.track(['100']);
  assert.equal(live.status().following, 1);
  assert.ok(FakeSocket.all[0].sent.some((m) => m.action === 'unsubscribe' && m.event_id === 101));

  // Uncovered match: dropped without retrying.
  FakeSocket.all[0].push({ type: 'error', code: 'not_tracked', message: 'x', event_id: 100 });
  assert.equal(live.status().following, 0);
  assert.equal(live.status().notCovered, 1);
  live.stop();
  db.close();
});

test('a missing WebSocket addon stops reconnecting and is reported', async () => {
  FakeSocket.all = [];
  const db = openDb(':memory:');
  const live = createLiveSocket(db, { token: 'tok', WebSocketImpl: FakeSocket, reconnectMs: 1 });
  live.track(['1']);
  await tick();
  FakeSocket.all[0].push({ type: 'error', code: 'subscription_required', message: 'No active WebSocket addon' });
  FakeSocket.all[0].onclose({ code: 4402 });
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(FakeSocket.all.length, 1);
  assert.match(live.status().fatal, /4402|subscription_required/);
  live.stop();
  db.close();
});

test('REST live sync hands covered matches to the socket and keeps fresh live prices open', async () => {
  FakeSocket.all = [];
  const db = openDb(':memory:');
  const tracked = [];
  const liveSocket = { track: (ids) => tracked.push([...ids]), status: () => ({}) };
  const routes = {
    '/events/live/': { results: [
      { id: 1, home_team: 'A', away_team: 'B', event_date: iso(-H), status: 'inprogress', home_score: 0, away_score: 0, current_minute: 20, live_websocket: true },
      { id: 2, home_team: 'C', away_team: 'D', event_date: iso(-H), status: 'inprogress', home_score: 1, away_score: 1, current_minute: 50, live_websocket: false },
    ] },
  };
  const fetchImpl = async (url) => {
    const body = routes[new URL(url).pathname.replace('/api/v2', '')];
    return new Response(JSON.stringify(body ?? {}), { status: body ? 200 : 404 });
  };
  const feed = createFeed(db, { token: 't', fetchImpl, liveSocket });
  await feed.syncLive();
  assert.deepEqual(tracked.at(-1), ['1']);

  // A fresh socket price survives the next REST poll when the score has not changed.
  const id = db.prepare("SELECT id FROM events WHERE external_id = '1'").get().id;
  db.prepare("INSERT INTO selections (event_id, code, odds_x100) VALUES (?, '1', 200), (?, '2', 300)").run(id, id);
  db.prepare('UPDATE events SET live_odds_at = ? WHERE id = ?').run(nowIso(), id);
  await feed.syncLive();
  assert.ok(sels(db, id).every((s) => s.active === 1));

  // …but not a goal reported by REST.
  routes['/events/live/'].results[0].home_score = 1;
  await feed.syncLive();
  assert.ok(sels(db, id).every((s) => s.active === 0));
  db.close();
});

test('in play the pre-match book, or one that ignores the score, never opens the market', async () => {
  FakeSocket.all = [];
  const db = openDb(':memory:');
  const id = liveEvent(db, 99);
  db.prepare("INSERT INTO selections (event_id, code, odds_x100, active) VALUES (?, '1', 218, 0), (?, 'X', 332, 0), (?, '2', 324, 0)").run(id, id, id);
  const live = createLiveSocket(db, { token: 'tok', WebSocketImpl: FakeSocket });
  live.track(['99']);
  await tick();
  const sock = FakeSocket.all[0];
  sock.push({ type: 'event', event_id: 99, score: { home: 1, away: 3 }, time: { minute: 45, display: "45'", status: 'live' } });
  // Same prices as before kick-off: refused.
  sock.push({ type: 'odds', event_id: 99, odds: { match_winner: { home: 2.18, draw: 3.32, away: 3.24 } } });
  assert.ok(sels(db, id).every((s) => s.active === 0));
  // Moved, but the side two goals up is still the longer price: refused.
  sock.push({ type: 'odds', event_id: 99, odds: { match_winner: { home: 2.2, draw: 3.3, away: 3.2 } } });
  assert.ok(sels(db, id).every((s) => s.active === 0));
  assert.equal(ev(db, id).live_odds_at, null);
  // A real in-play book: opens.
  sock.push({ type: 'odds', event_id: 99, odds: { match_winner: { home: 21, draw: 8.5, away: 1.08 } } });
  assert.ok(sels(db, id).every((s) => s.active === 1));
  assert.ok(ev(db, id).live_odds_at);
  live.stop();
  db.close();
});
