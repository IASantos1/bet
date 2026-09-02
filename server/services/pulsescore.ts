/**
 * PulseScore sports data client (api.pulsescore.net) — the sports data provider wired in after
 * GoalServe/sportsApiPro/API-Football/StatPal were all removed from this backend (see git history
 * around the "Remove dead parallel frontend..." / events.ts stub commits).
 *
 * Built against real sample responses pulled directly by the user (not guessed) for NINE confirmed
 * sports so far — soccer, tennis, volleyball, rugby (rugby union), mma, ice hockey, handball,
 * basketball, baseball — each with a /leagues page and an /events page. Three CONFIRMED endpoint
 * shapes:
 *   GET https://api.pulsescore.net/api/onexbet/{sport}/leagues?page=&limit=
 *   GET https://api.pulsescore.net/api/onexbet/{sport}/events?page=&limit=
 *   GET https://api.pulsescore.net/api/onexbet/{sport}/events/{eventId}   -> { data: <event> }
 *   headers: accept: * / *, x-secret: <key>, Accept-Encoding: gzip
 *
 * Only soccer/tennis/volleyball/rugby/mma/ice-hockey/handball/basketball/baseball are confirmed
 * working — `sport` is a path segment so other sports may follow the same shape, but that's
 * unverified; sportSegment() below only maps sports actually seen in a real response. The
 * single-event endpoint has actually been pulled for tennis, volleyball, mma, ice hockey, handball,
 * basketball and baseball (7 of the 8 non-soccer sports); using it for soccer/rugby too is a
 * pattern-consistency call (the /leagues and /events collection endpoints are already confirmed
 * byte-for-byte identical in shape across all nine sports), not a blind guess of an unseen URL.
 * Note: both rugby's and ice hockey's own `sport` field come back with an underscore
 * ("rugby_union", "ice_hockey") even though their URL path segments use a hyphen ("rugby-union",
 * "ice-hockey") — normalizePulseScoreEvent() always stamps the AppEvent with the canonical sport
 * string THIS module was called with, never PulseScore's raw `sport` field, so that mismatch never
 * leaks out.
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
 * Ice hockey period-naming quirk (CONFIRMED in a real single-event/-events sample): unlike every
 * other sport seen so far, which sticks to ONE naming style for its periods (soccer/rugby always
 * FIRST_HALF/SECOND_HALF, tennis/volleyball always FIRST_SET/SECOND_SET/...), ice hockey mixes
 * FIRST_HALF/SECOND_HALF for periods 1-2 with THIRD_PERIOD for period 3 in the very same match.
 * periodSuffix() already handles this correctly with no code change needed — it matches on the
 * generic (ordinal-word)_(unit-word) shape rather than hardcoding which unit word each sport uses.
 *
 * Basketball period quirk (CONFIRMED in a real single-event/-events sample): unlike ice hockey
 * (which just alternates naming style across DIFFERENT, non-overlapping periods of one match),
 * basketball events carry BOTH half-based markets (FIRST_HALF) AND quarter-based markets
 * (FIRST_QUARTER) CONCURRENTLY for the very same event — this module's key-slugging code needs no
 * change for it (periodSuffix() already yields distinct "1h" vs "1q" suffixes so the keys never
 * collide), but the frontend's dynamic tab-bucketing (dynamicMarketTabs.ts) needs a
 * basketball-specific bucketer that keeps halves and quarters in separate tabs rather than reusing
 * ice hockey's shared ordinal-only bucket.
 *
 * Baseball period quirk (CONFIRMED in a real single-event/-events sample): baseball uses an
 * "innings" period vocabulary never seen in any other sport so far — FIRST_INNING, SECOND_INNING,
 * NINTH_INNING, ... (ordinal-word_INNING, handled by periodSuffix()'s generic pattern once INNING
 * was added to its recognized unit words, plus NINTH/EIGHTH added to ORDINAL_WORD_TO_DIGIT to cover
 * a full 9-inning game) — and one genuinely new shape, FIRST_FIVE_INNINGS (a "first 5 innings"
 * market, common in baseball betting), which doesn't fit the ordinal_unit pattern at all and is
 * special-cased in periodSuffix() to a distinct "f5i" suffix. Baseball also carries a large block of
 * individual player-prop markets (canonicalMarket OTHER, rawName always prefixed "Players' stats
 * Pitchers."/"Players' stats Batters." — CONFIRMED in the real single-event sample) that the
 * frontend's classifyBaseballMarket buckets together under one "Estatísticas de Jogadores" tab
 * rather than scattering them across "Especiais", since the OTHER-bucket rawName-derived slug
 * reliably starts with "players_stats" for all of them.
 *
 * Live in-play feed (CONFIRMED via real /live-events?sport=<x> samples): PulseScore also exposes a
 *   GET https://api.pulsescore.net/api/onexbet/live-events?page=&limit=&sport=<sport>
 *   GET https://api.pulsescore.net/api/onexbet/live-events/sports
 * pair, separate from the per-sport /events endpoint above. Its events carry the same `markets`
 * shape (redundant with what the regular per-sport pull already ingests) but ALSO carry
 * `matchClock`/`score`/`statistics` fields that never appear in a regular /events or /leagues
 * response — previously (before this was confirmed) getEventResult() in routes/events.ts assumed
 * PulseScore had no score data at all; that's now known to be true only of the /events endpoint,
 * not of this dedicated feed. fetchPulseScoreLiveEvents()/extractLiveState() below pull just the
 * score/clock and merge them onto already-cached events (see refreshOnce() in routes/events.ts) —
 * this feed's markets/odds are intentionally NOT re-ingested, since the regular per-sport pull
 * already covers live matches' odds. The /live-events/sports discovery response also revealed FIVE
 * sports never confirmed anywhere else in this codebase — cricket, esports, futsal, padel, snooker —
 * which are NOT added to PULSESCORE_SPORTS/sportSegment() here, since only their existence and a
 * live event COUNT is confirmed, never a real /leagues or /events response for any of them; wiring
 * them in as full sports is a separate, larger decision than this live-score enrichment.
 *
 * Odds here already come normalized by PulseScore itself (canonicalMarket/canonicalOutcome enums,
 * decimal odds, `line` split out of the display label) — unlike GoalServe's raw XML-derived JSON,
 * there is no attribute-prefix bug and no per-sport wrapper-shape guessing needed.
 */

const PULSESCORE_BASE_URL = 'https://api.pulsescore.net';

// CONFIRMED for soccer, tennis, volleyball, rugby, mma, ice hockey and handball (real sample
// responses pulled for all seven). Add an entry here only once a real response for that sport has
// actually been pulled — never guess. Note the rugby/ice-hockey URL segments use a hyphen
// ("rugby-union", "ice-hockey") even though PulseScore's own event payloads report sport with an
// underscore ("rugby_union", "ice_hockey") — see module docstring. Handball has no such quirk: its
// URL segment and payload `sport` field are both the plain "handball".
export function sportSegment(sport: string): string | null {
  const s = String(sport || '').toLowerCase().trim();
  if (s === 'soccer' || s === 'football' || s === 'futebol') return 'soccer';
  if (s === 'tennis' || s === 'tenis' || s === 'ténis') return 'tennis';
  if (s === 'volleyball' || s === 'voleibol') return 'volleyball';
  if (s === 'rugby' || s === 'rugby-union' || s === 'rugby_union' || s === 'rúgbi') return 'rugby-union';
  if (s === 'ice-hockey' || s === 'ice_hockey' || s === 'icehockey' || s === 'hockey' || s === 'hóquei') return 'ice-hockey';
  if (s === 'mma' || s === 'ufc' || s === 'mixed martial arts' || s === 'luta') return 'mma';
  if (s === 'handball' || s === 'handebol') return 'handball';
  if (s === 'basketball' || s === 'basquete' || s === 'basquetebol') return 'basketball';
  if (s === 'baseball' || s === 'beisebol') return 'baseball';
  return null;
}

function apiKeyOk(apiKey: string): boolean {
  return typeof apiKey === 'string' && apiKey.trim().length > 0;
}

// ---- Rate limiting (CONFIRMED via a real production error: "Too many requests. Your MAX plan
// allows 3 request(s) per second per bookmaker.") ----
// refreshOnce() in routes/events.ts fires many sequential requests per cycle (9 sports x up to
// several /events pages, x2 once the /live-events pass was added) with zero delay between them —
// each request typically completes in well under 333ms, so without pacing this easily bursts past
// 3/sec, which is exactly what produced real 429s in production. requestGate() serializes every
// request issued through fetchJson (regardless of caller — refreshOnce()'s sequential per-sport
// loops, and any concurrent single-event resolveEvent() fallback) and enforces a minimum gap
// between dispatch times, shared globally across this whole module.
// Caveat this can't cover: if the server runs multiple replicas of this process against the same
// API key, each replica paces itself independently, so the combined rate across replicas could
// still exceed 3/sec — this only guarantees pacing within one process.
// History:
//   420ms → hit production 429s after cold starts (pacing was too tight against real jitter).
//   520ms → still rare 429s on pages 1-5 of the high-volume sports within the first minute
//   (because the 3 WS connect attempts also count against the same plan-level token bucket,
//   confirmed via the plan 4429 close reason: "3-connection limit").
//   Widened to 580ms + ±80ms jitter (~1.6-1.8 req/sec sustained). The MAX plan allows 3
//   req/sec; intentionally leaving ~40% of the budget unused during normal operation so
//   transient spikes (page retries, concurrent resolveEvent() fallbacks, live-events fast
//   polling) don't have to fight for tokens against the baseline pre-match cycle.
const MIN_REQUEST_INTERVAL_MS = 580; // ~1.7 req/sec sustained, wide headroom vs 3.0
const GATE_JITTER_MS = 80;            // ±80ms random offset — flattens rigid request cadence
const RETRY_BACKOFF_FLOOR_MS = 1600;
let lastDispatchAt = 0;
let requestGateChain: Promise<void> = Promise.resolve();

function requestGate(): Promise<void> {
  const gated = requestGateChain.then(async () => {
    const jitter = Math.random() * 2 * GATE_JITTER_MS - GATE_JITTER_MS;
    const wait = Math.max(0, lastDispatchAt + MIN_REQUEST_INTERVAL_MS + jitter - Date.now());
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
    lastDispatchAt = Date.now();
  });
  requestGateChain = gated;
  return gated;
}

/** A 401 ("User is not authorized") is a credentials problem — retrying with the same bad
 *  PULSESCORE_API_KEY value would never help, so it's surfaced immediately via console.error like
 *  any other non-2xx status, same as before. A 429 is different: it's this client hitting
 *  PulseScore's own confirmed rate limit, which requestGate() above already paces against but can
 *  still transiently hit (e.g. right after a redeploy resets `lastDispatchAt`) — retried up to
 *  once for paginated pre-match pulls (those pages will simply be revisited on the next 30s cycle
 *  anyway, so stacking retries just deepens a 429 cascade) and up to twice for live/fast-poll
 *  pages where freshness actually matters. Retry backoff floor is now 1200ms (not 500ms), with
 *  exponential stepping so a cluster of colliding retries doesn't re-429 as a batch. */
async function fetchJson(
  url: string,
  apiKey: string,
  timeoutMs = 12000,
  retriesLeft = 1,
  retryAttempt = 0,
): Promise<any | null> {
  await requestGate();
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), Math.max(1000, timeoutMs));
  try {
    const res = await fetch(url, {
      headers: { accept: '*/*', 'x-secret': apiKey, 'accept-encoding': 'gzip' },
      signal: controller.signal,
    });
    if (res.status === 429 && retriesLeft > 0) {
      const retryAfterHeader = typeof (res as any)?.headers?.get === 'function' ? (res as any).headers.get('retry-after') : null;
      const retryAfterSec = Number(retryAfterHeader);
      const explicitSec = Number.isFinite(retryAfterSec) && retryAfterSec > 0 ? retryAfterSec * 1000 : 0;
      const steppedFloor = RETRY_BACKOFF_FLOOR_MS * Math.pow(2, retryAttempt);
      const backoffMs = Math.max(explicitSec, steppedFloor);
      console.error('[pulsescore] 429 rate limited, retrying in', backoffMs, 'ms (attempt', retryAttempt + 1, '):', url);
      await new Promise((resolve) => setTimeout(resolve, backoffMs));
      clearTimeout(t);
      return fetchJson(url, apiKey, timeoutMs, retriesLeft - 1, retryAttempt + 1);
    }
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

export type RawSelection = {
  canonicalOutcome: string;
  rawName: string;
  odds: number;
  rawOdds: string;
  isActive: boolean;
  selectionId: string;
  line?: number;
};

export type RawMarket = {
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

// ---- Live in-play feed (CONFIRMED via real /live-events?sport=<x> samples for soccer, tennis,
// basketball, ice-hockey, volleyball and baseball, plus an empty-but-valid response for mma) — a
// DEDICATED feed, separate from the per-sport /events endpoint above. Its events carry the exact
// same `markets` shape (so its
// odds/markets are redundant with what the regular per-sport pull already ingests), but ALSO carry
// `matchClock`/`score`/`statistics`, none of which ever appear in a regular /events or /leagues
// response — this is the only confirmed source of real-time score/clock data PulseScore offers. See
// fetchPulseScoreLiveEvents() below. */
type RawLiveMatchClock = { minute?: number; second?: number; period?: string; periodId?: string };
type RawLiveScore = { home?: string; away?: string; info?: string };
export type RawPulseScoreLiveEvent = RawPulseScoreEvent & {
  matchClock?: RawLiveMatchClock;
  score?: RawLiveScore;
  // Sport-dependent freeform block (CONFIRMED shapes so far: football -> {home,away: {yellowCards,
  // redCards, corners}}, tennis -> {sets: {home: number[], away: number[]}}) — passed through
  // untyped since only two sports' shapes have actually been seen and no consumer needs it yet.
  statistics?: Record<string, unknown>;
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
  // Populated only when a live-events sample matched this event by eventId (see
  // fetchPulseScoreLiveEvents()/mergeLiveState() below) — absent (not 0/0 or 0) for any event we
  // have no live-state sample for, so a consumer can't mistake "unknown" for "0-0 right now".
  score?: { home: number; away: number };
  minute?: number;
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
  // EIGHTH/NINTH added for baseball's innings (CONFIRMED: NINTH_INNING in a real sample; EIGHTH
  // completes the sequence between the confirmed SECOND_INNING and NINTH_INNING for a full 9-inning
  // game, same pattern-completion reasoning already applied to FOURTH-SEVENTH above).
  EIGHTH: '8',
  NINTH: '9',
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
  // Baseball-specific shape (CONFIRMED in a real sample): "first 5 innings" markets don't fit the
  // ordinal_unit pattern below at all — special-cased to its own distinct suffix.
  if (p === 'FIRST_FIVE_INNINGS') return 'f5i';
  const m = /^(FIRST|SECOND|THIRD|FOURTH|FIFTH|SIXTH|SEVENTH|EIGHTH|NINTH)_(HALF|SET|QUARTER|PERIOD|ROUND|INNING)$/.exec(p);
  if (m) {
    const digit = ORDINAL_WORD_TO_DIGIT[m[1]];
    const unit = m[2] === 'HALF' ? 'h' : m[2] === 'SET' ? 's' : m[2] === 'QUARTER' ? 'q' : m[2] === 'PERIOD' ? 'p' : m[2] === 'INNING' ? 'i' : 'r';
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
 *  frontend despite having real, biddable odds — see module docstring.
 *  WebSocket caveat: the onexbet /ws/live feed occasionally drops the `period` field entirely on
 *  MATCH_RESULT (or reports it as "LIVE"/"MATCH") — the initial MATCH_RESULT + FULL_TIME find()
 *  would miss it, so we progressively widen the search to ANY active MATCH_RESULT (any period)
 *  that has at least one of HOME/AWAY with real odds, and finally to ANY market with 2 or 3
 *  selections whose canonicalOutcomes (or rawNames) clearly spell out {HOME,AWAY,DRAW} — all so a
 *  live event that has real 1X2 odds on the wire doesn't render as `-----` in the frontend card.*/
function extractH2H(raw: RawMarket[]): { home: number; draw: number; away: number } {
  const markets = raw || [];

  function pickFromOutcomes(m: RawMarket): { home: number; draw: number; away: number } | null {
    const sel = m.selections;
    const pickCO = (outcome: string) => Number(sel.find((s) => s.canonicalOutcome === outcome && s.isActive)?.odds || 0);
    let home = pickCO('HOME');
    let away = pickCO('AWAY');
    let draw = pickCO('DRAW');
    if (home === 0) home = Number(sel.find((s) => s.isActive && (/^(w1|home|casa|1|h)$/i.test(String(s.rawName || '')) || /^(w1|home|casa|1|h)$/i.test(String(s.canonicalOutcome || ''))))?.odds || 0);
    if (away === 0) away = Number(sel.find((s) => s.isActive && (/^(w2|away|fora|visitante|2|a)$/i.test(String(s.rawName || '')) || /^(w2|away|fora|visitante|2|a)$/i.test(String(s.canonicalOutcome || ''))))?.odds || 0);
    if (draw === 0) draw = Number(sel.find((s) => s.isActive && (/^(x|draw|empate|d|tie|e)$/i.test(String(s.rawName || '')) || /^(x|draw|empate|d|tie|e)$/i.test(String(s.canonicalOutcome || ''))))?.odds || 0);
    if (home > 0 || away > 0 || draw > 0) return { home, draw, away };
    const homeByName = Number(sel.find((s) => s.isActive && /^(w1|home|casa|1)$/i.test(String(s.rawName || '')))?.odds || 0);
    const awayByName = Number(sel.find((s) => s.isActive && /^(w2|away|fora|visitante|2)$/i.test(String(s.rawName || '')))?.odds || 0);
    const drawByName = Number(sel.find((s) => s.isActive && /^(x|draw|empate|d)$/i.test(String(s.rawName || '')))?.odds || 0);
    if (homeByName > 0 || awayByName > 0 || drawByName > 0) {
      return { home: home || homeByName, draw: draw || drawByName, away: away || awayByName };
    }
    return null;
  }

  const exact = markets.find((x) => x.canonicalMarket === 'MATCH_RESULT' && x.period === 'FULL_TIME' && x.isActive);
  if (exact) {
    const p = pickFromOutcomes(exact);
    if (p) return p;
  }

  // step 2: any active MATCH_RESULT any period (WS live often drops the period field)
  const anyMR = markets.find((x) => x.canonicalMarket === 'MATCH_RESULT' && x.isActive);
  if (anyMR) {
    const p = pickFromOutcomes(anyMR);
    if (p) return p;
  }

  // step 2.5: rawName alias match (feeds that don't set canonicalMarket properly — e.g. Chile Primera División, low-liquidity leagues)
  const aliasMR = markets.find((x) => {
    if (!x.isActive) return false;
    const name = String(x.rawName || '').toLowerCase();
    return /(^|[^a-z])(1x2|h2h|match.?winner|full.?time.?result|resultado.?final|vencedor)([^a-z]|$)/i.test(name) || /^\s*1\s*[,:x]\s*2\s*/.test(name);
  });
  if (aliasMR) {
    const p = pickFromOutcomes(aliasMR);
    if (p) return p;
  }

  // step 2.6: ANY market with at least 2 selections whose labels CLEARLY indicate {home,away} — final defensive fallback for unrecognised feed aliases
  const anyLooksLike1X2 = markets.find((m) => {
    if (!m.isActive) return false;
    const s = (m.selections || []).filter((x) => x.isActive);
    if (s.length < 2 || s.length > 3) return false;
    let hasH = false, hasA = false, hasD = false;
    for (const sel of s) {
      const n = String(sel.rawName || sel.canonicalOutcome || '').toLowerCase();
      if (/w1|^home$|^casa$|^1$/.test(n)) hasH = true;
      else if (/w2|^away$|^fora$|^visitante$|^2$/.test(n)) hasA = true;
      else if (/^x$|^draw$|^empate$|^d$|^tie$/.test(n)) hasD = true;
    }
    return (hasH && hasA) && (s.length === 2 || hasD);
  });
  if (anyLooksLike1X2) {
    const p = pickFromOutcomes(anyLooksLike1X2);
    if (p) return p;
  }

  // step 3: Win 2Way fallback (mma Muay Thai-style fights with no MATCH_RESULT)
  const win2way = markets.find((x) => x.isActive && /win.*2.?way/i.test(String(x.rawName || '')));
  if (win2way) {
    const pickByName = (name: string) => Number(win2way.selections.find((s) => s.isActive && String(s.rawName || '').toUpperCase() === name)?.odds || 0);
    return { home: pickByName('W1'), draw: 0, away: pickByName('W2') };
  }

  // step 4: scan all active markets for the first one that looks like a 2/3-way 1X2 market,
  // regardless of canonicalMarket name (defense against feed aliases we haven't hardcoded).
  for (const m of markets) {
    if (!m.isActive) continue;
    const p = pickFromOutcomes(m);
    if (p) return p;
  }
  return { home: 0, draw: 0, away: 0 };
}

export function normalizePulseScoreEvent(sport: string, raw: RawPulseScoreEvent): AppEvent {
  const { home, draw, away } = extractH2H(raw.markets);
  const base: AppEvent = {
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
  const rawAny = raw as any;
  if (rawAny.matchClock) (base as any).matchClock = rawAny.matchClock;
  if (rawAny.score) (base as any).score = rawAny.score;
  if (rawAny.statistics) (base as any).statistics = rawAny.statistics;
  if (rawAny.moreInfo) (base as any).moreInfo = rawAny.moreInfo;
  if (Array.isArray(rawAny.events) && rawAny.events.length > 0) (base as any).events = rawAny.events;
  if (Array.isArray(rawAny.incidents) && rawAny.incidents.length > 0) (base as any).incidents = rawAny.incidents;
  return base;
}

/** Fetches every page of the flat /events list for a sport (bounded by a safety cap — the real
 *  total can be thousands of pages deep on soccer alone, but pages ~25+ are almost always fixtures
 *  2-3 weeks out, stable enough that re-pulling them every 30s is pure waste and a guaranteed way
 *  to 429 the MAX-plan 3/sec budget. Cold-start run confirmed: 49 pages of soccer x 100 items =
 *  ~22% of a full 3/sec minute just for ONE sport. Default capped to the near-future horizon that
 *  actually matters for a betting product; callers can still widen on demand via opts. */
export async function fetchPulseScoreEvents(
  apiKey: string,
  sport: string,
  opts: { pageLimit?: number; maxPages?: number } = {},
): Promise<RawPulseScoreEvent[]> {
  if (!apiKeyOk(apiKey)) return [];
  const seg = sportSegment(sport);
  if (!seg) return [];
  const pageLimit = opts.pageLimit ?? 100;
  const maxPages = opts.maxPages ?? 20;
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
  const maxPages = opts.maxPages ?? 20;
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

export const PULSESCORE_SPORTS = ['soccer', 'tennis', 'volleyball', 'rugby', 'mma', 'ice-hockey', 'handball', 'basketball', 'baseball'] as const;

// The `sport` query value(s) /live-events expects — CONFIRMED directly via real curl responses for
// soccer, tennis, mma (empty-but-valid), basketball, ice-hockey ("ice_hockey", underscore),
// volleyball and baseball. `handball` is the only one still fully unconfirmed for this endpoint
// (zero live matches in every sample so far) — follows the "plain name, no quirk" pattern already
// established for its own /events endpoint.
//
// `rugby` needs TWO query values, not one — CONFIRMED via a real /events sample (rugby-events.json
// in this integration's sample set): PulseScore's "rugby-union" /events URL segment, which this
// app's single canonical 'rugby' sport is built on, actually lumps BOTH rugby codes together — real
// rugby LEAGUE competitions ("Australia. NRL", "England. Super League") appear side by side with
// rugby UNION ones ("New Zealand. Bunnings NPC", "France. Pro D2") in the very same /events
// response. The live-events feed does NOT merge them the same way: a real zero-result live-events
// query for an unrelated sport (basketball) once echoed back `"sport": "rugby_league"` — a value
// never otherwise used in this file — which only makes sense if live-events tracks rugby league as
// its own distinct sport bucket, separate from 'rugby_union'. Querying only 'rugby_union' here would
// mean a live NRL or Super League match could never be detected as live, even though its pregame
// odds are already correctly ingested under 'rugby' — so both values are queried and merged.
const LIVE_EVENTS_SPORT_PARAMS: Record<string, string[]> = {
  soccer: ['soccer'],
  tennis: ['tennis'],
  volleyball: ['volleyball'],
  rugby: ['rugby_union', 'rugby_league'],
  mma: ['mma'],
  'ice-hockey': ['ice_hockey'],
  handball: ['handball'],
  basketball: ['basketball'],
  baseball: ['baseball'],
};

/** Fetches every page of the dedicated /live-events feed for a sport (bounded low on purpose — the
 *  real /live-events/sports sample showed 170 live events across ALL nine sports COMBINED at one
 *  moment, so limit=100 × 3 pages is comfortably more than any single-sport live feed will ever
 *  realistically hold. Capped tighter than /events because live bursts compete for the same 3/sec
 *  budget with fast-poll timers and in-flight pre-match page pulls on cold start. */
export async function fetchPulseScoreLiveEvents(
  apiKey: string,
  sport: string,
  opts: { pageLimit?: number; maxPages?: number } = {},
): Promise<RawPulseScoreLiveEvent[]> {
  if (!apiKeyOk(apiKey)) return [];
  const params = LIVE_EVENTS_SPORT_PARAMS[sport];
  if (!params || params.length === 0) return [];
  const pageLimit = opts.pageLimit ?? 100;
  const maxPages = opts.maxPages ?? 3;
  const out: RawPulseScoreLiveEvent[] = [];
  for (const param of params) {
    for (let page = 1; page <= maxPages; page += 1) {
      const url = `${PULSESCORE_BASE_URL}/api/onexbet/live-events?page=${page}&limit=${pageLimit}&sport=${encodeURIComponent(param)}`;
      const json: EventsResponse | null = await fetchJson(url, apiKey);
      if (!json || !Array.isArray(json.events)) break;
      out.push(...(json.events as RawPulseScoreLiveEvent[]));
      if (!json.hasNextPage) break;
    }
  }
  return out;
}

// ---- PulseScore Results endpoint (CONFIRMED curl samples user L140 curl):
//   GET /api/onexbet/results/sports -> { total, sports:[{name,resultCount}]}  (sport name no URL é snake_case — soccer, tennis etc)
//   GET /api/onexbet/results?sport=tennis&page=1&limit=20 -> { events:[{eventId, home, away, league, score:{home,away,info}, markets?}]
const RESULTS_SPORT_PARAMS: Record<string, string[]> = {
  soccer: ['soccer'],
  tennis: ['tennis'],
  volleyball: ['volleyball'],
  'american-football': ['american_football'],
  rugby: ['rugby_union', 'rugby_league'],
  mma: ['mma'],
  'ice-hockey': ['ice_hockey'],
  handball: ['handball'],
  basketball: ['basketball'],
  baseball: ['baseball'],
  cricket: ['cricket'],
  futsal: ['futsal'],
  badminton: ['badminton'],
  table_tennis: ['table_tennis'],
  'table-tennis': ['table_tennis'],
  snooker: ['snooker'],
  padel: ['padel'],
  boxing: ['boxing'],
  esports: ['esports'],
  motorsports: ['motorsports'],
  'field-hockey': ['field_hockey'],
  field_hockey: ['field_hockey'],
  'australian-rules': ['australian_rules'],
  waterpolo: ['water_polo'],
  'water-polo': ['water_polo'],
};

export type RawPulseScoreResultEvent = {
  eventId: string;
  home: string;
  away: string;
  league?: string;
  startTime?: string;
  score?: { home?: string | number; away?: string | number; info?: string } | null;
  live?: boolean;
  markets?: RawMarket[];
};

type ResultsResponse = {
  total?: number;
  events?: RawPulseScoreResultEvent[];
  hasNextPage?: boolean;
};

/** Recent finalized results list per sport — /results endpoint confirms immediately a match has ended
 *  (its final score is listed in /results which only lists finalized matches). Used by events service
 *  to mark is_live=0 the moment a match actually ends instead of waiting for the /live-events
 *  list to stop returning it (can delay minutes). Pagination bounded: pages 1-2 cover 40 most recent
 *  results per sport — enough to catch any game that just finished. */
export async function fetchPulseScoreResults(
  apiKey: string,
  sport: string,
  opts: { pageLimit?: number; maxPages?: number } = {},
): Promise<RawPulseScoreResultEvent[]> {
  if (!apiKeyOk(apiKey)) return [];
  const params = RESULTS_SPORT_PARAMS[sport];
  if (!params || params.length === 0) return [];
  const pageLimit = opts.pageLimit ?? 20;
  const maxPages = opts.maxPages ?? 2;
  const out: RawPulseScoreResultEvent[] = [];
  for (const param of params) {
    for (let page = 1; page <= maxPages; page += 1) {
      const url = `${PULSESCORE_BASE_URL}/api/onexbet/results?page=${page}&limit=${pageLimit}&sport=${encodeURIComponent(param)}`;
      const json: ResultsResponse | null = await fetchJson(url, apiKey);
      if (!json || !Array.isArray(json.events)) break;
      out.push(...(json.events as RawPulseScoreResultEvent[]));
      if (!json.hasNextPage) break;
    }
  }
  return out;
}

/** Extracts just the real-time score/clock off a /live-events sample (CONFIRMED fields: `score.home`/
 *  `score.away` come back as numeric STRINGS, e.g. "2"/"1"; `matchClock.minute` as a number) — never
 *  fabricates a 0-0/minute-0 default when the source data is missing or unparseable, so a caller can
 *  tell "no live-state sample for this event" apart from "genuinely 0-0 at minute 0".
 *  Note (CONFIRMED, passed through verbatim, not reinterpreted here): `matchClock.minute`'s meaning
 *  is sport-dependent — soccer counts UP (elapsed minutes, e.g. 89), basketball counts DOWN within
 *  the current quarter (e.g. "minute": 5 alongside `score.info`: "6 min remaining"). Tennis has no
 *  `minute` at all (sets are tracked by `score`/period, not a clock), so `minute` is simply absent
 *  for it — never a fabricated 0. */
export function extractLiveState(raw: RawPulseScoreLiveEvent): { score?: { home: number; away: number }; minute?: number } {
  const out: { score?: { home: number; away: number }; minute?: number } = {};
  if (raw.score && (raw.score.home !== undefined || raw.score.away !== undefined)) {
    const home = Number(raw.score.home);
    const away = Number(raw.score.away);
    if (Number.isFinite(home) && Number.isFinite(away)) out.score = { home, away };
  }
  if (raw.matchClock && typeof raw.matchClock.minute === 'number' && Number.isFinite(raw.matchClock.minute)) {
    out.minute = raw.matchClock.minute;
  }
  return out;
}
