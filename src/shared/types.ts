export interface Env {
  ADMIN_TOKEN?: string;
  BOOTSTRAP_TOKEN?: string;
  ADMIN_USER?: string;
  ADMIN_PASS?: string;
  API_SPORTS_KEY?: string;
  SPORTSAPI_PRO_KEY?: string;
  ODDS_API_KEY?: string;
  ODDS_API_BOOKMAKERS?: string;
  ENVIRONMENT?: string;
  APP_MODE?: string;
  DEV_MODE?: string;
  ALLOWED_IPS?: string;
  JWT_SECRET?: string;
  API_SPORTS_SEASON?: string;
  FOOTBALL_DATA_API_KEY?: string;
  MEDIA_PROXY_BASE?: string;
}

// --- Canonical Schema (Market & Game) ---
export interface Selection {
  id: string;
  label: string;
  odd: number;
  suspended?: boolean;
  playerId?: string;
}

export interface Market {
  id: string;
  key: string;          // h2h | ou_2.5 | btts | hcp_-1
  name: string;         // Resultado Final | Over/Under 2.5
  selections: Selection[];
  outcomes?: any[];     // For compatibility with raw DB/OddsAPI formats
  suspended?: boolean;
  suspended_reason?: 'GOAL' | 'VAR' | 'CARD' | 'UPDATE';
  period?: string;
  scope?: 'game' | 'team' | 'player';
}

export interface Game {
  id: string;
  league: string;
  sport: string;
  teams: {
    home: string;
    away: string;
  };
  score?: {
    home: number;
    away: number;
    minute?: number;
  };
  markets: Market[];
}
// ----------------------------------------

export const EventSchema = z.object({
  id: z.union([z.number(), z.string()]),
  external_event_id: z.string().optional(),
  match: z.string(),
  league: z.string(),
  home_team: z.string(),
  away_team: z.string(),
  home_odd: z.number(),
  draw_odd: z.number(),
  away_odd: z.number(),
  event_date: z.string().nullable(),
  is_live: z.number(),
  sport: z.string().optional(),
  country: z.string().optional(),
  score: z.string().nullable(),
  status: z.string().optional(),
  start_time: z.string().optional(),
  suspended: z.boolean().optional(),
  suspendReason: z.string().optional(),
  markets: z.any().optional(),
  odds: z.any().optional(),
  goals: z.object({
    home: z.union([z.number(), z.string(), z.null()]).optional(),
    away: z.union([z.number(), z.string(), z.null()]).optional()
  }).optional(),
  golsCasa: z.union([z.number(), z.string()]).optional(),
  golsFora: z.union([z.number(), z.string()]).optional(),
  goalsHome: z.union([z.number(), z.string()]).optional(),
  goalsAway: z.union([z.number(), z.string()]).optional(),
  elapsed: z.number().optional(),
  fixture: z.object({
    id: z.number().optional(),
    status: z.object({
      elapsed: z.number().optional(),
      short: z.string().optional()
    }).optional(),
    date: z.string().optional()
  }).optional(),
  teams: z.object({
    home: z.object({ name: z.string().optional() }).optional(),
    away: z.object({ name: z.string().optional() }).optional()
  }).optional(),
  league_obj: z.object({
    name: z.string().optional(),
    country: z.string().optional()
  }).optional(),
  oddsFrozen: z.boolean().optional(),
  created_at: z.string(),
  updated_at: z.string(),
});

export type Event = z.infer<typeof EventSchema>;

export const BetSchema = z.object({
  id: z.number(),
  user_id: z.string(),
  event_id: z.union([z.number(), z.string()]),
  selection: z.string(),
  odd: z.number(),
  stake: z.number(),
  potential_win: z.number(),
  status: z.string(),
  result: z.string().nullable(),
  type: z.string().optional(),
  selections: z.array(z.object({
      event_id: z.union([z.number(), z.string()]),
      market_key: z.string().optional(),
      selection: z.string(),
      odd: z.number(),
      status: z.string().optional()
  })).optional(),
  created_at: z.string(),
  updated_at: z.string(),
});

export type Bet = z.infer<typeof BetSchema>;

export interface BetSlipItem {
  id: string;
  event_id: number | string;
  match: string;
  selection: string;
  market?: string;
  odd: number;
  currentOdd?: number;
  changed?: boolean;
  stake: number;
  league?: string;
  sport?: string;
  suspended?: boolean;        // New: Selection suspended
  market_suspended?: boolean; // New: Market suspended
}

export interface MatchDetail {
  match: {
    fixture_id: number;
    date: string;
    competition: {
      id: number;
      name: string;
      season: string;
      sport: string;
    };
    home: {
      id: number;
      name: string;
      logo: string;
      score: number | null;
    };
    away: {
      id: number;
      name: string;
      logo: string;
      score: number | null;
    };
    status: {
      long: string;
      short: string;
      elapsed: number | null;
    };
    venue: {
      id: number | null;
      name: string;
      city: string;
    };
    probabilities?: {
      home_win?: number | string;
      draw?: number | string;
      away_win?: number | string;
      source?: string;
    };
    head_to_head?: Array<{
      date: string;
      home_team: string;
      away_team: string;
      score: string;
    }>;
    league_standings?: {
      home_team?: { position: number; points: number };
      away_team?: { position: number; points: number };
    };
    teams?: {
      home?: {
        name?: string;
        statistics?: {
          fixture_statistics?: Array<{ type: string; value: string | number }>;
        };
      };
      away?: {
        name?: string;
        statistics?: {
          fixture_statistics?: Array<{ type: string; value: string | number }>;
        };
      };
    };
  };
  events: any[]; // Goal, Card, Subst...
  stats: any[];
  lineups: any[];
}

export interface LiveScore {
  id: number;
  minuto: number | string;
  elapsed?: number; // Added for compatibility
  status: string;
  casa: string;
  fora: string;
  golsCasa: number;
  golsFora: number;
  frozen?: boolean;
}

export interface SuspendedMarket {
  eventId: number;
  marketId: string;
  reason: string;
}
