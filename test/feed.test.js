import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../server/db.js';
import { createFeed, mapStatus, normalizeEvent, normalizeOdds, normalizeOddsRow } from '../server/feed.js';
import { createApp } from '../server/app.js';
import { placeBets } from '../server/betting.js';
import { tx, nowIso } from '../server/db.js';
import { postTransaction } from '../server/wallet.js';

const H = 3600_000;
const iso = (ms) => new Date(Date.now() + ms).toISOString();

/** Fake sports.bzzoiro.com: routes are a map of pathname → JSON (or function returning JSON). */
function fakeApi(routes) {
  const calls = [];
  const fetchImpl = async (url, opts) => {
    const u = new URL(url);
    calls.push({ path: u.pathname, query: Object.fromEntries(u.searchParams), auth: opts.headers.Authorization });
    const key = u.pathname.replace('/api/v2', '');
    const body = typeof routes[key] === 'function' ? routes[key](u) : routes[key];
    if (body === undefined) return new Response(JSON.stringify({ detail: 'Not found' }), { status: 404 });
    return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  return { fetchImpl, calls };
}

function feedFor(db, routes) {
  const api = fakeApi(routes);
  const feed = createFeed(db, { token: 'tok123', baseUrl: 'https://sports.bzzoiro.com/api/v2', fetchImpl: api.fetchImpl });
  return { feed, calls: api.calls };
}

function player(db, balance = 10_000) {
  const { lastInsertRowid } = db.prepare(
    "INSERT INTO users (email, name, birthdate, password_hash, created_at) VALUES (?, 'P', '1990-01-01', 'x', ?)"
  ).run(`p${Math.random()}@x.pt`, nowIso());
  const id = Number(lastInsertRowid);
  tx(db, () => postTransaction(db, id, balance, 'deposit', 'teste'));
  return db.prepare('SELECT * FROM users WHERE id = ?').get(id);
}

const eventRow = (db, ext) => db.prepare("SELECT * FROM events WHERE source = 'bzzoiro' AND external_id = ?").get(String(ext));
const sels = (db, eventId) => db.prepare('SELECT code, odds_x100, active FROM selections WHERE event_id = ? ORDER BY code').all(eventId).map((r) => ({ ...r }));

test('normalizers accept the documented shapes', () => {
  assert.equal(mapStatus('notstarted'), 'scheduled');
  assert.equal(mapStatus('inprogress'), 'live');
  assert.equal(mapStatus('finished'), 'finished');
  assert.equal(mapStatus('postponed'), 'postponed');
  assert.equal(mapStatus('cancelled'), 'cancelled');

  const ev = normalizeEvent({
    id: 212581, home_team: { id: 1, name: 'Netherlands' }, away_team: 'Germany',
    event_date: '2026-09-24T20:45:00+00:00', league: { id: 64, name: 'Friendlies' }, status: 'inprogress',
    home_score: 1, away_score: 0, current_minute: 57,
  });
  assert.deepEqual(ev, {
    externalId: '212581', home: 'Netherlands', away: 'Germany', startTime: '2026-09-24T20:45:00.000Z',
    competition: 'Friendlies', status: 'live', homeScore: 1, awayScore: 0, clock: "57'", homeTeamId: '1', awayTeamId: null, liveWs: false,
  });
  assert.equal(normalizeEvent({ id: 1, home_team: 'A' }), null);

  const { odds, nextUpdateAt } = normalizeOdds({ odds: { home_win: 1.17, draw: 7.26, away_win: null }, next_update_at: '2026-08-17T01:18:14Z' });
  assert.deepEqual(odds, { 1: 117, X: 726, 2: null });
  assert.equal(nextUpdateAt, '2026-08-17T01:18:14Z');
});

test('fixtures sync imports upcoming matches with consensus odds and sends the token', async () => {
  const db = openDb(':memory:');
  const { feed, calls } = feedFor(db, {
    '/events/': { count: 2, next: null, results: [
      { id: 501, home_team: 'Benfica', away_team: 'Porto', event_date: iso(5 * H), league: { name: 'Liga Portugal' }, status: 'notstarted' },
      { id: 502, home_team: 'Arsenal', away_team: 'Chelsea', event_date: iso(30 * H), league: { name: 'Premier League' }, status: 'notstarted' },
    ] },
    '/events/501/odds/': { event_id: 501, odds: { home_win: 2.1, draw: 3.4, away_win: 3.3 }, next_update_at: iso(H) },
    '/events/502/odds/': { event_id: 502, odds: { home_win: null, draw: null, away_win: null }, next_update_at: iso(4 * H) },
  });
  const r = await feed.syncFixtures();
  assert.deepEqual(r, { fixtures: 2, created: 2, priced: 1 });
  assert.ok(calls.every((c) => c.auth === 'Token tok123'));
  assert.equal(calls[0].query.status, 'upcoming');

  const benfica = eventRow(db, 501);
  assert.equal(benfica.competition, 'Liga Portugal');
  assert.deepEqual(sels(db, benfica.id), [{ code: '1', odds_x100: 210, active: 1 }, { code: '2', odds_x100: 330, active: 1 }, { code: 'X', odds_x100: 340, active: 1 }]);
  assert.deepEqual(sels(db, eventRow(db, 502).id), []);

  // Second run: nothing is due for an odds refresh, and nothing is duplicated.
  const before = calls.length;
  const r2 = await feed.syncFixtures();
  assert.deepEqual(r2, { fixtures: 2, created: 0, priced: 0 });
  assert.equal(calls.length - before, 2); // fixtures list + bulk odds (404 here → per-match fallback)
  db.close();
});

test('live sync updates the score and suspends pre-match prices', async () => {
  const db = openDb(':memory:');
  const routes = {
    '/events/': { results: [{ id: 700, home_team: 'Braga', away_team: 'Vitória', event_date: iso(2 * H), status: 'notstarted' }] },
    '/events/700/odds/': { odds: { home_win: 1.9, draw: 3.5, away_win: 4 } },
  };
  const { feed } = feedFor(db, routes);
  await feed.syncFixtures();
  routes['/events/live/'] = [{ id: 700, home_team: 'Braga', away_team: 'Vitória', event_date: iso(-H), status: 'inprogress', home_score: 2, away_score: 1, current_minute: 63 }];
  const r = await feed.syncLive();
  assert.deepEqual(r, { live: 1, updated: 1 });
  const ev = eventRow(db, 700);
  assert.equal(ev.status, 'live');
  assert.equal(ev.home_score, 2);
  assert.equal(ev.clock, "63'");
  assert.ok(sels(db, ev.id).every((s) => s.active === 0));
  db.close();
});

test('results sync settles bets when the provider reports a finished match', async () => {
  const db = openDb(':memory:');
  const routes = {
    '/events/': { results: [
      { id: 801, home_team: 'Sporting', away_team: 'Braga', event_date: iso(2 * H), status: 'notstarted' },
      { id: 802, home_team: 'Porto', away_team: 'Benfica', event_date: iso(3 * H), status: 'notstarted' },
    ] },
    '/events/801/odds/': { odds: { home_win: 2, draw: 3, away_win: 4 } },
    '/events/802/odds/': { odds: { home_win: 2.5, draw: 3, away_win: 2.8 } },
  };
  const { feed } = feedFor(db, routes);
  await feed.syncFixtures();

  const p = player(db, 10_000);
  const s801 = db.prepare("SELECT id FROM selections WHERE event_id = ? AND code = '1'").get(eventRow(db, 801).id).id;
  const s802 = db.prepare("SELECT id FROM selections WHERE event_id = ? AND code = 'X'").get(eventRow(db, 802).id).id;
  tx(db, () => placeBets(db, p, { mode: 'single', stakeCents: 1_000, picks: [{ selectionId: s801, odds: 2 }, { selectionId: s802, odds: 3 }] }));
  assert.equal(db.prepare('SELECT balance_cents FROM users WHERE id = ?').get(p.id).balance_cents, 8_000);

  // Both matches kicked off; 801 ends 2-0 (home win), 802 is cancelled.
  db.prepare("UPDATE events SET start_time = ? WHERE source = 'bzzoiro'").run(iso(-3 * H));
  routes['/events/801/'] = { id: 801, home_team: 'Sporting', away_team: 'Braga', event_date: iso(-3 * H), status: 'finished', home_score: 2, away_score: 0 };
  routes['/events/802/'] = { id: 802, home_team: 'Porto', away_team: 'Benfica', event_date: iso(-3 * H), status: 'cancelled' };
  const r = await feed.syncResults();
  assert.deepEqual(r, { checked: 2, settledEvents: 2, settledBets: 2 });

  assert.equal(eventRow(db, 801).result, '1');
  assert.equal(eventRow(db, 802).status, 'cancelled');
  const bets = db.prepare('SELECT status, payout_cents FROM bets ORDER BY id').all();
  assert.deepEqual(bets.map((b) => [b.status, b.payout_cents]), [['won', 2_000], ['void', 1_000]]);
  // 8.000 left + 20,00 win + 10,00 refund
  assert.equal(db.prepare('SELECT balance_cents FROM users WHERE id = ?').get(p.id).balance_cents, 11_000);

  // Running again changes nothing (no double payout).
  const r2 = await feed.syncResults();
  assert.equal(r2.checked, 0);
  assert.equal(db.prepare('SELECT balance_cents FROM users WHERE id = ?').get(p.id).balance_cents, 11_000);
  db.close();
});

test('postponed match is suspended until it gets a new date', async () => {
  const db = openDb(':memory:');
  const routes = {
    '/events/': { results: [{ id: 901, home_team: 'Luton', away_team: 'Millwall', event_date: iso(H), status: 'notstarted' }] },
    '/events/901/odds/': { odds: { home_win: 2, draw: 3.2, away_win: 3.6 } },
  };
  const { feed } = feedFor(db, routes);
  await feed.syncFixtures();
  db.prepare("UPDATE events SET start_time = ? WHERE source = 'bzzoiro'").run(iso(-H));
  routes['/events/901/'] = { id: 901, home_team: 'Luton', away_team: 'Millwall', event_date: iso(-H), status: 'postponed' };
  await feed.syncResults();
  const ev = eventRow(db, 901);
  assert.equal(ev.status, 'scheduled');
  assert.ok(sels(db, ev.id).every((s) => s.active === 0));
  db.close();
});

test('feed without a token does nothing and reports disabled', async () => {
  const db = openDb(':memory:');
  const feed = createFeed(db, { token: '', fetchImpl: () => { throw new Error('should not be called'); } });
  assert.deepEqual(await feed.syncAll(), { fixtures: { skipped: 'sem token' }, live: { skipped: 'sem token' }, results: { skipped: 'sem token' } });
  assert.equal(feed.status().enabled, false);
  db.close();
});

test('an API error is recorded without crashing the sync', async () => {
  const db = openDb(':memory:');
  const { feed } = feedFor(db, {});
  const r = await feed.syncAll();
  assert.match(r.fixtures.error, /HTTP 404/);
  assert.match(feed.status().lastError, /HTTP 404/);
  db.close();
});

test('bulk odds feed prices many matches in one call and only sends deltas afterwards', async () => {
  const db = openDb(':memory:');
  const oddsQueries = [];
  const routes = {
    '/events/': { results: [
      { id: 11, home_team: { id: 35, name: 'Benfica' }, away_team: { id: 36, name: 'Porto' }, event_date: iso(4 * H), status: 'notstarted' },
      { id: 12, home_team: { id: 40, name: 'Braga' }, away_team: { id: 41, name: 'Sporting' }, event_date: iso(6 * H), status: 'notstarted' },
    ] },
    '/odds/': (u) => {
      oddsQueries.push(Object.fromEntries(u.searchParams));
      if (u.searchParams.get('updated_after')) {
        return { results: [{ event_id: 11, market: '1x2', outcome: 'HOME', decimal_odds: 1.95, bookmaker_slug: 'consensus', updated_at: '2026-09-28T11:00:00Z' }] };
      }
      return { count: 7, next: null, results: [
        { event_id: 11, market: '1x2', outcome: 'HOME', decimal_odds: 2.05, updated_at: '2026-09-28T10:00:00Z' },
        { event_id: 11, market: '1x2', outcome: 'DRAW', decimal_odds: 3.3, updated_at: '2026-09-28T10:00:00Z' },
        { event_id: 11, market: '1x2', outcome: 'AWAY', decimal_odds: 3.6, updated_at: '2026-09-28T10:00:00Z' },
        { event_id: 12, market: '1x2', outcome: 'HOME', decimal_odds: 2.4, updated_at: '2026-09-28T10:05:00Z' },
        { event_id: 12, market: '1x2', outcome: 'AWAY', decimal_odds: 2.9, updated_at: '2026-09-28T10:05:00Z' },
        { event_id: 12, market: 'btts', outcome: 'yes', decimal_odds: 1.8, updated_at: '2026-09-28T10:05:00Z' },
        { event_id: 99, market: '1x2', outcome: 'HOME', decimal_odds: 1.5, updated_at: '2026-09-28T10:05:00Z' },
      ] };
    },
  };
  const { feed, calls } = feedFor(db, routes);
  const r = await feed.syncFixtures();
  assert.equal(r.priced, 2);
  assert.ok(!calls.some((c) => /\/events\/\d+\/odds\//.test(c.path)), 'no per-match odds calls needed');
  assert.equal(oddsQueries[0].market, '1x2');
  assert.deepEqual(sels(db, eventRow(db, 11).id).map((x) => [x.code, x.odds_x100]), [['1', 205], ['2', 360], ['X', 330]]);
  assert.deepEqual(sels(db, eventRow(db, 12).id).map((x) => [x.code, x.odds_x100]), [['1', 240], ['2', 290]]);

  await feed.syncFixtures();
  assert.equal(oddsQueries[1].updated_after, '2026-09-28T10:05:00Z');
  assert.equal(sels(db, eventRow(db, 11).id)[0].odds_x100, 195);

  // Team badges come from the provider's image proxy.
  const server = createApp(db).listen(0);
  await new Promise((res) => server.once('listening', res));
  const events = (await (await fetch(`http://127.0.0.1:${server.address().port}/api/events`)).json()).events;
  server.close();
  const benfica = events.find((e) => e.home === 'Benfica');
  assert.equal(benfica.homeLogo, 'https://sports.bzzoiro.com/img/team/35/?bg=transparent');
  assert.equal(benfica.awayLogo, 'https://sports.bzzoiro.com/img/team/36/?bg=transparent');
  db.close();
});

test('bulk odds never reopen a match that has kicked off', async () => {
  const db = openDb(':memory:');
  const routes = {
    '/events/': { results: [{ id: 21, home_team: 'A', away_team: 'B', event_date: iso(2 * H), status: 'notstarted' }] },
    '/odds/': { results: [
      { event_id: 21, market: '1x2', outcome: 'HOME', decimal_odds: 2 },
      { event_id: 21, market: '1x2', outcome: 'AWAY', decimal_odds: 3 },
    ] },
  };
  const { feed } = feedFor(db, routes);
  await feed.syncFixtures();
  db.prepare("UPDATE events SET status = 'live', start_time = ? WHERE external_id = '21'").run(iso(-H));
  db.prepare('UPDATE selections SET active = 0').run();
  await feed.syncOdds();
  assert.ok(sels(db, eventRow(db, 21).id).every((x) => x.active === 0));
  assert.equal(normalizeOddsRow({ event_id: 1, market: '1x2', outcome: 'DRAW', decimal_odds: 1 }), null);
  db.close();
});

test('with per-bookmaker rows (Football Unlimited) the price is the mean across books', async () => {
  const db = openDb(':memory:');
  let round = 0;
  const routes = {
    '/events/': { results: [{ id: 31, home_team: 'A', away_team: 'B', event_date: iso(5 * H), status: 'notstarted' }] },
    '/odds/': () => (round++ === 0
      ? { results: [
        { event_id: 31, market: '1x2', outcome: 'HOME', decimal_odds: 2.0, bookmaker_slug: 'pinnacle', updated_at: '2026-09-28T10:00:00Z' },
        { event_id: 31, market: '1x2', outcome: 'HOME', decimal_odds: 2.2, bookmaker_slug: 'bet365', updated_at: '2026-09-28T10:00:00Z' },
        { event_id: 31, market: '1x2', outcome: 'AWAY', decimal_odds: 3.0, bookmaker_slug: 'pinnacle', updated_at: '2026-09-28T10:00:00Z' },
        { event_id: 31, market: '1x2', outcome: 'AWAY', decimal_odds: 3.4, bookmaker_slug: 'bet365', updated_at: '2026-09-28T10:00:00Z' },
      ] }
      // Delta: only bet365 moved; pinnacle's earlier price still counts.
      : { results: [{ event_id: 31, market: '1x2', outcome: 'HOME', decimal_odds: 2.4, bookmaker_slug: 'bet365', updated_at: '2026-09-28T11:00:00Z' }] }),
  };
  const { feed } = feedFor(db, routes);
  await feed.syncFixtures();
  assert.deepEqual(sels(db, eventRow(db, 31).id).map((x) => [x.code, x.odds_x100]), [['1', 210], ['2', 320]]);
  await feed.syncFixtures();
  assert.equal(sels(db, eventRow(db, 31).id)[0].odds_x100, 220);
  db.close();
});
