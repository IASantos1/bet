import type http from 'http';
import type pg from 'pg';
import { sendJson } from '../lib/http';

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

const SPORTS_API_DISABLED_MESSAGE =
  'Integracoes de APIs esportivas foram removidas deste backend.';

function sendSportsApiDisabled(
  res: http.ServerResponse,
  path: string,
  extra: Record<string, unknown> = {},
): void {
  sendJson(res, 410, {
    error: 'SPORTS_APIS_DISABLED',
    message: SPORTS_API_DISABLED_MESSAGE,
    path,
    ...extra,
  });
}

export function createEventsService(_pool: pg.Pool | null, _apiKey: string): EventsService {
  const handleEventsRoutes = async (
    req: http.IncomingMessage,
    res: http.ServerResponse,
    url: URL,
  ): Promise<boolean> => {
    const path = url.pathname;
    const managedPaths = new Set([
      '/api/health',
      '/api/sports',
      '/api/events/by-sport',
      '/api/world-cup-2026',
      '/api/world-cup-2026/info',
      '/api/world-cup-2026/groups',
      '/api/world-cup-2026/matches',
      '/api/dev/odds-debug',
      '/api/dev/cache-debug',
      '/api/dev/provider-debug',
      '/api/dev/schedule-debug',
      '/api/dev/force-import',
    ]);

    if (!managedPaths.has(path)) return false;

    if (req.method === 'GET' && path === '/api/health') {
      sendJson(res, 200, {
        ok: true,
        sportsApisEnabled: false,
        provider: null,
        message: SPORTS_API_DISABLED_MESSAGE,
      });
      return true;
    }

    if (req.method === 'GET' && path === '/api/sports') {
      sendJson(res, 200, []);
      return true;
    }

    if (req.method === 'GET' && path === '/api/events/by-sport') {
      sendJson(res, 200, {
        live: [],
        pregame: [],
        highlights: [],
        provider: null,
        sportsApisEnabled: false,
      });
      return true;
    }

    sendSportsApiDisabled(res, path, { sportsApisEnabled: false });
    return true;
  };

  const getAdminOddsEvents = async (): Promise<any[]> => [];

  const setOddsOverride = async (_eventId: string, _odds: { home_odd?: number; draw_odd?: number; away_odd?: number }): Promise<void> => {
    return;
  };

  const getEventOdds = async (
    _eventId: string,
    _sport?: string,
  ): Promise<{
    home: number;
    draw: number;
    away: number;
    markets: any;
    versions: { home: number; draw: number; away: number };
  } | null> => null;

  const getEventResult = async (
    _eventId: string,
    _sport?: string,
  ): Promise<{ finished: boolean; statusShort: string; homeScore: number | null; awayScore: number | null } | null> => null;

  const getGoalServeSettlement = async (
    _sport: string,
    _gsId: string,
    _marketId: number,
    _oddname: string,
  ): Promise<GoalServeSettlementOutcome | null> => null;

  const listTradingEvents = async (
    _filters: { status?: string; sport?: string; from?: string; to?: string },
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
  > => [];

  const setTradingDecision = async (
    _eventId: string,
    _status: 'pending' | 'approved' | 'suspended',
    _manualOdds?: { home?: number; draw?: number; away?: number },
  ): Promise<void> => {
    return;
  };

  const isMarketSuspended = async (_eventId: string): Promise<boolean> => false;

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
