import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb, nowIso } from '../server/db.js';
import { seed } from '../server/seed.js';
import { createApp } from '../server/app.js';
import { pickFamilies, drawCards, popularLabel, createMatchPicks, BOOST_PCT, SUPER_BOOST_PCT } from '../server/picks.js';

// A football match with the markets WinHouse gives (ours and the provider's), Sporting the favourite.
function match(db) {
  const soon = new Date(Date.now() + 6 * 3_600_000).toISOString();
  const id = Number(db.prepare(`INSERT INTO events (sport, competition, home, away, start_time, status, source, external_id, created_at, updated_at)
    VALUES ('futebol', 'Liga Portugal', 'Sporting CP', 'Rio Ave', ?, 'scheduled', 'winhouse', 'p1', ?, ?)`).run(soon, nowIso(), nowIso()).lastInsertRowid);
  const add = (market, code, odds) => db.prepare('INSERT INTO selections (event_id, market, code, odds_x100, active) VALUES (?, ?, ?, ?, 1)').run(id, market, code, odds);
  add('1x2', '1', 140); add('1x2', 'X', 450); add('1x2', '2', 750);
  add('dc', '1X', 118); add('dc', '12', 120); add('dc', 'X2', 280);
  add('btts', 'Y', 190); add('btts', 'N', 185);
  add('ou', 'O1.5', 125); add('ou', 'O2.5', 175); add('ou', 'U2.5', 205); add('ou', 'O3.5', 290);
  add('tou', '1O1.5', 160); add('tou', '1U1.5', 220);
  add('x', '1014~1° Tempo - 1x2~1', 190); add('x', '1014~1° Tempo - 1x2~x', 230); add('x', '1014~1° Tempo - 1x2~2', 600);
  add('x', '1054~1° Tempo - Total de Golos - Mais / Menos~Mais de (0.5)', 130); add('x', '1054~1° Tempo - Total de Golos - Mais / Menos~Mais de (1.5)', 240);
  add('x', '1300017~Cantos · Total~Mais de (8.5)', 165); add('x', '1300017~Cantos · Total~Mais de (9.5)', 205); add('x', '1300017~Cantos · Total~Menos de (9.5)', 170);
  add('x', '1300015~Cantos · Total 1~Mais de (5.5)', 175);
  add('x', '1800017~Remates à Baliza · Total~Mais de (8.5)', 180);
  add('x', '1800015~Remates à Baliza · Total 1~Mais de (5.5)', 170);
  add('x', '1500017~Cartões Amarelos · Total~Mais de (3.5)', 185);
  add('x', '1008201~Golo de Cabeça~Sim', 210); add('x', '1008201~Golo de Cabeça~Não', 165);
  return id;
}

test('market kinds for a match: the favourite\'s side, the "over" near 1.70', () => {
  const db = openDb(':memory:');
  const id = match(db);
  const sels = db.prepare('SELECT id, market, code, odds_x100 FROM selections WHERE event_id = ?').all(id);
  const fams = pickFamilies(sels, { fav: '1', team: (n) => (n === '1' ? 'Sporting CP' : 'Rio Ave') });
  const by = Object.fromEntries(fams.map((f) => [f.key, f]));
  assert.equal(by.result.sel.code, '1');
  assert.equal(by.dc.sel.code, '1X');
  assert.equal(by.goals.sel.code, 'O2.5'); // 1.75, the nearest to 1.70
  assert.match(by.corners.sel.code, /Mais de \(8\.5\)$/);
  assert.equal(by.teamCorners.name, 'Sporting CP Cantos Mais/Menos');
  assert.ok(!by.headed && !by.htCorners); // not settled from the result or the tracker: left out
  assert.match(by.htResult.sel.code, /~1$/);
  // No clear favourite: no result legs.
  assert.ok(!pickFamilies(sels, { fav: null, team: () => '' }).some((f) => f.group === 'result'));
});

test('cards: three different kinds each, not repetitive, priced 2.00–15', () => {
  const db = openDb(':memory:');
  const id = match(db);
  const sels = db.prepare('SELECT id, market, code, odds_x100 FROM selections WHERE event_id = ?').all(id);
  let n = 0;
  const cards = drawCards(pickFamilies(sels, { fav: '1', team: () => 'Sporting CP' }), () => ((n = (n * 9301 + 49297) % 233280) / 233280));
  assert.equal(cards.length, 8);
  const pairs = new Set();
  const uses = new Map();
  for (const c of cards) {
    assert.equal(new Set(c.families.map((f) => f.group)).size, 3);
    assert.ok(c.odds >= 2 && c.odds <= 15, String(c.odds));
    const k = c.families.map((f) => f.key).sort();
    for (const p of [`${k[0]}${k[1]}`, `${k[0]}${k[2]}`, `${k[1]}${k[2]}`]) { assert.ok(!pairs.has(p), `pair ${p} twice`); pairs.add(p); }
    for (const f of k) uses.set(f, (uses.get(f) || 0) + 1);
  }
  assert.ok([...uses.values()].every((v) => v <= 3));
  assert.equal(popularLabel(9), null);
  assert.equal(popularLabel(130), '100+');
});

async function start(db) {
  const server = createApp(db, { loginAttempts: 1000, registrations: 1000 }).listen(0);
  await new Promise((r) => server.once('listening', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  let cookie = '';
  const call = async (method, path, body) => {
    const res = await fetch(base + path, { method, headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}) }, body: body ? JSON.stringify(body) : undefined });
    const set = res.headers.get('set-cookie');
    if (set) cookie = set.split(';')[0];
    return { status: res.status, body: res.status === 204 ? null : await res.json() };
  };
  return { server, call };
}

test('a card placed from the match page is priced with its boost; a stale card is refused', async () => {
  const db = openDb(':memory:');
  seed(db);
  const id = match(db);
  const { server, call } = await start(db);
  try {
    const { picks } = (await call('GET', `/api/events/${id}/picks`)).body;
    assert.ok(picks.length >= 6);
    assert.equal(picks.filter((p) => p.super).length, 2);
    assert.ok(picks.every((p) => p.pct === (p.super ? SUPER_BOOST_PCT : BOOST_PCT) && p.legs.length === 3 && p.boosted > p.odds));
    assert.ok(picks.some((p) => p.legs.some((l) => /^Mais de \d/.test(l.label)))); // "Mais de (9.5)" shown as "Mais de 9.5"
    await call('POST', '/api/auth/register', { name: 'Rui', email: 'rui@x.pt', password: 'segredo123', birthdate: '1990-01-01', acceptTerms: true });
    await call('POST', '/api/wallet/deposit', { amount: 100 });
    const p = picks[0];
    const selections = p.legs.map((l) => ({ selectionId: l.selectionId, odds: l.odds }));
    const r = await call('POST', '/api/bets', { mode: 'builder', stake: 10, pickKey: p.key, selections });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    const bet = db.prepare('SELECT total_odds, pick_key FROM bets WHERE id = ?').get(r.body.betIds[0]);
    assert.equal(bet.total_odds, p.boosted);
    assert.equal(bet.pick_key, p.key);
    // Another set of picks under that card's key: no boost, refused.
    const other = await call('POST', '/api/bets', { mode: 'builder', stake: 10, pickKey: p.key, selections: picks[1].legs.map((l) => ({ selectionId: l.selectionId, odds: l.odds })) });
    assert.equal(other.status, 409);
    // The same legs as a plain builder: no boost.
    const plain = await call('POST', '/api/bets', { mode: 'builder', stake: 10, selections });
    assert.equal(plain.status, 201);
    assert.ok(db.prepare('SELECT total_odds FROM bets WHERE id = ?').get(plain.body.betIds[0]).total_odds < p.boosted);
  } finally { server.close(); }
});

test('the popularity badge counts the bets placed on a card', () => {
  const db = openDb(':memory:');
  seed(db);
  const id = match(db);
  const picks = createMatchPicks(db);
  const card = picks.forEvent(id)[0];
  assert.equal(card.popular, null);
  const ins = db.prepare("INSERT INTO bets (user_id, type, stake_cents, total_odds, potential_cents, created_at, pick_key) VALUES (1, 'builder', 100, 3, 300, ?, ?)");
  for (let i = 0; i < 27; i++) ins.run(nowIso(), card.key);
  assert.equal(picks.forEvent(id)[0].popular, '25+');
});
