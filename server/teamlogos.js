// Team badges for the teams the feed sends without one, and their kit colours.
//
// Badges come from API-Football (api-sports.io, key API_FOOTBALL_KEY) when it is set: the same key
// serves football, basketball, hockey, volleyball and handball, 100 requests a day each on the free
// plan, so at most apiFootballDaily lookups a day per sport are made (games in play first), and
// at most apiFootballPerMinute a minute (its firewall blocks bursts). Matching is hybrid: the names
// TheSportsDB knows for the team (official name and other names, "Man Utd" → "Manchester United")
// are searched too, and a result is only taken when its name is one of them. API-Sports asks for
// only its key header on requests, and for its logos to be kept rather than fetched each time: each
// badge is downloaded once and served from here (/team-logo/<id>).
// WinHouse sends a badge for some teams only. For the others, the team is looked up by name in
// TheSportsDB (free API: https://www.thesportsdb.com, key THESPORTSDB_KEY), a few teams a minute
// (the free tier allows 30 requests a minute), and the badge and kit colours kept in team_logos.
// A team not found is asked again after a month. Only a result whose name is the team's own (name,
// short name or one of its other names) is taken, so another club's colours are never shown. Where
// there is no badge the page shows the real kit image (strEquipment), else a shirt in the kit
// colours, else a neutral shirt.

import { createHash } from 'node:crypto';
import https from 'node:https';
import { nowIso } from './db.js';

const SPORT_NAME = {
  futebol: 'Soccer', futsal: 'Futsal', basquetebol: 'Basketball', hoquei: 'Ice Hockey', voleibol: 'Volleyball',
  andebol: 'Handball', esports: 'ESports', futamericano: 'American Football', basebol: 'Baseball', raguebi: 'Rugby', mma: 'Fighting',
};
const MISS_RETRY_MS = 30 * 86_400_000;
const VERSION = 2; // entries saved by an older version are looked up again
const API_SPORTS = { futebol: 'football', basquetebol: 'basketball', hoquei: 'hockey', voleibol: 'volleyball', andebol: 'handball',
  futamericano: 'american-football', basebol: 'baseball', raguebi: 'rugby', mma: 'mma' };
// MMA has fighters, not teams: their photo is looked up by name (API-MMA), shown like a badge.
const PEOPLE_SPORTS = new Set(['mma']);
// API-Football leagues whose whole team list (one request each, a few dozen badges) is kept in
// team_directory, so the teams of these leagues need no request of their own. Refreshed monthly.
const LEAGUE_PACKS = {
  futebol: [94, 95, 39, 40, 140, 141, 135, 136, 78, 79, 61, 62, 88, 144, 179, 203, 197, 207, 218, 119, 113, 103, 106, 345, 283, 210,
    71, 72, 128, 253, 262, 307, 2, 3, 848, 96],
  futamericano: [1], // NFL
  basebol: [1], // MLB
};
const PACK_RETRY_MS = 30 * 86_400_000;
// API-Football league ids whose official logo the site shows (the home page's league row): kept here
// like the team badges, fetched once from its media server (no key, no request of the daily quota).
export const LEAGUE_LOGO_IDS = new Set([39, 40, 45, 140, 141, 143, 135, 136, 137, 78, 79, 81, 61, 62, 66, 94, 95, 96, 88, 89, 144, 179,
  203, 197, 207, 218, 119, 113, 103, 106, 345, 2, 3, 848, 13, 11, 1, 4, 5, 71, 72, 128, 253, 262, 307, 98]);

/** A GET with only the headers given (fetch adds its own, which API-Sports refuses). */
export function plainGet(url, headers) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers, timeout: 10_000 }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const body = Buffer.concat(chunks);
        resolve({
          ok: res.statusCode >= 200 && res.statusCode < 300, status: res.statusCode,
          headers: { get: (h) => res.headers[String(h).toLowerCase()] ?? null },
          json: async () => JSON.parse(body.toString('utf8')), arrayBuffer: async () => body,
        });
      });
      res.on('error', reject);
    });
    req.on('timeout', () => req.destroy(new Error('sem resposta (10 s)')));
    req.on('error', reject);
  });
}
const HEX = /^#?([0-9a-f]{6}|[0-9a-f]{3})$/i;

/** A team name compared loosely: no accents, lower case, single spaces. */
export const teamKey = (sport, name) => `${sport}|${String(name || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim()}`;

/** Other spellings to try when the name as the feed has it finds nothing ("1. Koln" → "Koln", "FC Porto" → "Porto"). */
export function nameVariants(name) {
  const base = String(name || '').trim();
  const out = [base];
  const stripped = base.replace(/^\d+\.\s*/, '').replace(/\b(FC|CF|SC|AC|AFC|CD|SL|FK|SK|BK|IF|SV|VfB|VfL|TSG|RC|AS|US|SS|CA|UD|SD|RCD)\b\.?/g, '')
    .replace(/\s+/g, ' ').trim();
  if (stripped && stripped !== base) out.push(stripped);
  return out;
}

const loose = (name) => teamKey('', name).slice(1);
const httpsUrl = (u) => (typeof u === 'string' && /^https:\/\/[^\s"'<>]+$/.test(u) ? u : null);

/** Whether a TheSportsDB team is the team the feed names (same name, short name or other name). */
export function sameTeam(t, name) {
  const theirs = [t.strTeam, t.strTeamShort, ...String(t.strTeamAlternate || '').split(',')]
    .filter(Boolean).flatMap((n) => nameVariants(n)).map(loose).filter(Boolean);
  return nameVariants(name).map(loose).some((n) => n && theirs.includes(n));
}

// Words that do not tell clubs apart ("Lille OSC" is "Lille", "Olympique de Marseille" is "Marseille").
const FILLER = new Set(['fc', 'cf', 'sc', 'ac', 'afc', 'cd', 'sl', 'fk', 'sk', 'bk', 'if', 'sv', 'vfb', 'vfl', 'tsg', 'rc', 'as', 'us', 'ss',
  'ca', 'ud', 'sd', 'rcd', 'osc', 'sco', 'ogc', 'aj', 'olympique', 'de', 'del', 'la', 'le', 'les', 'the', 'club', 'stade', 'calcio', 'clube']);
const words = (name) => loose(name).split(' ').filter((w) => w && !FILLER.has(w));
const sameWord = (a, b) => {
  if (a === b) return true;
  let n = 0;
  while (n < a.length && n < b.length && a[n] === b[n]) n += 1;
  // "rennais" ~ "rennes", "brestois" ~ "brest"; a short word must be whole ("celta" is not "celtic").
  const min = Math.min(a.length, b.length);
  return n >= 4 && n >= (min >= 6 ? min - 2 : min);
};

// Words many clubs share: they never tell two clubs apart ("Leeds United" is not "Manchester United").
const COMMON = new Set(['united', 'utd', 'city', 'town', 'county', 'rovers', 'wanderers', 'athletic', 'atletico', 'atletic', 'sporting',
  'real', 'albion', 'hotspur', 'rangers', 'inter', 'internacional', 'dynamo', 'dinamo', 'racing', 'deportivo', 'borussia', 'union',
  'saint', 'st', 'san', 'santa', 'sport', 'sports', 'esporte', 'football', 'futebol', 'futbol', 'women', 'ii', 'b', 'u19', 'u21', 'u23']);
const strong = (name) => { const w = words(name); const s = w.filter((x) => !COMMON.has(x)); return s.length ? s : w; };

/** The one team whose name is the same club ({ name, logo } list): every telling word of each name is in the
 * other ("Stade Rennais" ~ "Rennes", "Lille OSC" ~ "Lille"), and no other team fits. Null otherwise. */
export function closeName(name, teams) {
  const mine = strong(name);
  if (!mine.length) return null;
  const fits = new Map();
  for (const t of teams) {
    const theirs = strong(t.name);
    if (!theirs.length) continue;
    const ok = mine.every((w) => theirs.some((x) => sameWord(w, x))) && theirs.every((x) => mine.some((w) => sameWord(w, x)));
    if (ok) fits.set(t.logo, t);
  }
  if (fits.size === 1) return [...fits.values()][0];
  if (fits.size) return null;
  // None: a shorter name the other names in full and only adds to ("Celta" ~ "Celta Vigo"), still only one.
  for (const t of teams) {
    const theirs = strong(t.name);
    if (theirs.length > mine.length && mine.every((w) => theirs.includes(w))) fits.set(t.logo, t);
  }
  return fits.size === 1 ? [...fits.values()][0] : null;
}

const colour = (c) => {
  const m = HEX.exec(String(c || '').trim());
  if (!m) return null;
  const h = m[1].length === 3 ? m[1].split('').map((x) => x + x).join('') : m[1];
  return `#${h.toLowerCase()}`;
};

export function createTeamLogos(db, {
  key = '123', apiFootballKey = '', apiFootballVia = '', apiFootballDaily = 90, apiFootballPerMinute = 8, fetchImpl = globalThis.fetch, perRun = 12, enabled = true,
  log = () => {}, persistent = true, leaguePacks = LEAGUE_PACKS,
} = {}) {
  db.exec(`CREATE TABLE IF NOT EXISTS team_logos (
    team_key TEXT PRIMARY KEY, logo TEXT, colors TEXT, checked_at TEXT NOT NULL)`);
  const cols = db.prepare('PRAGMA table_info(team_logos)').all().map((c) => c.name);
  if (!cols.includes('kit')) db.exec('ALTER TABLE team_logos ADD COLUMN kit TEXT');
  if (!cols.includes('ver')) db.exec('ALTER TABLE team_logos ADD COLUMN ver INTEGER NOT NULL DEFAULT 1');
  if (!cols.includes('apif')) db.exec('ALTER TABLE team_logos ADD COLUMN apif INTEGER NOT NULL DEFAULT 0');
  if (!cols.includes('alt')) db.exec('ALTER TABLE team_logos ADD COLUMN alt TEXT');
  db.exec('CREATE TABLE IF NOT EXISTS team_logo_files (id TEXT PRIMARY KEY, type TEXT NOT NULL, body BLOB NOT NULL, fetched_at TEXT NOT NULL)');
  const fileGet = db.prepare('SELECT type, body FROM team_logo_files WHERE id = ?');
  const filePut = db.prepare('INSERT OR REPLACE INTO team_logo_files (id, type, body, fetched_at) VALUES (?, ?, ?, ?)');
  db.exec('CREATE TABLE IF NOT EXISTS api_quota (name TEXT PRIMARY KEY, day TEXT NOT NULL, used INTEGER NOT NULL)');
  // Every team of the leagues fetched whole, by loose name: { logo } (the remote address).
  db.exec(`CREATE TABLE IF NOT EXISTS team_directory (sport TEXT NOT NULL, name_key TEXT NOT NULL, name TEXT NOT NULL, logo TEXT NOT NULL,
    PRIMARY KEY (sport, name_key))`);
  db.exec('CREATE TABLE IF NOT EXISTS team_directory_packs (sport TEXT NOT NULL, league INTEGER NOT NULL, season INTEGER, teams INTEGER NOT NULL, fetched_at TEXT NOT NULL, PRIMARY KEY (sport, league))');
  if (!db.prepare('PRAGMA table_info(team_directory)').all().some((c) => c.name === 'league')) {
    // Lists kept before leagues were noted are fetched again (once) to note them.
    db.exec('ALTER TABLE team_directory ADD COLUMN league INTEGER');
    db.exec('DELETE FROM team_directory_packs');
  }
  const dirGet = db.prepare('SELECT name, logo FROM team_directory WHERE sport = ? AND name_key = ?');
  const dirPut = db.prepare('INSERT OR REPLACE INTO team_directory (sport, name_key, name, logo, league) VALUES (?, ?, ?, ?, ?)');
  const dirLeagues = db.prepare('SELECT DISTINCT league FROM team_directory WHERE sport = ? AND name_key = ? AND league IS NOT NULL');
  const dirOfLeague = db.prepare('SELECT DISTINCT name, logo FROM team_directory WHERE sport = ? AND league = ?');
  const dirOfSport = db.prepare('SELECT DISTINCT name, logo FROM team_directory WHERE sport = ?');
  const dirSize = db.prepare('SELECT COUNT(*) AS n FROM team_directory');
  const dirLogos = db.prepare('SELECT DISTINCT logo FROM team_directory');
  const packGet = db.prepare('SELECT fetched_at FROM team_directory_packs WHERE sport = ? AND league = ?');
  const packPut = db.prepare('INSERT OR REPLACE INTO team_directory_packs (sport, league, season, teams, fetched_at) VALUES (?, ?, ?, ?, ?)');
  // Badges matched by an earlier close-name rule (which let "United" alone match, then "Celta" take
  // Celtic's) are matched again.
  for (const m of ['migrate:close-names-2', 'migrate:close-names-3']) {
    if (db.prepare('SELECT 1 FROM api_quota WHERE name = ?').get(m)) continue;
    db.exec("UPDATE team_logos SET logo = NULL, apif = 0 WHERE logo LIKE '/team-logo/%'");
    db.prepare('INSERT INTO api_quota (name, day, used) VALUES (?, ?, 1)').run(m, new Date().toISOString().slice(0, 10));
  }
  // The sports added later (fighters, NFL, baseball, rugby) were searched once without a result and
  // marked for a month: looked up again with the fixed lookup.
  if (!db.prepare("SELECT 1 FROM api_quota WHERE name = 'migrate:new-sports-1'").get()) {
    db.exec(`UPDATE team_logos SET apif = 0, checked_at = '2000-01-01T00:00:00.000Z'
      WHERE logo IS NULL AND (team_key LIKE 'mma|%' OR team_key LIKE 'futamericano|%' OR team_key LIKE 'basebol|%' OR team_key LIKE 'raguebi|%')`);
    db.prepare("INSERT INTO api_quota (name, day, used) VALUES ('migrate:new-sports-1', ?, 1)").run(new Date().toISOString().slice(0, 10));
  }
  const cache = new Map(db.prepare('SELECT team_key, logo, colors, kit, ver, apif, alt, checked_at FROM team_logos').all()
    .map((r) => [r.team_key, { logo: r.logo, colors: r.colors ? JSON.parse(r.colors) : null, kit: r.kit, ver: r.ver, apif: !!r.apif,
      alt: r.alt ? JSON.parse(r.alt) : [], checkedAt: r.checked_at }]));
  const save = db.prepare(`INSERT INTO team_logos (team_key, logo, colors, kit, ver, apif, alt, checked_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(team_key) DO UPDATE SET logo = excluded.logo, colors = excluded.colors, kit = excluded.kit, ver = excluded.ver,
      apif = excluded.apif, alt = excluded.alt, checked_at = excluded.checked_at`);

  // API-Football: requests made today per sport (the free plan allows 100 a day each).
  const apif = Boolean(apiFootballKey);
  const today = () => new Date().toISOString().slice(0, 10);
  const quotaRow = db.prepare('SELECT day, used FROM api_quota WHERE name = ?');
  const quotaSet = db.prepare(`INSERT INTO api_quota (name, day, used) VALUES (?, ?, ?)
    ON CONFLICT(name) DO UPDATE SET day = excluded.day, used = excluded.used`);
  const used = (sport) => { const r = quotaRow.get(`apif:${sport}`); return r && r.day === today() ? r.used : 0; };
  const spend = (sport, n = 1) => quotaSet.run(`apif:${sport}`, today(), used(sport) + n);
  let pausedUntil = 0; // after an error that is not the daily limit (a bad key…): a pause, then try again
  let lastError = null;
  const apifCan = (sport) => apif && API_SPORTS[sport] && used(sport) < apiFootballDaily && Date.now() >= pausedUntil;
  const apiGet = fetchImpl === globalThis.fetch ? plainGet : (url, headers) => fetchImpl(url, { signal: AbortSignal.timeout(10_000), headers });

  /** What is known of a team: { logo, colors, kit } (any may be null), or null when never looked up. */
  const get = (sport, name) => cache.get(teamKey(sport, name)) || null;

  async function search(name) {
    const url = `https://www.thesportsdb.com/api/v1/json/${encodeURIComponent(key)}/searchteams.php?t=${encodeURIComponent(name)}`;
    const res = await fetchImpl(url, { signal: AbortSignal.timeout(10_000), headers: { Accept: 'application/json' } });
    if (res.status === 429) throw Object.assign(new Error('TheSportsDB: demasiados pedidos'), { rate: true });
    if (!res.ok) throw new Error(`TheSportsDB HTTP ${res.status}`);
    const data = await res.json().catch(() => null);
    return Array.isArray(data?.teams) ? data.teams : [];
  }

  /** One API-Sports request (counted against the day's and the minute's allowance): its `response` list. */
  async function apiCall(sport, pathAndQuery) {
    const api = API_SPORTS[sport];
    const rapid = apiFootballVia === 'rapidapi' && api === 'football';
    const url = rapid ? `https://api-football-v1.p.rapidapi.com/v3/${pathAndQuery}`
      : `https://${api === 'football' ? 'v3' : 'v1'}.${api}.api-sports.io/${pathAndQuery}`;
    // Only the key header: API-Sports refuses requests with headers it does not list.
    const headers = rapid ? { 'x-rapidapi-key': apiFootballKey, 'x-rapidapi-host': 'api-football-v1.p.rapidapi.com' } : { 'x-apisports-key': apiFootballKey };
    spend(sport);
    minuteCalls += 1;
    const res = await apiGet(url, headers);
    if (res.status === 429) throw Object.assign(new Error('API-Football: demasiados pedidos por minuto'), { rate: true });
    if (!res.ok) {
      lastError = { at: nowIso(), message: `API-Football HTTP ${res.status}` };
      pausedUntil = Date.now() + 15 * 60_000;
      throw new Error(lastError.message);
    }
    // Requests left today, as the API counts them.
    const leftRaw = res.headers?.get?.('x-ratelimit-requests-remaining');
    if (leftRaw != null && Number.isFinite(Number(leftRaw)) && Number(leftRaw) <= 0) spend(sport, apiFootballDaily);
    const data = await res.json().catch(() => null);
    const errors = data?.errors && (Array.isArray(data.errors) ? data.errors : Object.values(data.errors));
    if (errors?.length) {
      const message = String(errors[0]).slice(0, 200);
      const seasonRefused = /season|plan/i.test(message) && /season/i.test(pathAndQuery);
      // A season outside the plan is expected (an older one is tried next): not an error to show.
      if (!seasonRefused) lastError = { at: nowIso(), message: `API-Football: ${message}` };
      if (/request limit|requests|quota/i.test(message)) spend(sport, apiFootballDaily); // out of requests today
      else if (!/season|plan/i.test(message)) pausedUntil = Date.now() + 15 * 60_000; // bad key or the like
      throw Object.assign(new Error(`API-Football: ${message}`), { season: /season|plan/i.test(message) });
    }
    return Array.isArray(data?.response) ? data.response : [];
  }

  /** A badge from the kept league lists (no request): the team's name, or one of its other names. */
  function directoryLogo(sport, names) {
    // A fighter written "Last, First" is also "First Last".
    const all = PEOPLE_SPORTS.has(sport) ? names.flatMap((n) => [n, String(n).split(/\s*,\s*/).reverse().join(' ')]) : names;
    for (const n of all) for (const v of nameVariants(n)) {
      const row = dirGet.get(sport, loose(v));
      if (row) return row.logo;
    }
    return null;
  }

  // The season to ask for: the current one, or the latest the plan allows (the free plan has a range).
  const seasonNow = () => { const d = new Date(); return d.getUTCMonth() >= 6 ? d.getUTCFullYear() : d.getUTCFullYear() - 1; };
  const seasonKept = () => { const r = quotaRow.get('apif:season'); return r ? Number(r.used) : null; };
  /** Fetches one league's team list whole into team_directory. */
  async function loadPack(sport, league) {
    const tries = [...new Set([seasonKept(), seasonNow(), seasonNow() - 1, 2024, 2023, 2022].filter(Boolean))];
    for (const season of tries) {
      if (!apifCan(sport) || minuteCalls >= apiFootballPerMinute) return false;
      let list;
      try { list = await apiCall(sport, `teams?league=${league}&season=${season}`); } catch (err) {
        if (err.season) continue; // that season is not in the plan: an older one
        throw err;
      }
      quotaSet.run('apif:season', today(), season);
      let n = 0;
      for (const x of list) {
        const t = x.team || x;
        if (!t?.name || !httpsUrl(t.logo)) continue;
        for (const v of [...nameVariants(t.name), t.code].filter(Boolean)) if (loose(v).length >= 3) dirPut.run(sport, loose(v), t.name, t.logo, league);
        n += 1;
      }
      packPut.run(sport, league, season, n, nowIso());
      return true;
    }
    packPut.run(sport, league, null, 0, nowIso()); // no season works: try again next month
    return false;
  }
  /**
   * MMA: every fighter of a day's fights, with their photo, in one request (fights?date=…), kept in
   * team_directory like a league's teams; the days with fights here in the next four days, each
   * read again after 12 hours (cards change).
   */
  const mmaDays = db.prepare(`SELECT DISTINCT substr(start_time, 1, 10) AS day FROM events
    WHERE sport = 'mma' AND status IN ('scheduled', 'live') AND start_time < ? ORDER BY day LIMIT 5`);
  function fightDaysDue() {
    const old = Date.now() - 12 * 3_600_000;
    return mmaDays.all(new Date(Date.now() + 4 * 86_400_000).toISOString()).map((r) => r.day).filter((day) => {
      const p = packGet.get('mma', Number(day.replaceAll('-', '')));
      return !p || new Date(p.fetched_at).getTime() < old;
    });
  }
  async function loadFightDay(day) {
    const list = await apiCall('mma', `fights?date=${day}`);
    let n = 0;
    for (const f of list) {
      for (const side of [f?.fighters?.first, f?.fighters?.second]) {
        const logo = httpsUrl(side?.logo || side?.photo || side?.image);
        if (!side?.name || !logo) continue;
        const names = [side.name, String(side.name).split(/\s*,\s*/).reverse().join(' ')];
        for (const v of new Set(names.flatMap(nameVariants))) if (loose(v).length >= 3) dirPut.run('mma', loose(v), side.name, logo, null);
        n += 1;
      }
    }
    packPut.run('mma', Number(day.replaceAll('-', '')), null, n, nowIso());
    return n;
  }

  /** The next league lists to fetch (never fetched, or a month old). */
  function packsDue() {
    const old = Date.now() - PACK_RETRY_MS;
    return Object.entries(leaguePacks).flatMap(([sport, ids]) => ids.map((league) => ({ sport, league })))
      .filter(({ sport, league }) => { const r = packGet.get(sport, league); return !r || new Date(r.fetched_at).getTime() < old; });
  }

  /** API-Football: the badge of the team with this name or one of its other names (same team only), or null. */
  async function apiFootballLogo(sport, name, alt = []) {
    const known = [name, ...alt];
    const kept = directoryLogo(sport, known);
    if (kept) return keepFile(kept);
    // A fighter written "Last, First" is also looked up as "First Last".
    const person = PEOPLE_SPORTS.has(sport) ? [String(name).split(/\s*,\s*/).reverse().join(' ')] : [];
    const terms = [...new Set([...person, ...nameVariants(name), ...alt.slice(0, 1)].map((v) => v.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim()))];
    for (const q of terms) {
      // The search takes letters, digits and spaces only, 3 at least.
      if (q.length < 3 || !apifCan(sport) || minuteCalls >= apiFootballPerMinute) continue;
      const people = PEOPLE_SPORTS.has(sport);
      const teams = (await apiCall(sport, `${people ? 'fighters' : 'teams'}?search=${encodeURIComponent(q)}`))
        .map((x) => x.team || x).map((x) => (people ? { ...x, logo: x.photo || x.logo || x.image, code: x.nickname } : x));
      const t = teams.find((x) => httpsUrl(x.logo) && [...known, ...person].some((n) => sameTeam({ strTeam: x.name, strTeamShort: x.code }, n)));
      if (t) {
        for (const v of nameVariants(t.name)) dirPut.run(sport, loose(v), t.name, t.logo, null);
        return keepFile(t.logo);
      }
    }
    return null;
  }

  /** Downloads a badge once and serves it from here (/team-logo/<id>); the remote address if that fails. */
  async function keepFile(url) {
    const id = fileId(url);
    if (fileGet.get(id)) return `/team-logo/${id}`;
    try {
      const res = await apiGet(url, {});
      const type = String(res.headers?.get?.('content-type') || '').split(';')[0].trim().toLowerCase();
      if (!res.ok || !/^image\/(png|jpeg|webp|gif)$/.test(type)) return url;
      const body = Buffer.from(await res.arrayBuffer());
      if (!body.length || body.length > 400_000) return url;
      filePut.run(id, type, body, nowIso());
      return `/team-logo/${id}`;
    } catch { return url; }
  }

  /** An API-Football league's official logo, kept here: { type, body } or null (not one of ours, or unreachable). */
  const leagueMiss = new Map();
  async function leagueLogo(id) {
    const n = Number(id);
    if (!LEAGUE_LOGO_IDS.has(n) || leagueMiss.get(n) > Date.now()) return null;
    const path = await keepFile(`https://media.api-sports.io/football/leagues/${n}.png`);
    const f = path.startsWith('/team-logo/') ? fileGet.get(path.slice(11)) || null : null;
    if (!f) leagueMiss.set(n, Date.now() + 3_600_000); // unreachable: not asked again for an hour
    return f;
  }

  /**
   * Another sport's league logo (basketball, ice hockey, volleyball, handball, American football, baseball, rugby), found once by name with
   * that sport's API-Sports (one request of its daily allowance) and kept: { type, body } or null.
   * A league not found is not asked for again for a month.
   */
  db.exec('CREATE TABLE IF NOT EXISTS league_logos (league_key TEXT PRIMARY KEY, logo TEXT, checked_at TEXT NOT NULL)');
  const leagueRowGet = db.prepare('SELECT logo, checked_at FROM league_logos WHERE league_key = ?');
  const leagueRowPut = db.prepare('INSERT OR REPLACE INTO league_logos (league_key, logo, checked_at) VALUES (?, ?, ?)');
  const leagueAsking = new Map();
  // The big ones by their API-Sports id (no search needed): NFL and NCAA, MLB.
  const KNOWN_LEAGUES = [
    ['futamericano', /^(usa\.\s*)?nfl\b/i, 'https://media.api-sports.io/american-football/leagues/1.png'],
    ['futamericano', /^(usa\.\s*)?ncaa\b/i, 'https://media.api-sports.io/american-football/leagues/2.png'],
    ['basebol', /^(usa\.\s*)?mlb\b/i, 'https://media.api-sports.io/baseball/leagues/1.png'],
  ];
  async function sportLeagueLogo(sport, name, country = '') {
    const short = String(name || '').replace(/^[^.]+\.\s+(?=\S)/, '').trim().slice(0, 80);
    if (sport === 'futebol' || !API_SPORTS[sport] || PEOPLE_SPORTS.has(sport) || loose(short).length < 2) return null;
    const known = KNOWN_LEAGUES.find(([sp, re]) => sp === sport && re.test(String(name).trim()));
    if (known) {
      const path = await keepFile(known[2]);
      return path.startsWith('/team-logo/') ? fileGet.get(path.slice(11)) || null : null;
    }
    const k = `${sport}|${loose(country)}|${loose(short)}`;
    let row = leagueRowGet.get(k);
    if (!row || (!row.logo && Date.now() - new Date(row.checked_at).getTime() > PACK_RETRY_MS)) {
      if (!apifCan(sport)) return null;
      if (!leagueAsking.has(k)) {
        leagueAsking.set(k, findLeague(sport, short, country).then((logo) => { leagueRowPut.run(k, logo, nowIso()); })
          .catch(() => {}).finally(() => leagueAsking.delete(k)));
      }
      await leagueAsking.get(k);
      row = leagueRowGet.get(k);
    }
    if (!row?.logo) return null;
    const path = await keepFile(row.logo);
    return path.startsWith('/team-logo/') ? fileGet.get(path.slice(11)) || null : null;
  }
  async function findLeague(sport, short, country) {
    const want = loose(short);
    const land = loose(country);
    const place = (l) => loose(l.country?.name || (typeof l.country === 'string' ? l.country : ''));
    const words = short.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9 ]+/g, ' ').split(/\s+/).filter((w) => w.length >= 3);
    const terms = [...new Set([words.join(' '), ...[...words].sort((a, b) => b.length - a.length)])].filter((t) => t.length >= 3).slice(0, 2);
    for (const q of terms) {
      if (!apifCan(sport)) break;
      const found = (await apiCall(sport, `leagues?search=${encodeURIComponent(q)}`)).map((x) => ({ ...(x.league || x), country: x.country || x.league?.country }))
        .filter((l) => httpsUrl(l.logo) && (!land || ['europe', 'world', 'international'].includes(land) || !place(l) || place(l) === land
          || (land === 'unitedstates' && place(l) === 'usa') || (land === 'czechrepublic' && place(l) === 'czechia')));
      const theirs = (l) => loose(l.name);
      const hit = found.find((l) => theirs(l) === want)
        || found.find((l) => theirs(l).includes(want) || want.includes(theirs(l)));
      if (hit) return hit.logo;
    }
    return null;
  }

  /** A kept badge: { type, body } or null. */
  const file = (id) => (/^[0-9a-f]{20}$/.test(String(id)) ? fileGet.get(id) || null : null);

  /** Looks one team up: a result of its sport with the team's own name (one with a badge first). */
  async function lookUp(sport, name) {
    if (PEOPLE_SPORTS.has(sport)) return { logo: null, colors: null, kit: null, alt: [] }; // TheSportsDB has teams only
    const want = SPORT_NAME[sport];
    for (const variant of nameVariants(name)) {
      const teams = (await search(variant)).filter((t) => (!want || t.strSport === want) && sameTeam(t, name));
      const t = teams.find((x) => x.strBadge) || teams[0];
      if (t) {
        const colors = [colour(t.strColour1), colour(t.strColour2)].filter(Boolean);
        const alt = [t.strTeam, ...String(t.strTeamAlternate || '').split(',')].map((x) => String(x || '').trim())
          .filter((x) => x && loose(x) !== loose(name)).slice(0, 4);
        return { logo: httpsUrl(t.strBadge), colors: colors.length ? colors : null, kit: httpsUrl(t.strEquipment), alt };
      }
    }
    return { logo: null, colors: null, kit: null, alt: [] };
  }

  /** Teams of the games in play or starting in two days still to look up (or that a kept league list now covers).
   * Teams the feed sends a badge for come last: theirs is kept as a spare should the feed's not load. */
  function wanted(limit) {
    const until = new Date(Date.now() + 2 * 86_400_000).toISOString();
    const rows = db.prepare(`SELECT sport, home, away, home_team_ext, away_team_ext FROM events
      WHERE (status = 'live' OR (status = 'scheduled' AND start_time < ?)) AND sport IN (${Object.keys(SPORT_NAME).map(() => '?').join(',')})
      ORDER BY status = 'live' DESC, start_time LIMIT 600`).all(until, ...Object.keys(SPORT_NAME));
    const first = new Map();
    const later = new Map();
    const stale = Date.now() - MISS_RETRY_MS;
    for (const r of rows) {
      for (const [name, ext] of [[r.home, r.home_team_ext], [r.away, r.away_team_ext]]) {
        if (!name) continue;
        const feedBadge = typeof ext === 'string' && ext.startsWith('https://');
        const k = teamKey(r.sport, name);
        const c = cache.get(k);
        const fresh = c && c.ver >= VERSION && (c.logo || new Date(c.checkedAt).getTime() > stale);
        const local = typeof c?.logo === 'string' && c.logo.startsWith('/team-logo/');
        const apiDue = apif && API_SPORTS[r.sport] && !local && (!c?.apif || directoryLogo(r.sport, [name, ...(c?.alt || [])]));
        if (fresh && !(apiDue && (apifCan(r.sport) || directoryLogo(r.sport, [name, ...(c?.alt || [])])))) continue;
        const into = feedBadge ? later : first;
        if (!first.has(k) && !later.has(k)) into.set(k, { sport: r.sport, name, feedBadge });
      }
    }
    return [...first.values(), ...later.values()].slice(0, limit);
  }

  /** The kept league a competition is (most of its teams found there by exact name), or null. */
  function competitionLeague(sport, teams) {
    const votes = new Map();
    for (const name of teams) {
      const seen = new Set();
      for (const v of nameVariants(name)) for (const { league } of dirLeagues.all(sport, loose(v))) seen.add(league);
      for (const l of seen) votes.set(l, (votes.get(l) || 0) + 1);
    }
    const ranked = [...votes.entries()].sort((a, b) => b[1] - a[1]);
    if (!ranked.length || ranked[0][1] < 2 || (ranked[1] && ranked[1][1] === ranked[0][1])) return null;
    return ranked[0][0];
  }

  // Free pass, every run: teams the kept league lists cover get their badge with no request — by exact
  // name, or by a close name among the teams of the league their competition is ("Stade Rennais" →
  // "Rennes" in Ligue 1). Each team is checked again only when the lists grow.
  const freeChecked = new Map(); // team key → list size when checked
  async function freePass(maxDownloads = 40) {
    if (!apif) return 0;
    const until = new Date(Date.now() + 2 * 86_400_000).toISOString();
    const sports = Object.keys(LEAGUE_PACKS_SPORTS());
    if (!sports.length) return 0;
    const rows = db.prepare(`SELECT sport, competition, home, away FROM events
      WHERE (status = 'live' OR (status = 'scheduled' AND start_time < ?)) AND sport IN (${sports.map(() => '?').join(',')})
      ORDER BY status = 'live' DESC, start_time LIMIT 3000`).all(until, ...sports);
    const size = dirSize.get().n;
    const comps = new Map();
    for (const r of rows) {
      const k = `${r.sport}|${r.competition}`;
      if (!comps.has(k)) comps.set(k, { sport: r.sport, teams: new Set() });
      comps.get(k).teams.add(r.home).add(r.away);
    }
    let downloads = 0;
    let found = 0;
    const allTeams = new Map();
    for (const { sport, teams } of comps.values()) {
      let league;
      for (const name of teams) {
        if (!name || downloads >= maxDownloads) continue;
        const k = teamKey(sport, name);
        const c = cache.get(k);
        if (typeof c?.logo === 'string' && c.logo.startsWith('/team-logo/')) continue;
        if (freeChecked.get(k) === size) continue;
        freeChecked.set(k, size);
        let remote = directoryLogo(sport, [name, ...(c?.alt || [])]);
        if (!remote) {
          if (league === undefined) league = competitionLeague(sport, teams);
          if (league != null) remote = closeName(name, dirOfLeague.all(sport, league))?.logo || null;
        }
        // Not in its competition's league (promoted, another country…): the same club among all kept teams.
        if (!remote) {
          if (!allTeams.has(sport)) allTeams.set(sport, dirOfSport.all(sport));
          remote = closeName(name, allTeams.get(sport))?.logo || null;
        }
        if (!remote) continue;
        downloads += 1;
        const logo = await keepFile(remote);
        found += 1;
        const v = { logo, colors: c?.colors || null, kit: c?.kit || null, ver: VERSION, apif: true, alt: c?.alt || [], checkedAt: nowIso() };
        cache.set(k, v);
        save.run(k, v.logo, v.colors ? JSON.stringify(v.colors) : null, v.kit, VERSION, 1, JSON.stringify(v.alt), v.checkedAt);
      }
    }
    return found;
  }
  const LEAGUE_PACKS_SPORTS = () => leaguePacks;

  // Every badge of the kept league lists is downloaded ahead (image calls cost no API requests, but
  // API-Sports limits them per minute, so a few a run), so a team's first game already has it.
  const fileId = (url) => createHash('sha1').update(url).digest('hex').slice(0, 20);
  async function prefetch(max = 20) {
    let n = 0;
    for (const { logo } of dirLogos.all()) {
      if (n >= max) break;
      if (fileGet.get(fileId(logo))) continue;
      n += 1;
      await keepFile(logo);
    }
    return n;
  }

  let busy = false;
  let minuteCalls = 0; // API-Football requests in this run (runs are a minute apart)
  let lastRun = null;
  async function run() {
    if (!enabled || busy) return { asked: 0, found: 0 };
    busy = true;
    minuteCalls = 0;
    let asked = 0;
    let found = 0;
    try {
      // Whole league lists first (a few a minute): one request covers a league's teams.
      if (apif) {
        for (const { sport, league } of packsDue().slice(0, 3)) {
          if (!apifCan(sport) || minuteCalls >= apiFootballPerMinute - 2) break;
          try { await loadPack(sport, league); } catch (err) {
            log(`lista de equipas da liga ${league}: ${err.message}`);
            if (err.rate) break;
          }
        }
      }
      // MMA: the fighters of the days with fights (one request a day).
      if (apif) {
        for (const day of fightDaysDue().slice(0, 2)) {
          if (!apifCan('mma') || minuteCalls >= apiFootballPerMinute - 2) break;
          try { await loadFightDay(day); } catch (err) {
            log(`combates de MMA de ${day}: ${err.message}`);
            if (err.rate) break;
            packPut.run('mma', Number(day.replaceAll('-', '')), null, 0, nowIso()); // not asked again for 12 h
          }
        }
      }
      try { found += await freePass(); } catch (err) { log(`emblemas das ligas guardadas: ${err.message}`); }
      try { if (apif) await prefetch(); } catch (err) { log(`descarga de emblemas: ${err.message}`); }
      for (const { sport, name, feedBadge } of wanted(perRun)) {
        const k = teamKey(sport, name);
        const c = cache.get(k);
        let r = c && c.ver >= VERSION ? c : null;
        let apiLogo = null;
        let apiAsked = Boolean(c?.apif);
        try {
          if (!r) r = await lookUp(sport, name);
          const known = [name, ...(r.alt || [])];
          if (apif && API_SPORTS[sport] && directoryLogo(sport, known)) {
            apiLogo = await keepFile(directoryLogo(sport, known)); // kept list: no request
            apiAsked = true;
          } else if (!apiAsked && !feedBadge && apifCan(sport) && minuteCalls < apiFootballPerMinute) {
            apiLogo = await apiFootballLogo(sport, name, r.alt || []);
            apiAsked = true;
          }
        } catch (err) {
          log(`emblema de ${name}: ${err.message}`);
          if (err.rate) break;
          if (!r) continue;
        }
        asked += 1;
        const logo = apiLogo || r.logo;
        if (logo && logo !== c?.logo) found += 1;
        const v = { logo, colors: r.colors, kit: r.kit, ver: VERSION, apif: apiAsked, alt: r.alt || [], checkedAt: nowIso() };
        cache.set(k, v);
        save.run(k, v.logo, v.colors ? JSON.stringify(v.colors) : null, v.kit, VERSION, apiAsked ? 1 : 0, JSON.stringify(v.alt), v.checkedAt);
      }
    } finally { busy = false; }
    lastRun = { at: nowIso(), asked, found };
    if (found) log(`${found} emblema(s) de equipas encontrados (${asked} procuradas)`);
    return { asked, found };
  }

  /** For the admin: what is set, the API-Football account (its status call is free) and what is kept. */
  async function diagnose() {
    const steps = [];
    steps.push({ name: 'Procura de emblemas', ok: enabled, detail: enabled ? 'ligada' : 'desligada (TEAM_LOGOS=0)' });
    steps.push({ name: 'Base de dados guardada entre deploys', ok: persistent,
      detail: persistent ? 'sim: os emblemas ficam guardados' : 'NÃO: crie um volume no Railway, senão os emblemas perdem-se em cada deploy' });
    steps.push({ name: 'Chave API-Football (API_FOOTBALL_KEY)', ok: apif, detail: apif ? `definida${apiFootballVia === 'rapidapi' ? ' (via RapidAPI)' : ''}` : 'não definida nas Variables' });
    if (apif && apiFootballVia !== 'rapidapi') {
      try {
        const res = await apiGet('https://v3.football.api-sports.io/status', { 'x-apisports-key': apiFootballKey });
        const data = await res.json().catch(() => null);
        const errors = data?.errors && (Array.isArray(data.errors) ? data.errors : Object.values(data.errors));
        if (!res.ok || errors?.length) steps.push({ name: 'Conta API-Football', ok: false, detail: errors?.length ? String(errors[0]) : `HTTP ${res.status}` });
        else {
          const r = data.response || {};
          steps.push({ name: 'Conta API-Football', ok: r.subscription?.active !== false,
            detail: `plano ${r.subscription?.plan || '?'} · pedidos hoje ${r.requests?.current ?? '?'} de ${r.requests?.limit_day ?? '?'}` });
        }
      } catch (err) { steps.push({ name: 'Conta API-Football', ok: false, detail: err.message }); }
    }
    const count = (sql, ...a) => db.prepare(sql).get(...a).n;
    const packs = count('SELECT COUNT(*) AS n FROM team_directory_packs WHERE teams > 0');
    steps.push({ name: 'Ligas guardadas (API-Football)', ok: !apif || packs > 0,
      detail: `${packs} de ${Object.values(leaguePacks).flat().length} ligas · ${count('SELECT COUNT(DISTINCT logo) AS n FROM team_directory')} equipas${seasonKept() ? ` · época ${seasonKept()}` : ''}` });
    const total = cache.size;
    const withLogo = [...cache.values()].filter((c) => c.logo).length;
    const local = [...cache.values()].filter((c) => typeof c.logo === 'string' && c.logo.startsWith('/team-logo/')).length;
    steps.push({ name: 'Emblemas descarregados (guardados aqui)', ok: true,
      detail: `${count('SELECT COUNT(*) AS n FROM team_logo_files')} de ${dirLogos.all().length} das ligas guardadas · não gastam pedidos` });
    steps.push({ name: 'Equipas dos jogos', ok: withLogo > 0, detail: `${total} procuradas · ${withLogo} com emblema · ${local} guardados aqui (API-Football)` });
    steps.push({ name: 'MMA: lutadores dos combates (API-MMA)', ok: true,
      detail: `${count("SELECT COUNT(DISTINCT logo) AS n FROM team_directory WHERE sport = 'mma'")} lutadores com foto · ${count("SELECT COUNT(*) AS n FROM team_directory_packs WHERE sport = 'mma' AND teams > 0")} dias lidos` });
    steps.push({ name: 'Pedidos API-Football hoje (contados aqui)', ok: true, detail: Object.keys(API_SPORTS).map((sp) => `${sp} ${used(sp)}`).join(' · ') });
    steps.push({ name: 'Última procura', ok: Boolean(lastRun), detail: lastRun ? `${lastRun.at} · ${lastRun.asked} procuradas · ${lastRun.found} encontradas` : 'ainda não correu' });
    if (lastError) steps.push({ name: 'Último erro da API', ok: false, detail: `${lastError.at} · ${lastError.message}` });
    return steps;
  }

  function start(everyMs = 60_000) {
    if (!enabled) return () => {};
    const first = setTimeout(run, 15_000);
    const t = setInterval(run, everyMs);
    return () => { clearTimeout(first); clearInterval(t); };
  }

  return { get, run, start, wanted, file, leagueLogo, sportLeagueLogo, diagnose, apiFootballUsed: used };
}
