import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb, nowIso, tx } from '../server/db.js';
import { seed } from '../server/seed.js';
import { createApp } from '../server/app.js';
import { createFeatured, builderConflict, builderOdds, impliedLeg } from '../server/featured.js';
import { settleEvent } from '../server/betting.js';
import { config } from '../server/config.js';

// A tiny seeded random, so draws are repeatable.
const seeded = (n) => () => { n = (n * 16807) % 2147483647; return (n - 1) / 2147483646; };

function addEvent(db, { sport = 'futebol', hours = 3, home, away }) {
  const id = Number(db.prepare(`INSERT INTO events (sport, competition, home, away, start_time, status, created_at, updated_at)
    VALUES (?, 'Liga', ?, ?, ?, 'scheduled', ?, ?)`).run(sport, home, away, new Date(Date.now() + hours * 3600_000).toISOString(), nowIso(), nowIso()).lastInsertRowid);
  const add = (market, code, odds) => db.prepare('INSERT INTO selections (event_id, market, code, odds_x100, active) VALUES (?, ?, ?, ?, 1)').run(id, market, code, odds);
  if (sport === 'futebol') {
    add('1x2', '1', 150); add('1x2', 'X', 380); add('1x2', '2', 600);
    add('dc', '1X', 110); add('dc', 'X2', 210);
    add('ou', 'O2.5', 190); add('ou', 'U2.5', 185); add('ou', 'U1.5', 300);
    add('btts', 'Y', 170); add('btts', 'N', 200);
    add('x', '77~Cantos · Total~Mais de (8.5)', 180);
  } else {
    add('ml', '1', 140); add('ml', '2', 280);
  }
  return id;
}

test('builder rules: double chance only covering the result, no "both score" + under 1.5, one pick per market', () => {
  assert.equal(builderConflict([{ market: '1x2', code: '1' }, { market: 'dc', code: '1X' }]), null);
  assert.equal(builderConflict([{ market: '1x2', code: '1' }, { market: 'dc', code: '12' }]), null);
  assert.match(builderConflict([{ market: '1x2', code: '1' }, { market: 'dc', code: 'X2' }]), /dupla/);
  assert.match(builderConflict([{ market: '1x2', code: 'X' }, { market: 'dc', code: '12' }]), /dupla/);
  assert.match(builderConflict([{ market: 'btts', code: 'Y' }, { market: 'ou', code: 'U1.5' }]), /Ambas/);
  assert.match(builderConflict([{ market: 'ou', code: 'O2.5' }, { market: 'ou', code: 'O1.5' }]), /mesmo mercado/);
  assert.equal(builderConflict([{ market: '1x2', code: '1' }, { market: 'btts', code: 'Y' }, { market: 'ou', code: 'O2.5' }]), null);
  assert.equal(builderOdds([1.5, 1.7, 1.9]), Math.round(1.5 * 1.7 * 1.9 * config.builderFactor * 100) / 100);
  // A double chance covering the result is certain with it: priced at 1.00.
  const legs = [{ market: '1x2', code: '1', odds: 1.5 }, { market: 'dc', code: '1X', odds: 1.1 }, { market: 'ou', code: 'O2.5', odds: 1.9 }];
  assert.ok(impliedLeg(legs[1], legs));
  assert.equal(builderOdds(legs), Math.round(1.5 * 1.9 * config.builderFactor * 100) / 100);
});

test('featured: six builders (result + one more market + goals) and four-leg multiples', () => {
  const db = openDb(':memory:');
  for (let i = 0; i < 8; i++) addEvent(db, { home: `Casa ${i}`, away: `Fora ${i}` });
  for (let i = 0; i < 10; i++) addEvent(db, { sport: i % 2 ? 'tenis' : 'basquetebol', home: `P${i}`, away: `Q${i}` });
  const f = createFeatured(db, { rng: seeded(7) }).get();
  assert.equal(f.builders.length, 6);
  for (const b of f.builders) {
    assert.equal(b.legs.length, 3);
    assert.equal(b.legs[0].market, '1x2');
    assert.ok(['dc', 'btts', 'x'].includes(b.legs[1].market), b.legs[1].market);
    if (b.legs[1].market === 'dc') {
      assert.ok(b.legs[1].code.includes(b.legs[0].code));
      assert.equal(b.legs[1].implied, true);
      assert.equal(b.odds, Math.round(b.legs[0].odds * b.legs[2].odds * config.builderFactor * 100) / 100);
    }
    assert.equal(b.legs[2].market, 'ou');
    assert.equal(builderConflict(b.legs), null);
    assert.ok(b.legs[0].odds <= 5);
    assert.equal(new Set(b.legs.map((l) => l.eventId)).size, 1);
  }
  assert.ok(f.accas.length >= 2);
  for (const a of f.accas) {
    assert.equal(a.legs.length, 4);
    assert.equal(new Set(a.legs.map((l) => l.eventId)).size, 4);
    for (const l of a.legs) assert.ok(l.odds >= 1.15 && l.odds <= 1.95 && l.code !== 'X');
    assert.ok(a.lastStart);
  }
  // No match is used by two multiples.
  const used = f.accas.flatMap((a) => a.legs.map((l) => l.eventId));
  assert.equal(new Set(used).size, used.length);
  // Football first; other sports only in whole cards of their own, after it runs out.
  for (const a of f.accas) assert.equal(new Set(a.legs.map((l) => l.sport)).size, 1);
  const sports = f.accas.map((a) => a.legs[0].sport);
  assert.deepEqual(sports.slice(0, 2), ['futebol', 'futebol']);
  assert.ok(sports.slice(2).every((sp) => sp !== 'futebol'));
  assert.equal(sports[2], 'tenis');
});

test('accas: football of today, then football of the next days, before any other sport', () => {
  const db = openDb(':memory:');
  for (let i = 0; i < 4; i++) addEvent(db, { home: `Hoje ${i}`, away: `X${i}`, hours: 1 + i * 0.1 });
  for (let i = 0; i < 8; i++) addEvent(db, { home: `Depois ${i}`, away: `Y${i}`, hours: 30 + i });
  for (let i = 0; i < 8; i++) addEvent(db, { sport: 'tenis', home: `T${i}`, away: `U${i}`, hours: 1 });
  const f = createFeatured(db, { rng: seeded(11) }).get();
  const sports = f.accas.map((a) => a.legs[0].sport);
  assert.deepEqual(sports, ['futebol', 'futebol', 'futebol', 'tenis', 'tenis']);
  assert.ok(f.accas[0].legs.every((l) => l.home.startsWith('Hoje')));
});

test('bet builder bet: one match, priced with the margin, settled with it', async () => {
  const db = openDb(':memory:');
  seed(db);
  const ev = addEvent(db, { home: 'Alfa', away: 'Beta' });
  const other = addEvent(db, { home: 'Gama', away: 'Delta' });
  const sel = (id, market, code) => db.prepare('SELECT id, odds_x100 FROM selections WHERE event_id = ? AND market = ? AND code = ?').get(id, market, code);
  const server = createApp(db, { loginAttempts: 1000, registrations: 1000 }).listen(0);
  await new Promise((r) => server.once('listening', r));
  let cookie = '';
  const call = async (method, path, body) => {
    const res = await fetch(`http://127.0.0.1:${server.address().port}${path}`, { method, headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}) }, body: body ? JSON.stringify(body) : undefined });
    const set = res.headers.get('set-cookie');
    if (set) cookie = set.split(';')[0];
    return { status: res.status, body: await res.json() };
  };
  try {
    assert.equal((await call('POST', '/api/auth/register', { name: 'Ana Silva', email: 'b@example.com', password: 'segredo123', birthdate: '1990-05-10', acceptTerms: true })).status, 201);
    db.prepare("UPDATE users SET balance_cents = 10000 WHERE email = 'b@example.com'").run();
    const pick = (s) => ({ selectionId: s.id, odds: s.odds_x100 / 100 });
    const legs = [sel(ev, '1x2', '1'), sel(ev, 'btts', 'Y'), sel(ev, 'ou', 'O2.5')];
    // Refused: two matches; a double chance without the result; a single leg.
    assert.equal((await call('POST', '/api/bets', { mode: 'builder', stake: 10, selections: [pick(legs[0]), pick(sel(other, 'btts', 'Y'))] })).status, 400);
    assert.equal((await call('POST', '/api/bets', { mode: 'builder', stake: 10, selections: [pick(legs[0]), pick(sel(ev, 'dc', 'X2'))] })).status, 400);
    // Result + the double chance covering it + goals: the double chance counts as 1.00.
    const dc = await call('POST', '/api/bets', { mode: 'builder', stake: 10, selections: [legs[0], sel(ev, 'dc', '1X'), legs[2]].map(pick) });
    assert.equal(dc.status, 201, JSON.stringify(dc.body));
    const dcBet = db.prepare('SELECT * FROM bets WHERE id = ?').get(dc.body.betIds[0]);
    assert.equal(dcBet.total_odds, Math.round(1.5 * 1.9 * config.builderFactor * 100) / 100);
    assert.equal((await call('POST', '/api/bets', { mode: 'builder', stake: 10, selections: [pick(legs[0])] })).status, 400);
    const r = await call('POST', '/api/bets', { mode: 'builder', stake: 10, selections: legs.map(pick) });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    const bet = db.prepare('SELECT * FROM bets WHERE id = ?').get(r.body.betIds[0]);
    assert.equal(bet.type, 'builder');
    const product = 1.5 * 1.7 * 1.9;
    assert.equal(bet.total_odds, Math.round(product * config.builderFactor * 100) / 100);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM bet_legs WHERE bet_id = ?').get(bet.id).n, 3);
    // 2-1: all three legs win; the payout keeps the margin.
    tx(db, () => {
      db.prepare("UPDATE events SET status = 'finished', home_score = 2, away_score = 1 WHERE id = ?").run(ev);
      settleEvent(db, ev);
    });
    const done = db.prepare('SELECT * FROM bets WHERE id = ?').get(bet.id);
    assert.equal(done.status, 'won');
    assert.ok(Math.abs(done.payout_cents - Math.floor(1000 * product * config.builderFactor)) <= 1, `${done.payout_cents}`);
    const dcDone = db.prepare('SELECT * FROM bets WHERE id = ?').get(dcBet.id);
    assert.equal(dcDone.status, 'won');
    assert.ok(Math.abs(dcDone.payout_cents - Math.round(1000 * dcBet.total_odds)) <= 1, `${dcDone.payout_cents}`); // the quoted total
    // The sports page draws use the same price.
    const f = await call('GET', '/api/featured');
    assert.equal(f.status, 200);
    assert.equal(typeof f.body.builderFactor, 'number');
  } finally {
    server.close();
    db.close();
  }
});

test('featured: a short draw (board still filling after a restart) is redrawn after a minute, not kept ten', () => {
  const db = openDb(':memory:');
  let t = Date.now();
  const f = createFeatured(db, { rng: seeded(3), now: () => t });
  assert.equal(f.get().builders.length, 0);
  for (let i = 0; i < 7; i++) addEvent(db, { home: `C${i}`, away: `F${i}` });
  t += 30_000;
  assert.equal(f.get().builders.length, 0); // still within the minute
  t += 40_000;
  assert.equal(f.get().builders.length, 6);
});
