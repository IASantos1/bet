import { WebSocket } from 'ws';
import {
  type AppEvent,
  type AppMarket,
  type AppSelection,
  normalizePulseScoreEvent,
  PULSESCORE_SPORTS,
  type RawMarket,
  type RawPulseScoreLiveEvent,
  type RawSelection,
  sportSegment,
} from './pulsescore';

const PULSESCORE_WS_BASE = 'wss://api.pulsescore.net/api/onexbet/ws/live';

/** Plan PulseScore MAX: 3 simultaneous WS slots max. User can override via env var
 *  PULSESCORE_WS_SLOTS = "soccer,tennis,basketball"   (default)
 *                      = "soccer,tennis,volleyball"
 *                      = "soccer,tennis,baseball"
 *  Tennis is ALWAYS kept as one slot (per user mandate) — if the user-provided list
 *  doesn't include tennis, we append it and drop the last item to keep the cap at 3. */
function resolveWsLiveSports(): readonly string[] {
  const DEFAULT = ['soccer', 'tennis', 'basketball'] as const;
  const envRaw = typeof process !== 'undefined' ? (process.env?.PULSESCORE_WS_SLOTS as string | undefined) : undefined;
  if (!envRaw) return DEFAULT;
  const fromEnv = envRaw
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  const normalized = fromEnv.map((s) => sportSegment(s)).filter((s): s is string => Boolean(s));
  const deDup = Array.from(new Set(normalized));
  // Hard cap: 3 slots MAX (MAX plan limit per PulseScore). Always keep tennis.
  const mustKeep = 'tennis';
  const hasTennis = deDup.includes(mustKeep);
  let result = hasTennis ? [...deDup] : [mustKeep, ...deDup];
  if (result.length > 3) result = result.slice(0, 3);
  if (result.length === 0) return DEFAULT;
  return Object.freeze(result);
}

export const WS_LIVE_SPORTS: readonly string[] = resolveWsLiveSports();
export type WsLiveSport = string;

const FAST_POLL_LIVE_SPORTS_LOCAL = ['ice-hockey', 'baseball', 'volleyball'] as const;
export const FAST_POLL_LIVE_SPORTS = FAST_POLL_LIVE_SPORTS_LOCAL;
export type FastPollLiveSport = (typeof FAST_POLL_LIVE_SPORTS_LOCAL)[number];

const RECONNECT_BASE_MS = 6_000;
const RECONNECT_STEP_MS = 2_000;
const RECONNECT_MAX_MS = 60_000;
const WS_STARTUP_STAGGER_MS = 6_000;
const FRAME_TIMEOUT_MS = 15_000;
const PING_INTERVAL_MS = 10_000;
const WS_CONNECT_MIN_GAP_MS = 5_100;

export type LiveUpdate = {
  sport: string;
  event: AppEvent;
  receivedAt: number;
};

export type PulseScoreWsStatus = {
  sport: string;
  connected: boolean;
  lastFrameAt: number | null;
  framesReceived: number;
  reconnectCount: number;
  lastError: string | null;
};

export type PulseScoreWsClient = {
  getStatus: () => PulseScoreWsStatus[];
  stop: () => void;
  onEventUpdate: (sport: WsLiveSport, handler: (updates: LiveUpdate[]) => void) => () => void;
  onSportLiveIds: (sport: WsLiveSport, handler: (ids: Set<string>) => void) => () => void;
  /** Resolves once every scheduled WS slot has connected successfully on startup.
   *  Used by the REST refresh cycle to delay its cold-start burst until the WS
   *  handshake has fully settled — opening 3 WebSockets and firing 9 paginated
   *  REST pulls simultaneously was saturating the MAX plan's 3 req/sec token
   *  bucket (confirmed: 429s on page 2 of /soccer/events before the 3rd WS
   *  had even finished the connect handshake). */
  waitUntilStarted: () => Promise<void>;
};

const CANONICAL_OUTCOME_MAP: Record<string, string> = {
  home: 'HOME',
  away: 'AWAY',
  draw: 'DRAW',
  '1': 'HOME',
  '2': 'AWAY',
  x: 'DRAW',
  '1x': 'HOME_OR_DRAW',
  'x2': 'DRAW_OR_AWAY',
  '12': 'HOME_OR_AWAY',
  over: 'OVER',
  under: 'UNDER',
  yes: 'YES',
  no: 'NO',
};

const CANONICAL_MARKET_ALIASES: Record<string, string> = {
  MATCH_WINNER: 'MATCH_RESULT',
  '1X2': 'MATCH_RESULT',
  'FULL TIME RESULT': 'MATCH_RESULT',
  'MATCH WINNER': 'MATCH_RESULT',
  WINNER: 'MATCH_RESULT',
  TOTAL_GOALS: 'OVER_UNDER',
  TOTAL: 'OVER_UNDER',
  OVER_UNDER: 'OVER_UNDER',
  BTTS: 'BOTH_TEAMS_TO_SCORE',
  'BOTH TEAMS TO SCORE': 'BOTH_TEAMS_TO_SCORE',
  GG: 'BOTH_TEAMS_TO_SCORE',
  DC: 'DOUBLE_CHANCE',
  DOUBLE_CHANCE: 'DOUBLE_CHANCE',
  AH: 'ASIAN_HANDICAP',
  ASIAN_HANDICAP: 'ASIAN_HANDICAP',
  HANDICAP: 'ASIAN_HANDICAP',
  DNB: 'DRAW_NO_BET',
  'DRAW NO BET': 'DRAW_NO_BET',
  CORRECT_SCORE: 'CORRECT_SCORE',
  HT_FT: 'HALF_TIME_FULL_TIME',
  HALF_TIME_FULL_TIME: 'HALF_TIME_FULL_TIME',
  FIRST_TO_SCORE: 'FIRST_TEAM_TO_SCORE',
  'FIRST TEAM TO SCORE': 'FIRST_TEAM_TO_SCORE',
  ODD_EVEN: 'TOTAL_GOALS_ODD_EVEN',
  TOTAL_GAMES: 'TOTAL_GAMES',
  GAME_HANDICAP: 'GAME_HANDICAP',
  SET_HANDICAP: 'GAME_HANDICAP',
  RACE_TO_POINTS: 'RACE_TO_POINTS',
  EUROPEAN_HANDICAP: 'EUROPEAN_HANDICAP',
};

function normalizeCanonicalMarket(cm: string | undefined): string {
  const raw = String(cm || 'OTHER').trim().toUpperCase().replace(/\s+/g, '_');
  if (CANONICAL_MARKET_ALIASES[raw]) return CANONICAL_MARKET_ALIASES[raw];
  // also try without underscore for aliases whose key had punctuation
  const withoutUnderscore = raw.replace(/_/g, ' ');
  if (CANONICAL_MARKET_ALIASES[withoutUnderscore] && !CANONICAL_MARKET_ALIASES[raw]) {
    return CANONICAL_MARKET_ALIASES[withoutUnderscore];
  }
  return cm ? raw : 'OTHER';
}

const PERIOD_MAP: Record<string, string> = {
  fulltime: 'FULL_TIME',
  'first half': 'FIRST_HALF',
  'second half': 'SECOND_HALF',
  first_half: 'FIRST_HALF',
  second_half: 'SECOND_HALF',
  'first set': 'FIRST_SET',
  'second set': 'SECOND_SET',
  'third set': 'THIRD_SET',
  'fourth set': 'FOURTH_SET',
  'fifth set': 'FIFTH_SET',
  first_set: 'FIRST_SET',
  second_set: 'SECOND_SET',
  third_set: 'THIRD_SET',
  fourth_set: 'FOURTH_SET',
  fifth_set: 'FIFTH_SET',
  'first quarter': 'FIRST_QUARTER',
  'second quarter': 'SECOND_QUARTER',
  'third quarter': 'THIRD_QUARTER',
  'fourth quarter': 'FOURTH_QUARTER',
  first_quarter: 'FIRST_QUARTER',
  second_quarter: 'SECOND_QUARTER',
  third_quarter: 'THIRD_QUARTER',
  fourth_quarter: 'FOURTH_QUARTER',
  'first period': 'FIRST_PERIOD',
  'second period': 'SECOND_PERIOD',
  'third period': 'THIRD_PERIOD',
  first_period: 'FIRST_PERIOD',
  second_period: 'SECOND_PERIOD',
  third_period: 'THIRD_PERIOD',
  'first inning': 'FIRST_INNING',
  'second inning': 'SECOND_INNING',
  'third inning': 'THIRD_INNING',
  'fourth inning': 'FOURTH_INNING',
  'fifth inning': 'FIFTH_INNING',
  'sixth inning': 'SIXTH_INNING',
  'seventh inning': 'SEVENTH_INNING',
  'eighth inning': 'EIGHTH_INNING',
  'ninth inning': 'NINTH_INNING',
  first_inning: 'FIRST_INNING',
  second_inning: 'SECOND_INNING',
  third_inning: 'THIRD_INNING',
  fourth_inning: 'FOURTH_INNING',
  fifth_inning: 'FIFTH_INNING',
  sixth_inning: 'SIXTH_INNING',
  seventh_inning: 'SEVENTH_INNING',
  eighth_inning: 'EIGHTH_INNING',
  ninth_inning: 'NINTH_INNING',
  'first five innings': 'FIRST_FIVE_INNINGS',
  first_five_innings: 'FIRST_FIVE_INNINGS',
};

function toCanonicalOutcome(name: string, homeTeam?: string, awayTeam?: string): string {
  const n = String(name || '').trim().toLowerCase();
  if (!n) return 'OTHER';
  if (homeTeam && n === homeTeam.toLowerCase()) return 'HOME';
  if (awayTeam && n === awayTeam.toLowerCase()) return 'AWAY';
  if (CANONICAL_OUTCOME_MAP[n]) return CANONICAL_OUTCOME_MAP[n];
  for (const key of Object.keys(CANONICAL_OUTCOME_MAP)) {
    if (n.startsWith(key)) return CANONICAL_OUTCOME_MAP[key];
  }
  if (n.includes('over')) return 'OVER';
  if (n.includes('under')) return 'UNDER';
  if (n.includes('draw') || n === 'empate' || n === 'x') return 'DRAW';
  const ht = String(homeTeam || '').trim().toLowerCase();
  const at = String(awayTeam || '').trim().toLowerCase();
  // onexbet shortens long team names inside selection.name (e.g. "Club Social y D." vs
  // "Club Social y Deportivo") → the 1st 5+ chars must agree (handles most abbreviation).
  if (ht) {
    const min = Math.min(n.length, ht.length);
    if (min >= 5 && n.slice(0, min) === ht.slice(0, min)) return 'HOME';
  }
  if (at) {
    const min = Math.min(n.length, at.length);
    if (min >= 5 && n.slice(0, min) === at.slice(0, min)) return 'AWAY';
  }
  return 'OTHER';
}

function mapPeriod(period: string): string {
  const p = String(period || '').trim();
  if (!p) return 'FULL_TIME';
  const upper = p.toUpperCase();
  if (upper === 'FULL_TIME' || upper === 'FULLTIME') return 'FULL_TIME';
  const mapped = PERIOD_MAP[p.toLowerCase()];
  if (mapped) return mapped;
  return p;
}

type WsRawSelection = { name?: string; rawName?: string; canonicalOutcome?: string; decimal?: string | number; odds?: number; isActive?: boolean; selectionId?: string; line?: number };
type WsRawMarket = {
  canonicalMarket?: string;
  rawName?: string;
  period?: string;
  line?: number;
  isActive?: boolean;
  selections?: WsRawSelection[];
  marketId?: string;
};
type WsRawEvent = {
  eventId?: string;
  sport?: string;
  home?: string;
  away?: string;
  league?: string;
  live?: boolean;
  startTime?: string;
  markets?: WsRawMarket[];
  matchClock?: { minute?: number; second?: number; period?: string; periodId?: string };
  score?: { home?: string | number; away?: string | number; info?: string };
  statistics?: Record<string, unknown>;
};
type WsFrame = WsRawEvent[] | { events?: WsRawEvent[] } | { data?: WsRawEvent[] | WsRawEvent } | WsRawEvent;

function wsSelectionToRaw(s: WsRawSelection, homeTeam?: string, awayTeam?: string): RawSelection {
  const name = String(s.name || s.rawName || '');
  const oddNum =
    typeof s.odds === 'number' && Number.isFinite(s.odds)
      ? s.odds
      : Number(s.decimal) || 0;
  // The onexbet WS feed sometimes mirrors the exact REST schema — selections
  // already carry a precomputed `canonicalOutcome` in {HOME,AWAY,DRAW,OVER,...}
  // plus numeric `odds`. Trust that if present (avoids re-parsing "Draw"→"DRAW"
  // which works but also crucially handles team-name selections like "Club Social
  // y D." whose canonicalOutcome is already HOME/AWAY upstream and would otherwise
  // fall into OTHER if the abbreviation fuzzy match ever misses).
  const co = s.canonicalOutcome?.trim().toUpperCase();
  const canonicalOutcome = co ? co : toCanonicalOutcome(name, homeTeam, awayTeam);
  return {
    canonicalOutcome,
    rawName: name,
    odds: oddNum,
    rawOdds: String(s.decimal != null ? s.decimal : oddNum),
    isActive: s.isActive !== false,
    selectionId: s.selectionId || `${name}_${oddNum}`,
    line: typeof s.line === 'number' ? s.line : undefined,
  };
}

function wsMarketToRaw(m: WsRawMarket, homeTeam?: string, awayTeam?: string): RawMarket {
  return {
    canonicalMarket: normalizeCanonicalMarket(m.canonicalMarket),
    rawName: String(m.rawName || m.canonicalMarket || 'Market'),
    period: mapPeriod(m.period || 'fulltime'),
    line: typeof m.line === 'number' ? m.line : undefined,
    isActive: m.isActive !== false,
    selections: (m.selections || []).map((s) => wsSelectionToRaw(s, homeTeam, awayTeam)),
    marketId: m.marketId || `${m.canonicalMarket}_${m.period}_${m.line || ''}`,
  };
}

function wsFrameToRawEvents(frame: WsFrame): WsRawEvent[] {
  if (!frame) return [];
  if (Array.isArray(frame)) return frame;
  if (typeof frame !== 'object') return [];
  const f = frame as any;
  if (Array.isArray(f.events)) return f.events;
  if (Array.isArray(f.data)) return f.data;
  if (f.data && typeof f.data === 'object') return [f.data];
  if (f.eventId) return [f];
  return [];
}

function wsRawEventToPulseScoreLive(e: WsRawEvent, sport: string): RawPulseScoreLiveEvent | null {
  if (!e || !e.eventId) return null;
  const home = String(e.home || '');
  const away = String(e.away || '');
  const markets: RawMarket[] = (e.markets || []).map((m) => wsMarketToRaw(m, home, away));
  const result: RawPulseScoreLiveEvent = {
    eventId: String(e.eventId),
    sport: e.sport || sport,
    home,
    away,
    league: String(e.league || ''),
    live: e.live !== false,
    startTime: e.startTime ? String(e.startTime) : undefined,
    markets,
  };
  if (e.matchClock) {
    (result as any).matchClock = {
      minute: typeof e.matchClock.minute === 'number' ? e.matchClock.minute : undefined,
      second: typeof e.matchClock.second === 'number' ? e.matchClock.second : undefined,
      period: e.matchClock.period,
      periodId: e.matchClock.periodId,
    };
  }
  if (e.score) {
    (result as any).score = {
      home: e.score.home != null ? String(e.score.home) : undefined,
      away: e.score.away != null ? String(e.score.away) : undefined,
      info: e.score.info,
    };
  }
  if (e.statistics) (result as any).statistics = e.statistics;
  if ((e as any).moreInfo) (result as any).moreInfo = (e as any).moreInfo;
  return result;
}

type SportStatus = PulseScoreWsStatus & {
  handlers: Set<(updates: LiveUpdate[]) => void>;
  liveIdHandlers: Set<(ids: Set<string>) => void>;
  ws: WebSocket | null;
  pingTimer: NodeJS.Timeout | null;
  frameTimer: NodeJS.Timeout | null;
  reconnectAttempts: number;
  reconnectTimer: NodeJS.Timeout | null;
  stopped: boolean;
};

function createSportStatus(sport: string): SportStatus {
  return {
    sport,
    connected: false,
    lastFrameAt: null,
    framesReceived: 0,
    reconnectCount: 0,
    lastError: null,
    handlers: new Set(),
    liveIdHandlers: new Set(),
    ws: null,
    pingTimer: null,
    frameTimer: null,
    reconnectAttempts: 0,
    reconnectTimer: null,
    stopped: false,
  };
}

function clearTimers(st: SportStatus) {
  if (st.pingTimer) {
    clearInterval(st.pingTimer);
    st.pingTimer = null;
  }
  if (st.frameTimer) {
    clearTimeout(st.frameTimer);
    st.frameTimer = null;
  }
  if (st.reconnectTimer) {
    clearTimeout(st.reconnectTimer);
    st.reconnectTimer = null;
  }
}

function closeWs(st: SportStatus) {
  clearTimers(st);
  st.connected = false;
  if (st.ws) {
    try {
      st.ws.removeAllListeners();
      st.ws.close();
    } catch {
      void 0;
    }
    st.ws = null;
  }
}

function scheduleReconnect(st: SportStatus, _apiKey: string, connectFn: (st: SportStatus) => void) {
  if (st.stopped) return;
  st.reconnectAttempts += 1;
  st.reconnectCount += 1;
  const delay = Math.min(
    RECONNECT_MAX_MS,
    Math.max(RECONNECT_BASE_MS, RECONNECT_BASE_MS + RECONNECT_STEP_MS * (st.reconnectAttempts - 1)),
  );
  console.error(`[pulsescore-ws:${st.sport}] reconnecting in ${delay}ms (attempt ${st.reconnectAttempts})`);
  st.reconnectTimer = setTimeout(() => connectFn(st), delay);
}

export function createPulseScoreWsClient(apiKey: string, opts?: { sports?: readonly WsLiveSport[] }): PulseScoreWsClient {
  const sports = (opts?.sports && opts.sports.length > 0 ? opts.sports : WS_LIVE_SPORTS).filter(
    (s) => sportSegment(s) != null,
  );
  const statuses = new Map<string, SportStatus>();
  for (const s of sports) statuses.set(s, createSportStatus(s));

  // PulseScore enforces "wait 5s to replace a connection" on the MAX plan even
  // across the 3 slots — proven by the cold-start logs (4429 on tennis and
  // basketball within 210ms of soccer's open). Serialize ALL connect() attempts
  // through a shared gate so no two WebSocket opens ever land within 5.1s of each
  // other — regardless of whether that open was triggered by initial startup,
  // reconnect, or a mix of both. This also keeps the reconnect schedule safe too.
  let connectGateChain = Promise.resolve();
  let lastConnectAttemptAt = 0;
  function gatedConnect(st: SportStatus, connectFn: (st: SportStatus) => void): void {
    connectGateChain = connectGateChain.then(async () => {
      const wait = Math.max(0, lastConnectAttemptAt + WS_CONNECT_MIN_GAP_MS - Date.now());
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
      lastConnectAttemptAt = Date.now();
      connectFn(st);
    });
  }

  let startupSettled: Promise<void> | null = null;
  const startupReady: Promise<void> = (async () => {
    if (!apiKey || !apiKey.trim()) {
      console.warn('[pulsescore-ws] no API key, all WS connections skipped');
      return;
    }
    const list = Array.from(statuses.values());
    for (let i = 0; i < list.length; i += 1) {
      const st = list[i];
      if (i > 0) await new Promise((r) => setTimeout(r, WS_STARTUP_STAGGER_MS));
      await new Promise<void>((resolve) => {
        const doConnect = () => {
          gatedConnect(st, (s) => connect(s));
        };
        const resolveOnce = () => {
          if (st.ws) {
            st.ws.removeListener('open', onOpen);
            st.ws.removeListener('error', onError);
            st.ws.removeListener('close', resolveOnce);
          }
          resolve();
        };
        const onOpen = () => {
          setTimeout(resolveOnce, 500);
        };
        const onError = () => {
          resolveOnce();
        };
        // After dispatching, we subscribe to the next socket (gate schedules it, but the ws object may not yet exist
        // at the moment we return from gatedConnect — poll until ws exists to subscribe, timeout 15s).
        const startAt = Date.now();
        const attach = () => {
          doConnect();
          const trySub = () => {
            const ws = statuses.get(st.sport)?.ws;
            if (ws) {
              ws.once('open', onOpen);
              ws.once('error', onError);
              ws.once('close', resolveOnce);
            } else if (Date.now() - startAt < 15_000) {
              setTimeout(trySub, 200);
            } else {
              resolveOnce();
            }
          };
          trySub();
        };
        attach();
      });
    }
  })();
  startupSettled = startupReady;

  function connect(st: SportStatus) {
    if (st.stopped) return;
    closeWs(st);
    const seg = sportSegment(st.sport);
    if (!seg) return;
    const url = `${PULSESCORE_WS_BASE}?key=${encodeURIComponent(apiKey)}&sport=${encodeURIComponent(seg)}`;
    let opened = false;
    try {
        st.ws = new WebSocket(url, { perMessageDeflate: false });
      } catch (e: any) {
        st.lastError = String(e?.message || e);
        console.error(`[pulsescore-ws:${st.sport}] constructor failed:`, st.lastError);
        scheduleReconnect(st, apiKey, (s) => gatedConnect(s, connect));
        return;
      }
    const ws = st.ws!;
    ws.on('open', () => {
      opened = true;
      st.connected = true;
      st.lastError = null;
      st.reconnectAttempts = 0;
      console.log(`[pulsescore-ws:${st.sport}] connected`);
      st.pingTimer = setInterval(() => {
        try {
          if (ws.readyState === WebSocket.OPEN) ws.ping();
        } catch {
          void 0;
        }
      }, PING_INTERVAL_MS);
      st.frameTimer = setTimeout(() => {
        if (!st.stopped && (st.lastFrameAt == null || Date.now() - st.lastFrameAt > FRAME_TIMEOUT_MS)) {
          console.warn(`[pulsescore-ws:${st.sport}] no frames for ${FRAME_TIMEOUT_MS}ms, recycling`);
          try {
            ws.terminate();
          } catch {
            void 0;
          }
        }
      }, FRAME_TIMEOUT_MS);
    });
    ws.on('pong', () => void 0);
    ws.on('error', (e: any) => {
      st.lastError = String(e?.message || e);
      console.error(`[pulsescore-ws:${st.sport}] error:`, st.lastError);
    });
    ws.on('close', (code, reason) => {
      st.connected = false;
      console.warn(`[pulsescore-ws:${st.sport}] closed code=${code} reason=${String(reason || '')}`);
      clearTimers(st);
      if (!st.stopped) scheduleReconnect(st, apiKey, (s) => gatedConnect(s, connect));
    });
    ws.on('message', (data) => {
      let parsed: WsFrame | null = null;
      try {
        const str = typeof data === 'string' ? data : Buffer.isBuffer(data) ? data.toString('utf8') : String(data);
        if (!str) return;
        parsed = JSON.parse(str);
      } catch (e: any) {
        st.lastError = `parse: ${String(e?.message || e)}`;
        return;
      }
      const now = Date.now();
      st.lastFrameAt = now;
      st.framesReceived += 1;
      if (st.frameTimer) {
        clearTimeout(st.frameTimer);
        st.frameTimer = setTimeout(() => {
          if (!st.stopped && Date.now() - st.lastFrameAt! > FRAME_TIMEOUT_MS) {
            console.warn(`[pulsescore-ws:${st.sport}] no frames after frame, recycling`);
            try {
              ws.terminate();
            } catch {
              void 0;
            }
          }
        }, FRAME_TIMEOUT_MS);
      }
      const raws = wsFrameToRawEvents(parsed);
      if (raws.length === 0) return;
      const updates: LiveUpdate[] = [];
      const liveIds = new Set<string>();
      for (const r of raws) {
        const converted = wsRawEventToPulseScoreLive(r, st.sport);
        if (!converted) continue;
        liveIds.add(`pulsescore_${converted.eventId}`);
        try {
          const base = normalizePulseScoreEvent(st.sport, converted);
          const ev = { ...base, is_live: 1 } as AppEvent;
          const liveAny = converted as any;
          if (Array.isArray(liveAny.events) && liveAny.events.length > 0) (ev as any).events = liveAny.events;
          if (Array.isArray(liveAny.incidents) && liveAny.incidents.length > 0) (ev as any).incidents = liveAny.incidents;
          if (liveAny.score || liveAny.matchClock || liveAny.statistics || liveAny.moreInfo) {
            const live = converted as RawPulseScoreLiveEvent;
            if (live.score && (live.score.home !== undefined || live.score.away !== undefined)) {
              const hn = Number(live.score.home);
              const an = Number(live.score.away);
              if (Number.isFinite(hn) && Number.isFinite(an)) ev.score = { home: hn, away: an };
              else (ev as any).score = liveAny.score;
            } else if (liveAny.score) {
              (ev as any).score = liveAny.score;
            }
            if (live.matchClock) {
              (ev as any).matchClock = liveAny.matchClock;
              if (typeof live.matchClock.minute === 'number' && Number.isFinite(live.matchClock.minute)) {
                ev.minute = live.matchClock.minute;
              }
            }
            if (liveAny.statistics) (ev as any).statistics = liveAny.statistics;
            if (liveAny.moreInfo) (ev as any).moreInfo = liveAny.moreInfo;
          }
          updates.push({ sport: st.sport, event: ev, receivedAt: now });
        } catch (e: any) {
          st.lastError = `normalize: ${String(e?.message || e)}`;
        }
      }
      if (updates.length > 0) {
        for (const h of st.handlers) {
          try {
            h(updates);
          } catch (e: any) {
            console.error(`[pulsescore-ws:${st.sport}] handler error:`, String(e?.message || e));
          }
        }
      }
      for (const lh of st.liveIdHandlers) {
        try {
          lh(liveIds);
        } catch (e: any) {
          console.error(`[pulsescore-ws:${st.sport}] liveIds handler error:`, String(e?.message || e));
        }
      }
    });
    setTimeout(() => {
      if (!opened && !st.stopped) {
        console.warn(`[pulsescore-ws:${st.sport}] connect timeout, terminating`);
        try {
          ws.terminate();
        } catch {
          void 0;
        }
      }
    }, 8_000);
  }

  function getStatus(): PulseScoreWsStatus[] {
    return Array.from(statuses.values()).map((st) => ({
      sport: st.sport,
      connected: st.connected,
      lastFrameAt: st.lastFrameAt,
      framesReceived: st.framesReceived,
      reconnectCount: st.reconnectCount,
      lastError: st.lastError,
    }));
  }

  function stop() {
    for (const st of statuses.values()) {
      st.stopped = true;
      closeWs(st);
      st.handlers.clear();
      st.liveIdHandlers.clear();
    }
  }

  function onEventUpdate(sport: WsLiveSport, handler: (updates: LiveUpdate[]) => void): () => void {
    const st = statuses.get(sport);
    if (!st) return () => void 0;
    st.handlers.add(handler);
    return () => st.handlers.delete(handler);
  }

  function onSportLiveIds(sport: WsLiveSport, handler: (ids: Set<string>) => void): () => void {
    const st = statuses.get(sport);
    if (!st) return () => void 0;
    st.liveIdHandlers.add(handler);
    return () => st.liveIdHandlers.delete(handler);
  }

  function waitUntilStarted(): Promise<void> {
    return startupSettled ?? Promise.resolve();
  }

  return { getStatus, stop, onEventUpdate, onSportLiveIds, waitUntilStarted };
}

export function isWsLiveSport(sport: string): sport is WsLiveSport {
  return (WS_LIVE_SPORTS as readonly string[]).includes(sport);
}

export function isFastPollLiveSport(sport: string): sport is FastPollLiveSport {
  return (FAST_POLL_LIVE_SPORTS as readonly string[]).includes(sport);
}
