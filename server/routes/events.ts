import type http from 'http';
import type pg from 'pg';
import { sendJson } from '../lib/http';
import {
  extractLiveState,
  fetchPulseScoreEvent,
  fetchPulseScoreEvents,
  fetchPulseScoreLiveEvents,
  normalizePulseScoreEvent,
  PULSESCORE_SPORTS,
  type AppEvent,
  type RawPulseScoreLiveEvent,
} from '../services/pulsescore';
import {
  createPulseScoreWsClient,
  type PulseScoreWsClient,
  isWsLiveSport,
  isFastPollLiveSport,
  FAST_POLL_LIVE_SPORTS,
  WS_LIVE_SPORTS,
  type LiveUpdate,
} from '../services/pulsescoreWs';
import { createOddsStore, oddsKey, recordOdd } from '../lib/oddsVersioning';

export type GoalServeSettlementOutcome = 'won' | 'lost' | 'half_won' | 'half_lost' | 'void';

export type EventsService = {
  handleEventsRoutes: (
    req: http.IncomingMessage,
    res: http.ServerResponse,
    url: URL,
  ) => Promise<boolean>;
  getWsStatus: () => any[];
  getAdminOddsEvents: () => Promise<any[]>;
  setOddsOverride: (eventId: string, odds: { home_odd?: number; draw_odd?: number; away_odd?: number }) => Promise<void>;
  getEventOdds: (
    eventId: string,
    sport?: string,
  ) => Promise<{
    home: number;
    draw: number;
    away: number;
    markets: any;
    versions: { home: number; draw: number; away: number };
  } | null>;
  getEventResult: (
    eventId: string,
    sport?: string,
  ) => Promise<{ finished: boolean; statusShort: string; homeScore: number | null; awayScore: number | null } | null>;
  getGoalServeSettlement: (sport: string, gsId: string, marketId: number, oddname: string) => Promise<GoalServeSettlementOutcome | null>;
  listTradingEvents: (filters: { status?: string; sport?: string; from?: string; to?: string }) => Promise<
    Array<{
      id: string;
      match: string;
      league: string;
      sport: string;
      event_date: string | null;
      trading_status: 'pending' | 'approved' | 'suspended';
      manual_odds: { home?: number; draw?: number; away?: number } | null;
      home_odd: number;
      draw_odd: number;
      away_odd: number;
      is_live: number;
    }>
  >;
  setTradingDecision: (
    eventId: string,
    status: 'pending' | 'approved' | 'suspended',
    manualOdds?: { home?: number; draw?: number; away?: number },
  ) => Promise<void>;
  isMarketSuspended: (eventId: string) => Promise<boolean>;
};

// Conservative default: PulseScore's docs/curl samples never stated a rate limit. Fetching every
// confirmed sport (today just soccer, ~3420 events / ~35 pages at pageLimit=100) is one sequential
// paginated pull; polling much faster than this would mean overlapping pulls for little benefit
// since odds on a sportsbook feed this size don't realistically move faster than every few seconds
// anyway. Revisit once PulseScore states an actual limit.
const POLL_INTERVAL_MS = 30_000;
const FAST_POLL_INTERVAL_MS = 3_000;
const PREMATCH_INTERSPORT_STAGGER_MS = 250;
const HIGH_VOLUME_SPORTS = ['soccer', 'tennis', 'basketball'] as const;

type TradingStatus = 'pending' | 'approved' | 'suspended';
type ManualOdds = { home?: number; draw?: number; away?: number };
type OddsOverride = { home_odd?: number; draw_odd?: number; away_odd?: number };

function hasApiKey(apiKey: string): boolean {
  return typeof apiKey === 'string' && apiKey.trim().length > 0;
}

/** Accepts either our own `pulsescore_<id>` external id or the bare PulseScore eventId. */
function toInternalId(raw: string): string {
  const s = String(raw || '').trim();
  return s.startsWith('pulsescore_') ? s : `pulsescore_${s}`;
}

export function createEventsService(_pool: pg.Pool | null, apiKey: string, wsClientIn?: PulseScoreWsClient | null): EventsService {
  const cache = new Map<string, AppEvent>();
  const oddsStore = createOddsStore();
  const overrides = new Map<string, OddsOverride>();
  const tradingStatus = new Map<string, TradingStatus>();
  const tradingManualOdds = new Map<string, ManualOdds>();

  let lastRefreshAt = 0;
  let lastRefreshError: string | null = null;
  let refreshInFlight: Promise<void> | null = null;
  let pollTimer: NodeJS.Timeout | null = null;

  let fastPollInFlight: Promise<void> | null = null;
  let fastPollTimer: NodeJS.Timeout | null = null;
  let lastFastPollAt = 0;
  let lastFastPollError: string | null = null;

  const wsLiveIdsBySport = new Map<string, Set<string>>();
  const wsClient: PulseScoreWsClient | null =
    wsClientIn ?? (hasApiKey(apiKey) ? createPulseScoreWsClient(apiKey) : null);

  function recordH2HOdds(ev: AppEvent, now: number) {
    if (ev.home_odd > 0) recordOdd(oddsStore, oddsKey(ev.id, 'h2h', 'home'), ev.home_odd, now);
    if (ev.draw_odd > 0) recordOdd(oddsStore, oddsKey(ev.id, 'h2h', 'draw'), ev.draw_odd, now);
    if (ev.away_odd > 0) recordOdd(oddsStore, oddsKey(ev.id, 'h2h', 'away'), ev.away_odd, now);
  }

  if (wsClient) {
    for (const sport of WS_LIVE_SPORTS) {
      wsLiveIdsBySport.set(sport, new Set());
      wsClient.onEventUpdate(sport, (updates: LiveUpdate[]) => {
        const now = Date.now();
        for (const u of updates) {
          const existing = cache.get(u.event.id);
          const merged: AppEvent = existing
            ? {
                ...existing,
                ...u.event,
                home_odd: u.event.home_odd > 0 ? u.event.home_odd : existing.home_odd,
                draw_odd: u.event.draw_odd > 0 ? u.event.draw_odd : existing.draw_odd,
                away_odd: u.event.away_odd > 0 ? u.event.away_odd : existing.away_odd,
                markets: u.event.markets && u.event.markets.length > 0 ? u.event.markets : existing.markets,
                event_date: u.event.event_date || existing.event_date,
                league: u.event.league || existing.league,
                home_team: u.event.home_team || existing.home_team,
                away_team: u.event.away_team || existing.away_team,
                match: u.event.match || existing.match,
              }
            : u.event;
          merged.is_live = 1;
          cache.set(merged.id, merged);
          recordH2HOdds(merged, now);
        }
      });
      wsClient.onSportLiveIds(sport, (ids: Set<string>) => {
        const cur = wsLiveIdsBySport.get(sport);
        if (cur) {
          cur.clear();
          for (const id of ids) cur.add(id);
        }
      });
    }
  }

  function isWsLiveSportActive(sport: string): boolean {
    if (!wsClient) return false;
    if (!isWsLiveSport(sport)) return false;
    const st = wsClient.getStatus().find((s) => s.sport === sport);
    if (!st) return false;
    return st.connected && st.lastFrameAt != null && Date.now() - st.lastFrameAt < 60_000;
  }

  async function fastLivePollOnce(): Promise<void> {
    const now = Date.now();
    try {
      const liveIdsBySport = new Map<string, Set<string>>();
      for (const sport of FAST_POLL_LIVE_SPORTS) {
        let liveRaw: RawPulseScoreLiveEvent[];
        try {
          liveRaw = await fetchPulseScoreLiveEvents(apiKey, sport, { pageLimit: 50, maxPages: 5 });
        } catch {
          continue;
        }
        const liveIds = new Set<string>();
        for (const lr of liveRaw) {
          const id = `pulsescore_${lr.eventId}`;
          liveIds.add(id);
          const liveState = extractLiveState(lr);
          const cached = cache.get(id);
          if (cached) {
            cache.set(id, { ...cached, ...liveState, is_live: 1 });
          } else {
            const ev = normalizePulseScoreEvent(sport, lr);
            cache.set(id, { ...ev, ...liveState, is_live: 1 });
            recordH2HOdds(ev, now);
          }
        }
        liveIdsBySport.set(sport, liveIds);
      }
      for (const ev of cache.values()) {
        if (ev.is_live === 1 && liveIdsBySport.has(ev.sport) && !liveIdsBySport.get(ev.sport)!.has(ev.id)) {
          cache.set(ev.id, { ...ev, is_live: 0 });
        }
      }
      lastFastPollError = null;
    } catch (e: any) {
      lastFastPollError = String(e?.message || e);
    } finally {
      lastFastPollAt = now;
    }
  }

  function runFastLivePoll(): Promise<void> {
    if (fastPollInFlight) return fastPollInFlight;
    fastPollInFlight = fastLivePollOnce().finally(() => {
      fastPollInFlight = null;
    });
    return fastPollInFlight;
  }

  function startFastLivePoll(): void {
    if (fastPollTimer || !hasApiKey(apiKey)) return;
    const tick = () => {
      runFastLivePoll().finally(() => {
        fastPollTimer = setTimeout(tick, FAST_POLL_INTERVAL_MS);
      });
    };
    fastPollTimer = setTimeout(tick, 500);
  }
  startFastLivePoll();

  async function refreshOnce(): Promise<void> {
    const now = Date.now();
    try {
      // On the very first refresh (cold start), defer the burst of REST pagination until the
      // WebSocket startup has fully settled. PulseScore's plan-level token bucket counts the
      // 3 /ws/live upgrade/handshake requests against the same per-second quota that /events
      // and /live-events share — opening all 3 sockets and 9 paginated REST pulls simultaneously
      // reliably 429'd pages 1-5 of soccer/tennis within the first minute (confirmed in
      // production). Waiting ~13s (3 slots × 6s staggered) for the WS handshakes to complete
      // first means that bucket is fully free once the REST cycle actually starts pulling.
      // We never delay *subsequent* refreshes (cache.size > 0) — a user-facing request
      // mid-cycle must serve stale cache + background refresh, exactly as before.
      if (cache.size === 0 && wsClient && typeof (wsClient as any).waitUntilStarted === 'function') {
        try {
          await Promise.race([
            (wsClient as any).waitUntilStarted(),
            new Promise<void>((r) => setTimeout(r, 25_000)),
          ]);
        } catch {
          void 0;
        }
      }
      let sportIndex = 0;
      for (const sport of PULSESCORE_SPORTS) {
        if (sportIndex > 0) await new Promise((r) => setTimeout(r, PREMATCH_INTERSPORT_STAGGER_MS));
        sportIndex += 1;
        const highVolume = (HIGH_VOLUME_SPORTS as readonly string[]).includes(sport);
        const maxPages = highVolume ? 20 : 10;
        const raw = await fetchPulseScoreEvents(apiKey, sport, { maxPages });
        for (const r of raw) {
          const id = `pulsescore_${r.eventId}`;
          const wsLive = cache.get(id)?.is_live === 1 && isWsLiveSportActive(sport);
          const ev = normalizePulseScoreEvent(sport, r);
          if (wsLive) {
            const existing = cache.get(id);
            const merged: AppEvent = existing
              ? {
                  ...existing,
                  event_date: ev.event_date || existing.event_date,
                  league: ev.league || existing.league,
                  home_team: ev.home_team || existing.home_team,
                  away_team: ev.away_team || existing.away_team,
                  match: ev.match || existing.match,
                }
              : ev;
            cache.set(id, merged);
          } else {
            cache.set(ev.id, ev);
          }
          recordH2HOdds(ev, now);
        }
      }
      const liveIdsBySport = new Map<string, Set<string>>();
      let liveSportIndex = 0;
      for (const sport of PULSESCORE_SPORTS) {
        if (liveSportIndex > 0) await new Promise((r) => setTimeout(r, 200));
        liveSportIndex += 1;
        if (isWsLiveSportActive(sport)) {
          liveIdsBySport.set(sport, new Set(wsLiveIdsBySport.get(sport) || []));
          continue;
        }
        if (isFastPollLiveSport(sport)) continue;
        let liveRaw: RawPulseScoreLiveEvent[];
        try {
          liveRaw = await fetchPulseScoreLiveEvents(apiKey, sport, { maxPages: 3 });
        } catch {
          continue;
        }
        const liveIds = new Set<string>();
        for (const lr of liveRaw) {
          const id = `pulsescore_${lr.eventId}`;
          liveIds.add(id);
          const liveState = extractLiveState(lr);
          const cached = cache.get(id);
          if (cached) {
            cache.set(id, { ...cached, ...liveState, is_live: 1 });
          } else {
            const ev = normalizePulseScoreEvent(sport, lr);
            cache.set(id, { ...ev, ...liveState, is_live: 1 });
            recordH2HOdds(ev, now);
          }
        }
        liveIdsBySport.set(sport, liveIds);
      }
      for (const ev of cache.values()) {
        if (ev.is_live === 1 && liveIdsBySport.has(ev.sport) && !liveIdsBySport.get(ev.sport)!.has(ev.id)) {
          cache.set(ev.id, { ...ev, is_live: 0 });
        }
      }
      lastRefreshError = null;
    } catch (e: any) {
      lastRefreshError = String(e?.message || e);
      console.error('[events] pulsescore refresh failed:', lastRefreshError);
    } finally {
      lastRefreshAt = Date.now();
    }
  }

  function runRefreshOnce(): Promise<void> {
    if (refreshInFlight) return refreshInFlight;
    refreshInFlight = refreshOnce().finally(() => {
      refreshInFlight = null;
    });
    return refreshInFlight;
  }

  function ensureRefreshed(): Promise<void> {
    if (cache.size > 0) {
      if (Date.now() - lastRefreshAt >= POLL_INTERVAL_MS) runRefreshOnce();
      return Promise.resolve();
    }
    return runRefreshOnce();
  }

  function startPolling(): void {
    if (pollTimer || !hasApiKey(apiKey)) return;
    const tick = () => {
      runRefreshOnce().finally(() => {
        pollTimer = setTimeout(tick, POLL_INTERVAL_MS);
      });
    };
    pollTimer = setTimeout(tick, 0);
  }
  startPolling();

  function findCachedSync(rawId: string): AppEvent | null {
    const id = toInternalId(rawId);
    return cache.get(id) || cache.get(String(rawId || '').trim()) || null;
  }

  /** Cache lookup with a live single-event fallback: the poll loop covers every page of every
   *  confirmed sport, so a miss here means either the event just isn't PulseScore's (any sport,
   *  any id), or it fell out of the 30s-old cache window — the fallback fetches it directly via
   *  fetchPulseScoreEvent instead of forcing a full-catalog refresh for one lookup. */
  async function resolveEvent(rawId: string, sportHint?: string): Promise<AppEvent | null> {
    const cached = findCachedSync(rawId);
    if (cached) return cached;
    if (!hasApiKey(apiKey)) return null;
    const bareId = String(rawId || '').trim().replace(/^pulsescore_/, '');
    if (!bareId) return null;
    const hint = sportHint && String(sportHint).trim();
    const sports = hint ? [hint, ...PULSESCORE_SPORTS.filter((s) => s !== hint)] : [...PULSESCORE_SPORTS];
    for (const sport of sports) {
      const raw = await fetchPulseScoreEvent(apiKey, sport, bareId).catch(() => null);
      if (raw) {
        const ev = normalizePulseScoreEvent(sport, raw);
        cache.set(ev.id, ev);
        return ev;
      }
    }
    return null;
  }

  function applyOverride(ev: AppEvent): AppEvent {
    const o = overrides.get(ev.id);
    if (!o) return ev;
    return {
      ...ev,
      home_odd: o.home_odd ?? ev.home_odd,
      draw_odd: o.draw_odd ?? ev.draw_odd,
      away_odd: o.away_odd ?? ev.away_odd,
    };
  }

  function marketsAsRecord(ev: AppEvent): Record<string, Array<{ id: string; label: string; odd: number; suspended?: boolean }>> {
    const out: Record<string, Array<{ id: string; label: string; odd: number; suspended?: boolean }>> = {};
    for (const m of ev.markets || []) {
      out[m.key] = m.selections;
    }
    return out;
  }

  // ---- HTTP routes ----

  const handleEventsRoutes = async (
    req: http.IncomingMessage,
    res: http.ServerResponse,
    url: URL,
  ): Promise<boolean> => {
    const path = url.pathname;

    if (req.method === 'GET' && path === '/api/health') {
      sendJson(res, 200, {
        ok: true,
        sportsApisEnabled: hasApiKey(apiKey),
        provider: 'pulsescore',
        eventsCached: cache.size,
        lastRefreshAt: lastRefreshAt || null,
        lastRefreshError,
      });
      return true;
    }

    if (req.method === 'GET' && path === '/api/sports') {
      const names: Record<string, string> = { soccer: 'Futebol', tennis: 'Ténis', volleyball: 'Voleibol', rugby: 'Rugby', mma: 'MMA', 'ice-hockey': 'Hóquei no Gelo', handball: 'Andebol', basketball: 'Basquetebol', baseball: 'Basebol' };
      sendJson(res, 200, PULSESCORE_SPORTS.map((s) => ({ key: s, name: names[s] || s })));
      return true;
    }

    if (req.method === 'GET' && path === '/api/ws/status') {
      sendJson(res, 200, {
        ws: wsClient ? wsClient.getStatus() : [],
        wsSports: Array.from(WS_LIVE_SPORTS),
        fastPollSports: Array.from(FAST_POLL_LIVE_SPORTS),
        fastPollIntervalMs: FAST_POLL_INTERVAL_MS,
        lastFastPollAt: lastFastPollAt || null,
        lastFastPollError,
      });
      return true;
    }

    if (req.method === 'GET' && path === '/api/events/by-sport') {
      await ensureRefreshed();

      const sportsParam = String(url.searchParams.get('sports') || 'all').toLowerCase().trim();
      const leagueParam = String(url.searchParams.get('league') || '').toLowerCase().trim();
      const only = String(url.searchParams.get('only') || 'both').toLowerCase().trim();
      const daysRaw = Number(url.searchParams.get('days'));
      const days = Number.isFinite(daysRaw) ? Math.max(0, Math.min(14, daysRaw)) : 7;

      const requestedSports = sportsParam === 'all' ? null : new Set(sportsParam.split(',').map((s) => s.trim()).filter(Boolean));
      const sportAllowed = (sport: string) => !requestedSports || requestedSports.has(sport);

      const now = Date.now();
      const horizon = now + days * 86_400_000;

      const live: AppEvent[] = [];
      const pregame: AppEvent[] = [];
      for (const raw of cache.values()) {
        if (!sportAllowed(raw.sport)) continue;
        if (leagueParam && !raw.league.toLowerCase().includes(leagueParam)) continue;
        const ev = applyOverride(raw);
        if (ev.is_live === 1) {
          live.push(ev);
        } else {
          const t = ev.event_date ? new Date(ev.event_date).getTime() : 0;
          if (!t || t <= horizon) pregame.push(ev);
        }
      }

      sendJson(res, 200, {
        live: only === 'pregame' ? [] : live,
        pregame: only === 'live' ? [] : pregame,
        highlights: [],
        provider: 'pulsescore',
        sportsApisEnabled: hasApiKey(apiKey),
      });
      return true;
    }

    const worldCupPaths = new Set([
      '/api/world-cup-2026',
      '/api/world-cup-2026/info',
      '/api/world-cup-2026/groups',
      '/api/world-cup-2026/matches',
    ]);
    if (req.method === 'GET' && worldCupPaths.has(path)) {
      // No World Cup 2026-specific endpoint has been confirmed on PulseScore — honestly empty
      // rather than guessing a shape, same discipline as everywhere else in this file.
      sendJson(res, 200, { info: null, groups: [], matches: [], teams: [] });
      return true;
    }

    if (req.method === 'GET' && path === '/api/dev/cache-debug') {
      sendJson(res, 200, {
        provider: 'pulsescore',
        apiKeyConfigured: hasApiKey(apiKey),
        eventsCached: cache.size,
        lastRefreshAt: lastRefreshAt || null,
        lastRefreshError,
        pollIntervalMs: POLL_INTERVAL_MS,
        fastPoll: {
          intervalMs: FAST_POLL_INTERVAL_MS,
          sports: Array.from(FAST_POLL_LIVE_SPORTS),
          lastPollAt: lastFastPollAt || null,
          lastPollError: lastFastPollError,
        },
        ws: wsClient ? wsClient.getStatus() : null,
        sample: Array.from(cache.values())
          .slice(0, 5)
          .map((e) => ({ id: e.id, match: e.match, league: e.league, is_live: e.is_live })),
      });
      return true;
    }

    if (req.method === 'GET' && (path === '/api/dev/provider-debug' || path === '/api/dev/schedule-debug' || path === '/api/dev/odds-debug')) {
      sendJson(res, 200, {
        provider: 'pulsescore',
        sports: PULSESCORE_SPORTS,
        apiKeyConfigured: hasApiKey(apiKey),
        eventsCached: cache.size,
        lastRefreshAt: lastRefreshAt || null,
        lastRefreshError,
        ws: wsClient ? wsClient.getStatus() : null,
        wsSports: Array.from(WS_LIVE_SPORTS),
        fastPoll: {
          intervalMs: FAST_POLL_INTERVAL_MS,
          sports: Array.from(FAST_POLL_LIVE_SPORTS),
          lastPollAt: lastFastPollAt || null,
          lastPollError: lastFastPollError,
        },
      });
      return true;
    }

    if (path === '/api/dev/force-import') {
      // Goes through the same guarded runRefreshOnce() as everything else — joins an already
      // in-flight cycle rather than starting a redundant concurrent one (see runRefreshOnce()'s
      // comment above), which is what "force a refresh" should mean here anyway.
      await runRefreshOnce();
      sendJson(res, 200, { ok: true, eventsCached: cache.size, lastRefreshError });
      return true;
    }

    const evMatch = path.match(/^\/api\/events\/([^/]+)$/);
    if (evMatch && req.method === 'GET') {
      await ensureRefreshed();
      const sportHint = String(url.searchParams.get('sport') || '').trim() || undefined;
      const found = await resolveEvent(decodeURIComponent(evMatch[1] || ''), sportHint);
      if (!found) return sendJson(res, 404, { error: 'Evento não encontrado' }), true;
      sendJson(res, 200, applyOverride(found));
      return true;
    }

    const oddsMatch = path.match(/^\/api\/events\/([^/]+)\/odds$/);
    if (oddsMatch && req.method === 'GET') {
      const sportHint = String(url.searchParams.get('sport') || '').trim() || undefined;
      const odds = await getEventOdds(decodeURIComponent(oddsMatch[1] || ''), sportHint);
      if (!odds) return sendJson(res, 404, { error: 'Evento não encontrado' }), true;
      sendJson(res, 200, odds);
      return true;
    }

    const statsMatch = path.match(/^\/api\/events\/([^/]+)\/stats$/);
    if (statsMatch && req.method === 'GET') {
      // PulseScore carries no in-match statistics in any confirmed response — empty, not guessed.
      sendJson(res, 200, { stats: [], events: [] });
      return true;
    }

    const incidentsMatch = path.match(/^\/api\/events\/([^/]+)\/incidents$/);
    if (incidentsMatch && req.method === 'GET') {
      // Same as /stats: no confirmed PulseScore incidents feed.
      sendJson(res, 200, { incidents: [], bigChances: { home: 0, away: 0 } });
      return true;
    }

    return false;
  };

  const getAdminOddsEvents = async (): Promise<any[]> => {
    await ensureRefreshed();
    return Array.from(cache.values()).map((raw) => {
      const ev = applyOverride(raw);
      return {
        id: ev.id,
        external_event_id: ev.external_event_id,
        match: ev.match,
        home_team: ev.home_team,
        away_team: ev.away_team,
        league: ev.league,
        sport: ev.sport,
        event_date: ev.event_date,
        home_odd: ev.home_odd,
        draw_odd: ev.draw_odd,
        away_odd: ev.away_odd,
        is_live: ev.is_live,
      };
    });
  };

  const setOddsOverride = async (eventId: string, odds: { home_odd?: number; draw_odd?: number; away_odd?: number }): Promise<void> => {
    const id = toInternalId(eventId);
    const existing = overrides.get(id) || {};
    overrides.set(id, { ...existing, ...odds });
  };

  const getEventOdds = async (
    eventId: string,
    sport?: string,
  ): Promise<{
    home: number;
    draw: number;
    away: number;
    markets: any;
    versions: { home: number; draw: number; away: number };
  } | null> => {
    await ensureRefreshed();
    const raw = await resolveEvent(eventId, sport);
    if (!raw) return null;
    const ev = applyOverride(raw);
    const now = Date.now();
    const versions = {
      home: ev.home_odd > 0 ? recordOdd(oddsStore, oddsKey(ev.id, 'h2h', 'home'), ev.home_odd, now).snapshot.version : 0,
      draw: ev.draw_odd > 0 ? recordOdd(oddsStore, oddsKey(ev.id, 'h2h', 'draw'), ev.draw_odd, now).snapshot.version : 0,
      away: ev.away_odd > 0 ? recordOdd(oddsStore, oddsKey(ev.id, 'h2h', 'away'), ev.away_odd, now).snapshot.version : 0,
    };
    return { home: ev.home_odd, draw: ev.draw_odd, away: ev.away_odd, markets: marketsAsRecord(ev), versions };
  };

  // The dedicated /live-events feed DOES carry a live score/clock (see refreshOnce()'s merge of
  // AppEvent.score/minute above) — but never a "finished"/full-time signal, only a live snapshot
  // while a match is in progress. There is still nothing here to derive a settlement RESULT from
  // (unlike the removed GoalServe integration, which had a real status_short/FT field). Returning
  // null (rather than guessing "not finished" from the live score going stale) means the Settlement
  // Engine correctly falls back to manual admin settlement for every event, which is this
  // provider's honest limitation, not a bug.
  const getEventResult = async (
    _eventId: string,
    _sport?: string,
  ): Promise<{ finished: boolean; statusShort: string; homeScore: number | null; awayScore: number | null } | null> => null;

  // No GoalServe Settlements API exists anymore (goalserve.ts was removed) and no bet leg placed
  // against PulseScore-sourced odds carries a goalserve_oddname, so this is unreachable in
  // practice — kept only to satisfy the EventsService contract still relied on by admin.ts/bets.ts.
  const getGoalServeSettlement = async (
    _sport: string,
    _gsId: string,
    _marketId: number,
    _oddname: string,
  ): Promise<GoalServeSettlementOutcome | null> => null;

  const listTradingEvents = async (
    filters: { status?: string; sport?: string; from?: string; to?: string },
  ): Promise<
    Array<{
      id: string;
      match: string;
      league: string;
      sport: string;
      event_date: string | null;
      trading_status: 'pending' | 'approved' | 'suspended';
      manual_odds: { home?: number; draw?: number; away?: number } | null;
      home_odd: number;
      draw_odd: number;
      away_odd: number;
      is_live: number;
    }>
  > => {
    await ensureRefreshed();
    let rows = Array.from(cache.values()).map((raw) => {
      const ev = applyOverride(raw);
      return {
        id: ev.id,
        match: ev.match,
        league: ev.league,
        sport: ev.sport,
        event_date: ev.event_date,
        trading_status: tradingStatus.get(ev.id) || ('pending' as TradingStatus),
        manual_odds: tradingManualOdds.get(ev.id) || null,
        home_odd: ev.home_odd,
        draw_odd: ev.draw_odd,
        away_odd: ev.away_odd,
        is_live: ev.is_live,
      };
    });

    if (filters.status) rows = rows.filter((r) => r.trading_status === filters.status);
    if (filters.sport) rows = rows.filter((r) => r.sport.toLowerCase() === String(filters.sport).toLowerCase());
    if (filters.from) {
      const fromMs = new Date(filters.from).getTime();
      if (Number.isFinite(fromMs)) rows = rows.filter((r) => !r.event_date || new Date(r.event_date).getTime() >= fromMs);
    }
    if (filters.to) {
      const toMs = new Date(filters.to).getTime() + 24 * 3_600_000;
      if (Number.isFinite(toMs)) rows = rows.filter((r) => !r.event_date || new Date(r.event_date).getTime() <= toMs);
    }
    return rows;
  };

  const setTradingDecision = async (
    eventId: string,
    status: 'pending' | 'approved' | 'suspended',
    manualOdds?: { home?: number; draw?: number; away?: number },
  ): Promise<void> => {
    const id = toInternalId(eventId);
    tradingStatus.set(id, status);
    if (manualOdds) tradingManualOdds.set(id, manualOdds);
  };

  const isMarketSuspended = async (eventId: string): Promise<boolean> => tradingStatus.get(toInternalId(eventId)) === 'suspended';

  const getWsStatus = (): any[] => (wsClient ? wsClient.getStatus() : []);

  return {
    handleEventsRoutes,
    getWsStatus,
    getAdminOddsEvents,
    setOddsOverride,
    getEventOdds,
    getEventResult,
    getGoalServeSettlement,
    listTradingEvents,
    setTradingDecision,
    isMarketSuspended,
  };
}
