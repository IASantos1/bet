/**
 * GoalServe sports data client — full replacement for sportsApiPro.ts, covering the same 5 sports
 * currently live (soccer, tennis, basketball, ice-hockey, baseball): live scores, schedule/fixtures
 * by date, and pregame/live odds. Produces the exact same NormalizedEvent/OddsResult shapes as
 * sportsApiPro.ts so it's a drop-in swap in server/routes/events.ts.
 *
 * ⚠️ UNVERIFIED AGAINST REAL PAYLOADS. This sandbox's network egress blocks goalserve.com entirely
 * (confirmed via both curl and Node's fetch — "Host not in allowlist", not even the target server's
 * own rejection like the casino aggregator's IP whitelist was). Every parsing function below is
 * written defensively — checking multiple plausible field-name variants, the same style already
 * used by sportsApiPro.ts's extractEvents() — based on GoalServe's documented URL scheme and
 * publicly known XML/JSON conventions, but none of it has been exercised against a real response.
 * Validate against real output (e.g. by pasting sample JSON from each endpoint, the same way the
 * casino aggregator integration was built) before trusting this in production; until then keep
 * SPORTS_DATA_PROVIDER unset/'sportsapipro' so the known-working path stays live. Every `???`
 * comment below marks a specific field-name guess most worth checking first.
 */

import type { NormalizedEvent, OddsResult } from './sportsApiPro';

const BASE_URL = 'http://www.goalserve.com/getfeed';
const ODDS_BASE_URL = 'http://www.goalserve.com/getfeed';

/** GoalServe uses a different URL segment per sport, unlike sportsApiPro's uniform subdomain
 *  pattern. Matches the "SPORT_TYPES" list and per-sport feed paths in the shared docs. */
function sportSegment(sport: string): string {
  const s = String(sport || '').toLowerCase().trim();
  if (s === 'soccer' || s === 'football' || s === 'futebol') return 'soccernew';
  if (s === 'tennis' || s === 'tênis') return 'tennis_scores';
  if (s === 'basketball' || s === 'basket' || s === 'basquete') return 'bsktbl';
  if (s === 'ice-hockey' || s === 'icehockey' || s === 'hockey') return 'hockey';
  if (s === 'baseball') return 'baseball';
  if (s === 'handball') return 'handball';
  if (s === 'volleyball') return 'volleyball';
  if (s === 'rugby-union' || s === 'rugby') return 'rugby';
  if (s === 'cricket') return 'cricket';
  if (s === 'esports') return 'esports';
  return 'soccernew';
}

/** The single odds-comparison endpoint namespace is always "soccer" in the path — the actual
 *  sport is selected via the `cat` query param (`{oddsCat}_10`), per the shared docs. */
function oddsCat(sport: string): string {
  const s = String(sport || '').toLowerCase().trim();
  if (s === 'soccer' || s === 'football' || s === 'futebol') return 'soccer';
  if (s === 'tennis' || s === 'tênis') return 'tennis';
  if (s === 'basketball' || s === 'basket' || s === 'basquete') return 'basket';
  if (s === 'ice-hockey' || s === 'icehockey' || s === 'hockey') return 'hockey';
  if (s === 'baseball') return 'baseball';
  if (s === 'handball') return 'handball';
  if (s === 'volleyball') return 'volleyball';
  if (s === 'rugby-union' || s === 'rugby') return 'rugby';
  if (s === 'cricket') return 'cricket';
  if (s === 'esports') return 'esports';
  return 'soccer';
}

async function fetchJson(url: string, timeoutMs = 12000): Promise<any | null> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), Math.max(1000, timeoutMs));
  try {
    const res = await fetch(url, { headers: { accept: 'application/json' }, signal: controller.signal });
    const text = await res.text().catch(() => '');
    if (!res.ok || !text) return null;
    try {
      return JSON.parse(text);
    } catch {
      // GoalServe returns XML unless ?json=1 is honored — surfacing this distinctly helps
      // diagnose a misconfigured URL rather than silently returning an empty event list.
      console.error('[goalserve] non-JSON response (check ?json=1 and the feed path):', url, text.slice(0, 200));
      return null;
    }
  } catch (e) {
    console.error('[goalserve] fetch failed:', url, String((e as any)?.message || e));
    return null;
  } finally {
    clearTimeout(t);
  }
}

function apiKeyOk(apiKey: string): boolean {
  return typeof apiKey === 'string' && apiKey.trim().length > 0;
}

/** GoalServe wraps most feeds under `scores.category` (soccer) or a sport-specific root key.
 *  ??? exact root key names per sport are the single biggest unknown here — this checks every
 *  plausible shape from the docs and falls back broad rather than narrow. */
function extractCategories(payload: any): any[] {
  if (!payload) return [];
  const roots = [
    payload?.scores?.category,
    payload?.category,
    payload?.data?.category,
    payload?.matches?.category, // ??? bsktbl/tennis_scores/hockey/baseball may nest one level differently
    payload?.tournaments?.tournament,
    payload?.scores?.tournament,
  ];
  for (const r of roots) {
    if (Array.isArray(r)) return r;
    if (r && typeof r === 'object') return [r]; // GoalServe often omits the array wrapper for a single category
  }
  return [];
}

/** A category's matches live under `.match` or `.matches.match`; both forms are documented
 *  elsewhere in GoalServe's XML conventions (??? confirm which applies per sport). */
function extractMatches(category: any): any[] {
  if (!category) return [];
  const candidates = [category?.match, category?.matches?.match, category?.matches, category?.game, category?.games];
  for (const c of candidates) {
    if (Array.isArray(c)) return c;
    if (c && typeof c === 'object') return [c];
  }
  return [];
}

function num(v: any): number {
  const n = typeof v === 'string' ? Number(v.trim().replace(',', '.')) : Number(v);
  return Number.isFinite(n) ? n : 0;
}

function str(v: any): string {
  return v == null ? '' : String(v).trim();
}

/** ??? team fields: GoalServe soccer uses localteam/awayteam or localteam/visitorteam depending
 *  on feed vintage; other sports sometimes use hometeam/awayteam. Checks all four pairs. */
function extractTeams(m: any): { home: any; away: any } {
  const home = m?.localteam ?? m?.hometeam ?? m?.home_team ?? m?.home ?? {};
  const away = m?.awayteam ?? m?.visitorteam ?? m?.away_team ?? m?.away ?? {};
  return { home, away };
}

function teamName(t: any): string {
  return str(t?.name ?? t?.['@name'] ?? t);
}

function teamId(t: any): string {
  return str(t?.id ?? t?.['@id']);
}

function teamLogo(t: any): string {
  return str(t?.logo ?? t?.badge ?? t?.image ?? '');
}

function teamScore(t: any, m: any, side: 'home' | 'away'): number | null {
  const direct = t?.score ?? t?.totalscore ?? t?.goals;
  if (direct != null && direct !== '') return num(direct);
  const fromMatch = side === 'home' ? (m?.localteam_score ?? m?.hscore) : (m?.awayteam_score ?? m?.ascore);
  if (fromMatch != null && fromMatch !== '') return num(fromMatch);
  return null;
}

/** GoalServe's status strings ("Not Started", "Finished", "1st Half", "Half Time", "45", live
 *  minute counters, etc.) — mapped to the same is_live/status_short convention sportsApiPro.ts's
 *  consumers expect. ??? exact live-status vocabulary per sport is unconfirmed. */
function parseStatus(raw: string): { status: string; statusShort: string; isLive: number; elapsed: number } {
  const s = str(raw);
  const upper = s.toUpperCase();
  if (!s || upper === 'NOT STARTED' || upper === 'NS' || upper === 'SCHEDULED') {
    return { status: 'Not Started', statusShort: 'NS', isLive: 0, elapsed: 0 };
  }
  if (upper === 'FT' || upper === 'FINISHED' || upper === 'FULL TIME' || upper === 'AET' || upper === 'FT PEN') {
    return { status: 'Finished', statusShort: 'FT', isLive: 0, elapsed: 90 };
  }
  if (upper === 'POSTP' || upper === 'POSTPONED' || upper === 'CANC' || upper === 'CANCELLED' || upper === 'ABAN') {
    return { status: s, statusShort: upper.slice(0, 4), isLive: 0, elapsed: 0 };
  }
  // Anything else (a bare minute number, "1st Half", "Half Time", "2nd Half", live set/quarter
  // labels for tennis/basketball) is treated as in-progress.
  const minuteMatch = /^(\d{1,3})/.exec(s);
  const elapsed = minuteMatch ? Number(minuteMatch[1]) : 0;
  return { status: s, statusShort: s.slice(0, 6), isLive: 1, elapsed };
}

/** Converts one GoalServe match object (soccer or otherwise) into the NormalizedEvent shape every
 *  other part of the app (odds versioning, bet settlement, EventCard) already relies on. */
function normalizeMatch(sport: string, category: any, m: any): NormalizedEvent | null {
  if (!m) return null;
  const { home, away } = extractTeams(m);
  const homeName = teamName(home);
  const awayName = teamName(away);
  if (!homeName || !awayName) return null;

  const id = str(m?.id ?? m?.['@id'] ?? m?.fixture_id);
  if (!id) return null;

  const { status, statusShort, isLive, elapsed } = parseStatus(str(m?.status ?? m?.status_name));
  const homeScore = teamScore(home, m, 'home');
  const awayScore = teamScore(away, m, 'away');

  // GoalServe dates are typically "dd.MM.yyyy" with a separate "time" field ("HH:mm") — combined
  // into an ISO-ish string. ??? confirm the exact date/time attribute names and format per sport.
  const dateRaw = str(m?.date ?? m?.formatted_date);
  const timeRaw = str(m?.time ?? m?.formatted_time);
  let eventDate = '';
  const dm = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(dateRaw);
  if (dm) {
    const [, dd, mm, yyyy] = dm;
    eventDate = `${yyyy}-${mm}-${dd}T${timeRaw || '00:00'}:00Z`;
  } else if (dateRaw) {
    eventDate = timeRaw ? `${dateRaw}T${timeRaw}:00Z` : dateRaw;
  }

  return {
    external_event_id: `goalserve_${id}`,
    sport,
    league: str(category?.name ?? category?.['@name']),
    home_team: homeName,
    away_team: awayName,
    team_match: `${homeName} vs ${awayName}`,
    event_date: eventDate,
    status,
    status_short: statusShort,
    status_long: status,
    is_live: isLive,
    home_odd: 0,
    draw_odd: 0,
    away_odd: 0,
    elapsed,
    timer: str(m?.timer ?? m?.minute ?? (elapsed || '')),
    score: JSON.stringify({ home: homeScore, away: awayScore }),
    markets: '{}',
    country: str(category?.country ?? ''),
    home_team_logo: teamLogo(home),
    away_team_logo: teamLogo(away),
    fixture: { id, date: eventDate, status: { description: status } },
    teams: { home: { id: teamId(home), name: homeName, logo: teamLogo(home) }, away: { id: teamId(away), name: awayName, logo: teamLogo(away) } },
    goals: { home: homeScore, away: awayScore },
  };
}

function flattenMatches(sport: string, payload: any): NormalizedEvent[] {
  const categories = extractCategories(payload);
  const out: NormalizedEvent[] = [];
  for (const cat of categories) {
    for (const m of extractMatches(cat)) {
      const n = normalizeMatch(sport, cat, m);
      if (n) out.push(n);
    }
  }
  return out;
}

// ---- League/team logos ----
// Separate API host and auth style from every other GoalServe feed above: base
// data2.goalserve.com:8084, key passed as `?k=` rather than in the URL path, and its own
// {SPORT_TYPES} segment naming (documented separately from the main feed docs — e.g. plain
// "basketball"/"hockey", not "bsktbl"/"hockey" mixed with GoalServe's feed-path abbreviations).
// ??? whether {USER_GUID} is the same account key used everywhere else, or a distinct value, is
// unconfirmed — the shared docs only call it "User's global unique identifier" with no example.
// ??? the response shape is entirely unconfirmed — no sample was provided; parsed defensively.

const LOGO_BASE_URL = 'http://data2.goalserve.com:8084/api/v1/logotips';
const LOGO_CACHE_TTL_MS = 24 * 60 * 60 * 1000; // logos change rarely — cache generously
const LOGO_MIN_INTERVAL_MS = 1100; // docs: "Requests limit - 1 request per second"

const logoCache = new Map<string, { ts: number; url: string }>();
let logoRateLimitChain: Promise<void> = Promise.resolve();

function logosSportType(sport: string): string {
  const s = String(sport || '').toLowerCase().trim();
  if (s === 'soccer' || s === 'football' || s === 'futebol') return 'soccer';
  if (s === 'basketball' || s === 'basket' || s === 'basquete') return 'basketball';
  if (s === 'baseball') return 'baseball';
  if (s === 'volleyball') return 'volleyball';
  if (s === 'tennis' || s === 'tênis') return 'tennis';
  if (s === 'handball') return 'handball';
  if (s === 'ice-hockey' || s === 'icehockey' || s === 'hockey') return 'hockey';
  if (s === 'cricket') return 'cricket';
  return 'soccer';
}

function extractLogoEntries(payload: any): Array<{ id: string; url: string }> {
  if (!payload) return [];
  const candidates = [payload?.teams, payload?.leagues, payload?.players, payload?.data, payload?.logos, payload?.results, payload];
  for (const c of candidates) {
    const arr = Array.isArray(c) ? c : Array.isArray(c?.team) ? c.team : Array.isArray(c?.league) ? c.league : null;
    if (!arr) continue;
    const out: Array<{ id: string; url: string }> = [];
    for (const item of arr) {
      const id = str(item?.id ?? item?.['@id'] ?? item?.team_id ?? item?.league_id);
      const url = str(item?.logo ?? item?.url ?? item?.image ?? item?.badge ?? item?.path ?? item?.['#text']);
      if (id && url) out.push({ id, url });
    }
    if (out.length) return out;
  }
  return [];
}

/** Batch-fetches team logos for every id not already cached, in one comma-separated request —
 *  naturally respects the 1 req/sec limit as long as callers don't fan out per-event requests.
 *  Never throws: a failed or unconfirmed-shape response just leaves those ids uncached, and
 *  callers fall back to no logo rather than losing the event data over it. */
async function fetchTeamLogos(apiKey: string, sport: string, teamIds: string[]): Promise<void> {
  const type = logosSportType(sport);
  const missing = Array.from(new Set(teamIds)).filter((id) => {
    const cached = logoCache.get(`${type}:${id}`);
    return !cached || Date.now() - cached.ts >= LOGO_CACHE_TTL_MS;
  });
  if (!missing.length || !apiKeyOk(apiKey)) return;

  const run = async () => {
    const url = `${LOGO_BASE_URL}/${type}/teams?k=${encodeURIComponent(apiKey)}&ids=${missing.map(encodeURIComponent).join(',')}`;
    const json = await fetchJson(url, 8000);
    for (const { id, url: logoUrl } of extractLogoEntries(json)) {
      logoCache.set(`${type}:${id}`, { ts: Date.now(), url: logoUrl });
    }
  };

  // Serialize against any other in-flight logo fetch so concurrent live+schedule calls for
  // different sports still respect the shared 1 req/sec limit.
  const chained = logoRateLimitChain.then(run).catch(() => void 0);
  logoRateLimitChain = chained.then(() => new Promise((resolve) => setTimeout(resolve, LOGO_MIN_INTERVAL_MS)));
  return chained;
}

/** Patches home_team_logo/away_team_logo (and the nested teams.*.logo mirrors) onto already-
 *  normalized events, using whatever logos are cached or can be fetched in one batch call.
 *  Best-effort — never removes or blocks on events whose logo isn't available. */
async function attachTeamLogos(apiKey: string, sport: string, events: NormalizedEvent[]): Promise<NormalizedEvent[]> {
  if (!events.length) return events;
  const ids = events.flatMap((e) => [e.teams?.home?.id, e.teams?.away?.id]).filter((id): id is string => !!id);
  await fetchTeamLogos(apiKey, sport, ids).catch(() => void 0);
  const type = logosSportType(sport);
  const lookup = (id: string | undefined) => (id ? logoCache.get(`${type}:${id}`)?.url || '' : '');
  for (const e of events) {
    const homeLogo = lookup(e.teams?.home?.id) || e.home_team_logo;
    const awayLogo = lookup(e.teams?.away?.id) || e.away_team_logo;
    e.home_team_logo = homeLogo;
    e.away_team_logo = awayLogo;
    if (e.teams?.home) e.teams.home.logo = homeLogo;
    if (e.teams?.away) e.teams.away.logo = awayLogo;
  }
  return events;
}

/** Calls the sport's "home" livescore feed (today's live + finished matches). */
export async function fetchGoalServeLive(apiKey: string, sport: string): Promise<NormalizedEvent[]> {
  if (!apiKeyOk(apiKey)) return [];
  const seg = sportSegment(sport);
  const url = `${BASE_URL}/${encodeURIComponent(apiKey)}/${seg}/home?json=1`;
  const json = await fetchJson(url);
  return attachTeamLogos(apiKey, sport, flattenMatches(sport, json));
}

/** GoalServe has no arbitrary-date schedule endpoint like sportsApiPro's `/api/schedule/{date}` —
 *  it only offers relative day-offset feeds (d-7..d-1, home, d1..d7). Converts the caller's
 *  "YYYY-MM-DD" date into the nearest day offset from today (UTC) and clamps to that ±7 window;
 *  a date further out than that returns an empty list rather than guessing at another endpoint. */
function dayOffsetSuffix(date: string): string | null {
  const d = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  const today = new Date();
  const todayUtc = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  const targetUtc = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  const diffDays = Math.round((targetUtc - todayUtc) / 86_400_000);
  if (diffDays === 0) return 'home';
  if (diffDays < -7 || diffDays > 7) return null;
  return diffDays > 0 ? `d${diffDays}` : `d${diffDays}`; // GoalServe's own negative segments already read "d-1".."d-7"
}

export async function fetchGoalServeSchedule(apiKey: string, sport: string, date: string): Promise<NormalizedEvent[]> {
  if (!apiKeyOk(apiKey)) return [];
  const suffix = dayOffsetSuffix(date);
  if (!suffix) return [];
  const seg = sportSegment(sport);
  const url = `${BASE_URL}/${encodeURIComponent(apiKey)}/${seg}/${suffix}?json=1`;
  const json = await fetchJson(url);
  return attachTeamLogos(apiKey, sport, flattenMatches(sport, json));
}

// ---- Odds ----

function normalizeOutcomeKey(name: string): 'home' | 'draw' | 'away' | null {
  const n = str(name).toLowerCase();
  if (n === 'home' || n === '1' || n === 'localteam') return 'home';
  if (n === 'draw' || n === 'x' || n === 'tie') return 'draw';
  if (n === 'away' || n === '2' || n === 'visitorteam' || n === 'awayteam') return 'away';
  return null;
}

/** Extracts the odds list from a single `<type>` block. ??? "bookmaker" wrapping and the exact
 *  `odd` element attribute names (name/value vs type/price) are the least certain part of this
 *  parser — GoalServe's odds feeds vary the bookmaker nesting by sport/product tier. */
function extractOddsFromType(typeBlock: any): Array<{ name: string; value: number }> {
  const bookmakers = Array.isArray(typeBlock?.bookmaker) ? typeBlock.bookmaker : typeBlock?.bookmaker ? [typeBlock.bookmaker] : [];
  const out: Array<{ name: string; value: number }> = [];
  for (const bm of bookmakers) {
    const odds = Array.isArray(bm?.odd) ? bm.odd : bm?.odd ? [bm.odd] : [];
    for (const o of odds) {
      const name = str(o?.name ?? o?.['@name'] ?? o?.value ?? o?.type);
      const value = num(o?.value ?? o?.['@value'] ?? o?.price);
      if (name && value > 1) out.push({ name, value });
    }
  }
  // Some feeds skip the bookmaker wrapper entirely for a single default price source.
  if (out.length === 0) {
    const odds = Array.isArray(typeBlock?.odd) ? typeBlock.odd : typeBlock?.odd ? [typeBlock.odd] : [];
    for (const o of odds) {
      const name = str(o?.name ?? o?.['@name'] ?? o?.value);
      const value = num(o?.value ?? o?.['@value'] ?? o?.price);
      if (name && value > 1) out.push({ name, value });
    }
  }
  return out;
}

function findMatchInOddsPayload(payload: any, matchId: string): any | null {
  const categories = extractCategories(payload);
  for (const cat of categories) {
    for (const m of extractMatches(cat)) {
      const id = str(m?.id ?? m?.['@id']);
      // GoalServe's match id here is its own (not prefixed) — matchId passed in may carry our
      // "goalserve_" prefix from normalizeMatch(), so compare both forms.
      if (id === matchId || `goalserve_${id}` === matchId || id === matchId.replace(/^goalserve_/, '')) return m;
    }
  }
  return null;
}

/** Builds the OddsResult.markets.h2h array plus derived home/draw/away, matching exactly what
 *  parseSportsApiProMatchOddsPayload() produces so deriveAdditionalMarkets() and the settlement/
 *  odds-versioning code downstream work unmodified. */
function parseOddsMatch(m: any): OddsResult | null {
  if (!m) return null;
  const typeBlocks: any[] = Array.isArray(m?.odds?.type) ? m.odds.type : m?.odds?.type ? [m.odds.type] : [];
  const h2h: Array<{ label: string; value: string; odd: number }> = [];
  const markets: Record<string, any[]> = {};

  for (const t of typeBlocks) {
    // ??? the exact `value`/`name` used for the 1X2 market's own <type> label is unconfirmed —
    // GoalServe commonly calls it "Home/Draw/Away", "Match Winner", or "1x2" depending on sport.
    const label = str(t?.value ?? t?.name ?? t?.['@value']).toLowerCase();
    const isH2H = label.includes('home') || label.includes('1x2') || label.includes('match winner') || label.includes('winner') || label.includes('result');
    const odds = extractOddsFromType(t);
    if (!odds.length) continue;

    if (isH2H) {
      for (const o of odds) {
        const key = normalizeOutcomeKey(o.name);
        if (!key) continue;
        h2h.push({ label: key === 'home' ? 'Home' : key === 'away' ? 'Away' : 'Draw', value: o.name, odd: o.value });
      }
    } else {
      const marketKey = label.replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'other';
      markets[marketKey] = odds.map((o) => ({ label: o.name, value: o.name, odd: o.value }));
    }
  }

  if (h2h.length) markets.h2h = h2h;
  if (!Object.keys(markets).length) return null;

  const home = Math.max(0, ...h2h.filter((s) => s.label === 'Home').map((s) => s.odd), 0);
  const draw = Math.max(0, ...h2h.filter((s) => s.label === 'Draw').map((s) => s.odd), 0);
  const away = Math.max(0, ...h2h.filter((s) => s.label === 'Away').map((s) => s.odd), 0);
  if (!home && !away && !Object.keys(markets).length) return null;

  return { home, draw, away, markets };
}

async function fetchOddsPayload(apiKey: string, sport: string): Promise<any | null> {
  if (!apiKeyOk(apiKey)) return null;
  const cat = oddsCat(sport);
  const url = `${ODDS_BASE_URL}/${encodeURIComponent(apiKey)}/getodds/soccer?cat=${cat}_10&json=1`;
  return fetchJson(url, 15000);
}

/** GoalServe doesn't split "all / live / pre-match" odds into separate endpoints the way
 *  sportsApiPro does — the same comparison feed carries whatever matches are currently priced,
 *  live or upcoming. All three exported functions below share this one fetch+parse path; kept as
 *  three functions only to match events.ts's existing call sites without changing its logic. */
async function fetchGoalServeMatchOdds(
  apiKey: string,
  sport: string,
  matchId: string,
  _opts?: { homeTeam?: string; awayTeam?: string },
): Promise<OddsResult | null> {
  const payload = await fetchOddsPayload(apiKey, sport);
  if (!payload) return null;
  const match = findMatchInOddsPayload(payload, matchId);
  return parseOddsMatch(match);
}

export async function fetchGoalServeMatchOddsAll(
  apiKey: string,
  sport: string,
  matchId: string,
  opts?: { homeTeam?: string; awayTeam?: string },
): Promise<OddsResult | null> {
  return fetchGoalServeMatchOdds(apiKey, sport, matchId, opts);
}

export async function fetchGoalServeMatchOddsLive(
  apiKey: string,
  sport: string,
  matchId: string,
  opts?: { homeTeam?: string; awayTeam?: string },
): Promise<OddsResult | null> {
  return fetchGoalServeMatchOdds(apiKey, sport, matchId, opts);
}

export async function fetchGoalServeMatchOddsPreMatch(
  apiKey: string,
  sport: string,
  matchId: string,
  opts?: { homeTeam?: string; awayTeam?: string },
): Promise<OddsResult | null> {
  return fetchGoalServeMatchOdds(apiKey, sport, matchId, opts);
}
