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
  // GoalServe-sourced markets only (see server/services/goalserve.ts's parseOddsMatch) — lets the
  // Settlement Engine auto-resolve this leg beyond h2h via GoalServe's own Pregame Odds
  // Settlements API. Never set for markets synthesized by marketDerivation.ts (GoalServe never
  // priced those). The backend independently re-verifies these against its own live odds before
  // trusting them (server/routes/bets.ts's verifyGoalServeMarketRef) — never taken at face value.
  market_id?: number;
  goalserve_oddname?: string;
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

// ---------------------------------------------------------------------------
// PitchAPI shared types (byte-for-byte mirror of server/services/pitchapi.ts
// public shapes so we can cast the JSON response returned by
// GET /api/events/:id/advanced without re-typing).
// ---------------------------------------------------------------------------
export interface PitchShot {
  id: string;
  player?: { id: string; name: string };
  team_id?: string;
  teamSide?: 'home' | 'away';
  /** 0–105 (metres, always attacks the goal at x=105 — never invert) */
  x: number;
  /** 0–68 (metres, lateral across the pitch) */
  y: number;
  expected_goals?: number;
  expected_goals_on_target?: number;
  is_on_target?: boolean;
  goal_crossed_y?: number;
  goal_crossed_z?: number;
  is_inside_box?: boolean;
  event_type?: 'Goal' | 'AttemptSaved' | 'Miss' | 'Post' | (string & {});
  situation?: 'RegularPlay' | 'FromCorner' | 'SetPiece' | 'FastBreak' | 'FreeKick' | 'ThrowInSetPiece' | 'Penalty' | 'IndividualPlay' | (string & {});
  shot_type?: 'RightFoot' | 'LeftFoot' | 'Header' | 'OtherBodyParts' | (string & {});
  minute?: number;
  minute_added?: number;
  is_blocked?: boolean;
  blocked_x?: number;
  blocked_y?: number;
  is_own_goal?: boolean;
}

export interface PitchTimelineEvent {
  type: 'goal' | 'yellowcard' | 'redcard' | 'substitution';
  minute: number;
  teamSide?: 'home' | 'away';
  description: string;
  score_after?: { home: number; away: number };
  player_out?: string;
  player_in?: string;
}

export interface PitchMomentumPoint {
  minute: number;
  /** -100..100; positive favours home, negative favours away */
  value: number;
}

export interface PitchAnalytics {
  possession?: { home: number; away: number };
  shots?: { home: number; away: number };
  onTarget?: { home: number; away: number };
  corners?: { home: number; away: number };
  cards?: { home: number; away: number };
  xg?: { home: number; away: number };
}

export interface PitchAdvancedStats {
  aligned: boolean;
  pitchMatchId: string | null;
  alignedAt?: number;
  alignmentScore?: number;
  shots: PitchShot[];
  events: PitchTimelineEvent[];
  momentum: PitchMomentumPoint[];
  analytics: PitchAnalytics;
  note?: string;
}

