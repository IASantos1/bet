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
const TTL = { fixtures: 12 * HOUR, standings: 6 * HOUR, form: 12 * HOUR, h2h: 12 * HOUR, events: 5 * 60_000 };
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
// A team's badge URL from the fixture's team object (GOAL API serves them at media.goal-api.com).
const httpsLogo = (u) => (typeof u === 'string' && /^https:\/\/[^\s"'<>]+$/.test(u.trim()) ? u.trim() : null);
const team = (t, name, id) => (t && typeof t === 'object'
  ? { id: t.id ?? id, name: t.name ?? name, logo: httpsLogo(t.logo ?? t.badge ?? t.crest ?? t.image ?? t.logoUrl) }
  : { id, name: typeof t === 'string' ? t : name, logo: null });

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
    // The badge is in the embedded team object (homeTeam.badge) or in the flat teamHomeBadge field,
    // depending on the endpoint — take whichever is there.
    home: { id: home.id ? String(home.id) : null, name: String(home.name), logo: home.logo || httpsLogo(f.teamHomeBadge || f.home_team_badge) || null },
    away: { id: away.id ? String(away.id) : null, name: String(away.name), logo: away.logo || httpsLogo(f.teamAwayBadge || f.away_team_badge) || null },
  };
};

// The list in an answer: data itself, or data.fixtures / data.items / data.data.
const listOf = (data) => (Array.isArray(data) ? data : ['fixtures', 'items', 'data', 'results'].map((k) => data?.[k]).find(Array.isArray) || []);

const slug = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

// A scorer / booked name without its annotation: "S. Solans (pen.)" -> "S. Solans".
const cleanPlayer = (s) => String(s || '').replace(/\([^)]*\)/g, '').replace(/\s+/g, ' ').trim();
// An own-goal line names the player who put it in their own net — not a "to score" hit for them.
const isOwnGoal = (s) => /\(\s*(?:o\.?g\.?|own)/i.test(String(s || ''));

/**
 * Per-player goals, assists, yellow and red cards of a match, from GOAL API match events. GOAL API's
 * events carry the side in the field name (homeScorer / awayScorer, homeAssist / awayAssist, and the
 * same home/away prefix for cards), so the player's team comes from which field held the name; a flat
 * player/team shape from another endpoint is still handled as a fallback. Returns player stat lines.
 */
export function normalizeMatchEvents(raw, fx = null) {
  const list = Array.isArray(raw) ? raw : ['events', 'incidents', 'timeline', 'data', 'items', 'goals'].map((k) => raw?.[k]).find(Array.isArray) || [];
  const by = new Map();
  const line = (id, name, team) => {
    const cn = cleanPlayer(name);
    const key = id != null && id !== '' ? `#${id}` : slug(cn);
    if (!key) return null;
    if (!by.has(key)) by.set(key, { id: id != null && id !== '' ? String(id) : null, name: cn, team: team || null, goals: 0, assists: 0, yellow: 0, red: 0 });
    const l = by.get(key);
    if (!l.name && cn) l.name = cn;
    if (!l.team && team) l.team = team;
    return l;
  };
  // Pick the first field that is present among several spellings, with its side prefix.
  const pick = (ev, side, ...names) => { for (const n of names) { const v = ev[`${side}${n}`] ?? ev[`${side}${n[0].toLowerCase()}${n.slice(1)}`]; if (v != null && v !== '') return v; } return null; };
  for (const ev of list) {
    if (!ev || typeof ev !== 'object') continue;
    const type = slug(ev.type || ev.eventType || ev.event_type || ev.incident || ev.incidentType || ev.kind || ev.detail);
    let sidePrefixed = false;
    for (const side of ['home', 'away']) {
      const scorer = pick(ev, side, 'Scorer');
      const scorerId = pick(ev, side, 'ScorerId');
      const assist = pick(ev, side, 'Assist');
      const assistId = pick(ev, side, 'AssistId');
      const yellow = pick(ev, side, 'YellowCard', 'Yellow', 'Booking');
      const yellowId = pick(ev, side, 'YellowCardId', 'YellowId', 'BookingId');
      const red = pick(ev, side, 'RedCard', 'Red', 'Sending');
      const redId = pick(ev, side, 'RedCardId', 'RedId', 'SendingId');
      if (scorer != null || scorerId != null || assist != null || yellow != null || red != null) sidePrefixed = true;
      if (/goal/.test(type) && (scorer != null || scorerId != null) && !isOwnGoal(scorer)) { const l = line(scorerId, scorer, side); if (l) l.goals += 1; }
      if (/goal/.test(type) && (assist != null || assistId != null)) { const a = line(assistId, assist, side); if (a) a.assists += 1; }
      if (red != null || redId != null) { const l = line(redId, red, side); if (l) l.red += 1; }
      else if (yellow != null || yellowId != null) { const l = line(yellowId, yellow, side); if (l) l.yellow += 1; }
    }
    if (sidePrefixed) continue;
    // Fallback: a flat player/team shape (player + team/side on the event itself).
    const team = (() => {
      const t = ev.team || ev.side || ev.teamName || ev.team_name;
      if (t === 'home' || t === 'away') return t;
      if (!fx) return null;
      const tn = slug(t); const tid = ev.teamId ?? ev.team_id ?? ev.team?.id;
      if ((tn && tn === slug(fx.home?.name)) || (tid != null && String(tid) === String(fx.home?.id))) return 'home';
      if ((tn && tn === slug(fx.away?.name)) || (tid != null && String(tid) === String(fx.away?.id))) return 'away';
      return null;
    })();
    const pName = ev.player?.name || ev.playerName || ev.player_name || (typeof ev.player === 'string' ? ev.player : null);
    const pId = ev.player?.id ?? ev.playerId ?? ev.player_id ?? null;
    if (/goal/.test(type) && !isOwnGoal(pName) && !/own/.test(type)) {
      const l = line(pId, pName, team); if (l) l.goals += 1;
      const aName = ev.assist?.name || ev.assistName || (typeof ev.assist === 'string' ? ev.assist : null);
      const aId = ev.assist?.id ?? ev.assistId ?? null;
      if (aName || aId != null) { const a = line(aId, aName, team); if (a) a.assists += 1; }
    } else if (/red/.test(type) || /second.?yellow|two.?yellow/.test(type)) {
      const l = line(pId, pName, team); if (l) l.red += 1;
    } else if (/yellow|booking|caution|card/.test(type)) {
      const l = line(pId, pName, team); if (l) l.yellow += 1;
    }
  }
  return [...by.values()];
}

/**
 * The match's goals in the order they were scored (by minute), each with its scorer — for first / last
 * goalscorer markets. Own goals are left out (they are not a "goalscorer" for betting). Same side-prefixed
 * shape as normalizeMatchEvents (homeScorer / awayScorer + time / timeNum).
 */
export function orderedGoals(raw) {
  const list = Array.isArray(raw) ? raw : ['events', 'incidents', 'timeline', 'data', 'items', 'goals'].map((k) => raw?.[k]).find(Array.isArray) || [];
  const goals = [];
  list.forEach((ev, i) => {
    if (!ev || typeof ev !== 'object') return;
    const type = slug(ev.type || ev.eventType || ev.event_type || ev.incident || ev.kind);
    if (!/goal/.test(type) && type !== 'score') return;
    const min = Number(ev.timeNum ?? ev.time ?? ev.minute);
    for (const side of ['home', 'away']) {
      const name = ev[`${side}Scorer`] ?? ev[`${side}_scorer`];
      const id = ev[`${side}ScorerId`] ?? ev[`${side}_scorer_id`];
      if ((name != null && name !== '') || (id != null && id !== '')) {
        if (isOwnGoal(name)) continue;
        goals.push({ player: cleanPlayer(name), id: id != null && id !== '' ? String(id) : null, team: side, order: Number.isFinite(min) ? min : i });
      }
    }
    // Flat fallback: player + team on the event itself.
    if (!ev.homeScorer && !ev.awayScorer) {
      const name = ev.player?.name || ev.playerName || (typeof ev.player === 'string' ? ev.player : null);
      const id = ev.player?.id ?? ev.playerId ?? null;
      if ((name || id != null) && !isOwnGoal(name) && !/own/.test(type)) {
        const team = ev.team === 'home' || ev.team === 'away' ? ev.team : null;
        goals.push({ player: cleanPlayer(name), id: id != null ? String(id) : null, team, order: Number.isFinite(min) ? min : i });
      }
    }
  });
  return goals.sort((a, b) => a.order - b.order);
}

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
  // A competition in groups sends each group's table, by name (leagueRound), in any order; some
  // (Argentina) send each again for another phase, still empty, under the same name. So: the rows by
  // group name, each team once in its group (the row with the most games; between rows with none, one
  // whose place no other team holds), and ours is the group with our teams (then the most games played).
  const teamOf = (r) => String(r.teamId || r.team?.id || loose(r.teamName || r.team?.name));
  const played = (r) => num(r.overallLeaguePlayed) || 0;
  const groups = new Map();
  for (const r of rows) {
    const name = r.leagueRound || r.group || r.groupName || '';
    if (!groups.has(name)) groups.set(name, new Map());
    const teams = groups.get(name);
    if (!teams.has(teamOf(r))) teams.set(teamOf(r), []);
    teams.get(teamOf(r)).push(r);
  }
  const pick = (teams) => {
    const out = [];
    const taken = new Set();
    const lists = [...teams.values()].map((l) => [...l].sort((x, y) => played(y) - played(x)))
      .sort((x, y) => played(y[0]) - played(x[0]));
    for (const l of lists) {
      const r = l.find((x) => played(x) === played(l[0]) && !taken.has(num(x.overallLeaguePosition))) || l[0];
      taken.add(num(r.overallLeaguePosition));
      out.push(r);
    }
    return out;
  };
  const tables = [...groups].map(([name, teams]) => [name, pick(teams)]);
  const score = ([, l]) => l.filter(ours).length * 1e6 + l.reduce((n, r) => n + played(r), 0);
  const [group, list] = tables.sort((x, y) => score(y) - score(x))[0];
  // Each side's split at home and away, when the table has it ("homeLeagueW", "home_league_W"…).
  const split = (r, side) => {
    const pick = (...ks) => { for (const k of ks) { const v = num(r[k]); if (v !== null) return v; } return null; };
    const f = (k) => pick(`${side}League${k}`, `${side}_league_${k}`);
    const won = f('W'); const drawn = f('D'); const lost = f('L');
    if (won === null || drawn === null || lost === null) return null;
    return { played: pick(`${side}LeaguePlayed`, `${side}LeaguePayed`, `${side}_league_payed`, `${side}_league_played`) ?? won + drawn + lost,
      won, drawn, lost, goalsFor: f('GF'), goalsAgainst: f('GA'), points: f('PTS') ?? won * 3 + drawn };
  };
  const table = list.map((r) => ({
    home: split(r, 'home'), away: split(r, 'away'),
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

/**
 * A team's record at one venue (the home side at home, the away side away): won / drawn / lost,
 * goals for and against, and its last games there. From the league table when it splits home and
 * away (the season), else from the team's recent results. null without data.
 */
export function normalizeVenue(results, teamId, atHome, row = null) {
  const pick = (...keys) => { for (const k of keys) { const v = num(row?.[k]); if (v !== null) return v; } return null; };
  const side = atHome ? 'home' : 'away';
  const games = (Array.isArray(results) ? results : ['recentFixtures', 'recent', 'results', 'fixtures', 'matches', 'lastMatches'].map((k) => results?.[k]).find(Array.isArray) || [])
    .map((f) => formGame(f, teamId)).filter((g) => g && g.home === atHome)
    .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
  const goals = (g) => { const [x, y] = g.score.split(/\s*[-:]\s*/).map(Number); return Number.isFinite(x) && Number.isFinite(y) ? (atHome ? [x, y] : [y, x]) : [0, 0]; };
  const won = pick(`${side}LeagueW`, `${side}_league_W`, `${side}W`);
  const drawn = pick(`${side}LeagueD`, `${side}_league_D`, `${side}D`);
  const lost = pick(`${side}LeagueL`, `${side}_league_L`, `${side}L`);
  if (won !== null && drawn !== null && lost !== null) {
    return { source: 'season', played: won + drawn + lost, won, drawn, lost,
      goalsFor: pick(`${side}LeagueGF`, `${side}_league_GF`, `${side}GF`), goalsAgainst: pick(`${side}LeagueGA`, `${side}_league_GA`, `${side}GA`), games: games.slice(0, 5) };
  }
  if (!games.length) return null;
  const list = games.slice(0, 10);
  const count = (r) => list.filter((g) => g.result === r).length;
  return { source: 'recent', played: list.length, won: count('W'), drawn: count('D'), lost: count('L'),
    goalsFor: list.reduce((n, g) => n + goals(g)[0], 0), goalsAgainst: list.reduce((n, g) => n + goals(g)[1], 0), games: list.slice(0, 5) };
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
  // One-time: links and day lists cached before team badges were read hold no logo, and a kept link is
  // never re-fetched — purge them once so everything re-links with the badge-aware compactFixture.
  const MARK = 'meta:badges-v2';
  if (enabled && !cacheGet.get(MARK)) {
    db.prepare("DELETE FROM goal_cache WHERE key LIKE 'link:%' OR key LIKE 'fixtures:%'").run();
    cacheSet.run(MARK, '1', Date.now());
  }
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
  let lastBadgeSync = null; // { at, evs, linked } from the periodic syncBadges run
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
    const kept = row ? JSON.parse(row.body) : null;
    // A kept link that already carries a badge is final; one without still gets re-resolved, in case a
    // later day list (or a fix) now has the emblem. Re-resolving against the kept day lists costs no request.
    if (kept && (kept.home?.logo || kept.away?.logo)) return kept;
    const fx = findFixture(ev, await candidatesFor(ev));
    if (fx && (fx.home?.logo || fx.away?.logo)) { cacheSet.run(name, JSON.stringify(fx), Date.now()); return fx; }
    if (fx && !kept) cacheSet.run(name, JSON.stringify(fx), Date.now());
    return kept || fx;
  }

  /** Whether this event gets GOAL API statistics at all (football, big or medium league). */
  const covers = (ev) => enabled && ev?.sport === 'futebol' && leagueTier('futebol', ev.competition) <= 2;

  /** The GOAL API badges of a football event, from the kept link (no request): { home, away } URLs, or null. */
  function badge(ev) {
    if (!enabled || ev?.sport !== 'futebol' || !ev?.id) return null;
    const row = cacheGet.get(`link:${ev.id}`);
    if (!row) return null;
    let fx; try { fx = JSON.parse(row.body); } catch { return null; }
    const home = fx?.home?.logo || null;
    const away = fx?.away?.logo || null;
    return home || away ? { home, away } : null;
  }

  /**
   * Links live and soon-to-start football games to their GOAL API fixture, so their team badges are kept
   * for badge() to serve on the cards. ALL football (not only tier 1-2): matching an event against a day's
   * fixture list — fetched once and kept 12 h — costs no request, so broad coverage is cheap.
   */
  async function syncBadges() {
    if (!enabled) return { linked: 0 };
    const until = new Date(Date.now() + 2 * 24 * HOUR).toISOString();
    const evs = db.prepare(`SELECT id, sport, competition, home, away, start_time FROM events
      WHERE sport = 'futebol' AND (status = 'live' OR (status = 'scheduled' AND start_time < ?))
      ORDER BY status = 'live' DESC, start_time LIMIT 500`).all(until);
    let linked = 0;
    for (const ev of evs) {
      try { const fx = await link(ev); if (fx && (fx.home?.logo || fx.away?.logo)) linked += 1; }
      catch (err) { if (err.budget) break; }
    }
    lastBadgeSync = { at: new Date().toISOString(), evs: evs.length, linked };
    return { linked };
  }

  const matchEvents = (fxid) => cached(`events:${fxid}`, TTL.events, async () => (await request(`/fixtures/${encodeURIComponent(fxid)}/events`)).data);

  /**
   * What happened in a football match, from GOAL API: per-player goals, assists and cards, so we can
   * settle player markets ourselves. Returns { linked, fixtureId, home, away, players }, or null when the
   * game is not linked. `players` is empty when GOAL API has no events for it yet (not started / no feed).
   */
  async function matchReport(ev) {
    if (!enabled || ev?.sport !== 'futebol') return null;
    const fx = await link(ev).catch(() => null);
    if (!fx) return null;
    const raw = await matchEvents(fx.id).catch(() => null);
    return {
      fixtureId: fx.id,
      home: { id: fx.home?.id || null, name: fx.home?.name || ev.home },
      away: { id: fx.away?.id || null, name: fx.away?.name || ev.away },
      players: normalizeMatchEvents(raw, fx),
      goals: orderedGoals(raw),
      raw: raw || null,
    };
  }

  const lineupsRaw = (fxid) => cached(`lineups:${fxid}`, TTL.events, async () => (await request(`/fixtures/${encodeURIComponent(fxid)}/lineups`)).data);

  /**
   * Which players are on the home side and which on the away side, so a player market can be split by team.
   * Returns { home: [names], away: [names], homeId, awayId } or null. Player names are matched by the UI;
   * the feed's shape varies, so every likely place is tried and the raw is kept for the diagnostic.
   */
  async function lineups(ev) {
    if (!enabled || ev?.sport !== 'futebol') return null;
    const fx = await link(ev).catch(() => null);
    if (!fx) return null;
    const raw = await lineupsRaw(fx.id).catch(() => null);
    if (!raw) return null;
    const player = (p) => (typeof p === 'string' ? { name: p } : {
      name: p?.name || p?.player?.name || p?.playerName || p?.player_name || null,
      number: p?.number ?? p?.shirt ?? p?.shirtNumber ?? p?.shirt_number ?? p?.jersey ?? null,
      position: p?.position || p?.pos || p?.role || p?.player?.position || null,
    });
    const side = (s) => {
      const block = raw[`${s}`] ?? raw[`${s}Team`] ?? raw[`${s}_team`] ?? raw[`team_${s}`]
        ?? (Array.isArray(raw.teams) ? raw.teams.find((t) => String(t?.side || t?.type).toLowerCase() === s
          || String(t?.id) === String(s === 'home' ? fx.home?.id : fx.away?.id)) : null) ?? null;
      const src = block || raw;
      // Starters and bench under their many spellings.
      const starters = (['startingXI', 'starting_xi', 'lineup', 'players', 'formation', `${s}Lineup`, `${s}StartingXI`, `${s}Players`, `${s}_players`]
        .map((k) => src?.[k]).find(Array.isArray) || []).map(player).filter((p) => p.name);
      const bench = (['substitutes', 'subs', 'bench', 'substitutions', `${s}Substitutes`, `${s}Bench`, `${s}_substitutes`]
        .map((k) => src?.[k]).find(Array.isArray) || []).map(player).filter((p) => p.name);
      return { starters, bench };
    };
    const home = side('home');
    const away = side('away');
    const flat = (t) => [...t.starters, ...t.bench].map((p) => p.name);
    return {
      homeId: fx.home?.id || null, awayId: fx.away?.id || null,
      home, away, names: { home: flat(home), away: flat(away) }, raw,
    };
  }

  /** Head-to-head, league table and last five games of each team; only what GOAL API has. */
  async function insights(ev) {
    const empty = { h2h: null, standings: null, form: null, venue: null };
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
    // Each side's row of the table (its home / away split, when the table has one).
    const rowOf = (team) => (Array.isArray(table) ? table : []).find((r) => (team.id && String(r.teamId || r.team?.id) === String(team.id))
      || loose(r.teamName || r.team?.name) === loose(team.name)) || null;
    const venueHome = normalizeVenue(home, fx.home.id, true, rowOf(fx.home));
    const venueAway = normalizeVenue(away, fx.away.id, false, rowOf(fx.away));
    return {
      h2h: normalizeH2H(h2h, ev),
      standings: normalizeStandings(table, fx),
      form: formHome || formAway ? { home: formHome, away: formAway } : null,
      venue: venueHome || venueAway ? { home: venueHome, away: venueAway } : null,
    };
  }

  const status = () => ({ enabled, usedToday: used(), daily, lastError, pausedUntil: pausedUntil > Date.now() ? new Date(pausedUntil).toISOString() : null });

  /** Admin check: the key, today's requests, and one real call (today's fixtures, from the cache when kept). */
  async function diagnose() {
    const steps = [{ name: 'Chave GOAL_API_KEY', ok: enabled, detail: enabled ? 'definida' : 'em falta nas Variables do Railway' }];
    if (!enabled) return steps;
    steps.push({ name: 'Pedidos hoje', ok: used() < daily, detail: `${used()} de ${daily}` });
    // Emblemas de futebol: quantos jogos ao vivo / a começar têm emblema pronto (via badge()), e o último sync.
    {
      const until = new Date(Date.now() + 2 * 24 * HOUR).toISOString();
      const fb = db.prepare(`SELECT id, sport, competition, home, away FROM events
        WHERE sport = 'futebol' AND (status = 'live' OR (status = 'scheduled' AND start_time < ?)) LIMIT 500`).all(until);
      const withBadge = fb.filter((e) => badge(e)).length;
      steps.push({ name: 'Emblemas de futebol (GOAL API)', ok: withBadge > 0,
        detail: `${withBadge} de ${fb.length} jogos com emblema · último sync: ${lastBadgeSync
          ? `${lastBadgeSync.at.slice(11, 19)} UTC (${lastBadgeSync.linked}/${lastBadgeSync.evs} ligados)`
          : 'ainda não correu'}` });
    }
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
      // Lineups: parsed starters/bench count, and the raw shape so the parser can be matched to reality.
      const lu = await lineups(sample).catch(() => null);
      steps.push({ name: 'Formações (titulares/suplentes)', ok: Boolean(lu && (lu.home.starters.length || lu.away.starters.length)),
        detail: lu ? `${sample.home}: ${lu.home.starters.length} tit / ${lu.home.bench.length} supl · ${sample.away}: ${lu.away.starters.length} tit / ${lu.away.bench.length} supl` : 'sem resposta' });
      if (lu && !lu.home.starters.length && !lu.away.starters.length) {
        steps.push({ name: 'Formações cruas (forma)', ok: false, detail: JSON.stringify(lu.raw).slice(0, 600) });
      }
    }
    // Player markets: a live or just-finished football game, the per-player goals/cards GOAL API gives.
    const recent = db.prepare(`SELECT id, sport, competition, home, away, start_time FROM events
      WHERE sport = 'futebol' AND start_time >= ? AND start_time <= ? ORDER BY (status = 'live') DESC, start_time DESC LIMIT 400`)
      .all(new Date(Date.now() - 6 * HOUR).toISOString(), new Date(Date.now() + HOUR).toISOString()).filter(covers);
    let rep = null;
    for (const ev of recent) { const m = await matchReport(ev).catch(() => null); if (m && (m.raw || m.players.length)) { rep = { ev, m }; if (m.players.length) break; } }
    if (!rep) {
      steps.push({ name: 'Eventos de jogo (mercados de jogador)', ok: false, detail: `nenhum jogo ao vivo / recente ligado nas últimas 6 h (de ${recent.length})` });
    } else {
      const { ev, m } = rep;
      const scorers = m.players.filter((p) => p.goals > 0).map((p) => `${p.name} (${p.team || '?'}) ${p.goals}g${p.assists ? ` ${p.assists}a` : ''}`);
      const cards = m.players.filter((p) => p.yellow || p.red).map((p) => `${p.name} ${p.red ? '🟥' : '🟨'}`);
      steps.push({ name: `Eventos: ${ev.home} - ${ev.away}`, ok: m.players.length > 0,
        detail: m.players.length ? `Marcadores: ${scorers.join(' · ') || 'nenhum'} · Cartões: ${cards.join(' · ') || 'nenhum'}` : 'GOAL API sem eventos para este jogo' });
      // One raw event per distinct type, so the normalizer can be matched to the real field names (cards included).
      const arr = Array.isArray(m.raw) ? m.raw : ['events', 'incidents', 'timeline', 'data', 'items', 'goals'].map((k) => m.raw?.[k]).find(Array.isArray) || [];
      const perType = new Map();
      for (const e of arr) { const t = String(e?.type || e?.eventType || '?'); if (!perType.has(t)) perType.set(t, e); }
      if (!arr.length) {
        steps.push({ name: 'Forma crua de /fixtures/{id}/events', ok: false, detail: `sem lista de eventos · chaves: ${m.raw ? Object.keys(m.raw).slice(0, 15).join(', ') : 'resposta vazia'}` });
      } else {
        for (const [t, e] of [...perType].slice(0, 4)) steps.push({ name: `Evento cru (${t})`, ok: true, detail: JSON.stringify(e).slice(0, 500) });
      }
    }
    return steps;
  }

  /** Forgets the kept day lists (the next look asks GOAL API again). */
  const refresh = () => db.prepare("DELETE FROM goal_cache WHERE key LIKE 'fixtures:%'").run().changes;

  return { enabled, covers, insights, link, badge, syncBadges, matchReport, lineups, status, diagnose, refresh };
}
