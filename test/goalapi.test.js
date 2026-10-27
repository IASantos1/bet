import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../server/db.js';
import { createGoalApi, findFixture, normalizeForm, normalizeH2H, normalizeStandings } from '../server/goalapi.js';

const HOUR = 3_600_000;
const ko = new Date(Math.floor(Date.now() / HOUR) * HOUR + 5 * HOUR); // in 5 h, on the hour
const fx = (id, home, away, at = ko, league = { id: 'L1', name: 'LaLiga' }) => ({
  id, leagueId: league.id, leagueName: league.name, kickoffUtc: new Date(at).toISOString(),
  homeTeam: { id: `t-${home}`, name: home }, awayTeam: { id: `t-${away}`, name: away }, matchStatus: 'SCHEDULED',
});
const ev = (home, away, extra = {}) => ({ id: 7, sport: 'futebol', competition: 'Spain. LaLiga', home, away, start_time: ko.toISOString(), ...extra });
const compact = (f) => ({ id: f.id, ko: Date.parse(f.kickoffUtc), leagueId: f.leagueId, league: f.leagueName, home: { id: f.homeTeam.id, name: f.homeTeam.name }, away: { id: f.awayTeam.id, name: f.awayTeam.name } });

test('our event is matched by kick-off time and both team names', () => {
  const list = [fx('1', 'Celtic', 'Rangers'), fx('2', 'RC Celta de Vigo', 'Real Madrid CF'), fx('3', 'Barcelona', 'Sevilla', ko.getTime() + 5 * HOUR)].map(compact);
  assert.equal(findFixture(ev('Celta Vigo', 'Real Madrid'), list)?.id, '2');
  assert.equal(findFixture(ev('Celtic', 'Rangers'), list)?.id, '1');
  // Same teams but 5 h apart, or one team different: no match.
  assert.equal(findFixture(ev('Barcelona', 'Sevilla'), list), null);
  assert.equal(findFixture(ev('Celta Vigo', 'Getafe'), list), null);
  // One team the same and the other a short form of the name.
  const more = [fx('4', 'Manchester United', 'Chelsea'), fx('5', 'Wolverhampton Wanderers', 'Everton'), fx('6', 'Manchester City', 'Arsenal')].map(compact);
  assert.equal(findFixture(ev('Man Utd', 'Chelsea'), more)?.id, '4');
  assert.equal(findFixture(ev('Wolves', 'Everton'), more)?.id, '5');
  assert.equal(findFixture(ev('Man Utd', 'Arsenal'), more), null, 'United is not City');
  // Both names shorter on one side (same kick-off); a reserve side is never the first team.
  const short = [fx('7', 'Rodez', 'Montpellier'), fx('8', 'Corinthians', 'Vitória', ko.getTime() + 30 * 60_000), fx('9', 'Ajax II', 'De Graafschap')].map(compact);
  assert.equal(findFixture(ev('Rodez Aveyron', 'Montpellier HSC'), short)?.id, '7');
  assert.equal(findFixture(ev('Corinthians Paulista', 'EC Vitoria Salvador'), short)?.id, '8');
  assert.equal(findFixture(ev('Ajax', 'De Graafschap'), short), null);
  // Other names of the same club.
  const other = [fx('10', 'PSG', 'Barcelona'), fx('11', 'Levante', 'Athletic Club'), fx('12', 'Crvena zvezda', 'København')].map(compact);
  assert.equal(findFixture(ev('Paris Saint-Germain', 'Barcelona'), other)?.id, '10');
  assert.equal(findFixture(ev('Levante UD', 'Athletic Bilbao'), other)?.id, '11');
  assert.equal(findFixture(ev('Crvena Zvezda', 'Copenhagen'), other)?.home.name, 'Crvena zvezda');
  // Kick-off off by up to 3 h still matches (the closest one).
  assert.equal(findFixture(ev('Barcelona', 'Sevilla', { start_time: new Date(ko.getTime() + 3 * HOUR).toISOString() }), list)?.id, '3');
});

test('head-to-head is counted from our home team side', () => {
  const h = normalizeH2H({
    team1: { id: 'a', name: 'Real Madrid' }, team2: { id: 'b', name: 'Barcelona' },
    matches: [
      { match_date: '2026-04-10', match_hometeam_name: 'Barcelona', match_awayteam_name: 'Real Madrid', match_hometeam_score: '1', match_awayteam_score: '3' },
      { match_date: '2025-10-26', match_hometeam_name: 'Real Madrid', match_awayteam_name: 'Barcelona', match_hometeam_score: '2', match_awayteam_score: '2' },
      { match_date: '2025-05-11', match_hometeam_name: 'Barcelona', match_awayteam_name: 'Real Madrid', match_hometeam_score: '4', match_awayteam_score: '0' },
      { match_date: '2026-12-01', match_hometeam_name: 'Real Madrid', match_awayteam_name: 'Barcelona', match_hometeam_score: '', match_awayteam_score: '' },
    ],
  }, { home: 'Real Madrid', away: 'Barcelona' });
  assert.deepEqual({ total: h.total, homeWins: h.homeWins, draws: h.draws, awayWins: h.awayWins, homeGoals: h.homeGoals, awayGoals: h.awayGoals },
    { total: 3, homeWins: 1, draws: 1, awayWins: 1, homeGoals: 5, awayGoals: 7 });
  assert.equal(h.recent[0].date, '2026-04-10');
  assert.equal(normalizeH2H({ matches: [] }, { home: 'A', away: 'B' }), null);
});

test('league table picks the group with our teams; form counts the last five', () => {
  const row = (pos, team, group, pts) => ({ teamId: `t-${team}`, teamName: team, leagueRound: group, overallLeaguePosition: String(pos), overallLeaguePlayed: '10',
    overallLeagueW: '5', overallLeagueD: '2', overallLeagueL: '3', overallLeagueGF: '15', overallLeagueGA: '9', overallLeaguePTS: String(pts) });
  const t = normalizeStandings([row(1, 'X', 'East', 30), row(2, 'Y', 'East', 20), row(2, 'Celta', 'West', 21), row(1, 'Getafe', 'West', 25)],
    compact(fx('9', 'Celta', 'Getafe')));
  assert.equal(t.name, 'LaLiga · West');
  assert.deepEqual(t.rows.map((r) => [r.position, r.team, r.side]), [[1, 'Getafe', 'away'], [2, 'Celta', 'home']]);
  // Argentina: two groups, their rows mixed together, and each group sent again for another phase
  // (still empty): only our group, each team once, with its games.
  const z = (pos, team, group, played) => ({ ...row(pos, team, group, played * 3), overallLeaguePlayed: String(played) });
  const arg = normalizeStandings([
    z(1, 'Tigre', 'Group B', 1), z(1, 'Platense', 'Group A', 2), z(1, 'Velez', 'Group B', 0), z(1, 'Newells', 'Group A', 0),
    z(2, 'Velez', 'Group B', 1), z(2, 'River', 'Group A', 1), z(2, 'Tigre', 'Group B', 0), z(2, 'Boca', 'Group A', 0),
    z(3, 'Newells', 'Group A', 1), z(3, 'Platense', 'Group A', 0), z(4, 'Boca', 'Group A', 0), z(4, 'River', 'Group A', 0),
  ], compact(fx('9', 'River', 'Platense')));
  assert.equal(arg.name, 'LaLiga · Group A');
  assert.deepEqual(arg.rows.map((r) => [r.position, r.team, r.played]), [[1, 'Platense', 2], [2, 'River', 1], [3, 'Newells', 1], [4, 'Boca', 0]]);

  const f = normalizeForm({ recentFixtures: ['W', 'W', 'D', 'L', 'W', 'L'].map((r, i) => ({ date: `2026-10-0${9 - i}`, opponent: `O${i}`, score: '1-0', isHome: i % 2 === 0, result: r })) });
  assert.equal(f.games.length, 5);
  assert.deepEqual([f.won, f.drawn, f.lost], [3, 1, 1]);
  assert.equal(normalizeForm({ recentFixtures: [] }), null);
  // A plain list of fixtures, counted from the team's side; "win"/"loss" words.
  const plain = normalizeForm([
    { matchDate: '2026-10-10', homeTeamId: 'me', homeTeamName: 'Me', awayTeamId: 'x', awayTeamName: 'X', homeTeamScore: '2', awayTeamScore: '0' },
    { matchDate: '2026-10-03', homeTeamId: 'y', homeTeamName: 'Y', awayTeamId: 'me', awayTeamName: 'Me', homeTeamScore: '3', awayTeamScore: '1' },
    { matchDate: '2026-09-27', homeTeamId: 'z', homeTeamName: 'Z', awayTeamId: 'me', awayTeamName: 'Me', homeTeamScore: '1', awayTeamScore: '1' },
  ], 'me');
  assert.deepEqual(plain.games.map((g) => [g.opponent, g.result, g.home]), [['X', 'W', true], ['Y', 'L', false], ['Z', 'D', false]]);
  assert.equal(normalizeForm({ recentFixtures: [{ date: '2026-10-01', opponent: 'Q', score: '0-1', isHome: true, result: 'loss' }] }).lost, 1);
});

test('insights: only big and medium leagues, answers kept, daily limit kept', async () => {
  const db = openDb(':memory:');
  const calls = [];
  const fetchImpl = async (url, opts) => {
    assert.equal(opts.headers.Authorization, 'Bearer k');
    const u = new URL(url);
    calls.push(u.pathname);
    const body = (data, more = false) => ({ ok: true, status: 200, json: async () => ({ success: true, data, pagination: { hasMore: more } }) });
    if (u.pathname.startsWith('/v1/fixtures/date/')) {
      const offset = Number(u.searchParams.get('offset'));
      // Two pages on the kick-off day: the game is on the second one.
      if (u.pathname.endsWith(ko.toISOString().slice(0, 10))) return offset ? body([fx('55', 'Real Madrid CF', 'FC Barcelona')]) : body([fx('54', 'Celtic', 'Rangers')], true);
      return body([]);
    }
    if (u.pathname.startsWith('/v1/h2h/')) {
      return body({ matches: [{ match_date: '2026-04-10', match_hometeam_name: 'FC Barcelona', match_awayteam_name: 'Real Madrid CF', match_hometeam_score: '1', match_awayteam_score: '3' }] });
    }
    if (u.pathname === '/v1/standings/L1') return body([{ teamId: 't-Real Madrid CF', teamName: 'Real Madrid CF', overallLeaguePosition: '1', overallLeaguePTS: '30' }]);
    if (u.pathname.startsWith('/v1/teams/')) return body({ recentFixtures: [{ date: '2026-10-01', opponent: 'Getafe', score: '2-0', isHome: true, result: 'W' }] });
    return { ok: false, status: 404, json: async () => ({}) };
  };
  const goal = createGoalApi(db, { key: 'k', daily: 50, fetchImpl });
  assert.equal(goal.covers(ev('A', 'B', { competition: 'Vietnam. V.League 2' })), false);
  assert.deepEqual(await goal.insights(ev('A', 'B', { competition: 'Vietnam. V.League 2' })), { h2h: null, standings: null, form: null, venue: null });
  assert.equal(calls.length, 0);

  const r = await goal.insights(ev('Real Madrid', 'Barcelona'));
  assert.equal(r.h2h.homeWins, 1);
  assert.equal(r.standings.rows[0].side, 'home');
  assert.equal(r.form.home.won, 1);
  // At home / away: the home side's games at home (the away side has none away here).
  assert.deepEqual([r.venue.home.source, r.venue.home.won, r.venue.home.goalsFor, r.venue.home.goalsAgainst], ['recent', 1, 2, 0]);
  assert.equal(r.venue.away, null);
  assert.ok(calls.includes('/v1/h2h/t-Real%20Madrid%20CF/t-FC%20Barcelona/direct'));
  const first = calls.length;
  await goal.insights(ev('Real Madrid', 'Barcelona'));
  assert.equal(calls.length, first, 'second look comes from the cache');
  assert.equal(goal.status().usedToday, first);

  // No requests beyond the daily limit.
  const tight = createGoalApi(openDb(':memory:'), { key: 'k', daily: 1, fetchImpl });
  const before = calls.length;
  assert.deepEqual(await tight.insights(ev('Real Madrid', 'Barcelona')), { h2h: null, standings: null, form: null, venue: null });
  assert.equal(calls.length - before, 1);
});

test('without a key nothing is asked', async () => {
  const goal = createGoalApi(openDb(':memory:'), { key: '', fetchImpl: async () => { throw new Error('no call'); } });
  assert.equal(goal.enabled, false);
  assert.deepEqual(await goal.insights(ev('Real Madrid', 'Barcelona')), { h2h: null, standings: null, form: null, venue: null });
});

test('at home / away: the season split from the table when it has one, else the recent games at that venue', async () => {
  const { normalizeVenue } = await import('../server/goalapi.js');
  const games = { recentFixtures: [
    { date: '2026-10-20', opponent: 'X', score: '1-2', isHome: false, result: 'W' },
    { date: '2026-10-13', opponent: 'Y', score: '0-0', isHome: true, result: 'D' },
    { date: '2026-10-06', opponent: 'Z', score: '3-1', isHome: false, result: 'L' },
  ] };
  const away = normalizeVenue(games, 't', false);
  assert.deepEqual([away.source, away.played, away.won, away.lost, away.goalsFor, away.goalsAgainst], ['recent', 2, 1, 1, 3, 4]);
  const season = normalizeVenue(games, 't', false, { awayLeagueW: '4', awayLeagueD: '2', awayLeagueL: '1', awayLeagueGF: '11', awayLeagueGA: '6' });
  assert.deepEqual([season.source, season.played, season.won, season.goalsFor, season.games.length], ['season', 7, 4, 11, 2]);
  assert.equal(normalizeVenue({ recentFixtures: [] }, 't', true), null);
});
