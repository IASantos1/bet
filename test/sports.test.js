import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb, nowIso, tx } from '../server/db.js';
import { createSportFeed, formLetters, parsePeriods } from '../server/sports.js';
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
  assert.deepEqual({ ...ev }, { home_score: 2, away_score: 1, clock: '6-4, 3-6, 6-4 (0-0)' });
  assert.equal(got.length, 2);
  assert.equal(got[1].data.server, 'away');
  assert.deepEqual(got[1].data.stats, { home: { aces: 7 }, away: { aces: 9 } });
  live.stop();
});
