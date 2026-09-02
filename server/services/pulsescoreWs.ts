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

export const WS_LIVE_SPORTS = ['soccer', 'tennis', 'basketball'] as const;
export type WsLiveSport = (typeof WS_LIVE_SPORTS)[number];

export const FAST_POLL_LIVE_SPORTS = ['ice-hockey', 'baseball'] as const;
export type FastPollLiveSport = (typeof FAST_POLL_LIVE_SPORTS)[number];

const RECONNECT_BASE_MS = 1_000;
const RECONNECT_MAX_MS = 30_000;
const FRAME_TIMEOUT_MS = 15_000;
const PING_INTERVAL_MS = 10_000;

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

type WsRawSelection = { name?: string; rawName?: string; decimal?: string | number; odds?: number; isActive?: boolean; selectionId?: string; line?: number };
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
  return {
    canonicalOutcome: toCanonicalOutcome(name, homeTeam, awayTeam),
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
    canonicalMarket: String(m.canonicalMarket || 'OTHER').toUpperCase(),
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

function scheduleReconnect(st: SportStatus, apiKey: string, connectFn: (st: SportStatus) => void) {
  if (st.stopped) return;
  st.reconnectAttempts += 1;
  st.reconnectCount += 1;
  const delay = Math.min(RECONNECT_MAX_MS, RECONNECT_BASE_MS * Math.pow(2, Math.min(st.reconnectAttempts, 10)));
  console.error(`[pulsescore-ws:${st.sport}] reconnecting in ${delay}ms (attempt ${st.reconnectAttempts})`);
  st.reconnectTimer = setTimeout(() => connectFn(st), delay);
}

export function createPulseScoreWsClient(apiKey: string, opts?: { sports?: readonly WsLiveSport[] }): PulseScoreWsClient {
  const sports = (opts?.sports && opts.sports.length > 0 ? opts.sports : WS_LIVE_SPORTS).filter(
    (s) => sportSegment(s) != null,
  );
  const statuses = new Map<string, SportStatus>();
  for (const s of sports) statuses.set(s, createSportStatus(s));

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
      scheduleReconnect(st, apiKey, connect);
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
      if (!st.stopped) scheduleReconnect(st, apiKey, connect);
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
          if ((converted as any).score || (converted as any).matchClock) {
            const live = converted as RawPulseScoreLiveEvent;
            if (live.score && (live.score.home !== undefined || live.score.away !== undefined)) {
              const hn = Number(live.score.home);
              const an = Number(live.score.away);
              if (Number.isFinite(hn) && Number.isFinite(an)) ev.score = { home: hn, away: an };
            }
            if (live.matchClock && typeof live.matchClock.minute === 'number' && Number.isFinite(live.matchClock.minute)) {
              ev.minute = live.matchClock.minute;
            }
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

  if (apiKey && apiKey.trim().length > 0) {
    for (const st of statuses.values()) connect(st);
  } else {
    console.warn('[pulsescore-ws] no API key, all WS connections skipped');
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

  return { getStatus, stop, onEventUpdate, onSportLiveIds };
}

export function isWsLiveSport(sport: string): sport is WsLiveSport {
  return (WS_LIVE_SPORTS as readonly string[]).includes(sport);
}

export function isFastPollLiveSport(sport: string): sport is FastPollLiveSport {
  return (FAST_POLL_LIVE_SPORTS as readonly string[]).includes(sport);
}
