/**
 * PulseScore sports data client (api.pulsescore.net) — the sports data provider wired in after
 * GoalServe/sportsApiPro/API-Football/StatPal were all removed from this backend (see git history
 * around the "Remove dead parallel frontend..." / events.ts stub commits).
 *
 * Built against real sample responses pulled directly by the user (not guessed) for FIVE confirmed
 * sports so far — soccer, tennis, volleyball, rugby (rugby union), mma — each with a /leagues page
 * and an /events page. Three CONFIRMED endpoint shapes:
 *   GET https://api.pulsescore.net/api/onexbet/{sport}/leagues?page=&limit=
 *   GET https://api.pulsescore.net/api/onexbet/{sport}/events?page=&limit=
 *   GET https://api.pulsescore.net/api/onexbet/{sport}/events/{eventId}   -> { data: <event> }
 *   headers: accept: * / *, x-secret: <key>, Accept-Encoding: gzip
 *
 * Only soccer/tennis/volleyball/rugby/mma are confirmed working — `sport` is a path segment so
 * other sports may follow the same shape, but that's unverified; sportSegment() below only maps
 * sports actually seen in a real response. The single-event endpoint has actually been pulled for
 * tennis, volleyball and mma (3 of the 4 non-soccer sports); using it for soccer/rugby too is a
 * pattern-consistency call (the /leagues and /events collection endpoints are already confirmed
 * byte-for-byte identical in shape across all five sports), not a blind guess of an unseen URL.
 * Note: a rugby event's own `sport` field comes back as "rugby_union" (underscore) even though the
 * URL path segment is "rugby-union" (hyphen) — normalizePulseScoreEvent() always stamps the AppEvent
 * with the canonical sport string THIS module was called with, never PulseScore's raw `sport`
 * field, so that mismatch never leaks out.
 *
 * MMA/combat-sports quirk (CONFIRMED across real samples): plain "mma"-league fights (e.g. Muay
 * Thai) carry NO MATCH_RESULT market at all — only a 2-way "Win (2Way)" market (canonicalMarket
 * OTHER, rawName "Win (2Way)", selections literally named W1/W2, no draw offered), while
 * "Combatsport."-league fights (ONE Championship, Brave CF, CFFC, ...) carry both MATCH_RESULT
 * (3-way, DRAW included as a real-but-longshot outcome) and the same Win (2Way) market side by
 * side. extractH2H() below falls back to Win (2Way) when there's no MATCH_RESULT, otherwise a
 * Muay-Thai-style fight would report home_odd/draw_odd/away_odd all 0 and get filtered out of
 * every event list on the frontend despite having real, biddable odds.
 *
 * Odds here already come normalized by PulseScore itself (canonicalMarket/canonicalOutcome enums,
 * decimal odds, `line` split out of the display label) — unlike GoalServe's raw XML-derived JSON,
 * there is no attribute-prefix bug and no per-sport wrapper-shape guessing needed.
 */

const PULSESCORE_BASE_URL = 'https://api.pulsescore.net';

// CONFIRMED for soccer, tennis, volleyball, rugby and mma (real sample responses pulled for all
// five). Add an entry here only once a real response for that sport has actually been pulled —
// never guess. Note the rugby URL segment is "rugby-union" (hyphen) even though PulseScore's own
// event payloads report sport "rugby_union" (underscore) — see module docstring.
function sportSegment(sport: string): string | null {
  const s = String(sport || '').toLowerCase().trim();
  if (s === 'soccer' || s === 'football' || s === 'futebol') return 'soccer';
  if (s === 'tennis' || s === 'tenis' || s === 'ténis') return 'tennis';
  if (s === 'volleyball' || s === 'voleibol') return 'volleyball';
  if (s === 'rugby' || s === 'rugby-union' || s === 'rugby_union' || s === 'rúgbi') return 'rugby-union';
  if (s === 'mma' || s === 'ufc' || s === 'mixed martial arts' || s === 'luta') return 'mma';
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
  // Tennis/volleyball-specific markets (confirmed in real tennis/volleyball samples).
  TOTAL_GAMES: 'total_games',
  GAME_HANDICAP: 'game_hcp',
  // Rugby-specific markets (confirmed in real rugby samples).
  HALF_TIME_FULL_TIME: 'htft',
  EUROPEAN_HANDICAP: 'ehcp',
  RACE_TO_POINTS: 'race_to_points',
};

/** PulseScore dumps many genuinely distinct market types into one generic "OTHER" canonicalMarket
 *  bucket (CONFIRMED: a single tennis event carries "1, Result + Total", "2, Result + Total",
 *  "Sets Handicap", "Total Sets", "Sets Scoring", "Set / Match" all as canonicalMarket "OTHER") —
 *  slugging those all down to the literal string "other" collides them together, so OTHER falls
 *  back to a slug of the market's own rawName instead (still deduped as a final safety net in
 *  mapMarkets, in case two OTHER markets ever do share a rawName). */
function slugMarket(m: RawMarket): string {
  if (m.canonicalMarket === 'OTHER') {
    const fromName = String(m.rawName || '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
    return fromName || 'other';
  }
  return MARKET_KEY_SLUGS[m.canonicalMarket] || String(m.canonicalMarket || 'other').toLowerCase().replace(/[^a-z0-9]+/g, '_');
}

const ORDINAL_WORD_TO_DIGIT: Record<string, string> = {
  FIRST: '1',
  SECOND: '2',
  THIRD: '3',
  FOURTH: '4',
  FIFTH: '5',
  SIXTH: '6',
  SEVENTH: '7',
};

/** Turns a PulseScore market `period` into a short key suffix ("1h", "2s", ...), or null for
 *  FULL_TIME (no suffix needed). Confirmed periods so far: FULL_TIME, FIRST_HALF/SECOND_HALF
 *  (soccer), FIRST_SET/SECOND_SET (tennis/volleyball) — but this always returns SOME suffix for a
 *  non-FULL_TIME period, even one never seen before, because two raw markets that share a
 *  canonicalMarket+line but differ only in period (e.g. "MATCH_RESULT"/FULL_TIME vs
 *  "MATCH_RESULT"/FIRST_SET, both seen in the same tennis event) would otherwise collide on the
 *  same Market.key and silently overwrite each other in marketsAsRecord. */
function periodSuffix(period: string): string | null {
  const p = String(period || '').toUpperCase().trim();
  if (!p || p === 'FULL_TIME') return null;
  const m = /^(FIRST|SECOND|THIRD|FOURTH|FIFTH|SIXTH|SEVENTH)_(HALF|SET|QUARTER|PERIOD|ROUND)$/.exec(p);
  if (m) {
    const digit = ORDINAL_WORD_TO_DIGIT[m[1]];
    const unit = m[2] === 'HALF' ? 'h' : m[2] === 'SET' ? 's' : m[2] === 'QUARTER' ? 'q' : m[2] === 'PERIOD' ? 'p' : 'r';
    return `${digit}${unit}`;
  }
  return p.toLowerCase().replace(/[^a-z0-9]+/g, '_');
}

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
  const suffix = periodSuffix(m.period);
  const out: AppMarket[] = [];
  for (const [lineKey, selections] of groups) {
    const base = slugMarket(m);
    const key = [base, lineKey || null, suffix || null].filter(Boolean).join('_');
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
  // Final safety net: even with the OTHER-bucket rawName fallback above, two raw markets could in
  // principle still slug down to the same key (identical rawName, same line, same period). Rather
  // than let one silently overwrite the other wherever this feeds a Record<key, ...> (see
  // events.ts marketsAsRecord), disambiguate any repeat with a numeric suffix.
  const seen = new Map<string, number>();
  for (const mkt of out) {
    const n = (seen.get(mkt.key) || 0) + 1;
    seen.set(mkt.key, n);
    if (n > 1) mkt.key = `${mkt.key}__${n}`;
  }
  return out;
}

/** h2h (1X2) odds, read straight off the FULL_TIME MATCH_RESULT market — the same market every
 *  other consumer in this app expects as home_odd/draw_odd/away_odd. Falls back to the "Win
 *  (2Way)" market (CONFIRMED: plain "mma"-league Muay Thai fights carry no MATCH_RESULT at all,
 *  only this) so such an event doesn't report all-zero odds and get filtered out everywhere on the
 *  frontend despite having real, biddable odds — see module docstring. */
function extractH2H(raw: RawMarket[]): { home: number; draw: number; away: number } {
  const m = (raw || []).find((x) => x.canonicalMarket === 'MATCH_RESULT' && x.period === 'FULL_TIME' && x.isActive);
  const pick = (outcome: string) => Number(m?.selections.find((s) => s.canonicalOutcome === outcome && s.isActive)?.odds || 0);
  const home = pick('HOME');
  const away = pick('AWAY');
  if (home > 0 || away > 0) return { home, draw: pick('DRAW'), away };

  const win2way = (raw || []).find((x) => x.period === 'FULL_TIME' && x.isActive && /win.*2.?way/i.test(String(x.rawName || '')));
  const pickByName = (name: string) => Number(win2way?.selections.find((s) => s.isActive && String(s.rawName || '').toUpperCase() === name)?.odds || 0);
  return { home: pickByName('W1'), draw: 0, away: pickByName('W2') };
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

/** Fetches one event by its PulseScore eventId. CONFIRMED URL shape for tennis (real sample
 *  pulled for eventId 749243435); used for soccer/volleyball too on pattern consistency with the
 *  already-confirmed-identical /leagues and /events collection endpoints (see module docstring) —
 *  not a blind guess. Returns null on any failure or unexpected shape, same as fetchJson's callers
 *  elsewhere in this file. */
export async function fetchPulseScoreEvent(apiKey: string, sport: string, eventId: string): Promise<RawPulseScoreEvent | null> {
  if (!apiKeyOk(apiKey)) return null;
  const seg = sportSegment(sport);
  const id = String(eventId || '').trim();
  if (!seg || !id) return null;
  const url = `${PULSESCORE_BASE_URL}/api/onexbet/${seg}/events/${encodeURIComponent(id)}`;
  const json = await fetchJson(url, apiKey);
  const data = json && typeof json === 'object' ? json.data : null;
  return data && typeof data === 'object' ? (data as RawPulseScoreEvent) : null;
}

export const PULSESCORE_SPORTS = ['soccer', 'tennis', 'volleyball', 'rugby', 'mma'] as const;
