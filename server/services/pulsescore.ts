/**
 * PulseScore sports data client (api.pulsescore.net) — the sports data provider wired in after
 * GoalServe/sportsApiPro/API-Football/StatPal were all removed from this backend (see git history
 * around the "Remove dead parallel frontend..." / events.ts stub commits).
 *
 * Everything below is built against 3 REAL sample responses pulled directly by the user (not
 * guessed) — a /leagues page, an /events page, and one single-event detail response — plus 2
 * CONFIRMED curl commands for the first two:
 *   GET https://api.pulsescore.net/api/onexbet/{sport}/leagues?page=&limit=
 *   GET https://api.pulsescore.net/api/onexbet/{sport}/events?page=&limit=
 *   headers: accept: * / *, x-secret: <key>, Accept-Encoding: gzip
 *
 * Only `sport=soccer` is confirmed working — `sport` is a path segment so other sports may follow
 * the same shape, but that's unverified; SPORT_SEGMENTS below only maps sports actually seen.
 *
 * The single-event detail sample (richer: markets split by FULL_TIME/FIRST_HALF/SECOND_HALF, plus
 * a `moreInfo.subGames` counter) has no confirmed URL — nothing here guesses one. A caller that
 * needs one event's odds gets it by pulling that event out of the already-fetched events/leagues
 * page instead (see findPulseScoreEvent in events.ts).
 *
 * Odds here already come normalized by PulseScore itself (canonicalMarket/canonicalOutcome enums,
 * decimal odds, `line` split out of the display label) — unlike GoalServe's raw XML-derived JSON,
 * there is no attribute-prefix bug and no per-sport wrapper-shape guessing needed.
 */

const PULSESCORE_BASE_URL = 'https://api.pulsescore.net';

// CONFIRMED only for soccer (the sport in every sample response/curl seen). Add an entry here only
// once a real response for that sport has actually been pulled — never guess a sport works.
function sportSegment(sport: string): string | null {
  const s = String(sport || '').toLowerCase().trim();
  if (s === 'soccer' || s === 'football' || s === 'futebol') return 'soccer';
  return null;
}

function apiKeyOk(apiKey: string): boolean {
  return typeof apiKey === 'string' && apiKey.trim().length > 0;
}

async function fetchJson(url: string, apiKey: string, timeoutMs = 12000): Promise<any | null> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), Math.max(1000, timeoutMs));
  try {
    const res = await fetch(url, {
      headers: { accept: '*/*', 'x-secret': apiKey, 'accept-encoding': 'gzip' },
      signal: controller.signal,
    });
    const text = await res.text().catch(() => '');
    if (!res.ok) {
      console.error('[pulsescore] HTTP', res.status, url, text.slice(0, 300));
      return null;
    }
    if (!text) return null;
    try {
      return JSON.parse(text);
    } catch {
      console.error('[pulsescore] non-JSON response:', url, text.slice(0, 200));
      return null;
    }
  } catch (e) {
    console.error('[pulsescore] fetch failed:', url, String((e as any)?.message || e));
    return null;
  } finally {
    clearTimeout(t);
  }
}

// ---- Raw PulseScore shapes (CONFIRMED against the 3 sample responses) ----

type RawSelection = {
  canonicalOutcome: string;
  rawName: string;
  odds: number;
  rawOdds: string;
  isActive: boolean;
  selectionId: string;
  line?: number;
};

type RawMarket = {
  canonicalMarket: string;
  rawName: string;
  period: string; // "FULL_TIME" | "FIRST_HALF" | "SECOND_HALF"
  line?: number;
  isActive: boolean;
  selections: RawSelection[];
  marketId: string;
};

export type RawPulseScoreEvent = {
  sport?: string;
  eventId: string;
  home: string;
  away: string;
  league: string;
  live: boolean;
  startTime?: string;
  markets: RawMarket[];
  moreInfo?: { sportId?: number; leagueId?: number; selectionCount?: number };
};

type LeaguesResponse = {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  hasNextPage: boolean;
  leagues: Array<{ name: string; sport?: string; leagueId?: string; events: RawPulseScoreEvent[] }>;
};

type EventsResponse = {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  hasNextPage: boolean;
  events: RawPulseScoreEvent[];
};

// ---- App-facing shapes (matching src/shared/types.ts's Event/Market/Selection so the frontend
// needs zero changes — server/ never imports from src/, so these are re-declared locally, same
// pattern as the removed goalserve.ts's NormalizedEvent). ----

export type AppSelection = { id: string; label: string; odd: number; suspended?: boolean };
export type AppMarket = { id: string; key: string; name: string; period?: string; selections: AppSelection[] };
export type AppEvent = {
  id: string;
  external_event_id: string;
  match: string;
  league: string;
  home_team: string;
  away_team: string;
  home_odd: number;
  draw_odd: number;
  away_odd: number;
  event_date: string | null;
  is_live: number;
  sport: string;
  markets: AppMarket[];
};

/** Mirrors this app's own `Market.key` convention (comment in src/shared/types.ts: "h2h | ou_2.5 |
 *  btts | hcp_-1") for the canonical markets actually seen in the sample data. Anything not listed
 *  falls back to a lowercased/underscored version of PulseScore's own canonicalMarket name, so an
 *  unrecognized market still comes through (just without a hand-picked short key). */
const MARKET_KEY_SLUGS: Record<string, string> = {
  MATCH_RESULT: 'h2h',
  DOUBLE_CHANCE: 'dc',
  BOTH_TEAMS_TO_SCORE: 'btts',
  OVER_UNDER: 'ou',
  ASIAN_HANDICAP: 'hcp',
  DRAW_NO_BET: 'dnb',
  HOME_OVER_UNDER: 'ou_home',
  AWAY_OVER_UNDER: 'ou_away',
  FIRST_TEAM_TO_SCORE: 'first_to_score',
  CORRECT_SCORE: 'correct_score',
  TOTAL_GOALS_ODD_EVEN: 'odd_even',
};

function slugMarket(canonicalMarket: string): string {
  return MARKET_KEY_SLUGS[canonicalMarket] || String(canonicalMarket || 'other').toLowerCase().replace(/[^a-z0-9]+/g, '_');
}

const PERIOD_SUFFIX: Record<string, string> = { FIRST_HALF: '1h', SECOND_HALF: '2h' };

/** A single PulseScore market entry can mix multiple lines in one `selections` array (CONFIRMED:
 *  the single-event sample's OVER_UNDER market carries Over/Under at 2, 2.5, 3 and 3.5 all
 *  together, with no market-level `line`) — split by each selection's own `line` so the result
 *  matches this app's one-Market-per-line convention (`ou_2.5`, not one lumped "Total" market). A
 *  market with no lines at all (h2h, btts, ...) produces exactly one group. */
function splitMarketByLine(m: RawMarket): AppMarket[] {
  const groups = new Map<string, RawSelection[]>();
  for (const s of m.selections) {
    const key = s.line != null ? String(s.line) : '';
    const arr = groups.get(key) || [];
    arr.push(s);
    groups.set(key, arr);
  }
  const periodSuffix = PERIOD_SUFFIX[m.period];
  const out: AppMarket[] = [];
  for (const [lineKey, selections] of groups) {
    const base = slugMarket(m.canonicalMarket);
    const key = [base, lineKey || null, periodSuffix || null].filter(Boolean).join('_');
    out.push({
      id: `${m.marketId}${lineKey ? `:${lineKey}` : ''}`,
      key,
      name: m.rawName,
      period: m.period,
      selections: selections.map((s) => ({ id: s.selectionId, label: s.rawName, odd: Number(s.odds), suspended: !s.isActive })),
    });
  }
  return out;
}

function mapMarkets(raw: RawMarket[]): AppMarket[] {
  const out: AppMarket[] = [];
  for (const m of raw || []) {
    if (!m?.isActive) continue;
    out.push(...splitMarketByLine(m));
  }
  return out;
}

/** h2h (1X2) odds, read straight off the FULL_TIME MATCH_RESULT market — the same market every
 *  other consumer in this app expects as home_odd/draw_odd/away_odd. */
function extractH2H(raw: RawMarket[]): { home: number; draw: number; away: number } {
  const m = (raw || []).find((x) => x.canonicalMarket === 'MATCH_RESULT' && x.period === 'FULL_TIME' && x.isActive);
  const pick = (outcome: string) => Number(m?.selections.find((s) => s.canonicalOutcome === outcome && s.isActive)?.odds || 0);
  return { home: pick('HOME'), draw: pick('DRAW'), away: pick('AWAY') };
}

export function normalizePulseScoreEvent(sport: string, raw: RawPulseScoreEvent): AppEvent {
  const { home, draw, away } = extractH2H(raw.markets);
  return {
    id: `pulsescore_${raw.eventId}`,
    external_event_id: `pulsescore_${raw.eventId}`,
    match: `${raw.home} vs ${raw.away}`,
    league: raw.league,
    home_team: raw.home,
    away_team: raw.away,
    home_odd: home,
    draw_odd: draw,
    away_odd: away,
    event_date: raw.startTime || null,
    is_live: raw.live ? 1 : 0,
    sport,
    markets: mapMarkets(raw.markets),
  };
}

/** Fetches every page of the flat /events list for a sport (bounded by a safety cap, since the
 *  real total can be in the thousands — CONFIRMED: 3420 soccer events / 684 pages at limit=5 in
 *  the sample). `pageLimit` is a default guess (PulseScore's docs/curl samples never stated a max
 *  page size) — kept conservative on purpose until a real limit is confirmed. */
export async function fetchPulseScoreEvents(
  apiKey: string,
  sport: string,
  opts: { pageLimit?: number; maxPages?: number } = {},
): Promise<RawPulseScoreEvent[]> {
  if (!apiKeyOk(apiKey)) return [];
  const seg = sportSegment(sport);
  if (!seg) return [];
  const pageLimit = opts.pageLimit ?? 100;
  const maxPages = opts.maxPages ?? 50;
  const out: RawPulseScoreEvent[] = [];
  for (let page = 1; page <= maxPages; page += 1) {
    const url = `${PULSESCORE_BASE_URL}/api/onexbet/${seg}/events?page=${page}&limit=${pageLimit}`;
    const json: EventsResponse | null = await fetchJson(url, apiKey);
    if (!json || !Array.isArray(json.events)) break;
    out.push(...json.events);
    if (!json.hasNextPage) break;
  }
  return out;
}

/** Fetches every page of the /leagues list (events grouped by league) for a sport, flattened back
 *  into a plain event list — same bounded-pagination approach as fetchPulseScoreEvents. */
export async function fetchPulseScoreLeagues(
  apiKey: string,
  sport: string,
  opts: { pageLimit?: number; maxPages?: number } = {},
): Promise<RawPulseScoreEvent[]> {
  if (!apiKeyOk(apiKey)) return [];
  const seg = sportSegment(sport);
  if (!seg) return [];
  const pageLimit = opts.pageLimit ?? 100;
  const maxPages = opts.maxPages ?? 50;
  const out: RawPulseScoreEvent[] = [];
  for (let page = 1; page <= maxPages; page += 1) {
    const url = `${PULSESCORE_BASE_URL}/api/onexbet/${seg}/leagues?page=${page}&limit=${pageLimit}`;
    const json: LeaguesResponse | null = await fetchJson(url, apiKey);
    if (!json || !Array.isArray(json.leagues)) break;
    for (const league of json.leagues) {
      if (Array.isArray(league.events)) out.push(...league.events);
    }
    if (!json.hasNextPage) break;
  }
  return out;
}

export const PULSESCORE_SPORTS = ['soccer'] as const;
