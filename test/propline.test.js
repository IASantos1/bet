import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb, nowIso, tx } from '../server/db.js';
import { createPropLineFeed, americanToX100, nameScore, matchEvent, pricesFrom } from '../server/propline.js';
import { createSportFeed } from '../server/sports.js';
import { placeBets } from '../server/betting.js';
import { postTransaction } from '../server/wallet.js';
import { createApp } from '../server/app.js';

const H = 3_600_000;
const iso = (ms) => new Date(Date.now() + ms).toISOString();

function fakeApi(routes, { headers = {} } = {}) {
  const calls = [];
  const fetchImpl = async (url, opts) => {
    const u = new URL(url);
    calls.push({ path: u.pathname, query: Object.fromEntries(u.searchParams), key: opts.headers['X-API-Key'] });
    const r = routes[u.pathname.replace('/v1', '')];
    const out = typeof r === 'function' ? r(u) : r;
    if (typeof out === 'number') return new Response(JSON.stringify({ detail: 'x', retry_after_seconds: 60 }), { status: out });
    if (out === undefined) return new Response('{"detail":"not found"}', { status: 404 });
    return new Response(JSON.stringify(out), { status: 200, headers: { 'X-Daily-Limit': '1000', 'X-Daily-Used': '10', 'X-Daily-Remaining': '990', ...headers } });
  };
  return { fetchImpl, calls };
}

function addEvent(db, { sport = 'futebol', home, away, start = iso(3 * H), status = 'scheduled', source = 'bzzoiro', ext = String(Math.random()) }) {
  const ts = nowIso();
  return Number(db.prepare(`INSERT INTO events (sport, competition, home, away, start_time, status, home_score, away_score, source, external_id, created_at, updated_at)
    VALUES (?, 'Liga', ?, ?, ?, ?, 0, 0, ?, ?, ?, ?)`).run(sport, home, away, start, status, source, ext, ts, ts).lastInsertRowid);
}
const sel = (db, id) => Object.fromEntries(db.prepare('SELECT market, code, odds_x100, active, src FROM selections WHERE event_id = ?').all(id)
  .map((r) => [`${r.market}|${r.code}`, `${r.odds_x100}${r.active ? '' : ':off'}${r.src ? `:${r.src}` : ''}`]));

const outcome = (name, price, point, extra = {}) => ({ name, price, ...(point !== undefined ? { point } : {}), ...extra });
const soccerGame = (id, commence, extra = {}) => ({
  id, sport_key: 'soccer_epl', home_team: 'Arsenal', away_team: 'Manchester United', commence_time: commence,
  bookmakers: [
    { key: 'draftkings', title: 'DraftKings', markets: [
      { key: 'h2h', outcomes: [outcome('Arsenal', -150), outcome('Draw', 280), outcome('Manchester United', 400)] },
      { key: 'totals', outcomes: [outcome('Over', -110, 2.5), outcome('Under', -110, 2.5)] },
      { key: 'totals', team: 'Arsenal', outcomes: [outcome('Over', -200, 1.5), outcome('Under', 160, 1.5)] },
      { key: 'spreads', outcomes: [outcome('Arsenal', 105, -0.5), outcome('Manchester United', -125, 0.5)] },
      { key: 'spreads', outcomes: [outcome('Arsenal', -105, -0.25), outcome('Manchester United', -115, 0.25)] },
      { key: 'both_teams_to_score', outcomes: [outcome('Yes', -130), outcome('No', 100)] },
    ] },
    { key: 'prizepicks', title: 'PrizePicks', markets: [{ key: 'h2h', outcomes: [outcome('Arsenal', 100), outcome('Draw', 100), outcome('Manchester United', 100)] }] },
  ],
  ...extra,
});

test('prices: American to decimal, and names matched across spellings', () => {
  assert.equal(americanToX100(-150), 167);
  assert.equal(americanToX100(280), 380);
  assert.equal(americanToX100(-110), 191);
  assert.equal(americanToX100(50), null);
  assert.ok(nameScore('Manchester United', 'Man Utd') >= 0.85);
  assert.ok(nameScore('FC Barcelona', 'Barcelona') === 1);
  assert.ok(nameScore('Arsenal', 'Chelsea') < 0.6);
  assert.ok(nameScore('B. Shick', 'Bernard Shick', { player: true }) >= 0.9);
  assert.ok(nameScore('Shick B.', 'Bernard Shick', { player: true }) >= 0.9);
  assert.ok(nameScore('A. Shick', 'Bernard Shick', { player: true }) < 0.6);
  const evs = [{ id: 1, home: 'Manchester Utd', away: 'Arsenal FC', start_time: '2026-10-01T15:00:00Z' }, { id: 2, home: 'Chelsea', away: 'Arsenal', start_time: '2026-10-01T15:00:00Z' }];
  const m = matchEvent({ home_team: 'Arsenal', away_team: 'Manchester United', commence_time: '2026-10-01T15:05:00Z' }, evs, 'futebol');
  assert.deepEqual([m.event.id, m.swapped], [1, true]);
  assert.equal(matchEvent({ home_team: 'Arsenal', away_team: 'Manchester United', commence_time: '2026-10-01T18:00:00Z' }, evs, 'futebol'), null);
});

test('prices from a game: DFS books, team totals and quarter lines left out; swapped sides mirrored', () => {
  const p = pricesFrom(soccerGame(1, '2026-10-01T15:00:00Z'), 'futebol');
  assert.deepEqual(p, {
    '1x2|1': 167, '1x2|X': 380, '1x2|2': 500, 'ou|O2.5': 191, 'ou|U2.5': 191,
    'hcp|1-0.5': 205, 'hcp|2+0.5': 180, 'btts|Y': 177, 'btts|N': 200,
  });
  const s = pricesFrom(soccerGame(1, '2026-10-01T15:00:00Z'), 'futebol', { swapped: true });
  assert.equal(s['1x2|2'], 167);
  assert.equal(s['hcp|2-0.5'], 205);
});

test('pre-match: PropLine fills only the markets the main provider does not price, and survives its syncs', async () => {
  const db = openDb(':memory:');
  const t = new Date(Date.now() + 3 * H);
  const id = addEvent(db, { home: 'Manchester Utd', away: 'Arsenal FC', start: t.toISOString() });
  // Bzzoiro prices the result.
  db.prepare("INSERT INTO selections (event_id, market, code, odds_x100) VALUES (?, '1x2', '1', 400), (?, '1x2', 'X', 330), (?, '1x2', '2', 190)").run(id, id, id);
  const api = fakeApi({ '/sports/soccer_epl/odds': [soccerGame(501, new Date(t.getTime() + 5 * 60_000).toISOString())], '/sports/tennis/odds': [] });
  const pl = createPropLineFeed(db, { apiKey: 'secret-key', sportKeys: ['soccer_epl', 'tennis'], fetchImpl: api.fetchImpl });
  await pl.tick();
  assert.equal(api.calls[0].key, 'secret-key');
  assert.equal(api.calls[0].query.markets, 'h2h,totals,spreads,both_teams_to_score');
  const s = sel(db, id);
  // Result untouched (main provider); the rest from PropLine, sides mirrored (their home is our away).
  assert.equal(s['1x2|1'], '400');
  assert.equal(s['ou|O2.5'], '191:pl');
  assert.equal(s['hcp|2-0.5'], '205:pl');
  assert.equal(s['btts|Y'], '177:pl');
  const st = pl.status();
  assert.equal(st.linked, 1);
  assert.equal(st.quota.remaining, 990);
  assert.deepEqual([st.sports[0].matched, st.sports[0].priced], [1, 1]);
  db.close();
});

test('the main provider closing its own prices leaves PropLine prices alone (basketball)', async () => {
  const db = openDb(':memory:');
  const t = new Date(Date.now() + 5 * H);
  const game = { id: 71204, league: { id: 12, name: 'NBA' }, home_team: { id: 1, name: 'Los Angeles Lakers' }, away_team: { id: 2, name: 'Denver Nuggets' }, event_date: t.toISOString(), status: 'scheduled' };
  const bz = createSportFeed(db, 'basquetebol', {
    token: 't', fetchImpl: fakeApi({
      '/basketball/api/v2/events/': { results: [game] },
      '/basketball/api/v2/events/71204/odds/': { bookmakers: [{ odds_home: 1.8, odds_away: 2.1 }] },
    }).fetchImpl,
  });
  await bz.syncFixtures();
  const id = db.prepare('SELECT id FROM events').get().id;
  const nba = { id: 9, sport_key: 'basketball_nba', home_team: 'Los Angeles Lakers', away_team: 'Denver Nuggets', commence_time: t.toISOString(), bookmakers: [
    { key: 'fanduel', markets: [
      { key: 'h2h', outcomes: [outcome('Los Angeles Lakers', -120), outcome('Denver Nuggets', 100)] },
      { key: 'totals', outcomes: [outcome('Over', -110, 225.5), outcome('Under', -110, 225.5)] },
      { key: 'spreads', outcomes: [outcome('Los Angeles Lakers', -110, -1.5), outcome('Denver Nuggets', -110, 1.5)] },
    ] },
  ] };
  const pl = createPropLineFeed(db, { apiKey: 'k', sportKeys: ['basketball_nba'], fetchImpl: fakeApi({ '/sports/basketball_nba/odds': [nba] }).fetchImpl });
  await pl.tick();
  assert.equal(sel(db, id)['ml|1'], '180');
  assert.equal(sel(db, id)['ou|O225.5'], '191:pl');
  // The main provider re-prices the game: its own rows are rewritten, PropLine's stay open.
  db.prepare('UPDATE events SET odds_next_at = NULL').run();
  await bz.syncOdds();
  assert.equal(sel(db, id)['hcp|1-1.5'], '191:pl');
  assert.equal(sel(db, id)['ml|1'], '180');
  db.close();
});

test('in play: only books that price in play, seen recently and after the last goal; goals close them', async () => {
  const db = openDb(':memory:');
  const start = new Date(Date.now() - 30 * 60_000);
  const id = addEvent(db, { home: 'Arsenal', away: 'Manchester United', start: start.toISOString(), status: 'live' });
  db.prepare("INSERT INTO provider_links (provider, provider_event_id, event_id, sport_key, swapped, matched_at) VALUES ('propline', '501', ?, 'soccer_epl', 0, ?)").run(id, nowIso());
  const now = Date.now();
  let seen = new Date(now - 10_000).toISOString();
  const liveGame = () => ({
    id: 501, home_team: 'Arsenal', away_team: 'Manchester United', commence_time: start.toISOString(), bookmakers: [
      { key: 'bovada', pregame_only: true, markets: [{ key: 'h2h', outcomes: [outcome('Arsenal', -150), outcome('Draw', 280), outcome('Manchester United', 400)] }] },
      { key: 'draftkings', pregame_only: false, markets: [
        { key: 'h2h', outcomes: [outcome('Arsenal', 120, undefined, { last_seen_at: seen, last_change_at: seen }), outcome('Draw', 200, undefined, { last_seen_at: seen, last_change_at: seen }), outcome('Manchester United', 300, undefined, { last_seen_at: seen, last_change_at: seen })] },
        { key: 'totals', suspended_at: seen, outcomes: [outcome('Over', -110, 2.5, { last_seen_at: seen }), outcome('Under', -110, 2.5, { last_seen_at: seen })] },
      ] },
    ],
  });
  const pl = createPropLineFeed(db, { apiKey: 'k', sportKeys: ['soccer_epl'], fetchImpl: fakeApi({ '/sports/soccer_epl/odds': [], '/sports/soccer_epl/events/501/odds': () => liveGame() }).fetchImpl });
  await pl.syncLive();
  // Only DraftKings' in-play result (Bovada is frozen on its pre-match price; the suspended total is out).
  assert.deepEqual(sel(db, id), { '1x2|1': '220:pl', '1x2|X': '300:pl', '1x2|2': '400:pl' });
  assert.ok(db.prepare('SELECT pl_live_at FROM events WHERE id = ?').get(id).pl_live_at);

  // A bet at the PropLine live price is accepted…
  const { lastInsertRowid } = db.prepare("INSERT INTO users (email, name, birthdate, password_hash, created_at) VALUES ('p@x.pt', 'P', '1990-01-01', 'x', ?)").run(nowIso());
  tx(db, () => postTransaction(db, Number(lastInsertRowid), 10_000, 'deposit', 't'));
  const user = db.prepare('SELECT * FROM users').get();
  const s1 = db.prepare("SELECT id FROM selections WHERE code = '1'").get().id;
  tx(db, () => placeBets(db, user, { mode: 'single', stakeCents: 500, picks: [{ selectionId: s1, odds: 2.2 }] }));

  // …a goal (recorded by the main provider) closes it, and a price older than the goal cannot reopen it.
  db.prepare("UPDATE selections SET active = 0 WHERE event_id = ?").run(id);
  db.prepare('UPDATE events SET home_score = 1, score_at = ?, pl_live_at = NULL WHERE id = ?').run(new Date(now - 5_000).toISOString(), id);
  await pl.syncLive();
  assert.ok(Object.values(sel(db, id)).every((v) => v.includes(':off')));
  seen = new Date(now).toISOString();
  await pl.syncLive();
  assert.equal(sel(db, id)['1x2|1'], '220:pl');

  // A stale confirmation hides PropLine's in-play prices on the site and refuses bets.
  db.prepare('UPDATE events SET pl_live_at = ? WHERE id = ?').run(new Date(now - 10 * 60_000).toISOString(), id);
  assert.throws(() => tx(db, () => placeBets(db, user, { mode: 'single', stakeCents: 500, picks: [{ selectionId: s1, odds: 2.2 }] })), /Mercado fechado/);
  const server = createApp(db).listen(0);
  try {
    const { event } = await (await fetch(`http://127.0.0.1:${server.address().port}/api/events/${id}`)).json();
    assert.ok(event.selections.every((x) => !x.active));
  } finally { server.close(); }
  db.close();
});

test('a refused key stops the source; the daily limit pauses it; errors never throw out of a tick', async () => {
  const db = openDb(':memory:');
  let code = 401;
  const pl = createPropLineFeed(db, { apiKey: 'bad', sportKeys: ['soccer_epl'], fetchImpl: fakeApi({ '/sports/soccer_epl/odds': () => code }).fetchImpl });
  await pl.tick();
  assert.match(pl.status().stopped, /PROPLINE_API_KEY/);
  const pl2 = createPropLineFeed(db, { apiKey: 'ok', sportKeys: ['soccer_epl'], fetchImpl: fakeApi({ '/sports/soccer_epl/odds': () => { code = 429; return 429; } }).fetchImpl });
  await pl2.tick();
  assert.ok(pl2.status().pausedUntil);
  await pl2.syncSport('soccer_epl').catch((err) => assert.match(err.message, /pausa/));
  // Budget: nothing is asked once the day's requests are spent.
  const api = fakeApi({ '/sports/soccer_epl/odds': [] });
  const pl3 = createPropLineFeed(db, { apiKey: 'ok', sportKeys: ['soccer_epl'], dailyRequests: 1, fetchImpl: api.fetchImpl });
  await pl3.tick();
  await pl3.syncSport('soccer_epl').catch(() => {});
  assert.equal(api.calls.length, 1);
  // Without a key it is off and does nothing.
  assert.equal(createPropLineFeed(db, { apiKey: '' }).enabled, false);
  db.close();
});
