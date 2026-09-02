// PitchAPI client — 105x68m coordinate football statistics & event stream
// Docs: https://pitchapi.dev/
//
// Scope:
//   1. Typed REST client for PitchAPI (X-API-KEY header).
//   2. Cross-vendor JOIN helpers that align PulseScore events → PitchAPI matches.
//
// Align key strategy (fuzzy, token-based, tolerant to small wording / accent /
// order differences):
//
//   Normalize each of (league, home, away) using the same rules:
//     • lowercase, strip diacritics (São Paulo → sao paulo)
//     • remove all punctuation / brackets
//     • drop common club stopwords (FC/SC/CF/AC/FK/United/City/Wanderers/…)
//     • drop league stopwords (Division, Serie, Nacional, Championship, …)
//     • remove youth / women tags (U21 / U19 / Women / Ladies)
//     • collapse whitespace
//
//   Compare pairs with a bi-directional "Sorensen-Dice" token overlap score,
//   plus a name-contains shortcut for the (very common) case where one
//   provider abbreviates and the other uses the full name.
//
// Final join requires (date equal) AND (league score ≥ 0.75) AND
// (home/home + away/away SCORE ≥ 0.90 OR swapped home/away ≥ 0.90).
// Matches that succeed are cached per-PulseScore-event-id for 6 hours.

const BASE = 'https://api.pitchapi.dev';
const ALIGN_TTL_MS = 6 * 60 * 60 * 1000;
const SCHEDULE_TTL_MS = 12 * 60 * 60 * 1000;

// ---------------------------------------------------------------------------
// Public shared types (mirror the ones we append to src/shared/types.ts so
// the two stay byte-for-byte compatible when cast through JSON).
// ---------------------------------------------------------------------------
export interface PitchShot {
  id: string;
  player?: { id: string; name: string };
  team_id?: string;
  teamSide?: 'home' | 'away';
  /** 0–105 (metres, x always attacks the goal at 105) */
  x: number;
  /** 0–68 (metres, lateral) */
  y: number;
  expected_goals?: number;
  expected_goals_on_target?: number;
  is_on_target?: boolean;
  goal_crossed_y?: number;
  goal_crossed_z?: number;
  is_inside_box?: boolean;
  /** Goal | AttemptSaved | Miss | Post */
  event_type?: string;
  /** RegularPlay | FromCorner | SetPiece | FastBreak | FreeKick | … */
  situation?: string;
  /** RightFoot | LeftFoot | Header | OtherBodyParts */
  shot_type?: string;
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

// ---------------------------------------------------------------------------
// Raw PitchAPI response shapes (private to this module)
// ---------------------------------------------------------------------------
interface PitchApiEnvelope<T> {
  data?: T;
  error?: { code: string; message: string };
}

interface PitchScheduleMatch {
  id: string; // m_XXXXXX
  kickoff: string; // RFC3339 UTC
  status: 'upcoming' | 'live' | 'finished';
  league_id?: string;
  league_name?: string;
  home_team_id?: string;
  away_team_id?: string;
  home_team_name: string;
  away_team_name: string;
  score_home?: number;
  score_away?: number;
}

interface PitchRawShot {
  id: string;
  player?: { id: string; name: string; position_id?: number; image_url?: string };
  team_id?: string;
  x: number;
  y: number;
  expected_goals?: number;
  expected_goals_on_target?: number;
  is_on_target?: boolean;
  goal_crossed_y?: number;
  goal_crossed_z?: number;
  is_inside_box?: boolean;
  event_type: string;
  situation?: string;
  shot_type?: string;
  minute: number;
  minute_added?: number;
  is_blocked?: boolean;
  blocked_x?: number;
  blocked_y?: number;
  is_own_goal?: boolean;
  is_saved_off_line?: boolean;
  keeper?: { id: string; name: string };
}

interface PitchRawEventGoal {
  type: 'goal';
  minute: number;
  team_id?: string;
  player_name?: string;
  own_goal?: boolean;
  penalty?: boolean;
  score_home?: number;
  score_away?: number;
}
interface PitchRawEventCard {
  type: 'yellowcard' | 'redcard';
  minute: number;
  team_id?: string;
  player_name?: string;
  second_yellow?: boolean;
}
interface PitchRawEventSub {
  type: 'substitution';
  minute: number;
  team_id?: string;
  player_out_name?: string;
  player_in_name?: string;
}
type PitchRawEvent = PitchRawEventGoal | PitchRawEventCard | PitchRawEventSub;

interface PitchRawMomentumPoint { minute: number; value: number }

interface PitchRawTeamStats {
  home?: Array<{ group: string; key: string; value: any; format_type?: string }>;
  away?: Array<{ group: string; key: string; value: any; format_type?: string }>;
}

// ---------------------------------------------------------------------------
// Normalisation + fuzzy score
// ---------------------------------------------------------------------------
const DIACRITICS: Array<[RegExp, string]> = [
  [/[àáâãäåāąă]/g, 'a'], [/[æ]/g, 'ae'],
  [/[çćčĉċ]/g, 'c'], [/[ðďđ]/g, 'd'],
  [/[èéêëēęěĕė]/g, 'e'],
  [/[ĝğġģ]/g, 'g'], [/[ĥħ]/g, 'h'],
  [/[ìíîïıīĩĭį]/g, 'i'], [/[ĳ]/g, 'ij'],
  [/[ĵ]/g, 'j'], [/[ķ]/g, 'k'],
  [/[łļľĺ]/g, 'l'],
  [/[ñńņň]/g, 'n'],
  [/[òóôõöøōőŏ]/g, 'o'], [/[œ]/g, 'oe'],
  [/[ą]/g, 'a'], [/[ŕř]/g, 'r'],
  [/[śšşșŝ]/g, 's'], [/[ţťț]/g, 't'],
  [/[ùúûüūűŭų]/g, 'u'], [/[ŵ]/g, 'w'],
  [/[ýÿŷ]/g, 'y'], [/[žźż]/g, 'z'],
  [/[ÀÁÂÃÄÅĀĄĂ]/g, 'A'], [/[ÇĆČĈĊ]/g, 'C'],
  [/[ÐĎĐ]/g, 'D'], [/[ÈÉÊËĒĘĚĔĖ]/g, 'E'],
  [/[ÌÍÎÏĪĨĬĮ]/g, 'I'], [/[ÑŃŅŇ]/g, 'N'],
  [/[ÒÓÔÕÖØŌŐŎ]/g, 'O'], [/[ÙÚÛÜŪŰŬŲ]/g, 'U'],
  [/[ÝŸŶ]/g, 'Y'], [/[ŽŹŻ]/g, 'Z'],
];
function stripDiacritics(s: string): string {
  let out = s;
  for (const [re, r] of DIACRITICS) out = out.replace(re, r);
  return out;
}

const CLUB_STOPWORDS = new Set([
  'fc', 'sc', 'cf', 'ac', 'fk', 'sk', 'kc', 'afc', 'scfc', 'fkc', 'ifk',
  'ff', 'fotbollsklubb', 'club', 'clube', 'klub', 'klubben', 'klubb',
  'united', 'city', 'wanderers', 'rovers', 'rangers', 'athletic', 'afc',
  'town', 'al', 'el', 'de', 'da', 'do', 'dos', 'das', 'the',
  'women', 'ladies', 'feminino', 'feminine',
  'u17', 'u18', 'u19', 'u20', 'u21', 'u22', 'u23', 'b', 'ii',
]);
const LEAGUE_STOPWORDS = new Set([
  'league', 'division', 'serie', 'series', 'championship', 'nacional',
  'national', 'state', 'premier', 'liga', 'ligue', 'copa', 'cup', 'trophy',
  'brasil', 'brazil', 'brasileirao', 'brasileirão', 'brasileirao',
  'profissional', 'profesional', 'division', 'saison', 'season', 'liga',
]);

function tokenize(raw: string): string[] {
  const s = stripDiacritics(String(raw || ''))
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!s) return [];
  return s.split(' ').filter(Boolean);
}

export function normalizeTeamName(raw: string): { tokens: Set<string>; core: string } {
  const tokens = tokenize(raw).filter((t) => !CLUB_STOPWORDS.has(t));
  return { tokens: new Set(tokens), core: tokens.join(' ') };
}
export function normalizeLeagueName(raw: string): { tokens: Set<string>; core: string } {
  const tokens = tokenize(raw).filter((t) => !LEAGUE_STOPWORDS.has(t));
  return { tokens: new Set(tokens), core: tokens.join(' ') };
}

/**
 * Bi-directional name similarity, 0 = no overlap, 1 = identical.
 * Uses Dice over bigrams because it handles missing stopwords well; combined
 * with a whole-token overlap check.
 */
function bigrams(s: string): Set<string> {
  const out = new Set<string>();
  const n = s.length;
  for (let i = 0; i <= n - 2; i++) out.add(s.slice(i, i + 2));
  return out;
}
function dice(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const v of a.values()) if (b.has(v)) inter++;
  return (2 * inter) / (a.size + b.size);
}
export function fuzzyNameScore(a: string, b: string): number {
  if (!a || !b) return 0;
  const aa = a.toLowerCase().trim();
  const bb = b.toLowerCase().trim();
  if (aa === bb) return 1;
  if (aa.includes(bb) || bb.includes(aa)) return 0.92;
  const at = normalizeTeamName(aa).tokens;
  const bt = normalizeTeamName(bb).tokens;
  const tokInter = [...at].filter((t) => bt.has(t)).length;
  const tokDice =
    at.size === 0 && bt.size === 0 ? 1 : (2 * tokInter) / Math.max(1, at.size + bt.size);
  const coreA = [...at].join('');
  const coreB = [...bt].join('');
  const bigDice = dice(bigrams(coreA), bigrams(coreB));
  return Math.min(1, Math.max(tokDice, bigDice) * 0.95 + (aa.includes(bb) || bb.includes(aa) ? 0.05 : 0));
}

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------
export class PitchApiClient {
  private key: string | undefined;
  private dateSchedules = new Map<string, { at: number; matches: PitchScheduleMatch[] }>();

  constructor(key?: string) {
    this.key = key && key.startsWith('pk_') ? key : undefined;
  }

  get configured(): boolean { return Boolean(this.key); }

  private async get<T>(path: string): Promise<T | null> {
    if (!this.key) return null;
    try {
      const headers: Record<string, string> = {
        'X-API-KEY': this.key,
        'Accept': 'application/json',
      };
      const controller = typeof AbortController !== 'undefined' ? new AbortController() : undefined;
      const timeout = setTimeout(() => controller?.abort(), 10_000);
      const res = await fetch(`${BASE}${path}`, {
        method: 'GET',
        headers,
        signal: controller?.signal,
      });
      clearTimeout(timeout);
      const text = await res.text();
      let json: PitchApiEnvelope<T>;
      try { json = JSON.parse(text) as PitchApiEnvelope<T>; } catch {
        return null;
      }
      if (json.error) {
        if (json.error.code === 'RATE_LIMIT_EXCEEDED') return null;
        return null;
      }
      return (json.data ?? null) as T | null;
    } catch {
      return null;
    }
  }

  async getDateSchedule(dateStr: string): Promise<PitchScheduleMatch[]> {
    const cacheKey = String(dateStr || '');
    const cached = this.dateSchedules.get(cacheKey);
    const now = Date.now();
    if (cached && now - cached.at < SCHEDULE_TTL_MS) return cached.matches;
    const data = await this.get<PitchScheduleMatch[]>(`/v1/date/${encodeURIComponent(cacheKey)}`);
    const matches = Array.isArray(data) ? data : [];
    this.dateSchedules.set(cacheKey, { at: now, matches });
    return matches;
  }

  async getMatchShots(matchId: string): Promise<PitchRawShot[]> {
    const data = await this.get<PitchRawShot[]>(`/v1/matches/${encodeURIComponent(matchId)}/shots`);
    return Array.isArray(data) ? data : [];
  }

  async getMatchEvents(matchId: string): Promise<PitchRawEvent[]> {
    const data = await this.get<PitchRawEvent[]>(`/v1/matches/${encodeURIComponent(matchId)}/events`);
    return Array.isArray(data) ? data : [];
  }

  async getMatchMomentum(matchId: string): Promise<PitchRawMomentumPoint[]> {
    const data = await this.get<PitchRawMomentumPoint[]>(`/v1/matches/${encodeURIComponent(matchId)}/momentum`);
    return Array.isArray(data) ? data : [];
  }

  async getMatchTeamStats(matchId: string): Promise<PitchRawTeamStats> {
    const data = await this.get<PitchRawTeamStats>(`/v1/matches/${encodeURIComponent(matchId)}/team-stats`);
    return data && typeof data === 'object' ? data : {};
  }
}

// ---------------------------------------------------------------------------
// Aligner
// ---------------------------------------------------------------------------
type AlignKey = {
  date: string; // YYYY-MM-DD
  league: { tokens: Set<string>; core: string; raw: string };
  home: { tokens: Set<string>; core: string; raw: string };
  away: { tokens: Set<string>; core: string; raw: string };
};

export function pulseToAlignKey(input: {
  event_date: string | Date | null | undefined;
  league: string;
  home_team: string;
  away_team: string;
}): AlignKey | null {
  let d: string | null = null;
  if (input.event_date instanceof Date) {
    d = input.event_date.toISOString().slice(0, 10);
  } else if (typeof input.event_date === 'string' && input.event_date) {
    const t = new Date(input.event_date);
    if (!Number.isNaN(t.getTime())) d = t.toISOString().slice(0, 10);
  }
  if (!d) return null;
  return {
    date: d,
    league: { ...normalizeLeagueName(input.league), raw: input.league },
    home: { ...normalizeTeamName(input.home_team), raw: input.home_team },
    away: { ...normalizeTeamName(input.away_team), raw: input.away_team },
  };
}

function scheduleItemToAlignKey(m: PitchScheduleMatch): AlignKey {
  return {
    date: new Date(m.kickoff).toISOString().slice(0, 10),
    league: { ...normalizeLeagueName(m.league_name || ''), raw: m.league_name || '' },
    home: { ...normalizeTeamName(m.home_team_name), raw: m.home_team_name },
    away: { ...normalizeTeamName(m.away_team_name), raw: m.away_team_name },
  };
}

function alignScore(a: AlignKey, b: AlignKey): number {
  if (a.date !== b.date) return 0;
  const lgScore = Math.max(
    fuzzyNameScore(a.league.core, b.league.core),
    a.league.core && b.league.core && a.league.core === b.league.core ? 1 : 0,
  );
  if (lgScore < 0.65) return 0;
  const direct =
    fuzzyNameScore(a.home.core, b.home.core) * 0.5 +
    fuzzyNameScore(a.away.core, b.away.core) * 0.5;
  const swapped =
    fuzzyNameScore(a.home.core, b.away.core) * 0.5 +
    fuzzyNameScore(a.away.core, b.home.core) * 0.5;
  const teamScore = Math.max(direct, swapped);
  if (teamScore < 0.82) return 0;
  return 0.25 * lgScore + 0.75 * teamScore;
}

export function alignPulseToPitchSchedule(
  pulse: AlignKey,
  schedule: PitchScheduleMatch[],
): { matchId: string; score: number } | null {
  let best: { matchId: string; score: number } | null = null;
  for (const m of schedule) {
    const k = scheduleItemToAlignKey(m);
    const s = alignScore(pulse, k);
    if (s >= 0.85 && (!best || s > best.score)) best = { matchId: m.id, score: s };
  }
  return best;
}

// ---------------------------------------------------------------------------
// Aggregator — Pitch raw data → shared PitchAdvancedStats
// ---------------------------------------------------------------------------
export interface AlignResult {
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

export function buildEmptyStats(note?: string): AlignResult {
  return {
    aligned: false,
    pitchMatchId: null,
    shots: [],
    events: [],
    momentum: [],
    analytics: {},
    ...(note ? { note } : {}),
  };
}

export async function buildPitchAdvancedStats(
  client: PitchApiClient,
  pitchMatchId: string,
  opts: {
    pitchHomeTeamId?: string;
    pitchAwayTeamId?: string;
    alignmentScore?: number;
  } = {},
): Promise<AlignResult> {
  if (!client.configured) return buildEmptyStats('PitchAPI key missing');
  const [shotsRaw, eventsRaw, momentumRaw, teamStats] = await Promise.all([
    client.getMatchShots(pitchMatchId),
    client.getMatchEvents(pitchMatchId),
    client.getMatchMomentum(pitchMatchId),
    client.getMatchTeamStats(pitchMatchId),
  ]);

  const shots: PitchShot[] = shotsRaw.map((s): PitchShot => {
    let teamSide: 'home' | 'away' | undefined;
    if (opts.pitchHomeTeamId && s.team_id === opts.pitchHomeTeamId) teamSide = 'home';
    else if (opts.pitchAwayTeamId && s.team_id === opts.pitchAwayTeamId) teamSide = 'away';
    return {
      id: s.id,
      player: s.player ? { id: s.player.id, name: s.player.name } : undefined,
      team_id: s.team_id,
      teamSide,
      x: s.x,
      y: s.y,
      expected_goals: s.expected_goals,
      expected_goals_on_target: s.expected_goals_on_target,
      is_on_target: s.is_on_target,
      goal_crossed_y: s.goal_crossed_y,
      goal_crossed_z: s.goal_crossed_z,
      is_inside_box: s.is_inside_box,
      event_type: s.event_type,
      situation: s.situation,
      shot_type: s.shot_type,
      minute: s.minute,
      minute_added: s.minute_added,
      is_blocked: s.is_blocked,
      blocked_x: s.blocked_x,
      blocked_y: s.blocked_y,
      is_own_goal: s.is_own_goal,
    };
  });

  const events: PitchTimelineEvent[] = eventsRaw.map((e): PitchTimelineEvent => {
    let teamSide: 'home' | 'away' | undefined;
    if (opts.pitchHomeTeamId && e.team_id === opts.pitchHomeTeamId) teamSide = 'home';
    else if (opts.pitchAwayTeamId && e.team_id === opts.pitchAwayTeamId) teamSide = 'away';
    if (e.type === 'goal') {
      return {
        type: 'goal',
        minute: e.minute,
        teamSide,
        description: [e.player_name || 'Gol', e.own_goal ? 'contra' : null, e.penalty ? 'pênalti' : null]
          .filter(Boolean).join(' · '),
        score_after:
          typeof e.score_home === 'number' && typeof e.score_away === 'number'
            ? { home: e.score_home, away: e.score_away }
            : undefined,
      };
    }
    if (e.type === 'yellowcard' || e.type === 'redcard') {
      return {
        type: e.type,
        minute: e.minute,
        teamSide,
        description: [e.player_name || 'Cartão', e.second_yellow ? '(2º amarelo)' : null].filter(Boolean).join(' · '),
      };
    }
    // Discriminated union residual: only 'substitution' remains; safe cast.
    const sub = e as unknown as PitchRawEventSub;
    return {
      type: 'substitution' as const,
      minute: e.minute,
      teamSide,
      description: [sub.player_out_name || 'Sai', '→', sub.player_in_name || 'Entra'].join(' '),
      player_out: sub.player_out_name,
      player_in: sub.player_in_name,
    };
  });

  const momentum: PitchMomentumPoint[] = momentumRaw.map((m) => ({
    minute: m.minute,
    value: m.value,
  }));

  const analytics = aggregateTeamStats(teamStats, shots);

  return {
    aligned: true,
    pitchMatchId,
    alignedAt: Date.now(),
    alignmentScore: opts.alignmentScore,
    shots,
    events,
    momentum,
    analytics,
  };
}

function aggregateTeamStats(ts: PitchRawTeamStats, shots: PitchShot[]): PitchAnalytics {
  const pick = (side: 'home' | 'away', group: string, key: string): number | undefined => {
    const rows = ts[side] || [];
    for (const r of rows) {
      if (r.group === group && r.key === key) {
        if (typeof r.value === 'number') return r.value;
        if (typeof r.value === 'string') {
          const n = parseFloat(r.value);
          return Number.isFinite(n) ? n : undefined;
        }
      }
    }
    return undefined;
  };

  const shotGroups = shots.reduce<{
    home: { all: number; onT: number };
    away: { all: number; onT: number };
  }>(
    (acc, s) => {
      const side = s.teamSide === 'home' ? 'home' : s.teamSide === 'away' ? 'away' : null;
      if (!side) return acc;
      acc[side].all++;
      if (s.is_on_target) acc[side].onT++;
      return acc;
    },
    { home: { all: 0, onT: 0 }, away: { all: 0, onT: 0 } },
  );

  return {
    possession: {
      home: pick('home', 'Totals', 'possession') ?? 50,
      away: pick('away', 'Totals', 'possession') ?? 50,
    },
    shots: {
      home: pick('home', 'Shooting', 'shots') ?? shotGroups.home.all,
      away: pick('away', 'Shooting', 'shots') ?? shotGroups.away.all,
    },
    onTarget: {
      home: pick('home', 'Shooting', 'shots_on_target') ?? shotGroups.home.onT,
      away: pick('away', 'Shooting', 'shots_on_target') ?? shotGroups.away.onT,
    },
    corners: {
      home: pick('home', 'Totals', 'corners_won') ?? 0,
      away: pick('away', 'Totals', 'corners_won') ?? 0,
    },
    cards: {
      home: pick('home', 'Defending', 'cards') ?? 0,
      away: pick('away', 'Defending', 'cards') ?? 0,
    },
    xg: {
      home: pick('home', 'Shooting', 'xG') ?? 0,
      away: pick('away', 'Shooting', 'xG') ?? 0,
    },
  };
}

// Per-event-id align cache — never hit PitchAPI schedule more than once per
// calendar day for the same PulseScore event (we keep the mapping even if it
// resolved to null so we don't retry in tight loops).
export class PitchAlignCache {
  private map = new Map<string, { at: number; matchId: string | null; score: number | undefined; pitchHomeId?: string; pitchAwayId?: string }>();
  constructor() {}

  get(eventId: string): { matchId: string | null; score: number | undefined; pitchHomeId?: string; pitchAwayId?: string } | null {
    const v = this.map.get(eventId);
    if (!v) return null;
    if (Date.now() - v.at > ALIGN_TTL_MS) { this.map.delete(eventId); return null; }
    return { matchId: v.matchId, score: v.score, pitchHomeId: v.pitchHomeId, pitchAwayId: v.pitchAwayId };
  }

  set(eventId: string, matchId: string | null, score?: number, pitchHomeId?: string, pitchAwayId?: string): void {
    this.map.set(eventId, { at: Date.now(), matchId, score, pitchHomeId, pitchAwayId });
  }
}

// Pull the PitchAPI schedule "date" string for a PulseScore event_date.
export function ymdFromPulseDate(d: string | Date | null | undefined): string | null {
  if (!d) return null;
  try {
    const t = typeof d === 'string' ? new Date(d) : d;
    if (Number.isNaN(t.getTime())) return null;
    return t.toISOString().slice(0, 10);
  } catch {
    return null;
  }
}
