// Team badges for the teams the feed sends without one, and their kit colours.
//
// Badges come from API-Football (api-sports.io, key API_FOOTBALL_KEY) when it is set: the same key
// serves football, basketball, hockey, volleyball and handball, 100 requests a day each on the free
// plan, so at most apiFootballDaily lookups a day per sport are made (games in play first).
// WinHouse sends a badge for some teams only. For the others, the team is looked up by name in
// TheSportsDB (free API: https://www.thesportsdb.com, key THESPORTSDB_KEY), a few teams a minute
// (the free tier allows 30 requests a minute), and the badge and kit colours kept in team_logos.
// A team not found is asked again after a month. Only a result whose name is the team's own (name,
// short name or one of its other names) is taken, so another club's colours are never shown. Where
// there is no badge the page shows the real kit image (strEquipment), else a shirt in the kit
// colours, else a neutral shirt.

import { nowIso } from './db.js';

const SPORT_NAME = {
  futebol: 'Soccer', futsal: 'Futsal', basquetebol: 'Basketball', hoquei: 'Ice Hockey', voleibol: 'Volleyball',
  andebol: 'Handball', esports: 'ESports',
};
const MISS_RETRY_MS = 30 * 86_400_000;
const VERSION = 2;
const API_SPORTS = { futebol: 'football', basquetebol: 'basketball', hoquei: 'hockey', voleibol: 'volleyball', andebol: 'handball' }; // entries saved by an older version are looked up again
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

const colour = (c) => {
  const m = HEX.exec(String(c || '').trim());
  if (!m) return null;
  const h = m[1].length === 3 ? m[1].split('').map((x) => x + x).join('') : m[1];
  return `#${h.toLowerCase()}`;
};

export function createTeamLogos(db, {
  key = '123', apiFootballKey = '', apiFootballVia = '', apiFootballDaily = 90, fetchImpl = globalThis.fetch, perRun = 12, enabled = true,
  log = () => {},
} = {}) {
  db.exec(`CREATE TABLE IF NOT EXISTS team_logos (
    team_key TEXT PRIMARY KEY, logo TEXT, colors TEXT, checked_at TEXT NOT NULL)`);
  const cols = db.prepare('PRAGMA table_info(team_logos)').all().map((c) => c.name);
  if (!cols.includes('kit')) db.exec('ALTER TABLE team_logos ADD COLUMN kit TEXT');
  if (!cols.includes('ver')) db.exec('ALTER TABLE team_logos ADD COLUMN ver INTEGER NOT NULL DEFAULT 1');
  if (!cols.includes('apif')) db.exec('ALTER TABLE team_logos ADD COLUMN apif INTEGER NOT NULL DEFAULT 0');
  db.exec('CREATE TABLE IF NOT EXISTS api_quota (name TEXT PRIMARY KEY, day TEXT NOT NULL, used INTEGER NOT NULL)');
  const cache = new Map(db.prepare('SELECT team_key, logo, colors, kit, ver, apif, checked_at FROM team_logos').all()
    .map((r) => [r.team_key, { logo: r.logo, colors: r.colors ? JSON.parse(r.colors) : null, kit: r.kit, ver: r.ver, apif: !!r.apif, checkedAt: r.checked_at }]));
  const save = db.prepare(`INSERT INTO team_logos (team_key, logo, colors, kit, ver, apif, checked_at) VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(team_key) DO UPDATE SET logo = excluded.logo, colors = excluded.colors, kit = excluded.kit, ver = excluded.ver,
      apif = excluded.apif, checked_at = excluded.checked_at`);

  // API-Football: requests made today per sport (the free plan allows 100 a day each).
  const apif = Boolean(apiFootballKey);
  const today = () => new Date().toISOString().slice(0, 10);
  const quotaRow = db.prepare('SELECT day, used FROM api_quota WHERE name = ?');
  const quotaSet = db.prepare(`INSERT INTO api_quota (name, day, used) VALUES (?, ?, ?)
    ON CONFLICT(name) DO UPDATE SET day = excluded.day, used = excluded.used`);
  const used = (sport) => { const r = quotaRow.get(`apif:${sport}`); return r && r.day === today() ? r.used : 0; };
  const spend = (sport, n = 1) => quotaSet.run(`apif:${sport}`, today(), used(sport) + n);
  const apifCan = (sport) => apif && API_SPORTS[sport] && used(sport) < apiFootballDaily;

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

  /** API-Football: the badge of the team with this name (same team only), or null. */
  async function apiFootballLogo(sport, name) {
    const api = API_SPORTS[sport];
    for (const variant of nameVariants(name)) {
      // The search takes letters, digits and spaces only, 3 at least.
      const q = variant.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
      if (q.length < 3 || !apifCan(sport)) continue;
      const rapid = apiFootballVia === 'rapidapi' && api === 'football';
      const url = rapid ? `https://api-football-v1.p.rapidapi.com/v3/teams?search=${encodeURIComponent(q)}`
        : `https://${api === 'football' ? 'v3' : 'v1'}.${api}.api-sports.io/teams?search=${encodeURIComponent(q)}`;
      const headers = rapid ? { 'x-rapidapi-key': apiFootballKey, 'x-rapidapi-host': 'api-football-v1.p.rapidapi.com' } : { 'x-apisports-key': apiFootballKey };
      spend(sport);
      const res = await fetchImpl(url, { signal: AbortSignal.timeout(10_000), headers: { Accept: 'application/json', ...headers } });
      if (res.status === 429) throw Object.assign(new Error('API-Football: demasiados pedidos'), { rate: true });
      if (!res.ok) throw new Error(`API-Football HTTP ${res.status}`);
      const data = await res.json().catch(() => null);
      const errors = data?.errors && (Array.isArray(data.errors) ? data.errors : Object.values(data.errors));
      if (errors?.length) {
        // Out of requests for today (or a bad key): no more today.
        spend(sport, apiFootballDaily);
        throw new Error(`API-Football: ${String(errors[0]).slice(0, 120)}`);
      }
      const teams = (Array.isArray(data?.response) ? data.response : []).map((x) => x.team || x);
      const t = teams.find((x) => httpsUrl(x.logo) && sameTeam({ strTeam: x.name, strTeamShort: x.code }, name));
      if (t) return t.logo;
    }
    return null;
  }

  /** Looks one team up: a result of its sport with the team's own name (one with a badge first). */
  async function lookUp(sport, name) {
    const want = SPORT_NAME[sport];
    for (const variant of nameVariants(name)) {
      const teams = (await search(variant)).filter((t) => (!want || t.strSport === want) && sameTeam(t, name));
      const t = teams.find((x) => x.strBadge) || teams[0];
      if (t) {
        const colors = [colour(t.strColour1), colour(t.strColour2)].filter(Boolean);
        return { logo: httpsUrl(t.strBadge), colors: colors.length ? colors : null, kit: httpsUrl(t.strEquipment) };
      }
    }
    return { logo: null, colors: null, kit: null };
  }

  /** Teams of the games in play or starting in two days that have no badge from the feed and were not looked up (lately). */
  function wanted(limit) {
    const until = new Date(Date.now() + 2 * 86_400_000).toISOString();
    const rows = db.prepare(`SELECT sport, home, away, home_team_ext, away_team_ext FROM events
      WHERE (status = 'live' OR (status = 'scheduled' AND start_time < ?)) AND sport IN (${Object.keys(SPORT_NAME).map(() => '?').join(',')})
      ORDER BY status = 'live' DESC, start_time LIMIT 600`).all(until, ...Object.keys(SPORT_NAME));
    const out = new Map();
    const stale = Date.now() - MISS_RETRY_MS;
    for (const r of rows) {
      for (const [name, ext] of [[r.home, r.home_team_ext], [r.away, r.away_team_ext]]) {
        if (!name || (typeof ext === 'string' && ext.startsWith('https://'))) continue;
        const k = teamKey(r.sport, name);
        const c = cache.get(k);
        const fresh = c && c.ver >= VERSION && (c.logo || new Date(c.checkedAt).getTime() > stale);
        if (fresh && !(apifCan(r.sport) && !c.apif)) continue;
        if (!out.has(k)) out.set(k, { sport: r.sport, name });
        if (out.size >= limit) return [...out.values()];
      }
    }
    return [...out.values()];
  }

  let busy = false;
  async function run() {
    if (!enabled || busy) return { asked: 0, found: 0 };
    busy = true;
    let asked = 0;
    let found = 0;
    try {
      for (const { sport, name } of wanted(perRun)) {
        const k = teamKey(sport, name);
        const c = cache.get(k);
        let r = c && c.ver >= VERSION ? c : null;
        let apiLogo = null;
        let apiAsked = Boolean(c?.apif);
        try {
          if (!r) r = await lookUp(sport, name);
          if (!apiAsked && apifCan(sport)) { apiLogo = await apiFootballLogo(sport, name); apiAsked = true; }
        } catch (err) {
          if (err.rate) break;
          log(`emblema de ${name}: ${err.message}`);
          if (!r) continue;
        }
        asked += 1;
        const logo = apiLogo || r.logo;
        if (logo && logo !== c?.logo) found += 1;
        const v = { logo, colors: r.colors, kit: r.kit, ver: VERSION, apif: apiAsked, checkedAt: nowIso() };
        cache.set(k, v);
        save.run(k, v.logo, v.colors ? JSON.stringify(v.colors) : null, v.kit, VERSION, apiAsked ? 1 : 0, v.checkedAt);
      }
    } finally { busy = false; }
    if (found) log(`${found} emblema(s) de equipas encontrados (${asked} procuradas)`);
    return { asked, found };
  }

  function start(everyMs = 60_000) {
    if (!enabled) return () => {};
    const first = setTimeout(run, 15_000);
    const t = setInterval(run, everyMs);
    return () => { clearTimeout(first); clearInterval(t); };
  }

  return { get, run, start, wanted, apiFootballUsed: used };
}
