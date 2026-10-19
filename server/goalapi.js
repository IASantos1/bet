// GOAL API (api.goal-api.com): football statistics only, for the "Estatísticas" tab of the match
// page. Head-to-head, the league table and each team's last five games. No odds, no markets.
//
// Our events (WinHouse) have no GOAL API id, so each one is matched to a GOAL API fixture by
// kick-off time (within 3 h, the closest wins) and both team names (same name, or the same club
// spelled differently: "Stade Rennais" ~ "Rennes", see closeName). A match, or the lack of one,
// is kept, so each game is looked up once.
//
// The free plan allows 1000 requests a day. Only big and medium leagues (tier 1 and 2, see
// leagues.js) are looked up, nothing is fetched until someone opens the statistics of a game, every
// answer is kept in the database (the day's fixtures 12 h, the table 6 h, form and head-to-head
// 12 h) and at most `daily` requests are made a day (GOAL_API_DAILY, default 900).
//
// Response shapes (all confirmed against real answers in the old Bet62Novo integration):
//   every answer        { success, data, pagination? }; numbers often come as strings
//   /fixtures/date/:d   [{ id, leagueId, leagueName, homeTeam:{id,name}, awayTeam, kickoffUtc }],
//                       100 a page (limit/offset) until pagination.hasMore is false
//   /h2h/:a/:b/direct   { team1:{id,name}, team2, matches:[{ match_date, match_hometeam_name,
//                       match_awayteam_name, match_hometeam_score, match_awayteam_score, league_name }] }
//   /standings/:league  [{ teamId, teamName, leagueRound, overallLeaguePosition, overallLeaguePlayed,
//                       overallLeagueW/D/L/GF/GA/PTS }] (leagueRound names the group when there are several)
//   /teams/:id/results  { recentFixtures:[{ date, opponent, score:"2-1", isHome, result:"W"|"D"|"L", league }] }

import { leagueTier } from './leagues.js';
import { closeName, nameVariants, teamKey } from './teamlogos.js';

const HOUR = 3_600_000;
const TTL = { fixtures: 12 * HOUR, standings: 6 * HOUR, form: 12 * HOUR, h2h: 12 * HOUR };
const WINDOW = 3 * HOUR; // kick-off difference allowed between our event and the GOAL API fixture
const MAX_PAGES = 30;
const AHEAD = 8 * 24 * HOUR; // games are looked up up to 8 days ahead

const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : null; };
// Letters that do not lose their mark like accents do ("København" is "kobenhavn").
const PLAIN = { ø: 'o', Ø: 'o', æ: 'ae', Æ: 'ae', ß: 'ss', đ: 'd', Đ: 'd', ł: 'l', Ł: 'l', ı: 'i', þ: 'th' };
const loose = (name) => teamKey('', String(name || '').replace(/[øØæÆßđĐłŁıþ]/g, (c) => PLAIN[c])).slice(1);
const day = (ms) => new Date(ms).toISOString().slice(0, 10);

// Reserve, youth and women's sides: "Ajax II" is never "Ajax".
const SIDE = /\b(ii|iii|b|u\d{2}|w|women|fem|feminin[ao]?|reserves?|youth|juniors?|sub ?\d{2})\b/;
const sideMark = (name) => (SIDE.exec(loose(name)) || [''])[0];

/** Whether a GOAL API team name is our team (same name, or the only close fit among the candidates). */
function fits(ours, theirs, candidates) {
  if (sideMark(ours) !== sideMark(theirs)) return false;
  const mine = new Set(nameVariants(ours).map(loose));
  if (nameVariants(theirs).map(loose).some((n) => n && mine.has(n))) return true;
  return closeName(ours, candidates.map((name) => ({ name, logo: name })))?.name === theirs;
}

// Club words that tell nothing ("FC", "United"...) are left out of the loose comparison.
const NOISE = new Set(['fc', 'cf', 'sc', 'ac', 'afc', 'cd', 'sl', 'fk', 'sk', 'bk', 'if', 'sv', 'club', 'de', 'la', 'the', 'real', 'united', 'utd', 'city', 'sporting', 'atletico', 'athletic', 'inter']);
const tokens = (name) => loose(name).split(' ').filter((w) => w.length >= 3 && !NOISE.has(w));
const KIND = { united: 'united', utd: 'united', city: 'city', town: 'town', county: 'county', rovers: 'rovers', albion: 'albion', athletic: 'athletic', wanderers: 'wanderers' };
const kinds = (name) => new Set(loose(name).split(' ').map((w) => KIND[w]).filter(Boolean));
const clash = (a, b) => { const ka = kinds(a); const kb = kinds(b); return ka.size > 0 && kb.size > 0 && ![...ka].some((k) => kb.has(k)); };
/** A loose fit: one telling word of each name starts the same ("Man Utd" ~ "Manchester United", "Wolves" ~ "Wolverhampton"). */
const near = (ours, theirs) => !clash(ours, theirs) && sideMark(ours) === sideMark(theirs) && tokens(ours).some((a) => tokens(theirs).some((b) => a.startsWith(b) || b.startsWith(a) || (a.slice(0, 4) === b.slice(0, 4) && a.length >= 4)));

/** One name is the other with words added ("Rodez Aveyron" ~ "Rodez", "EC Vitoria Salvador" ~ "Vitória"). */
const subset = (ours, theirs) => {
  if (clash(ours, theirs) || sideMark(ours) !== sideMark(theirs)) return false;
  const a = tokens(ours);
  const b = tokens(theirs);
  if (!a.length || !b.length) return false;
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  return short.every((w) => long.some((x) => x === w || (w.length >= 5 && (x.startsWith(w) || w.startsWith(x)))));
};

// Clubs known by another name on one side ("PSG", "København", "Athletic Club"): compared by one name.
const ALIASES = [
  ['Paris Saint Germain', 'psg', 'paris sg', 'paris saint germain fc'],
  ['Copenhagen', 'kobenhavn', 'fc kobenhavn', 'fc copenhagen'],
  ['Athletic Bilbao', 'athletic club', 'athletic club bilbao'],
  ['Inter Milan', 'inter', 'internazionale', 'fc internazionale milano', 'inter milano'],
  ['AC Milan', 'milan'],
  ['Manchester United', 'man utd', 'man united'],
  ['Manchester City', 'man city'],
  ['Tottenham', 'spurs', 'tottenham hotspur'],
  ['Wolverhampton', 'wolves', 'wolverhampton wanderers'],
  ['Nottingham Forest', 'nottm forest', 'nott m forest'],
  ['Atletico Madrid', 'atl madrid', 'atletico de madrid', 'club atletico de madrid'],
  ['Bayern Munich', 'bayern munchen', 'fc bayern munchen', 'bayern'],
  ['Borussia Monchengladbach', 'monchengladbach', 'gladbach', 'b monchengladbach'],
  ['Sporting CP', 'sporting lisbon', 'sporting clube de portugal', 'sporting'],
  ['Crvena Zvezda', 'red star belgrade', 'fk crvena zvezda'],
  ['Olympiacos', 'olympiakos', 'olympiacos piraeus', 'olympiacos fc'],
  ['PSV Eindhoven', 'psv'],
  ['AZ Alkmaar', 'az'],
  ['NEC Nijmegen', 'nec', 'n e c'],
  ['DC United', 'd c united'],
  ['Cincinnati', 'fc cincinnati'],
  ['Red Bull Salzburg', 'salzburg', 'rb salzburg', 'fc salzburg'],
  ['Union Saint Gilloise', 'union sg', 'royale union saint gilloise', 'union st gilloise'],
  ['Dinamo Zagreb', 'gnk dinamo zagreb', 'd zagreb'],
  ['Kuopion Palloseura', 'kups'],
];
const ALIAS = new Map(ALIASES.flatMap(([name, ...others]) => [name, ...others].map((o) => [loose(o), name])));
const alias = (name) => ALIAS.get(loose(name)) || name;

/** The fixture of our event among a day's fixtures: kick-off within 3 h (closest first) and both teams the
 * same; else the only fixture where one team is the same and the other a loose fit; else the only fixture
 * kicking off within 45 min where each name is the other with words added or left out. */
export function findFixture(event, fixtures) {
  const at = Date.parse(event.start_time);
  if (!Number.isFinite(at)) return null;
  const ev = { home: alias(event.home), away: alias(event.away) };
  // Compared with the other names in place; the fixture found is returned as GOAL API has it.
  const named = new Map();
  const close = fixtures.filter((f) => Math.abs(f.ko - at) <= WINDOW).sort((a, b) => Math.abs(a.ko - at) - Math.abs(b.ko - at))
    .map((f) => { const g = { ...f, home: { ...f.home, name: alias(f.home.name) }, away: { ...f.away, name: alias(f.away.name) } }; named.set(g, f); return g; });
  const homes = close.map((f) => f.home.name);
  const aways = close.map((f) => f.away.name);
  const sure = close.find((f) => fits(ev.home, f.home.name, homes) && fits(ev.away, f.away.name, aways));
  if (sure) return named.get(sure);
  const maybe = close.filter((f) => (fits(ev.home, f.home.name, homes) && near(ev.away, f.away.name)) || (fits(ev.away, f.away.name, aways) && near(ev.home, f.home.name)));
  if (maybe.length) return maybe.length === 1 ? named.get(maybe[0]) : null;
  const both = close.filter((f) => Math.abs(f.ko - at) <= 45 * 60_000 && subset(ev.home, f.home.name) && subset(ev.away, f.away.name));
  return both.length === 1 ? named.get(both[0]) : null;
}

// Kick-off: kickoffUtc; else matchDate + matchTime (taken as UTC).
const kickoff = (f) => {
  const iso = Date.parse(f.kickoffUtc || f.kickoff || '');
  if (Number.isFinite(iso)) return iso;
  const d = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(f.matchDate || f.date || ''));
  const t = /^(\d{1,2}):(\d{2})/.exec(String(f.matchTime || f.time || ''));
  return d && t ? Date.UTC(+d[1], +d[2] - 1, +d[3], +t[1], +t[2]) : NaN;
};
const team = (t, name, id) => (t && typeof t === 'object' ? { id: t.id ?? id, name: t.name ?? name } : { id, name: typeof t === 'string' ? t : name });

const compactFixture = (f) => {
  if (!f || typeof f !== 'object') return null;
  const ko = kickoff(f);
  const home = team(f.homeTeam, f.homeTeamName || f.match_hometeam_name, f.homeTeamId || f.match_hometeam_id);
  const away = team(f.awayTeam, f.awayTeamName || f.match_awayteam_name, f.awayTeamId || f.match_awayteam_id);
  const id = f.id ?? f.fixtureId ?? f.match_id;
  if (!id || !Number.isFinite(ko) || !home.name || !away.name) return null;
  const leagueId = f.leagueId ?? f.league?.id ?? f.league_id;
  return {
    id: String(id), ko, leagueId: leagueId ? String(leagueId) : null, league: f.leagueName || f.league?.name || f.league_name || null,
    country: f.countryName || f.country_name || null,
    home: { id: home.id ? String(home.id) : null, name: String(home.name) },
    away: { id: away.id ? String(away.id) : null, name: String(away.name) },
  };
};

// The list in an answer: data itself, or data.fixtures / data.items / data.data.
const listOf = (data) => (Array.isArray(data) ? data : ['fixtures', 'items', 'data', 'results'].map((k) => data?.[k]).find(Array.isArray) || []);

/** Head-to-head of our two teams, in the shape of the match page (home/away as in our event). */
export function normalizeH2H(raw, ev) {
  const matches = Array.isArray(raw?.matches) ? raw.matches : [];
  const played = matches.filter((m) => m.match_hometeam_score !== '' && num(m.match_hometeam_score) !== null && num(m.match_awayteam_score) !== null);
  if (!played.length) return null;
  const isOurHome = (name) => fits(ev.home, name, [...new Set(played.flatMap((m) => [m.match_hometeam_name, m.match_awayteam_name]))]);
  const out = { total: 0, homeWins: 0, draws: 0, awayWins: 0, homeGoals: 0, awayGoals: 0, recent: [] };
  for (const m of played.sort((a, b) => String(b.match_date).localeCompare(String(a.match_date)))) {
    const hs = num(m.match_hometeam_score);
    const as = num(m.match_awayteam_score);
    const flip = !isOurHome(m.match_hometeam_name); // our home team played away that day
    const ours = flip ? as : hs;
    const theirs = flip ? hs : as;
    out.total += 1;
    out.homeGoals += ours;
    out.awayGoals += theirs;
    if (ours > theirs) out.homeWins += 1; else if (ours < theirs) out.awayWins += 1; else out.draws += 1;
    if (out.recent.length < 5) {
      out.recent.push({ date: m.match_date || null, home: m.match_hometeam_name, away: m.match_awayteam_name, homeScore: hs, awayScore: as, league: m.league_name || null });
    }
  }
  out.avgGoals = Math.round(((out.homeGoals + out.awayGoals) / out.total) * 100) / 100;
  return out;
}

/** The league table (the group with our teams when there are several). */
export function normalizeStandings(raw, fx) {
  const rows = (Array.isArray(raw) ? raw : []).filter((r) => r && (r.teamName || r.team?.name));
  if (!rows.length) return null;
  const ids = new Set([fx.home.id, fx.away.id].filter(Boolean));
  const names = [fx.home.name, fx.away.name];
  const ours = (r) => ids.has(String(r.teamId || r.team?.id)) || names.some((n) => loose(n) === loose(r.teamName || r.team?.name));
  const groups = new Map();
  for (const r of rows) {
    const g = r.leagueRound || '';
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g).push(r);
  }
  const [group, list] = [...groups].find(([, l]) => l.some(ours)) || [...groups][0];
  const table = list.map((r) => ({
    position: num(r.overallLeaguePosition), team: r.teamName || r.team?.name, played: num(r.overallLeaguePlayed),
    won: num(r.overallLeagueW), drawn: num(r.overallLeagueD), lost: num(r.overallLeagueL),
    goalsFor: num(r.overallLeagueGF), goalsAgainst: num(r.overallLeagueGA), points: num(r.overallLeaguePTS),
    side: ours(r) ? (ids.has(String(r.teamId || r.team?.id)) ? (String(r.teamId || r.team?.id) === fx.home.id ? 'home' : 'away')
      : (loose(r.teamName || r.team?.name) === loose(fx.home.name) ? 'home' : 'away')) : null,
  })).filter((r) => r.position !== null).sort((a, b) => a.position - b.position);
  if (!table.length) return null;
  return { name: [fx.league, group].filter(Boolean).join(' · ') || null, rows: table };
}

/** A team's last five games and how many it won, drew and lost. */
const RESULT = { w: 'W', win: 'W', won: 'W', v: 'W', d: 'D', draw: 'D', e: 'D', l: 'L', loss: 'L', lost: 'L', lose: 'L' };
/** One past game of the team, from its own side: { date, opponent, home, score, result } or null. Takes the
 * resolved row ({ opponent, score:"2-1", isHome, result }) or a plain fixture (home/away names and scores). */
function formGame(f, teamId) {
  if (!f || typeof f !== 'object') return null;
  const date = f.date || f.matchDate || f.match_date || f.kickoffUtc || null;
  if (f.opponent || f.opponentName) {
    let result = RESULT[String(f.result || f.outcome || '').toLowerCase()];
    const [a, b] = String(f.score || '').split(/\s*[-:]\s*/).map(Number);
    if (!result && Number.isFinite(a) && Number.isFinite(b)) result = a === b ? 'D' : (f.isHome === false ? b > a : a > b) ? 'W' : 'L';
    return result ? { date, opponent: f.opponent || f.opponentName, home: f.isHome !== false, score: String(f.score || ''), result, league: f.league || f.leagueName || null } : null;
  }
  const homeId = String(f.homeTeamId ?? f.homeTeam?.id ?? f.match_hometeam_id ?? '');
  const awayId = String(f.awayTeamId ?? f.awayTeam?.id ?? f.match_awayteam_id ?? '');
  const hs = num(f.homeTeamScore ?? f.homeTeamFtScore ?? f.match_hometeam_score);
  const as = num(f.awayTeamScore ?? f.awayTeamFtScore ?? f.match_awayteam_score);
  if (hs === null || as === null || (teamId && homeId !== String(teamId) && awayId !== String(teamId))) return null;
  const home = !teamId || homeId === String(teamId);
  const opponent = home ? (f.awayTeamName || f.awayTeam?.name || f.match_awayteam_name) : (f.homeTeamName || f.homeTeam?.name || f.match_hometeam_name);
  const ours = home ? hs : as;
  const theirs = home ? as : hs;
  return opponent ? { date, opponent, home, score: `${hs}-${as}`, result: ours > theirs ? 'W' : ours < theirs ? 'L' : 'D', league: f.leagueName || null } : null;
}

export function normalizeForm(raw, teamId = null) {
  const rows = Array.isArray(raw) ? raw : ['recentFixtures', 'recent', 'results', 'fixtures', 'matches', 'lastMatches'].map((k) => raw?.[k]).find(Array.isArray) || [];
  const list = rows.map((f) => formGame(f, teamId)).filter(Boolean)
    .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')))
    .slice(0, 5);
  if (!list.length) return null;
  const count = (r) => list.filter((f) => f.result === r).length;
  return { games: list, won: count('W'), drawn: count('D'), lost: count('L') };
}

export function createGoalApi(db, { key = '', baseUrl = 'https://api.goal-api.com/v1', daily = 900, fetchImpl = globalThis.fetch, log = () => {} } = {}) {
  const enabled = Boolean(key);
  const base = String(baseUrl || '').replace(/\/+$/, '');
  db.exec('CREATE TABLE IF NOT EXISTS goal_cache (key TEXT PRIMARY KEY, body TEXT NOT NULL, fetched_at INTEGER NOT NULL)');
  db.exec('CREATE TABLE IF NOT EXISTS api_quota (name TEXT PRIMARY KEY, day TEXT NOT NULL, used INTEGER NOT NULL)');
  const cacheGet = db.prepare('SELECT body, fetched_at FROM goal_cache WHERE key = ?');
  const cacheSet = db.prepare(`INSERT INTO goal_cache (key, body, fetched_at) VALUES (?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET body = excluded.body, fetched_at = excluded.fetched_at`);
  const quotaRow = db.prepare("SELECT day, used FROM api_quota WHERE name = 'goal'");
  const quotaSet = db.prepare(`INSERT INTO api_quota (name, day, used) VALUES ('goal', ?, ?)
    ON CONFLICT(name) DO UPDATE SET day = excluded.day, used = excluded.used`);
  const used = () => { const r = quotaRow.get(); return r && r.day === day(Date.now()) ? r.used : 0; };
  let lastError = null;
  let pausedUntil = 0; // after a refused key or a 429: no requests for a while
  const inflight = new Map();

  async function request(path) {
    if (used() >= daily) throw Object.assign(new Error(`limite diário de ${daily} pedidos atingido`), { budget: true });
    if (Date.now() < pausedUntil) throw Object.assign(new Error('GOAL API em pausa'), { budget: true });
    quotaSet.run(day(Date.now()), used() + 1);
    const res = await fetchImpl(`${base}${path}`, { signal: AbortSignal.timeout(12_000), headers: { Authorization: `Bearer ${key}`, Accept: 'application/json' } });
    if (res.status === 401 || res.status === 403) { pausedUntil = Date.now() + HOUR; throw new Error(`GOAL API recusou a chave (HTTP ${res.status})`); }
    if (res.status === 429) { pausedUntil = Date.now() + 15 * 60_000; throw new Error('GOAL API: demasiados pedidos (429)'); }
    if (res.status === 404) return { data: null };
    if (!res.ok) throw new Error(`GOAL API HTTP ${res.status}`);
    const body = await res.json().catch(() => null);
    if (!body || body.success === false) throw new Error(`GOAL API: ${body?.error || body?.message || 'resposta inválida'}`);
    return body;
  }

  // Every page (100 a page). When the answer does not say whether there is more, a full page means
  // there may be; a page that repeats the previous one (offset ignored) ends it.
  let lastPaging = null;
  async function fetchAll(path) {
    const out = [];
    let prevFirst = null;
    for (let page = 0, offset = 0; page < MAX_PAGES; page += 1, offset += 100) {
      const body = await request(`${path}${path.includes('?') ? '&' : '?'}limit=100&offset=${offset}`);
      const list = listOf(body.data);
      const pg = body.pagination || body.data?.pagination || body.meta || null;
      lastPaging = { pages: page + 1, items: out.length + list.length, pagination: pg, keys: list[0] ? Object.keys(list[0]).slice(0, 25) : [] };
      const first = list[0] ? JSON.stringify(list[0]).slice(0, 200) : null;
      if (!list.length || (first && first === prevFirst)) break;
      prevFirst = first;
      out.push(...list);
      const more = pg?.hasMore ?? pg?.has_more ?? pg?.hasNext ?? (Number.isFinite(Number(pg?.total)) ? offset + list.length < Number(pg.total)
        : Number.isFinite(Number(pg?.totalPages)) ? page + 1 < Number(pg.totalPages) : list.length >= 100);
      if (!more) break;
    }
    return out;
  }

  /** A kept answer when still fresh, else asks GOAL API (an old answer is better than none on an error). */
  function cached(name, ttl, load) {
    const row = cacheGet.get(name);
    if (row && Date.now() - row.fetched_at < ttl) return Promise.resolve(JSON.parse(row.body));
    if (inflight.has(name)) return inflight.get(name);
    const p = (async () => {
      try {
        const value = await load();
        cacheSet.run(name, JSON.stringify(value ?? null), Date.now());
        lastError = null;
        return value ?? null;
      } catch (err) {
        if (!err.budget) { lastError = err.message; log(err.message); }
        if (row) return JSON.parse(row.body);
        throw err;
      } finally { inflight.delete(name); }
    })();
    inflight.set(name, p);
    return p;
  }

  const fixturesOn = (date) => cached(`fixtures:${date}`, TTL.fixtures,
    async () => (await fetchAll(`/fixtures/date/${date}`)).map(compactFixture).filter(Boolean));

  const candidatesFor = async (ev) => {
    const at = Date.parse(ev.start_time);
    if (!Number.isFinite(at) || at < Date.now() - 12 * HOUR || at > Date.now() + AHEAD) return [];
    const dates = [...new Set([day(at - WINDOW), day(at), day(at + WINDOW)])];
    return (await Promise.all(dates.map(fixturesOn))).flat();
  };

  /** The GOAL API fixture of our event (kept once found), or null. No match is not kept: matching
   * against the kept day lists costs no request, and a later list (or a fix) may find it. */
  async function link(ev) {
    const name = `link:${ev.id}`;
    const row = cacheGet.get(name);
    if (row) { const fx = JSON.parse(row.body); if (fx) return fx; }
    const fx = findFixture(ev, await candidatesFor(ev));
    if (fx) cacheSet.run(name, JSON.stringify(fx), Date.now());
    return fx;
  }

  /** Whether this event gets GOAL API statistics at all (football, big or medium league). */
  const covers = (ev) => enabled && ev?.sport === 'futebol' && leagueTier('futebol', ev.competition) <= 2;

  /** Head-to-head, league table and last five games of each team; only what GOAL API has. */
  async function insights(ev) {
    const empty = { h2h: null, standings: null, form: null };
    if (!covers(ev)) return empty;
    const fx = await link(ev).catch(() => null);
    if (!fx) return empty;
    const safe = (p) => p.catch(() => null);
    const [h2h, table, home, away] = await Promise.all([
      fx.home.id && fx.away.id ? safe(cached(`h2h:${fx.home.id}:${fx.away.id}`, TTL.h2h, async () => (await request(`/h2h/${encodeURIComponent(fx.home.id)}/${encodeURIComponent(fx.away.id)}/direct`)).data)) : null,
      fx.leagueId ? safe(cached(`standings:${fx.leagueId}`, TTL.standings, async () => (await request(`/standings/${encodeURIComponent(fx.leagueId)}`)).data)) : null,
      fx.home.id ? safe(cached(`form:${fx.home.id}`, TTL.form, async () => (await request(`/teams/${encodeURIComponent(fx.home.id)}/results`)).data)) : null,
      fx.away.id ? safe(cached(`form:${fx.away.id}`, TTL.form, async () => (await request(`/teams/${encodeURIComponent(fx.away.id)}/results`)).data)) : null,
    ]);
    const formHome = normalizeForm(home, fx.home.id);
    const formAway = normalizeForm(away, fx.away.id);
    return {
      h2h: normalizeH2H(h2h, ev),
      standings: normalizeStandings(table, fx),
      form: formHome || formAway ? { home: formHome, away: formAway } : null,
    };
  }

  const status = () => ({ enabled, usedToday: used(), daily, lastError, pausedUntil: pausedUntil > Date.now() ? new Date(pausedUntil).toISOString() : null });

  /** Admin check: the key, today's requests, and one real call (today's fixtures, from the cache when kept). */
  async function diagnose() {
    const steps = [{ name: 'Chave GOAL_API_KEY', ok: enabled, detail: enabled ? 'definida' : 'em falta nas Variables do Railway' }];
    if (!enabled) return steps;
    steps.push({ name: 'Pedidos hoje', ok: used() < daily, detail: `${used()} de ${daily}` });
    try {
      const list = await fixturesOn(day(Date.now()));
      steps.push({ name: 'Jogos de hoje na GOAL API', ok: list.length > 0, detail: `${list.length} jogos` });
    } catch (err) {
      steps.push({ name: 'Jogos de hoje na GOAL API', ok: false, detail: err.message });
    }
    if (lastPaging) {
      steps.push({ name: 'Última lista pedida', ok: lastPaging.items > 0,
        detail: `${lastPaging.pages} página(s), ${lastPaging.items} jogos · paginação: ${JSON.stringify(lastPaging.pagination)} · campos: ${lastPaging.keys.join(', ')}` });
    }
    // Big and medium leagues GOAL API has today and in the next days (from the kept lists).
    const lists = [];
    for (let d = 0; d < 3; d += 1) lists.push(...await fixturesOn(day(Date.now() + d * 24 * HOUR)).catch(() => []));
    const leagues = new Map();
    for (const f of lists) {
      const name = [f.country, f.league].filter(Boolean).join('. ');
      if (leagueTier('futebol', name) <= 2) leagues.set(name, (leagues.get(name) || 0) + 1);
    }
    steps.push({ name: 'Ligas grandes e médias na GOAL API (hoje + 2 dias)', ok: leagues.size > 0,
      detail: [...leagues].sort((a, b) => b[1] - a[1]).map(([n, c]) => `${n} (${c})`).join(' · ') || 'nenhuma' });
    // Our football games of big and medium leagues in the next 7 days: which ones found their GOAL API game.
    const ours = db.prepare(`SELECT id, sport, competition, home, away, start_time FROM events
      WHERE sport = 'futebol' AND status IN ('scheduled', 'live') AND start_time >= ? AND start_time <= ? ORDER BY start_time LIMIT 600`)
      .all(new Date(Date.now() - 3 * HOUR).toISOString(), new Date(Date.now() + 7 * 24 * HOUR).toISOString()).filter(covers);
    let found = 0;
    let sample = null;
    const misses = new Map();
    for (const ev of ours) {
      const fx = await link(ev).catch(() => null);
      if (fx) { found += 1; if (!sample || leagueTier('futebol', ev.competition) < leagueTier('futebol', sample.competition)) sample = ev; continue; }
      const key = `${ev.home} - ${ev.away}`;
      if (misses.has(key) || misses.size >= 10) continue;
      const at = Date.parse(ev.start_time);
      const close = (await candidatesFor(ev).catch(() => [])).filter((f) => Math.abs(f.ko - at) <= WINDOW);
      const same = close.filter((f) => [f.home.name, f.away.name].some((n) => [ev.home, ev.away].some((o) => loose(n).includes(loose(o).split(' ')[0]) || loose(o).includes(loose(n).split(' ')[0]))));
      misses.set(key, `${key} (${ev.start_time.slice(5, 16).replace('T', ' ')} UTC, ${ev.competition}) → ${close.length} jogos GOAL à mesma hora`
        + (same.length ? `; parecidos: ${same.slice(0, 2).map((f) => `${f.home.name} - ${f.away.name} ${new Date(f.ko).toISOString().slice(11, 16)}`).join(' | ')}` : '; nenhum parecido'));
    }
    steps.push({ name: 'Jogos nossos ligados (ligas grandes e médias, 7 dias)', ok: found > 0, detail: `${found} de ${ours.length}` });
    for (const m of misses.values()) steps.push({ name: 'Sem ligação', ok: false, detail: m });
    // One linked game of the biggest league: what the match page gets.
    if (sample) {
      const r = await insights(sample).catch(() => ({}));
      const fx = await link(sample).catch(() => null);
      const raw = fx?.home.id ? JSON.parse(cacheGet.get(`form:${fx.home.id}`)?.body || 'null') : null;
      const shape = (v) => (Array.isArray(v) ? `lista de ${v.length}${v[0] && typeof v[0] === 'object' ? ` {${Object.keys(v[0]).slice(0, 15).join(', ')}}` : ''}` : v && typeof v === 'object'
        ? `{${Object.keys(v).slice(0, 12).map((k) => (Array.isArray(v[k]) ? `${k}: ${shape(v[k])}` : k)).join(', ')}}` : String(v));
      if (!r.form) steps.push({ name: 'Resposta de /teams/{id}/results', ok: false, detail: shape(raw).slice(0, 600) });
      steps.push({ name: `Exemplo: ${sample.home} - ${sample.away}`, ok: Boolean(r.h2h || r.standings || r.form),
        detail: `H2H: ${r.h2h ? `${r.h2h.total} jogos` : 'sem dados'} · Classificação: ${r.standings ? `${r.standings.rows.length} equipas` : 'sem dados'} · Últimos 5: ${r.form ? 'sim' : 'sem dados'}` });
    }
    return steps;
  }

  /** Forgets the kept day lists (the next look asks GOAL API again). */
  const refresh = () => db.prepare("DELETE FROM goal_cache WHERE key LIKE 'fixtures:%'").run().changes;

  return { enabled, covers, insights, link, status, diagnose, refresh };
}
