import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb, nowIso, tx } from '../server/db.js';
import { createSportFeed, formLetters, parsePeriods, createLivePriceGate } from '../server/sports.js';
import { createLiveSocket } from '../server/livews.js';
import { createTennisFeed, TENNIS_SOURCE } from '../server/tennis.js';
import { placeBets } from '../server/betting.js';
import { postTransaction } from '../server/wallet.js';
import { createApp } from '../server/app.js';

const H = 3_600_000;
const iso = (ms) => new Date(Date.now() + ms).toISOString();

function fakeApi(prefix, routes) {
  const fetchImpl = async (url) => {
    const u = new URL(url);
    const key = u.pathname.replace(prefix, '');
    const r = routes[key];
    const body = typeof r === 'function' ? r(u) : r;
    if (body === undefined) return new Response('{"detail":"Not found"}', { status: 404 });
    if (body === 402) return new Response('{"code":"addon_required"}', { status: 402 });
    return new Response(JSON.stringify(body), { status: 200 });
  };
  return fetchImpl;
}

function setup(sport, prefix, routes) {
  const db = openDb(':memory:');
  const feed = createSportFeed(db, sport, { token: 'tok', fetchImpl: fakeApi(prefix, routes) });
  const { lastInsertRowid } = db.prepare(
    "INSERT INTO users (email, name, birthdate, password_hash, created_at) VALUES ('p@x.pt', 'P', '1990-01-01', 'x', ?)"
  ).run(nowIso());
  const userId = Number(lastInsertRowid);
  tx(db, () => postTransaction(db, userId, 10_000, 'deposit', 'teste'));
  const row = (ext) => db.prepare('SELECT * FROM events WHERE source = ? AND external_id = ?').get(feed.source, String(ext));
  const prices = (ext) => db.prepare('SELECT market, code, odds_x100 FROM selections WHERE event_id = ? AND active = 1 ORDER BY market, code')
    .all(row(ext).id).map((r) => `${r.market}|${r.code}=${r.odds_x100}`);
  const bet = (ext, market, code) => {
    const sel = db.prepare('SELECT * FROM selections WHERE event_id = ? AND market = ? AND code = ?').get(row(ext).id, market, code);
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
    return tx(db, () => placeBets(db, user, { mode: 'single', stakeCents: 1_000, picks: [{ selectionId: sel.id, odds: sel.odds_x100 / 100 }] }))[0];
  };
  const betStatus = (id) => db.prepare('SELECT status FROM bets WHERE id = ?').get(id).status;
  const kickoff = (ext) => db.prepare('UPDATE events SET start_time = ? WHERE id = ?').run(iso(-H), row(ext).id);
  return { db, feed, row, prices, bet, betStatus, kickoff };
}

const team = (id, name) => ({ id, name });

test('helpers: periods and form strings', () => {
  assert.deepEqual(parsePeriods('1-0, 1-1, 0-2'), [[1, 0], [1, 1], [0, 2]]);
  assert.deepEqual(formLetters('WWLOTLW'), ['V', 'V', 'D', 'D', 'V']);
  assert.deepEqual(formLetters(['L', 'W', 'D']), ['D', 'V', 'E']);
});

test('basketball: winner market from the bookmakers average, settled on the final score with overtime', async () => {
  let game = { id: 71204, league: { id: 12, name: 'NBA' }, home_team: team(402, 'Los Angeles Lakers'), away_team: team(407, 'Denver Nuggets'), event_date: iso(5 * H), status: 'scheduled' };
  const t = setup('basquetebol', '/basketball/api/v2', {
    '/events/': () => ({ results: [game] }),
    '/events/71204/odds/': { bookmakers: [{ odds_home: 1.8, odds_away: 2.1 }, { odds_home: 1.9, odds_away: 2.0 }] },
    '/events/71204/': () => game,
  });
  const r = await t.feed.syncFixtures();
  assert.equal(r.created, 1);
  assert.equal(r.priced, 1);
  assert.equal(t.row(71204).sport, 'basquetebol');
  assert.deepEqual(t.prices(71204), ['ml|1=185', 'ml|2=205']);
  const b = t.bet(71204, 'ml', '1');
  t.kickoff(71204);
  game = { ...game, status: 'finished', home_score: 121, away_score: 118 };
  await t.feed.syncResults();
  assert.equal(t.betStatus(b), 'won');
  assert.equal(t.row(71204).status, 'finished');

  const app = createApp(t.db, { sports: { basquetebol: t.feed } });
  const server = app.listen(0);
  try {
    const { event } = await (await fetch(`http://127.0.0.1:${server.address().port}/api/events/${t.row(71204).id}`)).json();
    assert.equal(event.markets[0].name, 'Vencedor (incl. prolongamento)');
    assert.equal(event.homeLogo, 'https://sports.bzzoiro.com/img/basketball/team/402/?bg=transparent');
  } finally {
    server.closeAllConnections();
    server.close();
  }
});

test('ice hockey: 3-way result settles on regulation time, draw-no-bet voids on a regulation draw', async () => {
  let match = { id: 40312, league: { id: 3, name: 'NHL' }, home_team: team(118, 'New York Rangers'), away_team: team(121, 'Boston Bruins'), match_date: iso(5 * H), status: 'scheduled' };
  const t = setup('hoquei', '/hockey/api/v2', {
    '/matches/': () => ({ results: [match] }),
    '/matches/40312/odds/': {
      bookmakers: [{ odds_home: 2.5, odds_draw: 4.2, odds_away: 2.4 }],
      markets: [{ market_kind: 'DNB', market_period: 'FT', market_line: null, bookmakers: [{ prices: { HOME: { price: 1.9 }, AWAY: { price: 1.85 } } }] }],
    },
    '/matches/40312/': () => match,
  });
  await t.feed.syncFixtures();
  assert.deepEqual(t.prices(40312), ['1x2|1=250', '1x2|2=240', '1x2|X=420', 'dnb|1=190', 'dnb|2=185']);
  const onDraw = t.bet(40312, '1x2', 'X');
  const onHome = t.bet(40312, '1x2', '1');
  const dnbHome = t.bet(40312, 'dnb', '1');
  t.kickoff(40312);
  // 4-3 after overtime: regulation was 3-3.
  match = { ...match, status: 'finished', home_score: 4, away_score: 3, periods_score: '1-1, 1-1, 1-1, 1-0', is_overtime: true, winner_id: 118 };
  await t.feed.syncResults();
  assert.equal(t.betStatus(onDraw), 'won');
  assert.equal(t.betStatus(onHome), 'lost');
  assert.equal(t.betStatus(dnbHome), 'void');
  const ev = t.row(40312);
  assert.deepEqual([ev.home_score, ev.away_score, ev.reg_home_score, ev.reg_away_score], [4, 3, 3, 3]);
});

test('ice hockey: without a draw price the books quote the moneyline (overtime included)', async () => {
  let match = { id: 7, league: { id: 3, name: 'NHL' }, home_team: team(1, 'A'), away_team: team(2, 'B'), match_date: iso(5 * H), status: 'scheduled' };
  const t = setup('hoquei', '/hockey/api/v2', {
    '/matches/': () => ({ results: [match] }),
    '/matches/7/odds/': { odds_home: 1.85, odds_away: 1.95 },
    '/matches/7/': () => match,
  });
  await t.feed.syncFixtures();
  assert.deepEqual(t.prices(7), ['ml|1=185', 'ml|2=195']);
  const b = t.bet(7, 'ml', '1');
  t.kickoff(7);
  match = { ...match, status: 'finished', home_score: 3, away_score: 2, is_shootout: true, winner_id: 1 };
  await t.feed.syncResults();
  assert.equal(t.betStatus(b), 'won');
});

test('darts: winner on sets, walkover void; CS2: a 1-1 in a best-of-two voids the winner market', async () => {
  const m = (id, f = {}) => ({ id, tournament: { id: 44, name: 'World Matchplay' }, player1: { id: 507, name: 'Luke Littler', country_code: 'GB' },
    player2: { id: 312, name: 'Luke Humphries', country_code: 'GB' }, match_date: iso(5 * H), status: 'scheduled', round_name: 'Final', ...f });
  const state = {};
  const d = setup('dardos', '/darts/api/v2', {
    '/matches/': { results: [m(1), m(2)] },
    '/matches/1/odds/': { bookmakers: [{ odds_player1: 1.25, odds_player2: 3.75 }] },
    '/matches/2/odds/': { bookmakers: [{ odds_player1: 1.5, odds_player2: 2.5 }] },
    '/matches/1/': () => m(1, state[1]),
    '/matches/2/': () => m(2, state[2]),
  });
  await d.feed.syncFixtures();
  assert.equal(d.row(1).home_country, 'GB');
  const b1 = d.bet(1, 'ml', '2');
  const b2 = d.bet(2, 'ml', '1');
  d.kickoff(1);
  d.kickoff(2);
  state[1] = { status: 'finished', player1_sets: 4, player2_sets: 6, winner_id: 312, best_of_sets: 11 };
  state[2] = { status: 'walkover', winner_id: 507 };
  await d.feed.syncResults();
  assert.equal(d.betStatus(b1), 'won');
  assert.equal(d.betStatus(b2), 'void');

  let cs = { id: 5531, tournament: { id: 87, name: 'IEM Cologne' }, home_team: team(342, 'Team Vitality'), away_team: team(199, 'FaZe Clan'), start_time: iso(5 * H), status: 'notstarted', best_of: 2 };
  const c = setup('esports', '/csgo/api/v2', {
    '/matches/': () => ({ results: [cs] }),
    '/matches/5531/odds/': { bookmakers: [{ odds_home: 1.47, odds_away: 2.59 }] },
    '/matches/5531/': () => cs,
  });
  await c.feed.syncFixtures();
  assert.equal(c.row(5531).competition, 'IEM Cologne · BO2');
  const b3 = c.bet(5531, 'ml', '1');
  c.kickoff(5531);
  cs = { ...cs, status: 'finished', home_score: 1, away_score: 1 };
  await c.feed.syncResults();
  assert.equal(c.betStatus(b3), 'void');
});

test('insights per sport: hockey H2H + table, darts rankings, CS2 comparison, basketball standings', async () => {
  const hk = setup('hoquei', '/hockey/api/v2', {
    '/matches/': { results: [{ id: 16264, league: { id: 3, name: 'NHL' }, home_team: team(118, 'Rangers'), away_team: team(121, 'Bruins'), match_date: iso(5 * H), status: 'scheduled' }] },
    '/matches/16264/odds/': { odds_home: 1.9, odds_away: 1.9 },
    '/matches/16264/h2h/': {
      head_to_head: { total_matches: 5, home_wins: 4, away_wins: 1, home_goals: 15, away_goals: 5, avg_total_goals: 4, recent_matches: [{ date: '2025-12-23T18:30:00Z', winner: 'home', home_goals: 4, away_goals: 1 }] },
      home_form: { points: 100, points_per_game: 1.22, form_string: 'WWLOTLW', home: { points_per_game: 1.44 } },
      away_form: { points: 90, points_per_game: 1.1, form_string: 'LLW', away: { points_per_game: 1.0 } },
    },
    '/predictions/': { results: [{ match_id: 16264, home_win_prob: 0.55, away_win_prob: 0.45, predicted_winner_id: 118, confidence: 0.55 }] },
    '/standings/': { standings: [{ position: 1, team: { id: 118, name: 'Rangers' }, matches_played: 82, wins: 45, losses: 27, overtime_wins: 6, overtime_losses: 4, points: 100, goals_scored: 254, goals_conceded: 219, form_string: 'WWL' }] },
  });
  await hk.feed.syncFixtures();
  const x = await hk.feed.matchInsights(hk.row(16264));
  assert.deepEqual([x.h2h.total, x.h2h.homeWins, x.h2h.meetings[0].score, x.h2h.meetings[0].won], [5, 4, '4-1', true]);
  assert.deepEqual(x.h2h.homeFormLetters, ['V', 'V', 'D', 'D', 'V']);
  assert.deepEqual(x.prediction, { home: 55, away: 45, draw: null, predicted: 'home', confidence: 55 });
  assert.equal(x.standings.rows[0].goals, '254:219');
  assert.equal(x.standings.rows[0].form, 'WWL');
  assert.deepEqual(x.standings.columns.map((c) => c.label), ['J', 'V', 'VP', 'DP', 'D', 'Golos', 'Pts']);

  const dt = setup('dardos', '/darts/api/v2', {
    '/matches/': { results: [{ id: 4410, tournament: { id: 1, name: 'PL' }, player1: { id: 1, name: 'Luke Littler' }, player2: { id: 2, name: 'Luke Humphries' }, match_date: iso(5 * H), status: 'scheduled' }] },
    '/matches/4410/h2h/': { total_matches: 23, player1_wins: 15, player2_wins: 8, player1_avg: 101.37, player2_avg: 100.94, recent_matches: [{ date: '2026-06-06T19:53:00Z', tournament: { name: 'Nordic Masters' }, round_name: 'SF', winner: 'player2', player1_sets: 5, player2_sets: 7 }] },
    '/rankings/': { results: [{ position: 1, prize_money: 1710000, player: { id: 2, name: 'Luke Humphries', country_code: 'GB' } }] },
  });
  await dt.feed.syncFixtures();
  const y = await dt.feed.matchInsights(dt.row(4410));
  assert.deepEqual([y.h2h.homeWins, y.h2h.awayWins, y.h2h.meetings[0].won], [15, 8, false]);
  assert.deepEqual(y.h2h.compare, [['Média de 3 dardos nos confrontos', 101.37, 100.94]]);
  assert.equal(y.rankings.away.position, 1);
  assert.equal(y.rankings.valueLabel, 'Prémios (£)');

  const cs = setup('esports', '/csgo/api/v2', {
    '/matches/': { results: [{ id: 9630, tournament: { id: 1, name: 'T' }, home_team: team(723, 'TLR'), away_team: team(486, 'OG'), start_time: iso(5 * H), status: 'notstarted' }] },
    '/matches/9630/stats/': {
      teams: [{ team: { id: 723 }, map_winrate: 41.4, round_winrate_all: 47, kd_ratio: 0.94, form_results: ['L', 'W'] }, { team: { id: 486 }, map_winrate: 55, round_winrate_all: 52, kd_ratio: 1.05, form_results: ['W'] }],
      head_to_head: { total_matches: 4, home_wins: 3, away_wins: 1, recent_matches: [] },
    },
  });
  await cs.feed.syncFixtures();
  const z = await cs.feed.matchInsights(cs.row(9630));
  assert.deepEqual(z.h2h.compare[0], ['Mapas ganhos (%)', 41.4, 55]);
  assert.deepEqual(z.h2h.homeFormLetters, ['D', 'V']);

  const bk = setup('basquetebol', '/basketball/api/v2', {
    '/events/': { results: [{ id: 1, league: { id: 12, name: 'NBA' }, home_team: team(402, 'Lakers'), away_team: team(407, 'Nuggets'), event_date: iso(5 * H), status: 'scheduled' }] },
    '/standings/': { league_id: 12, standings: [{ position: 1, team: { id: 407, name: 'Nuggets' }, played: 82, wins: 57, losses: 25, win_pct: 0.695 }] },
    '/predictions/': { results: [{ event_id: 1, home_win_prob: 0.61, away_win_prob: 0.39, predicted_winner_id: 402 }] },
  });
  await bk.feed.syncFixtures();
  const w = await bk.feed.matchInsights(bk.row(1));
  assert.equal(w.standings.rows[0].winPct, '69.5%');
  assert.equal(w.prediction.predicted, 'home');
});

test('tennis live socket: event and per-point score frames drive the scoreboard', async () => {
  const db = openDb(':memory:');
  const sockets = [];
  class FakeSocket {
    constructor(url, protocols) { this.url = url; this.protocols = protocols; this.sent = []; sockets.push(this); queueMicrotask(() => this.onopen?.()); }
    send(m) { this.sent.push(JSON.parse(m)); }
    close() {}
    push(f) { this.onmessage?.({ data: JSON.stringify(f) }); }
  }
  const live = createLiveSocket(db, { token: 't', url: 'wss://sports.bzzoiro.com/ws/live/', sport: 'tennis', source: TENNIS_SOURCE, WebSocketImpl: FakeSocket });
  const m = { id: 36835, tournament: { id: 88, name: 'US Open', circuit: 'ATP' }, player1: { id: 1, name: 'Carlos Alcaraz' }, player2: { id: 2, name: 'Jannik Sinner' }, match_date: iso(-H), status: 'live', player1_sets: 1, player2_sets: 1, sets_detail: '6-4, 3-6, 5-4' };
  const fetchImpl = fakeApi('/tennis/api/v2', { '/matches/live/': { results: [m] } });
  const tennis = createTennisFeed(db, { token: 't', fetchImpl, liveSocket: live });
  await tennis.syncLive();
  await new Promise((r) => setImmediate(r));
  assert.deepEqual(sockets[0].sent[0], { action: 'subscribe', event_id: 36835, sport: 'tennis' });
  const id = db.prepare('SELECT id FROM events WHERE external_id = ?').get('36835').id;
  const got = [];
  live.bus.on(`e:${id}`, (x) => got.push(x));
  sockets[0].push({ type: 'event', event_id: 36835, sport: 'tennis', score: { sets: [[6, 4], [3, 6], [5, 4]], home_sets: 1, away_sets: 1, point: '40-30', server: 'home' }, stats: { home: { aces: 7 }, away: { aces: 9 } } });
  sockets[0].push({ type: 'score', event_id: 36835, sets: [[6, 4], [3, 6], [6, 4]], point: '0-0', server: 'away' });
  const ev = db.prepare('SELECT home_score, away_score, clock FROM events WHERE id = ?').get(id);
  assert.deepEqual({ ...ev }, { home_score: 2, away_score: 1, clock: '6-4, 3-6, 6-4' });
  assert.equal(got.length, 2);
  assert.equal(got[1].data.server, 'away');
  assert.deepEqual(got[1].data.stats, { home: { aces: 7 }, away: { aces: 9 } });
  live.stop();
});

test('in play: markets open only on bookmaker prices updated after kick-off and in the last minutes', async () => {
  const now = Date.now();
  let books = [{ odds_home: 1.4, odds_away: 2.9, updated_at: new Date(now - 30_000).toISOString() }, { odds_home: 1.6, odds_away: 2.5, updated_at: new Date(now - 3_600_000).toISOString() }];
  const game = { id: 9, league: { id: 12, name: 'NBA' }, home_team: team(1, 'A'), away_team: team(2, 'B'), event_date: new Date(now - 30 * 60_000).toISOString(), status: 'live', home_score: 50, away_score: 48 };
  const t = setup('basquetebol', '/basketball/api/v2', {
    '/events/': { results: [] },
    '/events/live/': { results: [game] },
    '/events/9/odds/': () => ({ bookmakers: books }),
  });
  const r = await t.feed.syncLive();
  assert.equal(r.liveMarketsOpen, 1);
  // Only the fresh book counts (the other one is a pre-match price).
  assert.deepEqual(t.prices(9), ['ml|1=140', 'ml|2=290']);
  assert.ok(t.row(9).live_odds_at);
  t.bet(9, 'ml', '1');
  books = [{ odds_home: 1.3, odds_away: 3.2, updated_at: new Date(now - 3_600_000).toISOString() }];
  await t.feed.syncLive();
  assert.deepEqual(t.prices(9), []);
  assert.equal(t.row(9).live_odds_at, null);
});

test('tennis: a match without a list price is priced from /matches/{id}/odds/', async () => {
  const db = openDb(':memory:');
  const m = { id: 77, tournament: { id: 1, name: 'US Open', circuit: 'ATP' }, player1: { id: 1, name: 'A' }, player2: { id: 2, name: 'B' }, match_date: iso(5 * H), status: 'scheduled', odds_player1: null, odds_player2: null };
  const fetchImpl = fakeApi('/tennis/api/v2', { '/matches/': { results: [m] }, '/matches/77/odds/': { match_id: 77, odds_player1: 1.95, odds_player2: 1.87 } });
  const tennis = createTennisFeed(db, { token: 't', fetchImpl });
  const r = await tennis.syncFixtures();
  assert.equal(r.priced, 1);
  const id = db.prepare('SELECT id FROM events WHERE external_id = ?').get('77').id;
  assert.deepEqual(db.prepare('SELECT code, odds_x100 FROM selections WHERE event_id = ? AND active = 1 ORDER BY code').all(id).map((x) => `${x.code}=${x.odds_x100}`), ['1=195', '2=187']);
});

test('live gate: an undated price opens the market only while it keeps moving', () => {
  const realNow = Date.now;
  let clock = 1_000_000;
  Date.now = () => clock;
  try {
    const gate = createLivePriceGate(180_000);
    const pre = { 'ml|1': 150, 'ml|2': 260 };
    assert.equal(gate(1, { any: pre, previous: pre }), null); // still the pre-match price
    clock += 30_000;
    assert.deepEqual(gate(1, { any: { 'ml|1': 140, 'ml|2': 290 }, previous: pre }), { prices: { 'ml|1': 140, 'ml|2': 290 }, at: clock });
    const movedAt = clock;
    clock += 60_000;
    assert.equal(gate(1, { any: { 'ml|1': 140, 'ml|2': 290 } }).at, movedAt); // unchanged, still recent
    clock += 150_000;
    assert.equal(gate(1, { any: { 'ml|1': 140, 'ml|2': 290 } }), null); // frozen for more than 3 min
    const fresh = { 'ml|1': 120, 'ml|2': 400 };
    assert.deepEqual(gate(1, { fresh, any: {} }), { prices: fresh, at: clock }); // dated fresh book: open
  } finally {
    Date.now = realNow;
  }
});

test('tennis in play: the live list price opens the market once it moves', async () => {
  const db = openDb(':memory:');
  let odds = [1.8, 2.0];
  const m = () => ({ id: 5, tournament: { id: 1, name: 'Chengdu', circuit: 'ATP' }, player1: { id: 1, name: 'A' }, player2: { id: 2, name: 'B' }, match_date: iso(-H), status: 'live', player1_sets: 0, player2_sets: 0, sets_detail: '3-2', odds_player1: odds[0], odds_player2: odds[1] });
  const fetchImpl = fakeApi('/tennis/api/v2', { '/matches/live/': () => ({ results: [m()] }) });
  const tennis = createTennisFeed(db, { token: 't', fetchImpl });
  let r = await tennis.syncLive();
  assert.equal(r.liveMarketsOpen, 0); // first sight: nothing to compare with (no pre-match price stored)
  odds = [1.6, 2.3];
  r = await tennis.syncLive();
  assert.equal(r.liveMarketsOpen, 1);
  const ev = db.prepare('SELECT id, live_odds_at FROM events WHERE external_id = ?').get('5');
  assert.ok(ev.live_odds_at);
  assert.deepEqual(db.prepare('SELECT code, odds_x100 FROM selections WHERE event_id = ? AND active = 1 ORDER BY code').all(ev.id).map((x) => `${x.code}=${x.odds_x100}`), ['1=160', '2=230']);
});

test('in play: a consensus row with a fresh timestamp but pre-match prices never opens the market', async () => {
  const now = Date.now();
  const game = { id: 18233, league: { id: 7, name: 'KHL' }, home_team: team(1, 'Dinamo Minsk'), away_team: team(2, 'Lada Togliatti'), match_date: new Date(now - 2 * H).toISOString(), status: 'inprogress', home_score: 1, away_score: 1 };
  const old = new Date(now - 14 * H).toISOString();
  const t = setup('hoquei', '/hockey/api/v2', {
    '/matches/': { results: [] },
    '/matches/live/': { results: [game] },
    '/matches/18233/odds/': {
      bookmakers: [
        { bookmaker_slug: '1xbet', odds_home: 1.48, odds_draw: 5, odds_away: 6.43, updated_at: old },
        { bookmaker_slug: 'oddssafari-consensus', odds_home: 1.501, odds_draw: 5.25, odds_away: 5.92, updated_at: new Date(now - 20_000).toISOString() },
      ],
    },
  });
  const r = await t.feed.syncLive();
  assert.equal(t.row(18233).status, 'live');
  assert.equal(r.liveMarketsOpen, 0);
  assert.deepEqual(t.prices(18233), []);
});

const ahBook = (slug, home, away) => ({ bookmaker_slug: slug, prices: { HOME: { price: home }, AWAY: { price: away } }, updated_at: '2026-09-28T01:45:00Z' });
const ouBook = (slug, over, under) => ({ bookmaker_slug: slug, prices: { OVER: { price: over }, UNDER: { price: under } }, updated_at: '2026-09-28T01:45:00Z' });

test('basketball: handicap ladder keeps the most balanced lines and settles with overtime', async () => {
  let game = { id: 5, league: { id: 30, name: 'Euroleague' }, home_team: team(1, 'Anadolu Efes'), away_team: team(2, 'Real Madrid'), event_date: iso(5 * H), status: 'scheduled' };
  const ladder = [[-13.5, 5.6, 1.11], [-7.5, 2.9, 1.4], [-3.5, 2.2, 1.65], [-2.5, 2.05, 1.75], [-1.5, 1.95, 1.85], [1.5, 1.8, 2.0], [2.5, 1.7, 2.1], [8.5, 1.3, 3.4]];
  const t = setup('basquetebol', '/basketball/api/v2', {
    '/events/': () => ({ results: [game] }),
    '/events/5/odds/': {
      bookmakers: [{ bookmaker_slug: 'bet365', odds_home: 1.85, odds_away: 1.95 }, { bookmaker_slug: 'oddssafari-consensus', odds_home: 9, odds_away: 9 }],
      markets: [
        ...ladder.map(([line, h, a]) => ({ market_kind: 'AH', market_line: line, market_period: 'FT', bookmakers: [ahBook('betano', h, a), ahBook('oddssafari-consensus', 9, 9)] })),
        { market_kind: 'OU', market_line: 162.5, market_period: 'FT', bookmakers: [ouBook('betano', 1.9, 1.9)] },
        { market_kind: 'AH', market_line: -1.5, market_period: '1H', bookmakers: [ahBook('betano', 1.9, 1.9)] },
      ],
    },
    '/events/5/': () => game,
  });
  await t.feed.syncFixtures();
  const p = t.prices(5);
  assert.ok(p.includes('ml|1=185') && p.includes('ml|2=195'), 'consensus row left out of the winner average');
  const hcp = p.filter((x) => x.startsWith('hcp|1'));
  assert.deepEqual(hcp.sort(), ['hcp|1+1.5=180', 'hcp|1+2.5=170', 'hcp|1-1.5=195', 'hcp|1-2.5=205', 'hcp|1-3.5=220']);
  assert.ok(p.includes('ou|O162.5=190') && p.includes('ou|U162.5=190'));
  const onSpread = t.bet(5, 'hcp', '2+1.5');
  const onOver = t.bet(5, 'ou', 'O162.5');
  t.kickoff(5);
  // 85-84 after overtime: Real Madrid +1.5 covers; 169 points go over.
  game = { ...game, status: 'finished', home_score: 85, away_score: 84 };
  await t.feed.syncResults();
  assert.equal(t.betStatus(onSpread), 'won');
  assert.equal(t.betStatus(onOver), 'won');
});

test('ice hockey: handicap and total settle on regulation time; whole lines push', async () => {
  let match = { id: 6, league: { id: 7, name: 'KHL' }, home_team: team(1, 'Dinamo Minsk'), away_team: team(2, 'Lada Togliatti'), match_date: iso(5 * H), status: 'scheduled' };
  const t = setup('hoquei', '/hockey/api/v2', {
    '/matches/': () => ({ results: [match] }),
    '/matches/6/odds/': {
      bookmakers: [{ bookmaker_slug: '1xbet', odds_home: 1.48, odds_draw: 5, odds_away: 6.43 }],
      markets: [
        { market_kind: 'AH', market_line: -1, market_period: 'FT', bookmakers: [ahBook('1xbet', 1.6, 2.2)] },
        { market_kind: 'AH', market_line: -1.5, market_period: 'FT', bookmakers: [ahBook('1xbet', 1.83, 2.07)] },
        { market_kind: 'OU', market_line: 5.5, market_period: 'FT', bookmakers: [ouBook('1xbet', 1.9, 1.9)] },
      ],
    },
    '/matches/6/': () => match,
  });
  await t.feed.syncFixtures();
  const push = t.bet(6, 'hcp', '1-1');
  const minus = t.bet(6, 'hcp', '1-1.5');
  const under = t.bet(6, 'ou', 'U5.5');
  t.kickoff(6);
  // 3-2 in regulation (5 goals), no overtime.
  match = { ...match, status: 'finished', home_score: 3, away_score: 2, periods_score: '1-0, 1-1, 1-1', winner_id: 1 };
  await t.feed.syncResults();
  assert.equal(t.betStatus(push), 'void');
  assert.equal(t.betStatus(minus), 'lost');
  assert.equal(t.betStatus(under), 'won');
});

test('tennis live socket: odds frames with player1/player2 open the market and the REST loop leaves it open', async () => {
  const db = openDb(':memory:');
  const sockets = [];
  class FakeSocket {
    constructor() { this.sent = []; sockets.push(this); queueMicrotask(() => this.onopen?.()); }
    send(m) { this.sent.push(JSON.parse(m)); }
    close() {}
    push(f) { this.onmessage?.({ data: JSON.stringify(f) }); }
  }
  const live = createLiveSocket(db, { token: 't', url: 'wss://sports.bzzoiro.com/ws/live/', sport: 'tennis', source: TENNIS_SOURCE, WebSocketImpl: FakeSocket });
  const m = { id: 52777, tournament: { id: 9, name: 'WTA', circuit: 'WTA' }, player1: { id: 1, name: 'Ksenia Efremova' }, player2: { id: 2, name: 'Martyna Kubka' }, match_date: iso(-H), status: 'live', player1_sets: 0, player2_sets: 0, sets_detail: '2-3' };
  // REST only has the day-before prices.
  const stale = { bookmakers: [{ bookmaker_slug: 'bet365', odds_player1: 2.5, odds_player2: 1.5, updated_at: iso(-20 * H) }] };
  const fetchImpl = fakeApi('/tennis/api/v2', { '/matches/live/': { results: [m] }, '/matches/52777/odds/': stale });
  const tennis = createTennisFeed(db, { token: 't', fetchImpl, liveSocket: live });
  await tennis.syncLive();
  await new Promise((r) => setImmediate(r));
  const id = db.prepare('SELECT id FROM events WHERE external_id = ?').get('52777').id;
  db.prepare("INSERT INTO selections (event_id, market, code, odds_x100, active) VALUES (?, '1x2', '1', 250, 0), (?, '1x2', '2', 150, 0)").run(id, id);
  const open = () => db.prepare("SELECT code, odds_x100, active FROM selections WHERE event_id = ? ORDER BY code").all(id).map((r) => `${r.code}=${r.odds_x100}:${r.active}`);
  // An odds frame of an unknown shape is ignored (does not close anything).
  sockets[0].push({ type: 'odds', event_id: 52777, odds: { something_else: {} } });
  sockets[0].push({ type: 'odds', event_id: 52777, odds: { match_winner: { player1: 3.1, player2: 1.36 } } });
  assert.deepEqual(open(), ['1=310:1', '2=136:1']);
  await tennis.syncLive();
  assert.deepEqual(open(), ['1=310:1', '2=136:1']);
  assert.equal(live.status().oddsLog[0].decision, 'aberto');
  live.stop();
});

test('a 429 pauses every feed on the same account; an idle live list is asked every 30 s; a 1.00 price is ignored', async () => {
  const db = openDb(':memory:');
  let calls = 0;
  let status = 429;
  const fetchImpl = async (url) => {
    calls += 1;
    if (status === 429) return new Response('{"detail":"Too many requests"}', { status: 429, headers: { 'Retry-After': '120' } });
    const u = new URL(url);
    if (u.pathname.endsWith('/live/')) return new Response('{"results":[]}', { status: 200 });
    return new Response('{"results":[]}', { status: 200 });
  };
  const basket = createSportFeed(db, 'basquetebol', { token: 'acct-429', fetchImpl });
  const hockey = createSportFeed(db, 'hoquei', { token: 'acct-429', fetchImpl });
  await assert.rejects(basket.syncLive(), /HTTP 429/);
  // Same account: the next request of any sport is not sent while paused.
  await assert.rejects(hockey.syncLive(), /em pausa/);
  assert.equal(calls, 1);

  status = 200;
  const other = createSportFeed(db, 'basquetebol', { token: 'acct-idle', fetchImpl });
  await other.syncLive();
  const r = await other.syncLive();
  assert.equal(r.idle, true);
  assert.equal(calls, 2);

  // Tennis: a price of 1.00 is dropped instead of failing the whole import.
  const tennisFetch = fakeApi('/tennis/api/v2', { '/matches/': { results: [
    { id: 1, tournament: { id: 1, name: 'ATP' }, player1: { id: 1, name: 'A B' }, player2: { id: 2, name: 'C D' }, match_date: iso(2 * H), status: 'scheduled', odds_player1: 1.004, odds_player2: 30 },
    { id: 2, tournament: { id: 1, name: 'ATP' }, player1: { id: 3, name: 'E F' }, player2: { id: 4, name: 'G H' }, match_date: iso(2 * H), status: 'scheduled', odds_player1: 1.8, odds_player2: 2 },
  ] } });
  const tennis = createTennisFeed(db, { token: 'acct-tennis', fetchImpl: tennisFetch });
  const res = await tennis.syncFixtures();
  assert.equal(res.matches, 2);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM events WHERE source = ?").get(TENNIS_SOURCE).n, 2);
  db.close();
});

test('the per-minute budget keeps pre-match odds to half of it, oldest first', async () => {
  const { setRequestsPerMinute } = await import('../server/providerlimit.js');
  const db = openDb(':memory:');
  const games = Array.from({ length: 10 }, (_, i) => ({ id: 900 + i, league: { id: 1, name: 'NBA' }, home_team: team(1, `H${i}`), away_team: team(2, `A${i}`), event_date: iso((i + 2) * H), status: 'scheduled' }));
  let oddsCalls = 0;
  const routes = { '/basketball/api/v2/events/': { results: games } };
  for (const g of games) routes[`/basketball/api/v2/events/${g.id}/odds/`] = () => { oddsCalls += 1; return { bookmakers: [{ odds_home: 1.9, odds_away: 1.9 }] }; };
  const feed = createSportFeed(db, 'basquetebol', { token: 'acct-budget', fetchImpl: fakeApi('', routes) });
  setRequestsPerMinute(10);
  try {
    await feed.syncFixtures(); // 1 list request + odds for at most half of the minute
    assert.equal(oddsCalls, 4);
  } finally {
    setRequestsPerMinute(Infinity);
  }
  db.close();
});
