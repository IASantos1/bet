// ============================================
// TIPOS BASE MULTI-DESPORTO
// ============================================

/**
 * Tipos de desportos suportados pela API-Football
 */
export type SportType = 
  | 'football'
  | 'basketball'
  | 'baseball'
  | 'hockey'
  | 'rugby'
  | 'volleyball'
  | 'formula1'
  | 'mma'
  | 'nfl'
  | 'afl'
  | 'handball';

/**
 * Interface para Liga
 */
export interface League {
  name: string;
  country: string;
  sport: string;
  teams: string[];
}

export const API_FOOTBALL_BASE_URLS = {
  football: 'https://v3.football.api-sports.io',
  basketball: 'https://v1.basketball.api-sports.io',
  hockey: 'https://v1.hockey.api-sports.io',
  baseball: 'https://v1.baseball.api-sports.io',
  handball: 'https://v1.handball.api-sports.io',
  volleyball: 'https://v1.volleyball.api-sports.io',
  rugby: 'https://v1.rugby.api-sports.io',
};

/**
 * Mapeamento de endpoints da API-Football por desporto
 */
export const API_FOOTBALL_ENDPOINTS: Record<SportType, string> = {
  football: 'https://v3.football.api-sports.io',
  basketball: 'https://v1.basketball.api-sports.io',
  baseball: 'https://v1.baseball.api-sports.io',
  hockey: 'https://v1.hockey.api-sports.io',
  rugby: 'https://v1.rugby.api-sports.io',
  volleyball: 'https://v1.volleyball.api-sports.io',
  formula1: 'https://v1.formula-1.api-sports.io',
  mma: 'https://v1.mma.api-sports.io',
  nfl: 'https://v1.american-football.api-sports.io',
  afl: 'https://v1.aussierules.api-sports.io',
  handball: 'https://v1.handball.api-sports.io',
};

/**
 * Nomes de exibição dos desportos
 */
export const SPORT_DISPLAY_NAMES: Record<SportType, string> = {
  football: 'Futebol',
  basketball: 'Basquetebol',
  baseball: 'Basebol',
  hockey: 'Hóquei no Gelo',
  rugby: 'Rugby',
  volleyball: 'Voleibol',
  formula1: 'Fórmula 1',
  mma: 'MMA',
  nfl: 'NFL',
  afl: 'AFL',
  handball: 'Andebol',
};

/**
 * Ícones dos desportos (Remix Icon)
 */
export const SPORT_ICONS: Record<SportType, string> = {
  football: 'ri-football-line',
  basketball: 'ri-basketball-line',
  baseball: 'ri-ball-pen-line',
  hockey: 'ri-hockey-puck-line',
  rugby: 'ri-football-line',
  volleyball: 'ri-basketball-line',
  formula1: 'ri-steering-2-line',
  mma: 'ri-boxing-line',
  nfl: 'ri-football-line',
  afl: 'ri-football-line',
  handball: 'ri-basketball-line',
};

// ============================================
// EVENTOS ESPECÍFICOS POR DESPORTO
// ============================================

/**
 * Eventos de Futebol
 */
export enum FootballEventType {
  GOAL = 'goal',
  YELLOW_CARD = 'yellow_card',
  RED_CARD = 'red_card',
  SUBSTITUTION = 'substitution',
  PENALTY = 'penalty',
  VAR = 'var',
  CORNER = 'corner',
  FREE_KICK = 'free_kick',
  OFFSIDE = 'offside',
  DANGEROUS_ATTACK = 'dangerous_attack',
}

/**
 * Eventos de Basquetebol
 */
export enum BasketballEventType {
  BASKET = 'basket',
  FREE_THROW = 'free_throw',
  THREE_POINTER = 'three_pointer',
  FOUL = 'foul',
  TIMEOUT = 'timeout',
  QUARTER_END = 'quarter_end',
  SUBSTITUTION = 'substitution',
  STEAL = 'steal',
  BLOCK = 'block',
  TURNOVER = 'turnover',
}

/**
 * Eventos de Basebol
 */
export enum BaseballEventType {
  RUN = 'run',
  HIT = 'hit',
  HOME_RUN = 'home_run',
  STRIKE = 'strike',
  OUT = 'out',
  WALK = 'walk',
  ERROR = 'error',
  INNING_END = 'inning_end',
  DOUBLE_PLAY = 'double_play',
  STOLEN_BASE = 'stolen_base',
}

/**
 * Eventos de Hóquei
 */
export enum HockeyEventType {
  GOAL = 'goal',
  PENALTY = 'penalty',
  POWER_PLAY = 'power_play',
  SHORT_HANDED = 'short_handed',
  PERIOD_END = 'period_end',
  FACEOFF = 'faceoff',
  SHOT = 'shot',
  SAVE = 'save',
  SUBSTITUTION = 'substitution',
}

/**
 * Eventos de Rugby
 */
export enum RugbyEventType {
  TRY = 'try',
  CONVERSION = 'conversion',
  PENALTY = 'penalty',
  DROP_GOAL = 'drop_goal',
  YELLOW_CARD = 'yellow_card',
  RED_CARD = 'red_card',
  SCRUM = 'scrum',
  LINE_OUT = 'line_out',
  SUBSTITUTION = 'substitution',
}

/**
 * Eventos de Voleibol
 */
export enum VolleyballEventType {
  POINT = 'point',
  ACE = 'ace',
  BLOCK = 'block',
  SET_END = 'set_end',
  TIMEOUT = 'timeout',
  SUBSTITUTION = 'substitution',
  SERVICE = 'service',
  ATTACK = 'attack',
}

/**
 * Eventos de Fórmula 1
 */
export enum Formula1EventType {
  LAP_COMPLETED = 'lap_completed',
  PIT_STOP = 'pit_stop',
  OVERTAKE = 'overtake',
  FASTEST_LAP = 'fastest_lap',
  DNF = 'dnf',
  SAFETY_CAR = 'safety_car',
  DRS_ENABLED = 'drs_enabled',
  PENALTY = 'penalty',
}

/**
 * Eventos de MMA
 */
export enum MMAEventType {
  STRIKE = 'strike',
  TAKEDOWN = 'takedown',
  SUBMISSION_ATTEMPT = 'submission_attempt',
  ROUND_END = 'round_end',
  KNOCKOUT = 'knockout',
  SUBMISSION = 'submission',
  DECISION = 'decision',
}

/**
 * Eventos de NFL
 */
export enum NFLEventType {
  TOUCHDOWN = 'touchdown',
  FIELD_GOAL = 'field_goal',
  SAFETY = 'safety',
  INTERCEPTION = 'interception',
  FUMBLE = 'fumble',
  SACK = 'sack',
  PENALTY = 'penalty',
  QUARTER_END = 'quarter_end',
  TWO_POINT_CONVERSION = 'two_point_conversion',
}

/**
 * Eventos de AFL
 */
export enum AFLEventType {
  GOAL = 'goal',
  BEHIND = 'behind',
  MARK = 'mark',
  FREE_KICK = 'free_kick',
  QUARTER_END = 'quarter_end',
  SUBSTITUTION = 'substitution',
}

/**
 * Eventos de Andebol
 */
export enum HandballEventType {
  GOAL = 'goal',
  PENALTY = 'penalty',
  SEVEN_METER = 'seven_meter',
  YELLOW_CARD = 'yellow_card',
  RED_CARD = 'red_card',
  TWO_MINUTE_SUSPENSION = 'two_minute_suspension',
  TIMEOUT = 'timeout',
  SUBSTITUTION = 'substitution',
}

/**
 * União de todos os tipos de eventos
 */
export type SportEventType =
  | FootballEventType
  | BasketballEventType
  | BaseballEventType
  | HockeyEventType
  | RugbyEventType
  | VolleyballEventType
  | Formula1EventType
  | MMAEventType
  | NFLEventType
  | AFLEventType
  | HandballEventType;

// ============================================
// ESTATÍSTICAS ESPECÍFICAS POR DESPORTO
// ============================================

/**
 * Estatísticas de Futebol
 */
export interface FootballStatistics {
  possession: number;
  shots: number;
  shotsOnTarget: number;
  shotsOffTarget: number;
  saves: number;
  passes: number;
  passAccuracy: number;
  corners: number;
  fouls: number;
  offsides: number;
  yellowCards: number;
  redCards: number;
  attacks: number;
  dangerousAttacks: number;
  xg?: number;
}

/**
 * Estatísticas de Basquetebol
 */
export interface BasketballStatistics {
  points: number;
  fieldGoalsMade: number;
  fieldGoalsAttempted: number;
  fieldGoalPercentage: number;
  threePointersMade: number;
  threePointersAttempted: number;
  threePointPercentage: number;
  freeThrowsMade: number;
  freeThrowsAttempted: number;
  freeThrowPercentage: number;
  rebounds: number;
  offensiveRebounds: number;
  defensiveRebounds: number;
  assists: number;
  steals: number;
  blocks: number;
  turnovers: number;
  fouls: number;
}

/**
 * Estatísticas de Basebol
 */
export interface BaseballStatistics {
  runs: number;
  hits: number;
  errors: number;
  homeRuns: number;
  strikeouts: number;
  walks: number;
  stolenBases: number;
  doubles: number;
  triples: number;
  rbi: number;
  battingAverage: number;
  onBasePercentage: number;
  sluggingPercentage: number;
}

/**
 * Estatísticas de Hóquei
 */
export interface HockeyStatistics {
  goals: number;
  shots: number;
  shotsOnGoal: number;
  saves: number;
  savePercentage: number;
  powerPlayGoals: number;
  powerPlayOpportunities: number;
  shortHandedGoals: number;
  faceoffsWon: number;
  faceoffsLost: number;
  penalties: number;
  penaltyMinutes: number;
  hits: number;
  blockedShots: number;
}

/**
 * Estatísticas de Rugby
 */
export interface RugbyStatistics {
  tries: number;
  conversions: number;
  penalties: number;
  dropGoals: number;
  points: number;
  possession: number;
  territory: number;
  tackles: number;
  missedTackles: number;
  lineBreaks: number;
  carries: number;
  metersGained: number;
  turnovers: number;
  yellowCards: number;
  redCards: number;
}

/**
 * Estatísticas de Voleibol
 */
export interface VolleyballStatistics {
  points: number;
  aces: number;
  blocks: number;
  digs: number;
  attacks: number;
  attacksSuccessful: number;
  attackPercentage: number;
  serves: number;
  serviceErrors: number;
  receptionErrors: number;
  setErrors: number;
}

/**
 * Estatísticas de Fórmula 1
 */
export interface Formula1Statistics {
  position: number;
  lapsCompleted: number;
  fastestLap?: string;
  pitStops: number;
  gridPosition: number;
  timeGap?: string;
  status: 'running' | 'finished' | 'dnf' | 'dns';
  tireCompound?: string;
  drsActivations?: number;
}

/**
 * Estatísticas de MMA
 */
export interface MMAStatistics {
  strikesLanded: number;
  strikesAttempted: number;
  strikeAccuracy: number;
  significantStrikes: number;
  takedownsLanded: number;
  takedownsAttempted: number;
  takedownAccuracy: number;
  submissionAttempts: number;
  controlTime: string;
  knockdowns: number;
}

/**
 * Estatísticas de NFL
 */
export interface NFLStatistics {
  points: number;
  passingYards: number;
  rushingYards: number;
  totalYards: number;
  completions: number;
  attempts: number;
  completionPercentage: number;
  touchdowns: number;
  interceptions: number;
  fumbles: number;
  sacks: number;
  penalties: number;
  penaltyYards: number;
  timeOfPossession: string;
}

/**
 * Estatísticas de AFL
 */
export interface AFLStatistics {
  goals: number;
  behinds: number;
  points: number;
  disposals: number;
  kicks: number;
  handballs: number;
  marks: number;
  tackles: number;
  hitouts: number;
  freeKicksFor: number;
  freeKicksAgainst: number;
  inside50s: number;
}

/**
 * Estatísticas de Andebol
 */
export interface HandballStatistics {
  goals: number;
  shots: number;
  shotAccuracy: number;
  saves: number;
  savePercentage: number;
  assists: number;
  steals: number;
  turnovers: number;
  penalties: number;
  sevenMeters: number;
  yellowCards: number;
  redCards: number;
  twoMinuteSuspensions: number;
  fastBreaks: number;
}

/**
 * União de todas as estatísticas
 */
export type SportStatistics =
  | FootballStatistics
  | BasketballStatistics
  | BaseballStatistics
  | HockeyStatistics
  | RugbyStatistics
  | VolleyballStatistics
  | Formula1Statistics
  | MMAStatistics
  | NFLStatistics
  | AFLStatistics
  | HandballStatistics;

// ============================================
// ESTRUTURA DE FIXTURE GENÉRICA
// ============================================

/**
 * Fixture genérico para qualquer desporto
 */
export interface GenericFixture {
  id: string;
  sport: SportType;
  date: string;
  timestamp: number;
  status: {
    short: string;
    long: string;
    elapsed?: number;
  };
  league: {
    id: number;
    name: string;
    country: string;
    logo?: string;
    flag?: string;
  };
  teams: {
    home: {
      id: number;
      name: string;
      logo?: string;
    };
    away: {
      id: number;
      name: string;
      logo?: string;
    };
  };
  score: {
    home: number | null;
    away: number | null;
  };
  venue?: {
    id?: number;
    name?: string;
    city?: string;
  };
}

/**
 * Evento genérico para qualquer desporto
 */
export interface GenericEvent {
  id: string;
  fixtureId: string;
  sport: SportType;
  type: SportEventType;
  time: {
    elapsed: number;
    extra?: number;
  };
  team: {
    id: number;
    name: string;
  };
  player?: {
    id: number;
    name: string;
  };
  assist?: {
    id: number;
    name: string;
  };
  detail?: string;
  comments?: string;
}

// ============================================
// ESTRUTURA DE MATCH NORMALIZADA
// ============================================

export interface MarketOutcome {
  id: string;
  name: string;
  odds: number;
  probability?: number;
  isAvailable?: boolean;
}

export interface Market {
  id: string;
  type: string;
  name: string;
  description?: string;
  sport: SportType | string;
  priority: number;
  isLive: boolean;
}

export interface NormalizedMatch {
  id: string;
  fixtureId?: number;
  sport: string;
  league: string;
  country?: string;
  homeTeam: string;
  awayTeam: string;
  homeScore?: number;
  awayScore?: number;
  status: string;
  statusShort?: string;
  startTime?: string;
  time: string;
  elapsed?: number;
  period?: string;
  minute?: string;
  isLive: boolean;
  homeTeamLogo?: string;
  awayTeamLogo?: string;
  leagueLogo?: string;
  countryFlag?: string;
  venue?: string;
  odds?: NormalizedOdds;
}

/**
 * Odds normalizadas
 */
export interface NormalizedOdds {
  home: number;
  draw?: number;
  away: number;
  bookmaker?: string;
}

/**
 * Estatísticas normalizadas
 */
export interface NormalizedStats {
  possession: { home: number; away: number };
  shots: { home: number; away: number };
  shotsOnTarget: { home: number; away: number };
  corners: { home: number; away: number };
  fouls: { home: number; away: number };
  yellowCards: { home: number; away: number };
  redCards: { home: number; away: number };
}

/**
 * Alias para compatibilidade
 */
export type Match = NormalizedMatch;

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Verifica se um desporto é suportado
 */
export function isSupportedSport(sport: string): sport is SportType {
  return sport in API_FOOTBALL_ENDPOINTS;
}

/**
 * Obtém o endpoint da API para um desporto
 */
export function getApiEndpoint(sport: SportType): string {
  return API_FOOTBALL_ENDPOINTS[sport];
}

/**
 * Obtém o nome de exibição de um desporto
 */
export function getSportDisplayName(sport: SportType): string {
  return SPORT_DISPLAY_NAMES[sport];
}

/**
 * Obtém o ícone de um desporto
 */
export function getSportIcon(sport: SportType): string {
  return SPORT_ICONS[sport];
}

/**
 * Obtém todos os desportos suportados
 */
export function getAllSports(): SportType[] {
  return Object.keys(API_FOOTBALL_ENDPOINTS) as SportType[];
}
