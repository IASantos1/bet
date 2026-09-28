import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb, nowIso, tx } from '../server/db.js';
import {
  createTennisFeed, normalizeTennisMatch, normalizeTennisStats, normalizeTennisH2H, normalizeTennisPrediction, TENNIS_SOURCE,
} from '../server/tennis.js';
import { normalizeH2H, normalizePrediction, normalizeStandings } from '../server/feed.js';
import { placeBets } from '../server/betting.js';
import { postTransaction } from '../server/wallet.js';
import { createApp } from '../server/app.js';

const H = 3_600_000;
const iso = (ms) => new Date(Date.now() + ms).toISOString();

const match = (id, fields = {}) => ({
  id, tournament: { id: 218, name: 'Rome Masters', surface: 'clay', circuit: 'ATP' },
  player1: { id: 4211, name: 'Carlos Alcaraz', country_code: 'ES' },
  player2: { id: 3982, name: 'Jannik Sinner', country_code: 'IT' },
  match_date: iso(2 * H), status: 'scheduled', round_name: 'Final',
  player1_sets: null, player2_sets: null, sets_detail: null, winner_id: null, odds_player1: 1.95, odds_player2: 1.87,
  ...fields,
});

function fakeApi(routes) {
  const calls = [];
  const fetchImpl = async (url) => {
    const u = new URL(url);
    const key = u.pathname.replace('/tennis/api/v2', '');
    calls.push(key);
    const body = typeof routes[key] === 'function' ? routes[key](u) : routes[key];
    if (body === undefined) return new Response('{"detail":"Not found"}', { status: 404 });
    if (body === 402) return new Response('{"code":"addon_required"}', { status: 402 });
    return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  return { fetchImpl, calls };
}

function setup(routes) {
  const db = openDb(':memory:');
  const api = fakeApi(routes);
  const tennis = createTennisFeed(db, { token: 'tok', fetchImpl: api.fetchImpl });
  const { lastInsertRowid } = db.prepare(
    "INSERT INTO users (email, name, birthdate, password_hash, created_at) VALUES ('p@x.pt', 'P', '1990-01-01', 'x', ?)"
  ).run(nowIso());
  const userId = Number(lastInsertRowid);
  tx(db, () => postTransaction(db, userId, 10_000, 'deposit', 'teste'));
  const row = (ext) => db.prepare('SELECT * FROM events WHERE source = ? AND external_id = ?').get(TENNIS_SOURCE, String(ext));
  const bet = (ext, code) => {
    const sel = db.prepare("SELECT s.* FROM selections s JOIN events e ON e.id = s.event_id WHERE e.external_id = ? AND s.code = ?").get(String(ext), code);
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
    return tx(db, () => placeBets(db, user, { mode: 'single', stakeCents: 1_000, picks: [{ selectionId: sel.id, odds: sel.odds_x100 / 100 }] }))[0];
  };
  const betStatus = (id) => db.prepare('SELECT status, payout_cents FROM bets WHERE id = ?').get(id);
  const startNow = (ext) => db.prepare('UPDATE events SET start_time = ? WHERE external_id = ?').run(iso(-H), String(ext));
  return { db, tennis, row, bet, betStatus, startNow, calls: api.calls };
}

test('tennis matches normalize with players, countries, sets and odds', () => {
  const m = normalizeTennisMatch(match(1, { status: 'finished', player1_sets: 2, player2_sets: 1, sets_detail: '6-4, 3-6, 7-5', winner_id: 4211 }));
  assert.equal(m.home, 'Carlos Alcaraz');
  assert.equal(m.homeCountry, 'ES');
  assert.equal(m.competition, 'ATP · Rome Masters · Final');
  assert.equal(m.status, 'finished');
  assert.deepEqual([m.homeSets, m.awaySets, m.winnerId, m.odds1, m.odds2], [2, 1, 4211, 195, 187]);
  assert.equal(normalizeTennisMatch({ id: 2 }), null);
});

test('fixtures create tennis events with a match-winner market that settles on the winner', async () => {
  let status = { status: 'scheduled' };
  const t = setup({
    '/matches/': { count: 1, results: [match(36835)] },
    '/matches/36835/': () => match(36835, status),
  });
  const r = await t.tennis.syncFixtures();
  assert.equal(r.created, 1);
  const ev = t.row(36835);
  assert.equal(ev.sport, 'tenis');
  assert.equal(ev.home_country, 'ES');
  assert.equal(ev.home_team_ext, '4211');
  const prices = t.db.prepare('SELECT market, code, odds_x100 FROM selections WHERE event_id = ? ORDER BY code').all(ev.id).map((x) => ({ ...x }));
  assert.deepEqual(prices, [{ market: '1x2', code: '1', odds_x100: 195 }, { market: '1x2', code: '2', odds_x100: 187 }]);

  const onAlcaraz = t.bet(36835, '1');
  const onSinner = t.bet(36835, '2');
  t.startNow(36835);
  status = { status: 'finished', player1_sets: 2, player2_sets: 1, sets_detail: '6-4, 3-6, 7-5', winner_id: 4211 };
  const res = await t.tennis.syncResults();
  assert.equal(res.settledEvents, 1);
  assert.deepEqual({ ...t.betStatus(onAlcaraz) }, { status: 'won', payout_cents: 1950 });
  assert.equal(t.betStatus(onSinner).status, 'lost');
  assert.equal(t.row(36835).clock, '6-4, 3-6, 7-5');
});

test('retirement settles on the player who advances; walkover and early retirement are void', async () => {
  const state = {};
  const t = setup({
    '/matches/': { results: [match(1), match(2), match(3)] },
    '/matches/1/': () => match(1, state[1]),
    '/matches/2/': () => match(2, state[2]),
    '/matches/3/': () => match(3, state[3]),
  });
  await t.tennis.syncFixtures();
  const b1 = t.bet(1, '2');
  const b2 = t.bet(2, '1');
  const b3 = t.bet(3, '1');
  [1, 2, 3].forEach(t.startNow);
  // 1-1 in sets when Alcaraz retires: Sinner advances and wins the bet.
  state[1] = { status: 'retired', player1_sets: 1, player2_sets: 1, sets_detail: '6-4, 4-6, 1-0', winner_id: 3982 };
  state[2] = { status: 'walkover', winner_id: 4211 };
  state[3] = { status: 'retired', player1_sets: 0, player2_sets: 0, sets_detail: '3-2', winner_id: 4211 };
  await t.tennis.syncResults();
  assert.equal(t.betStatus(b1).status, 'won');
  assert.equal(t.row(1).status, 'finished');
  assert.match(t.row(1).clock, /Desistência/);
  assert.equal(t.betStatus(b2).status, 'void');
  assert.equal(t.row(2).status, 'cancelled');
  assert.equal(t.betStatus(b3).status, 'void');
});

test('live tennis closes the pre-match market and follows the sets', async () => {
  const t = setup({
    '/matches/': { results: [match(7)] },
    '/matches/live/': { results: [match(7, { status: 'live', player1_sets: 1, player2_sets: 0, sets_detail: '6-3, 2-1' })] },
  });
  await t.tennis.syncFixtures();
  await t.tennis.syncLive();
  const ev = t.row(7);
  assert.equal(ev.status, 'live');
  assert.deepEqual([ev.home_score, ev.away_score, ev.clock], [1, 0, '6-3, 2-1']);
  assert.equal(t.db.prepare('SELECT COUNT(*) AS n FROM selections WHERE event_id = ? AND active = 1').get(ev.id).n, 0);
});

test('without the Sports Addon the feed reports it instead of failing silently', async () => {
  const t = setup({ '/matches/': 402 });
  const r = await t.tennis.syncAll();
  assert.match(r.fixtures.error, /Sports Addon/);
  assert.equal(t.tennis.status().addonMissing, true);
});

test('tennis insights: per-set stats, H2H with form, prediction and rankings', async () => {
  const t = setup({
    '/matches/': { results: [match(9)] },
    '/matches/9/': match(9, {
      status: 'finished', player1_sets: 2, player2_sets: 0, winner_id: 4211, sets_detail: '6-4, 6-2',
      statistics: [{ set: 1, player1: { aces: 4, double_faults: 1, first_serve_pct: 68 }, player2: { aces: 2, double_faults: 3, first_serve_pct: 59 } }],
    }),
    '/matches/9/h2h/': {
      meetings: [match(5, { status: 'finished', winner_id: 3982, sets_detail: '4-6, 4-6' }), match(6, { status: 'finished', winner_id: 4211 })],
      player1_form: [match(11, { status: 'finished', winner_id: 4211 })],
      player2_form: [match(12, { status: 'finished', winner_id: 4211 })],
    },
    '/predictions/': { count: 1, results: [{ id: 1, match_id: 9, player1_win_prob: 0.64, player2_win_prob: 0.36, predicted_winner_id: 4211, confidence: 0.64 }] },
    '/players/4211/': { id: 4211, current_ranking: { position: 2, points: 8805, type: 'ATP' } },
    '/players/3982/': { id: 3982, current_ranking: { position: 1, points: 11830, type: 'ATP' } },
    '/rankings/': { results: [{ id: 1, position: 1, points: 11830, type: 'ATP', player: { id: 3982, name: 'Jannik Sinner', country_code: 'IT' } }] },
  });
  await t.tennis.syncFixtures();
  const row = t.row(9);
  const x = await t.tennis.matchInsights(row);
  assert.deepEqual([x.h2h.homeWins, x.h2h.awayWins, x.h2h.meetings.length], [1, 1, 2]);
  assert.equal(x.h2h.homeForm[0].won, true);
  assert.equal(x.h2h.awayForm[0].won, false);
  assert.deepEqual(x.prediction, { home: 64, away: 36, draw: null, predicted: 'home', confidence: 64 });
  assert.deepEqual(x.rankings.home, { position: 2, points: 8805, type: 'ATP' });
  assert.equal(x.rankings.rows[0].player, 'Jannik Sinner');
  const stats = await t.tennis.matchExtras('9');
  assert.equal(stats.sets[0].set, 'Set 1');
  assert.deepEqual(stats.sets[0].stats.map((s) => [s.label, s.home, s.away]), [['Ases', 4, 2], ['Duplas faltas', 1, 3], ['1.º serviço (%)', 68, 59]]);

  // Through the API, for any visitor.
  const app = createApp(t.db, { tennis: t.tennis });
  const server = app.listen(0);
  try {
    const base = `http://127.0.0.1:${server.address().port}`;
    const ins = await (await fetch(`${base}/api/events/${row.id}/insights`)).json();
    assert.equal(ins.prediction.home, 64);
    const { event } = await (await fetch(`${base}/api/events/${row.id}`)).json();
    assert.equal(event.homeCountry, 'ES');
    assert.equal(event.markets[0].name, 'Vencedor do encontro');
  } finally {
    server.closeAllConnections();
    server.close();
  }
});

test('football insights normalize H2H by team id, predictions and grouped standings', () => {
  const h = normalizeH2H({
    total_matches: 3, home_wins: 1, draws: 1, away_wins: 1, home_goals: 4, away_goals: 3, avg_total_goals: 2.33,
    recent_matches: [{ event_id: 1, date: '2026-04-04T16:30:00+00:00', home: 'A', away: 'B', home_team_id: 10, away_team_id: 20, home_score: null, away_score: null, score: '0-0' }],
  });
  assert.equal(h.total, 3);
  assert.equal(h.recent[0].homeScore, null); // no result recorded is not a 0-0
  const p = normalizePrediction({
    markets: { match_result: { prob_home: 34.1, prob_draw: 30.2, prob_away: 35.7, predicted: 'away' }, expected_goals: { home: 1.12, away: 1.24 },
      over_under: { prob_over_25: 44.8 }, btts: { prob_yes: 48.5 }, score: { most_likely: '1-1' } },
    model: { confidence: 0.62 },
  });
  assert.deepEqual([p.home, p.draw, p.away, p.predicted, p.over25, p.mostLikely, p.confidence], [34.1, 30.2, 35.7, 'away', 44.8, '1-1', 62]);
  const flat = normalizeStandings({
    standings: [{ position: 1, team_id: 10, team_name: 'Sporting CP', played: 34, won: 26, drawn: 4, lost: 4, goals_for: 80, goals_against: 20, pts: 82, form: 'WWDLW',
      zone: { key: 'cl', label: 'Champions League', type: 'qualification' } }],
    zones: [{ key: 'cl', label: 'Champions League', type: 'qualification', from: 1, to: 2 }],
  }, [10]);
  assert.equal(flat.rows[0].points, 82);
  assert.equal(flat.rows[0].zone.type, 'qualification');
  assert.equal(flat.zones[0].to, 2);
  const grouped = normalizeStandings({
    groups: [{ name: 'Group A', standings: [{ position: 1, team_id: 1, team_name: 'X', pts: 9 }] }, { name: 'Group B', standings: [{ position: 1, team_id: 20, team_name: 'Y', pts: 7 }] }],
    zones: { 'Group B': [{ label: 'Round of 16', type: 'qualification', from: 1, to: 2 }] },
  }, [20]);
  assert.equal(grouped.name, 'Group B');
  assert.equal(grouped.zones[0].label, 'Round of 16');
});

test('tennis stats accept an object keyed by set', () => {
  const s = normalizeTennisStats({ stats: { 1: { player1: { aces: 1 }, player2: { aces: 2 } }, all: { player1: { aces: 3 }, player2: { aces: 5 } } } });
  assert.deepEqual(s.map((x) => x.set), ['Set 1', 'Encontro']);
  assert.equal(normalizeTennisH2H({}, 1, 2), null);
  assert.equal(normalizeTennisPrediction({ results: [] }, 1), null);
});

test('football match insights resolve the current season for the league table', async () => {
  const { createFeed } = await import('../server/feed.js');
  const db = openDb(':memory:');
  const seen = [];
  const routes = {
    '/api/v2/events/500/h2h/': { total_matches: 2, home_wins: 1, draws: 1, away_wins: 0, recent_matches: [] },
    '/api/v2/events/500/prediction/': { markets: { match_result: { prob_home: 50, prob_draw: 25, prob_away: 25, predicted: 'home' } } },
    '/api/v2/leagues/238/season/': { id: 1635, name: 'Liga 2026' },
    '/api/v2/leagues/238/standings/': (u) => { seen.push(u.searchParams.get('season_id')); return { standings: [{ position: 1, team_id: 3001, team_name: 'Benfica', pts: 10 }] }; },
  };
  const fetchImpl = async (url) => {
    const u = new URL(url);
    const r = routes[u.pathname];
    const body = typeof r === 'function' ? r(u) : r;
    return body === undefined ? new Response('{}', { status: 404 }) : new Response(JSON.stringify(body), { status: 200 });
  };
  const feed = createFeed(db, { token: 't', fetchImpl });
  const x = await feed.matchInsights({ external_id: '500', league_ext: '238', home_team_ext: '3001', away_team_ext: '3002' });
  assert.equal(x.h2h.homeWins, 1);
  assert.equal(x.prediction.home, 50);
  assert.equal(x.standings.rows[0].team, 'Benfica');
  assert.deepEqual(seen, ['1635']);
  assert.equal(x.homeTeamId, 3001);
});

// Shape of /matches/{id}/odds/ as the provider returns it (trimmed from a real response).
const book = (slug, prices) => ({ bookmaker: slug, bookmaker_slug: slug, prices: Object.fromEntries(Object.entries(prices).map(([k, v]) => [k, { price: v, movement: null }])), updated_at: '2026-09-27T22:10:30Z' });
const tennisOdds = {
  match_id: 7, bookmakers: [{ bookmaker_slug: 'bet365', odds_player1: 2.5, odds_player2: 1.5, updated_at: '2026-09-27T22:10:35Z' }],
  markets: [
    { market_kind: 'WINNER', market_line: null, market_period: 'FT', bookmakers: [book('bet365', { P1: 2.5, P2: 1.5 })] },
    { market_kind: 'OU_GAMES', market_line: 20.5, market_period: 'FT', bookmakers: [book('bet365', { OVER: 1.9, UNDER: 1.8 }), book('betway', { OVER: 1.86, UNDER: 1.84 }), book('Consensus', { OVER: 5, UNDER: 5 })] },
    { market_kind: 'GAMES_HCP', market_line: 3.5, market_period: 'FT', bookmakers: [book('bet365', { P1: 1.87, P2: 1.82 })] },
    { market_kind: 'OE_GAMES', market_line: null, market_period: 'FT', bookmakers: [book('bet365', { ODD: 1.84, EVEN: 1.84 })] },
    { market_kind: 'OU_SETS', market_line: 2.5, market_period: 'FT', bookmakers: [book('bet365', { OVER: 2.5, UNDER: 1.45 })] },
    { market_kind: 'SET_HCP', market_line: -1.5, market_period: 'FT', bookmakers: [book('bet365', { P1: 3.94, P2: 1.19 })] },
    { market_kind: 'OU_GAMES', market_line: 9.5, market_period: '1S', bookmakers: [book('bet365', { OVER: 1.8, UNDER: 1.9 })] },
  ],
};

test('pre-match sets and games markets come from /odds/ and settle on sets and games', async () => {
  let status = { status: 'scheduled' };
  const t = setup({
    '/matches/': { results: [match(7, { odds_player1: null, odds_player2: null })] },
    '/matches/7/': () => match(7, status),
    '/matches/7/odds/': tennisOdds,
  });
  await t.tennis.syncFixtures();
  const sels = Object.fromEntries(t.db.prepare('SELECT market, code, odds_x100 FROM selections WHERE event_id = ?').all(t.row(7).id)
    .map((s) => [`${s.market}|${s.code}`, s.odds_x100]));
  assert.deepEqual(sels, {
    '1x2|1': 250, '1x2|2': 150,
    'gou|O20.5': 188, 'gou|U20.5': 182, // consensus row left out of the average
    'ghcp|1+3.5': 187, 'ghcp|2-3.5': 182,
    'goe|ODD': 184, 'goe|EVEN': 184,
    'ou|O2.5': 250, 'ou|U2.5': 145,
    'hcp|1-1.5': 394, 'hcp|2+1.5': 119,
    'pou|1:O9.5': 180, 'pou|1:U9.5': 190, // first set only
  });

  const bets = Object.fromEntries(['gou|O20.5', 'ghcp|1+3.5', 'goe|ODD', 'ou|O2.5', 'hcp|2+1.5'].map((k) => {
    const [market, code] = k.split('|');
    return [k, t.db.prepare('SELECT id FROM selections WHERE market = ? AND code = ?').get(market, code).id];
  }));
  const user = t.db.prepare('SELECT * FROM users').get();
  const ids = Object.fromEntries(Object.entries(bets).map(([k, selId]) => {
    const odds = t.db.prepare('SELECT odds_x100 FROM selections WHERE id = ?').get(selId).odds_x100 / 100;
    return [k, tx(t.db, () => placeBets(t.db, user, { mode: 'single', stakeCents: 500, picks: [{ selectionId: selId, odds }] }))[0]];
  }));

  t.startNow(7);
  // 6-4 3-6 7-6: 2-1 in sets, 16-16 in games (32, even).
  status = { status: 'finished', player1_sets: 2, player2_sets: 1, sets_detail: '6-4, 3-6, 7-6(5)', winner_id: 4211 };
  await t.tennis.syncResults();
  const ev = t.row(7);
  assert.deepEqual([ev.home_games, ev.away_games, ev.retired], [16, 16, 0]);
  const st = (k) => t.betStatus(ids[k]).status;
  assert.equal(st('gou|O20.5'), 'won');
  assert.equal(st('ghcp|1+3.5'), 'won');
  assert.equal(st('goe|ODD'), 'lost');
  assert.equal(st('ou|O2.5'), 'won');
  assert.equal(st('hcp|2+1.5'), 'won');
});

test('a retirement voids sets and games markets but settles the winner', async () => {
  let status = { status: 'scheduled' };
  const t = setup({
    '/matches/': { results: [match(8, { odds_player1: null, odds_player2: null })] },
    '/matches/8/': () => match(8, status),
    '/matches/8/odds/': tennisOdds,
  });
  await t.tennis.syncFixtures();
  const sel = (market, code) => t.db.prepare('SELECT id, odds_x100 FROM selections WHERE market = ? AND code = ?').get(market, code);
  const user = t.db.prepare('SELECT * FROM users').get();
  const place = (s) => tx(t.db, () => placeBets(t.db, user, { mode: 'single', stakeCents: 500, picks: [{ selectionId: s.id, odds: s.odds_x100 / 100 }] }))[0];
  const onGames = place(sel('gou', 'U20.5'));
  const onWinner = place(sel('1x2', '1'));
  t.startNow(8);
  status = { status: 'retired', player1_sets: 1, player2_sets: 0, sets_detail: '6-2, 3-1', winner_id: 4211 };
  await t.tennis.syncResults();
  assert.equal(t.betStatus(onGames).status, 'void');
  assert.equal(t.betStatus(onWinner).status, 'won');
  assert.equal(t.row(8).retired, 1);
});

test('set markets settle on that set; after a retirement only completed sets stand', async () => {
  let status = { status: 'scheduled' };
  const setOdds = {
    bookmakers: [{ bookmaker_slug: 'bet365', odds_player1: 1.8, odds_player2: 1.9, updated_at: '2026-09-27T22:10:30Z' }],
    markets: [
      { market_kind: 'WINNER', market_line: null, market_period: '1S', bookmakers: [book('bet365', { P1: 1.82, P2: 1.88 })] },
      { market_kind: 'WINNER', market_line: null, market_period: '2S', bookmakers: [book('bet365', { P1: 1.84, P2: 1.86 })] },
      { market_kind: 'OU_GAMES', market_line: 8.5, market_period: '1S', bookmakers: [book('bet365', { OVER: 1.27, UNDER: 3.38 })] },
      { market_kind: 'GAMES_HCP', market_line: -2.5, market_period: '1S', bookmakers: [book('bet365', { P1: 3.38, P2: 1.28 })] },
      { market_kind: 'OE_GAMES', market_line: null, market_period: '2S', bookmakers: [book('bet365', { ODD: 1.86, EVEN: 1.8 })] },
    ],
  };
  const t = setup({
    '/matches/': { results: [match(9, { odds_player1: null, odds_player2: null })] },
    '/matches/9/': () => match(9, status),
    '/matches/9/odds/': setOdds,
  });
  await t.tennis.syncFixtures();
  const user = t.db.prepare('SELECT * FROM users').get();
  const place = (market, code) => {
    const s = t.db.prepare('SELECT id, odds_x100 FROM selections WHERE market = ? AND code = ?').get(market, code);
    assert.ok(s, `${market} ${code}`);
    return tx(t.db, () => placeBets(t.db, user, { mode: 'single', stakeCents: 500, picks: [{ selectionId: s.id, odds: s.odds_x100 / 100 }] }))[0];
  };
  const set1 = place('pw', '1:1');
  const set1Over = place('pou', '1:O8.5');
  const set1Hcp = place('phcp', '1:2+2.5');
  const set2 = place('pw', '2:2');
  const set2Odd = place('poe', '2:ODD');

  // The API lists the set markets under their own titles.
  const app = createApp(t.db, { tennis: t.tennis });
  const server = app.listen(0);
  try {
    const { event } = await (await fetch(`http://127.0.0.1:${server.address().port}/api/events/${t.row(9).id}`)).json();
    const names = event.markets.map((m) => m.name);
    assert.ok(names.includes('Vencedor do set — 1.º set') && names.includes('Total de jogos — 1.º set') && names.includes('Jogos par / ímpar — 2.º set'), names.join(', '));
  } finally { server.close(); }

  t.startNow(9);
  // 6-3 to Alcaraz, then retirement at 2-1 in the second set: Alcaraz advances.
  status = { status: 'retired', player1_sets: 1, player2_sets: 0, sets_detail: '6-3, 2-1', winner_id: 4211 };
  await t.tennis.syncResults();
  assert.equal(t.betStatus(set1).status, 'won');
  assert.equal(t.betStatus(set1Over).status, 'won');
  assert.equal(t.betStatus(set1Hcp).status, 'lost'); // 6-3: Sinner +2.5 → 5.5 < 6
  assert.equal(t.betStatus(set2).status, 'void');
  assert.equal(t.betStatus(set2Odd).status, 'void');
});
