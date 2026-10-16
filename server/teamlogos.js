// Team badges for the teams the feed sends without one, and their kit colours (TheSportsDB).
//
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
const VERSION = 2; // entries saved by an older version are looked up again
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

export function createTeamLogos(db, { key = '123', fetchImpl = globalThis.fetch, perRun = 12, enabled = true, log = () => {} } = {}) {
  db.exec(`CREATE TABLE IF NOT EXISTS team_logos (
    team_key TEXT PRIMARY KEY, logo TEXT, colors TEXT, checked_at TEXT NOT NULL)`);
  const cols = db.prepare('PRAGMA table_info(team_logos)').all().map((c) => c.name);
  if (!cols.includes('kit')) db.exec('ALTER TABLE team_logos ADD COLUMN kit TEXT');
  if (!cols.includes('ver')) db.exec('ALTER TABLE team_logos ADD COLUMN ver INTEGER NOT NULL DEFAULT 1');
  const cache = new Map(db.prepare('SELECT team_key, logo, colors, kit, ver, checked_at FROM team_logos').all()
    .map((r) => [r.team_key, { logo: r.logo, colors: r.colors ? JSON.parse(r.colors) : null, kit: r.kit, ver: r.ver, checkedAt: r.checked_at }]));
  const save = db.prepare(`INSERT INTO team_logos (team_key, logo, colors, kit, ver, checked_at) VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(team_key) DO UPDATE SET logo = excluded.logo, colors = excluded.colors, kit = excluded.kit, ver = excluded.ver,
      checked_at = excluded.checked_at`);

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
        if (c && c.ver >= VERSION && (c.logo || new Date(c.checkedAt).getTime() > stale)) continue;
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
        let r;
        try { r = await lookUp(sport, name); } catch (err) {
          if (err.rate) break;
          log(`emblema de ${name}: ${err.message}`);
          continue;
        }
        asked += 1;
        if (r.logo) found += 1;
        const k = teamKey(sport, name);
        const v = { logo: r.logo, colors: r.colors, kit: r.kit, ver: VERSION, checkedAt: nowIso() };
        cache.set(k, v);
        save.run(k, v.logo, v.colors ? JSON.stringify(v.colors) : null, v.kit, VERSION, v.checkedAt);
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

  return { get, run, start, wanted };
}
