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
} from '../services/pulsescore';
import { createOddsStore, oddsKey, recordOdd } from '../lib/oddsVersioning';

export type GoalServeSettlementOutcome = 'won' | 'lost' | 'half_won' | 'half_lost' | 'void';

export type EventsService = {
  handleEventsRoutes: (
    req: http.IncomingMessage,
    res: http.ServerResponse,
    url: URL,
  ) => Promise<boolean>;
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

export function createEventsService(_pool: pg.Pool | null, apiKey: string): EventsService {
  const cache = new Map<string, AppEvent>(); // keyed by AppEvent.id ("pulsescore_<eventId>")
  const oddsStore = createOddsStore();
  const overrides = new Map<string, OddsOverride>();
  const tradingStatus = new Map<string, TradingStatus>();
  const tradingManualOdds = new Map<string, ManualOdds>();

  let lastRefreshAt = 0;
  let lastRefreshError: string | null = null;
  let refreshInFlight: Promise<void> | null = null;
  let pollTimer: NodeJS.Timeout | null = null;

  async function refreshOnce(): Promise<void> {
    const now = Date.now();
    try {
      for (const sport of PULSESCORE_SPORTS) {
        const raw = await fetchPulseScoreEvents(apiKey, sport);
        for (const r of raw) {
          const ev = normalizePulseScoreEvent(sport, r);
          cache.set(ev.id, ev);
          if (ev.home_odd > 0) recordOdd(oddsStore, oddsKey(ev.id, 'h2h', 'home'), ev.home_odd, now);
          if (ev.draw_odd > 0) recordOdd(oddsStore, oddsKey(ev.id, 'h2h', 'draw'), ev.draw_odd, now);
          if (ev.away_odd > 0) recordOdd(oddsStore, oddsKey(ev.id, 'h2h', 'away'), ev.away_odd, now);
        }
      }
      // Real-time score/clock enrichment (see module docstring in pulsescore.ts): a separate feed
      // from the per-sport pull above, so it only merges score/minute onto events already cached
      // there — never creates a new cache entry and never touches markets/odds, since this feed's
      // odds are redundant with what the per-sport pull already has.
      for (const sport of PULSESCORE_SPORTS) {
        const liveRaw = await fetchPulseScoreLiveEvents(apiKey, sport).catch(() => []);
        for (const lr of liveRaw) {
          const id = `pulsescore_${lr.eventId}`;
          const cached = cache.get(id);
          if (!cached) continue;
          const liveState = extractLiveState(lr);
          if (liveState.score || liveState.minute !== undefined) {
            cache.set(id, { ...cached, ...liveState });
          }
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

  function ensureRefreshed(): Promise<void> {
    if (refreshInFlight) return refreshInFlight;
    if (cache.size > 0 && Date.now() - lastRefreshAt < POLL_INTERVAL_MS) return Promise.resolve();
    refreshInFlight = refreshOnce().finally(() => {
      refreshInFlight = null;
    });
    return refreshInFlight;
  }

  function startPolling(): void {
    if (pollTimer || !hasApiKey(apiKey)) return;
    const tick = () => {
      refreshOnce().finally(() => {
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
      });
      return true;
    }

    if (path === '/api/dev/force-import') {
      await refreshOnce();
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

  return {
    handleEventsRoutes,
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
