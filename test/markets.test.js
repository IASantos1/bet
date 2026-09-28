import { test } from 'node:test';
import assert from 'node:assert/strict';
import { legOutcome, isValidSelection, selectionLabel } from '../server/markets.js';
import { openDb, nowIso } from '../server/db.js';
import { seed } from '../server/seed.js';
import { createApp } from '../server/app.js';
import { createLiveSocket, liveOddsPrices } from '../server/livews.js';

test('settlement rules per market', () => {
  const cases = [
    ['1x2', '1', 2, 1, 'won'], ['1x2', 'X', 2, 1, 'lost'], ['1x2', 'X', 1, 1, 'won'],
    ['dc', '1X', 1, 1, 'won'], ['dc', '1X', 0, 1, 'lost'], ['dc', '12', 0, 0, 'lost'], ['dc', 'X2', 0, 3, 'won'],
    ['dnb', '1', 2, 0, 'won'], ['dnb', '1', 0, 2, 'lost'], ['dnb', '2', 1, 1, 'void'],
    ['ou', 'O2.5', 2, 1, 'won'], ['ou', 'O2.5', 1, 1, 'lost'], ['ou', 'U2.5', 1, 1, 'won'], ['ou', 'O0.5', 0, 0, 'lost'], ['ou', 'U4.5', 3, 2, 'lost'],
    ['btts', 'Y', 1, 1, 'won'], ['btts', 'Y', 2, 0, 'lost'], ['btts', 'N', 0, 0, 'won'],
  ];
  for (const [m, c, h, a, want] of cases) assert.equal(legOutcome(m, c, h, a), want, `${m} ${c} ${h}-${a}`);
  assert.ok(isValidSelection('ou', 'O3.5'));
  assert.ok(!isValidSelection('ou', 'O2'));
  assert.equal(selectionLabel('dc', '1X', 'Benfica', 'Porto'), 'Benfica ou empate');
  assert.equal(selectionLabel('ou', 'U1.5'), 'Menos de 1.5');
});

async function start(db, opts = {}) {
  const server = createApp(db, { loginAttempts: 1000, registrations: 1000, ...opts }).listen(0);
  await new Promise((r) => server.once('listening', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  let cookie = '';
  const call = async (method, path, body) => {
    const res = await fetch(base + path, { method, headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}) }, body: body ? JSON.stringify(body) : undefined });
    const set = res.headers.get('set-cookie');
    if (set) cookie = set.split(';')[0];
    return { status: res.status, body: res.status === 204 ? null : await res.json() };
  };
  return { server, base, call };
}

test('match page lists every market; bets on other markets settle on the final score', async () => {
  const db = openDb(':memory:');
  seed(db);
  const { server, call } = await start(db);
  const events = (await call('GET', '/api/events')).body.events;
  const ev = events.find((e) => e.status === 'scheduled' && e.sport === 'futebol');
  assert.deepEqual(ev.selections.map((s) => s.market), ['1x2', '1x2', '1x2'], 'lists carry only 1X2');
  assert.equal(ev.marketCount, 4);

  const detail = (await call('GET', `/api/events/${ev.id}`)).body.event;
  assert.deepEqual(detail.markets.map((m) => m.market), ['1x2', 'dc', 'dnb', 'ou', 'btts']);
  const over25 = detail.markets.find((m) => m.market === 'ou').selections.find((s) => s.code === 'O2.5');
  const bttsNo = detail.markets.find((m) => m.market === 'btts').selections.find((s) => s.code === 'N');
  assert.equal(over25.label, 'Mais de 2.5');

  await call('POST', '/api/auth/register', { name: 'Rui', email: 'rui@x.pt', password: 'segredo123', birthdate: '1990-01-01', acceptTerms: true });
  await call('POST', '/api/wallet/deposit', { amount: 100 });
  let r = await call('POST', '/api/bets', { mode: 'single', stake: 10, selections: [{ selectionId: over25.id, odds: over25.odds }, { selectionId: bttsNo.id, odds: bttsNo.odds }] });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  // Two markets of the same match cannot be combined in a multiple.
  r = await call('POST', '/api/bets', { mode: 'multiple', stake: 10, selections: [{ selectionId: over25.id, odds: over25.odds }, { selectionId: bttsNo.id, odds: bttsNo.odds }] });
  assert.equal(r.status, 400);

  const bets = (await call('GET', '/api/bets')).body.bets;
  assert.equal(bets[0].legs[0].marketName, 'Ambas as equipas marcam');

  // Admin settles 3-0: over 2.5 wins, "both score: no" wins.
  const admin = await start(db);
  await admin.call('POST', '/api/auth/login', { email: 'admin@classicbet.local', password: 'admin12345' });
  await admin.call('POST', `/api/admin/events/${ev.id}/result`, { homeScore: 3, awayScore: 0 });
  const after = (await call('GET', '/api/bets')).body.bets;
  assert.deepEqual(after.map((b) => b.status).sort(), ['won', 'won']);
  const wallet = (await call('GET', '/api/wallet')).body;
  assert.equal(wallet.balance, Math.round((80 + 10 * over25.odds + 10 * bttsNo.odds) * 100) / 100);
  server.close();
  admin.server.close();
  db.close();
});

test('in-play odds frames price every live market', () => {
  assert.deepEqual(liveOddsPrices({
    match_winner: { home: 2.1, draw: 3.2, away: 3.6 },
    over_under: { over_15: 1.28, under_15: 3.75, over_25: 2.05, under_25: 1.78 },
    btts: { yes: 2, no: 1.8 },
  }), { '1x2|1': 210, '1x2|X': 320, '1x2|2': 360, 'ou|O1.5': 128, 'ou|U1.5': 375, 'ou|O2.5': 205, 'ou|U2.5': 178, 'btts|Y': 200, 'btts|N': 180 });
});

test('live stream: snapshot then real-time frames over server-sent events', async () => {
  const db = openDb(':memory:');
  const ts = nowIso();
  const { lastInsertRowid } = db.prepare(
    `INSERT INTO events (sport, competition, home, away, start_time, status, home_score, away_score, source, external_id, created_at, updated_at)
     VALUES ('futebol', 'Liga', 'Casa', 'Fora', ?, 'live', 0, 0, 'bzzoiro', '777', ?, ?)`
  ).run(ts, ts, ts);
  const id = Number(lastInsertRowid);
  const sockets = [];
  class FakeSocket { constructor() { sockets.push(this); queueMicrotask(() => this.onopen?.()); } send() {} close() {} push(f) { this.onmessage?.({ data: JSON.stringify(f) }); } }
  const liveSocket = createLiveSocket(db, { token: 't', WebSocketImpl: FakeSocket });
  liveSocket.track(['777']);
  await new Promise((r) => setImmediate(r));
  sockets[0].push({ type: 'livedata', event_id: 777, uts: 1, side: 'home', situation: 'attack', coordinates: [{ x: 60, y: 40 }] });

  const { server, base } = await start(db, { liveSocket });
  const res = await fetch(`${base}/api/events/${id}/live`);
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let text = '';
  const readUntil = async (needle) => {
    while (!text.includes(needle)) {
      const { value, done } = await reader.read();
      if (done) throw new Error(`stream ended before "${needle}"`);
      text += dec.decode(value);
    }
  };
  try {
    assert.match(res.headers.get('content-type'), /^text\/event-stream/);
    await readUntil('event: snapshot');
    await readUntil('\n\n');
    assert.match(text, /"situation":"attack"/);
    sockets[0].push({ type: 'event', event_id: 777, score: { home: 1, away: 0 }, time: { minute: 12, display: "12'" } });
    await readUntil('event: event');
    await readUntil('"homeScore":1');
    sockets[0].push({ type: 'livedata', event_id: 777, side: 'away', situation: 'dangerous_attack', coordinates: [{ x: 20, y: 55 }] });
    await readUntil('dangerous_attack');
    // Scheduled / manual matches have no stream.
    assert.equal((await fetch(`${base}/api/events/999/live`)).status, 204);
  } finally {
    await reader.cancel().catch(() => {});
    liveSocket.stop();
    server.closeAllConnections();
    server.close();
    db.close();
  }
});

test('handicap, games total and odd/even settlement', () => {
  const g = { homeGames: 16, awayGames: 13 };
  const cases = [
    ['hcp', '1-1.5', 2, 0, 'won'], ['hcp', '1-1.5', 2, 1, 'lost'], ['hcp', '2+1.5', 2, 1, 'won'], ['hcp', '1-1', 2, 1, 'void'],
    ['gou', 'O28.5', 2, 1, 'won'], ['gou', 'U28.5', 2, 1, 'lost'],
    ['ghcp', '1-3.5', 2, 1, 'lost'], ['ghcp', '2+3.5', 2, 1, 'won'],
    ['goe', 'ODD', 2, 1, 'won'], ['goe', 'EVEN', 2, 1, 'lost'],
  ];
  for (const [m, code, h, a, want] of cases) assert.equal(legOutcome(m, code, h, a, g), want, `${m} ${code}`);
  assert.equal(legOutcome('gou', 'O20.5', 2, 1), 'void'); // games unknown
  assert.ok(isValidSelection('hcp', '1-1.5') && isValidSelection('gou', 'O20.5') && !isValidSelection('gou', 'O20'));
  assert.equal(selectionLabel('ghcp', '1+3.5', 'Alcaraz', 'Sinner'), 'Alcaraz +3.5');
  assert.equal(selectionLabel('goe', 'EVEN'), 'Par');
});
