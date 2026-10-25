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
  assert.ok(isValidSelection('ou', 'O2')); // whole line: a push voids
  assert.ok(!isValidSelection('ou', 'O2.25'));
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

test('other provider markets: shown on the match page, bet like the rest, settled by the operator', async () => {
  const db = openDb(':memory:');
  seed(db);
  const { server, call } = await start(db);
  const ev = (await call('GET', '/api/events')).body.events.find((e) => e.status === 'scheduled' && e.sport === 'futebol');
  const add = db.prepare("INSERT INTO selections (event_id, market, code, odds_x100, active) VALUES (?, 'x', ?, ?, 1)");
  add.run(ev.id, '1300017~Cantos · Total~Mais de (8.5)', 185);
  add.run(ev.id, '1300017~Cantos · Total~Menos de (8.5)', 190);
  add.run(ev.id, '1012~1st Half / Fulltime~1/1', 300);
  const detail = (await call('GET', `/api/events/${ev.id}`)).body.event;
  const corners = detail.markets.find((m) => m.name === 'Cantos · Total');
  assert.deepEqual(corners.selections.map((s) => s.label), ['Mais de (8.5)', 'Menos de (8.5)']);
  assert.ok(detail.markets.some((m) => m.name === '1st Half / Fulltime'));

  await call('POST', '/api/auth/register', { name: 'Ana', email: 'ana@x.pt', password: 'segredo123', birthdate: '1990-01-01', acceptTerms: true });
  await call('POST', '/api/wallet/deposit', { amount: 100 });
  const over = corners.selections[0];
  let r = await call('POST', '/api/bets', { mode: 'single', stake: 10, selections: [{ selectionId: over.id, odds: over.odds }] });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  assert.equal((await call('GET', '/api/bets')).body.bets[0].legs[0].marketName, 'Cantos · Total');

  // The final score does not settle it: it waits in Liquidação.
  const admin = await start(db);
  await admin.call('POST', '/api/auth/login', { email: 'admin@classicbet.local', password: 'admin12345' });
  await admin.call('POST', `/api/admin/events/${ev.id}/result`, { homeScore: 2, awayScore: 1 });
  assert.equal((await call('GET', '/api/bets')).body.bets[0].status, 'open');
  const desk = (await admin.call('GET', '/api/admin/settlement')).body;
  const item = desk.queue.find((q) => q.id === ev.id);
  assert.deepEqual(item.specials.map((x) => [x.group, x.label, x.bets]), [['Cantos · Total', 'Mais de (8.5)', 1]]);
  await admin.call('POST', '/api/admin/settlement/run', {});
  assert.equal((await call('GET', '/api/bets')).body.bets[0].status, 'open', 'the safety net leaves it to the operator');

  r = await admin.call('POST', `/api/admin/events/${ev.id}/special`, { code: item.specials[0].code, result: 'won' });
  assert.equal(r.body.settledBets, 1);
  assert.equal((await call('GET', '/api/bets')).body.bets[0].status, 'won');
  assert.equal((await call('GET', '/api/wallet')).body.balance, 90 + 18.5);
  assert.ok(!(await admin.call('GET', '/api/admin/settlement')).body.queue.some((q) => q.id === ev.id));
  server.close();
  admin.server.close();
  db.close();
});

test('a market the operator hides leaves the match page and the slip; showing it again brings it back', async () => {
  const db = openDb(':memory:');
  seed(db);
  const { server, call } = await start(db);
  const admin = await start(db);
  await admin.call('POST', '/api/auth/login', { email: 'admin@classicbet.local', password: 'admin12345' });
  const ev = (await call('GET', '/api/events')).body.events.find((e) => e.status === 'scheduled' && e.sport === 'futebol');
  const btts = (await call('GET', `/api/events/${ev.id}`)).body.event.markets.find((m) => m.market === 'btts').selections[0];
  const vis = (await admin.call('GET', '/api/admin/market-visibility')).body.sports.futebol;
  assert.ok(vis.some((m) => m.key === 'btts' && m.own && !m.hidden && m.games > 0));
  assert.equal((await admin.call('POST', '/api/admin/market-visibility', { sport: 'futebol', key: 'btts', hidden: true })).status, 200);
  assert.ok(!(await call('GET', `/api/events/${ev.id}`)).body.event.markets.some((m) => m.market === 'btts'));
  assert.ok((await admin.call('GET', '/api/admin/market-visibility')).body.sports.futebol.find((m) => m.key === 'btts').hidden);
  await call('POST', '/api/auth/register', { name: 'Rui', email: 'rui@x.pt', password: 'segredo123', birthdate: '1990-01-01', acceptTerms: true });
  await call('POST', '/api/wallet/deposit', { amount: 100 });
  const r = await call('POST', '/api/bets', { mode: 'single', stake: 5, selections: [{ selectionId: btts.id, odds: btts.odds }] });
  assert.equal(r.status, 409);
  await admin.call('POST', '/api/admin/market-visibility', { sport: 'futebol', key: 'btts', hidden: false });
  assert.ok((await call('GET', `/api/events/${ev.id}`)).body.event.markets.some((m) => m.market === 'btts'));
  assert.equal((await call('POST', '/api/admin/market-visibility', { sport: 'futebol', key: 'btts', hidden: true })).status, 403);
  server.close();
  admin.server.close();
});

test('a game with no winner of ours shows the provider\'s winner on its card: home / away before a 1X2', async () => {
  const db = openDb(':memory:');
  seed(db);
  const soon = new Date(Date.now() + 3_600_000).toISOString();
  const id = Number(db.prepare(`INSERT INTO events (sport, competition, home, away, start_time, status, source, external_id, created_at, updated_at)
    VALUES ('criquete', 'IMC. World Cup Over 40s', 'Rest of the Caribbean', 'Scotland', ?, 'scheduled', 'winhouse', 'c1', ?, ?)`).run(soon, nowIso(), nowIso()).lastInsertRowid);
  const add = (code, odds) => db.prepare("INSERT INTO selections (event_id, market, code, odds_x100, active) VALUES (?, 'x', ?, ?, 1)").run(id, code, odds);
  add('20~Resultado do Jogo de Críquete (1x2)~1', 152); add('20~Resultado do Jogo de Críquete (1x2)~x', 3000); add('20~Resultado do Jogo de Críquete (1x2)~2', 232);
  add('31~1.ª entrada - Vencedor~1', 190); add('31~1.ª entrada - Vencedor~2', 180);
  add('10~Resultado final 2 vias~1', 152); add('10~Resultado final 2 vias~2', 231);
  const { server, call } = await start(db);
  const ev = (await call('GET', '/api/events')).body.events.find((e) => e.id === id);
  assert.deepEqual(ev.selections.map((s) => [s.code, s.odds]), [['1', 1.52], ['2', 2.31]]);
  // With the two-way one hidden by the operator, the 1X2 takes its place.
  db.prepare("INSERT INTO settings (key, value, updated_at) VALUES ('markets.hidden', ?, ?)").run(JSON.stringify({ criquete: ['x:10'] }), nowIso());
  const again = (await call('GET', '/api/events')).body.events.find((e) => e.id === id);
  assert.deepEqual(again.selections.map((s) => s.code), ['1', 'X', '2']);
  server.close();
});

test('a card shows the winner named after the teams (baseball, incl. extra innings)', async () => {
  const db = openDb(':memory:');
  seed(db);
  const soon = new Date(Date.now() + 3_600_000).toISOString();
  const ins = db.prepare(`INSERT INTO events (sport, competition, home, away, start_time, status, source, external_id, created_at, updated_at)
    VALUES ('basebol', 'Dominican Republic. LIDOM', ?, ?, ?, 'scheduled', 'winhouse', ?, ?, ?)`);
  const a = Number(ins.run('Tigres del Licey', 'Aguilas Cibaenas', soon, 'b1', nowIso(), nowIso()).lastInsertRowid);
  const add = (id, code, odds) => db.prepare("INSERT INTO selections (event_id, market, code, odds_x100, active) VALUES (?, 'x', ?, ?, 1)").run(id, code, odds);
  add(a, '40~Vencedor (incl. entradas extra)~Tigres del Licey', 175); add(a, '40~Vencedor (incl. entradas extra)~Aguilas Cibaenas', 205);
  add(a, '41~1.ª entrada - Vencedor~1', 190); add(a, '41~1.ª entrada - Vencedor~2', 180);
  const { server, call } = await start(db);
  const ev = (await call('GET', '/api/events')).body.events.find((x) => x.id === a);
  assert.deepEqual(ev.selections.map((s) => [s.code, s.odds]), [['1', 1.75], ['2', 2.05]]);
  server.close();
});

test('corners, yellow cards and shots on target settle from the tracker\'s counts; an "over" already passed is won at once', async () => {
  const { statOutcome } = await import('../server/markets.js');
  const live = { corners: [6, 4], yellow: [1, 1], sot: [5, 2], final: false };
  const fin = { ...live, final: true };
  assert.equal(statOutcome('1300017~Cantos · Total~Mais de (9.5)', live), 'won'); // 10 already
  assert.equal(statOutcome('1300017~Cantos · Total~Menos de (9.5)', live), 'lost');
  assert.equal(statOutcome('1300017~Cantos · Total~Mais de (10.5)', live), null); // could still happen
  assert.equal(statOutcome('1300017~Cantos · Total~Mais de (10.5)', fin), 'lost');
  assert.equal(statOutcome('1300015~Cantos · Total 1~Mais de (5.5)', live), 'won');
  assert.equal(statOutcome('1300062~Cantos · Total 2~Menos de (4.5)', fin), 'won');
  assert.equal(statOutcome('1500017~Cartões Amarelos · Total~Mais de (3.5)', fin), 'lost');
  assert.equal(statOutcome('1800017~Remates à Baliza · Total~Mais de (6.5)', live), 'won');
  assert.equal(statOutcome('1300017~Cantos · Total~Mais de (10)', fin), null); // whole lines: not read
  assert.equal(statOutcome('1300099~Cantos · Total Asiático~Mais de (9.5)', fin), null); // other markets: not read
  assert.equal(statOutcome('1300017~Cantos · Total~Mais de (9.5)', null), null);

  // A finished match with the tracker's final counts settles a builder with a corners leg.
  const db = openDb(':memory:');
  seed(db);
  const ev = db.prepare("SELECT id FROM events WHERE sport = 'futebol' AND status = 'scheduled' LIMIT 1").get();
  const sel = Number(db.prepare("INSERT INTO selections (event_id, market, code, odds_x100, active) VALUES (?, 'x', '1300017~Cantos · Total~Mais de (8.5)', 170, 1)").run(ev.id).lastInsertRowid);
  const bet = Number(db.prepare("INSERT INTO bets (user_id, type, stake_cents, total_odds, potential_cents, created_at) VALUES (1, 'single', 100, 1.7, 170, ?)").run(nowIso()).lastInsertRowid);
  db.prepare("INSERT INTO bet_legs (bet_id, event_id, selection_id, market, code, odds_x100) VALUES (?, ?, ?, 'x', '1300017~Cantos · Total~Mais de (8.5)', 170)").run(bet, ev.id, sel);
  db.prepare("UPDATE events SET status = 'finished', home_score = 2, away_score = 1, match_stats = ? WHERE id = ?").run(JSON.stringify({ corners: [4, 3], final: true }), ev.id);
  const { settleEvent } = await import('../server/betting.js');
  settleEvent(db, ev.id);
  assert.equal(db.prepare('SELECT status FROM bet_legs WHERE bet_id = ?').get(bet).status, 'lost'); // 7 corners: under 8.5
});
