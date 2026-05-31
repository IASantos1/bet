
/**
 * Serviço de Estatísticas Multi-Desporto via API-Football
 * Suporta: Futebol, Basquetebol, Hóquei, Basebol, Rúgbi, Vôlei, MMA, Andebol, AFL, F1
 */

import { apiFetch } from '../services/backendClient';

// ═══════════════════════════════════════════════════════════
// TIPOS
// ═══════════════════════════════════════════════════════════

export type SportType =
  | 'football'
  | 'basketball'
  | 'hockey'
  | 'baseball'
  | 'rugby'
  | 'volleyball'
  | 'mma'
  | 'handball'
  | 'afl'
  | 'formula1';

export interface MultiSportStatistics {
  sport: SportType;
  homeTeam: string;
  awayTeam: string;
  stats: StatItem[];
  isLive: boolean;
  lastUpdated: Date;
}

export interface StatItem {
  name: string;
  home: number;
  away: number;
  icon: string;
  isPercentage?: boolean;
}

export interface H2HData {
  totalMatches: number;
  homeWins: number;
  awayWins: number;
  draws: number;
  recentMatches: H2HMatch[];
}

export interface H2HMatch {
  date: string;
  homeTeam: string;
  awayTeam: string;
  homeScore: number;
  awayScore: number;
  competition: string;
  homeTeamLogo?: string;
  awayTeamLogo?: string;
}

// ═══════════════════════════════════════════════════════════
// CACHE
// ═══════════════════════════════════════════════════════════

const statsCache = new Map<string, { data: any; timestamp: number }>();
const CACHE_TTL = {
  live: 30000, // 30 segundos para jogos ao vivo
  upcoming: 300000, // 5 minutos para jogos futuros
  h2h: 600000, // 10 minutos para H2H
};

function getCached<T>(key: string, ttl: number): T | null {
  const cached = statsCache.get(key);
  if (cached && Date.now() - cached.timestamp < ttl) {
    return cached.data as T;
  }
  return null;
}

function setCache<T>(key: string, data: T): void {
  statsCache.set(key, { data, timestamp: Date.now() });
}

// ═══════════════════════════════════════════════════════════
// FUNÇÃO PRINCIPAL DE REQUISIÇÃO VIA BACKEND HTTP (proxy/stub)
// ═══════════════════════════════════════════════════════════

async function fetchFromProxy<T>(
  sport: SportType,
  endpoint: string,
  params: Record<string, string> = {}
): Promise<T | null> {
  try {
    const searchParams = new URLSearchParams({
      sport,
      endpoint,
      ...params,
    }).toString();
    const data = await apiFetch(`/stats/proxy?${searchParams}`, { method: 'GET' });
    if (data?.error) return null;
    return (data?.response ?? null) as T | null;
  } catch (error) {
    console.error(`❌ Erro ao buscar ${sport}/${endpoint}:`, error);
    return null;
  }
}

// ═══════════════════════════════════════════════════════════
// ESTATÍSTICAS POR DESPORTO
// ═══════════════════════════════════════════════════════════

/**
 * Busca estatísticas de FUTEBOL
 */
export async function fetchFootballStats(fixtureId: number): Promise<StatItem[] | null> {
  const cacheKey = `football_stats_${fixtureId}`;
  const cached = getCached<StatItem[]>(cacheKey, CACHE_TTL.live);
  if (cached) return cached;

  const data = await fetchFromProxy<any[]>('football', 'fixtures/statistics', {
    fixture: String(fixtureId),
  });

  if (!data || data.length < 2) return null;

  const homeStats = data[0].statistics;
  const awayStats = data[1].statistics;

  const getStat = (stats: any[], type: string): number => {
    const stat = stats.find((s: any) => s.type.toLowerCase().includes(type.toLowerCase()));
    if (!stat || stat.value === null) return 0;
    const val = String(stat.value).replace('%', '');
    return parseInt(val, 10) || 0;
  };

  const stats: StatItem[] = [
    {
      name: 'Posse de Bola',
      home: getStat(homeStats, 'Ball Possession'),
      away: getStat(awayStats, 'Ball Possession'),
      icon: 'ri-pie-chart-line',
      isPercentage: true,
    },
    { name: 'Remates', home: getStat(homeStats, 'Total Shots'), away: getStat(awayStats, 'Total Shots'), icon: 'ri-focus-3-line' },
    { name: 'Remates à Baliza', home: getStat(homeStats, 'Shots on Goal'), away: getStat(awayStats, 'Shots on Goal'), icon: 'ri-crosshair-2-line' },
    { name: 'Cantos', home: getStat(homeStats, 'Corner'), away: getStat(awayStats, 'Corner'), icon: 'ri-flag-line' },
    { name: 'Faltas', home: getStat(homeStats, 'Fouls'), away: getStat(awayStats, 'Fouls'), icon: 'ri-error-warning-line' },
    { name: 'Cartões Amarelos', home: getStat(homeStats, 'Yellow'), away: getStat(awayStats, 'Yellow'), icon: 'ri-rectangle-fill' },
    { name: 'Foras de Jogo', home: getStat(homeStats, 'Offside'), away: getStat(awayStats, 'Offside'), icon: 'ri-user-forbid-line' },
    { name: 'Passes', home: getStat(homeStats, 'Total passes'), away: getStat(awayStats, 'Total passes'), icon: 'ri-share-forward-line' },
    { name: 'Precisão Passes', home: getStat(homeStats, 'Passes %'), away: getStat(awayStats, 'Passes %'), icon: 'ri-percent-line', isPercentage: true },
    { name: 'Defesas GR', home: getStat(homeStats, 'Goalkeeper Saves'), away: getStat(awayStats, 'Goalkeeper Saves'), icon: 'ri-shield-line' },
  ];

  setCache(cacheKey, stats);
  console.log(`✅ Estatísticas futebol carregadas: ${stats.length} métricas`);
  return stats;
}

/**
 * Busca estatísticas de BASQUETEBOL
 */
export async function fetchBasketballStats(gameId: number): Promise<StatItem[] | null> {
  const cacheKey = `basketball_stats_${gameId}`;
  const cached = getCached<StatItem[]>(cacheKey, CACHE_TTL.live);
  if (cached) return cached;

  const data = await fetchFromProxy<any[]>('basketball', 'games/statistics', { id: String(gameId) });

  if (!data || data.length < 2) return null;

  const homeStats = data[0].statistics?.[0] || {};
  const awayStats = data[1].statistics?.[0] || {};

  const stats: StatItem[] = [
    { name: 'Pontos Q1', home: homeStats.points?.quarter_1 || 0, away: awayStats.points?.quarter_1 || 0, icon: 'ri-basketball-line' },
    { name: 'Pontos Q2', home: homeStats.points?.quarter_2 || 0, away: awayStats.points?.quarter_2 || 0, icon: 'ri-basketball-line' },
    { name: 'Pontos Q3', home: homeStats.points?.quarter_3 || 0, away: awayStats.points?.quarter_3 || 0, icon: 'ri-basketball-line' },
    { name: 'Pontos Q4', home: homeStats.points?.quarter_4 || 0, away: awayStats.points?.quarter_4 || 0, icon: 'ri-basketball-line' },
    { name: 'Ressaltos', home: homeStats.rebounds?.total || 0, away: awayStats.rebounds?.total || 0, icon: 'ri-arrow-up-circle-line' },
    { name: 'Assistências', home: homeStats.assists || 0, away: awayStats.assists || 0, icon: 'ri-hand-heart-line' },
    { name: 'Roubos', home: homeStats.steals || 0, away: awayStats.steals || 0, icon: 'ri-hand-coin-line' },
    { name: 'Bloqueios', home: homeStats.blocks || 0, away: awayStats.blocks || 0, icon: 'ri-shield-line' },
    { name: 'Turnovers', home: homeStats.turnovers || 0, away: awayStats.turnovers || 0, icon: 'ri-refresh-line' },
    { name: '% Lançamentos', home: homeStats.fieldGoalsPercentage || 0, away: awayStats.fieldGoalsPercentage || 0, icon: 'ri-percent-line', isPercentage: true },
  ];

  setCache(cacheKey, stats);
  console.log(`✅ Estatísticas basquetebol carregadas`);
  return stats;
}

/**
 * Busca estatísticas de HÓQUEI
 */
export async function fetchHockeyStats(gameId: number): Promise<StatItem[] | null> {
  const cacheKey = `hockey_stats_${gameId}`;
  const cached = getCached<StatItem[]>(cacheKey, CACHE_TTL.live);
  if (cached) return cached;

  const data = await fetchFromProxy<any[]>('hockey', 'games/statistics', { id: String(gameId) });

  if (!data || data.length < 2) return null;

  const homeStats = data[0].statistics || {};
  const awayStats = data[1].statistics || {};

  const stats: StatItem[] = [
    { name: 'Remates', home: homeStats.shots || 0, away: awayStats.shots || 0, icon: 'ri-focus-3-line' },
    { name: 'Defesas', home: homeStats.saves || 0, away: awayStats.saves || 0, icon: 'ri-shield-line' },
    { name: 'Power Plays', home: homeStats.powerplay_goals || 0, away: awayStats.powerplay_goals || 0, icon: 'ri-flashlight-line' },
    { name: 'Penalidades', home: homeStats.penalty_minutes || 0, away: awayStats.penalty_minutes || 0, icon: 'ri-error-warning-line' },
    { name: 'Face-offs Ganhos', home: homeStats.faceoffs_won || 0, away: awayStats.faceoffs_won || 0, icon: 'ri-refresh-line' },
    { name: 'Hits', home: homeStats.hits || 0, away: awayStats.hits || 0, icon: 'ri-boxing-line' },
    { name: 'Bloqueios', home: homeStats.blocked_shots || 0, away: awayStats.blocked_shots || 0, icon: 'ri-shield-cross-line' },
    { name: 'Giveaways', home: homeStats.giveaways || 0, away: awayStats.giveaways || 0, icon: 'ri-arrow-go-back-line' },
  ];

  setCache(cacheKey, stats);
  console.log(`✅ Estatísticas hóquei carregadas`);
  return stats;
}

/**
 * Busca estatísticas de BASEBOL
 */
export async function fetchBaseballStats(gameId: number): Promise<StatItem[] | null> {
  const cacheKey = `baseball_stats_${gameId}`;
  const cached = getCached<StatItem[]>(cacheKey, CACHE_TTL.live);
  if (cached) return cached;

  const data = await fetchFromProxy<any[]>('baseball', 'games/statistics', { id: String(gameId) });

  if (!data || data.length < 2) return null;

  const homeStats = data[0].statistics || {};
  const awayStats = data[1].statistics || {};

  const stats: StatItem[] = [
    { name: 'Corridas', home: homeStats.runs || 0, away: awayStats.runs || 0, icon: 'ri-run-line' },
    { name: 'Rebatidas', home: homeStats.hits || 0, away: awayStats.hits || 0, icon: 'ri-baseball-line' },
    { name: 'Erros', home: homeStats.errors || 0, away: awayStats.errors || 0, icon: 'ri-error-warning-line' },
    { name: 'Home Runs', home: homeStats.home_runs || 0, away: awayStats.home_runs || 0, icon: 'ri-home-line' },
    { name: 'RBIs', home: homeStats.rbi || 0, away: awayStats.rbi || 0, icon: 'ri-user-add-line' },
    { name: 'Strikeouts', home: homeStats.strikeouts || 0, away: awayStats.strikeouts || 0, icon: 'ri-close-circle-line' },
    { name: 'Walks', home: homeStats.walks || 0, away: awayStats.walks || 0, icon: 'ri-walk-line' },
    { name: 'Bases Roubadas', home: homeStats.stolen_bases || 0, away: awayStats.stolen_bases || 0, icon: 'ri-speed-line' },
  ];

  setCache(cacheKey, stats);
  console.log(`✅ Estatísticas basebol carregadas`);
  return stats;
}

/**
 * Busca estatísticas de RÚGBI
 */
export async function fetchRugbyStats(gameId: number): Promise<StatItem[] | null> {
  const cacheKey = `rugby_stats_${gameId}`;
  const cached = getCached<StatItem[]>(cacheKey, CACHE_TTL.live);
  if (cached) return cached;

  const data = await fetchFromProxy<any[]>('rugby', 'games/statistics', { id: String(gameId) });

  if (!data || data.length < 2) return null;

  const homeStats = data[0].statistics || {};
  const awayStats = data[1].statistics || {};

  const stats: StatItem[] = [
    { name: 'Tries', home: homeStats.tries || 0, away: awayStats.tries || 0, icon: 'ri-rugby-line' },
    { name: 'Conversões', home: homeStats.conversions || 0, away: awayStats.conversions || 0, icon: 'ri-check-double-line' },
    { name: 'Penalidades', home: homeStats.penalties || 0, away: awayStats.penalties || 0, icon: 'ri-error-warning-line' },
    { name: 'Drop Goals', home: homeStats.drop_goals || 0, away: awayStats.drop_goals || 0, icon: 'ri-football-line' },
    { name: 'Tackles', home: homeStats.tackles || 0, away: awayStats.tackles || 0, icon: 'ri-shield-line' },
    { name: 'Metros Ganhos', home: homeStats.meters_run || 0, away: awayStats.meters_run || 0, icon: 'ri-ruler-line' },
    { name: 'Passes', home: homeStats.passes || 0, away: awayStats.passes || 0, icon: 'ri-share-forward-line' },
    { name: 'Turnovers', home: homeStats.turnovers || 0, away: awayStats.turnovers || 0, icon: 'ri-refresh-line' },
  ];

  setCache(cacheKey, stats);
  console.log(`✅ Estatísticas rúgbi carregadas`);
  return stats;
}

/**
 * Busca estatísticas de VÔLEI
 */
export async function fetchVolleyballStats(gameId: number): Promise<StatItem[] | null> {
  const cacheKey = `volleyball_stats_${gameId}`;
  const cached = getCached<StatItem[]>(cacheKey, CACHE_TTL.live);
  if (cached) return cached;

  const data = await fetchFromProxy<any[]>('volleyball', 'games/statistics', { id: String(gameId) });

  if (!data || data.length < 2) return null;

  const homeStats = data[0].statistics || {};
  const awayStats = data[1].statistics || {};

  const stats: StatItem[] = [
    { name: 'Pontos Set 1', home: homeStats.set_1 || 0, away: awayStats.set_1 || 0, icon: 'ri-volleyball-line' },
    { name: 'Pontos Set 2', home: homeStats.set_2 || 0, away: awayStats.set_2 || 0, icon: 'ri-volleyball-line' },
    { name: 'Pontos Set 3', home: homeStats.set_3 || 0, away: awayStats.set_3 || 0, icon: 'ri-volleyball-line' },
    { name: 'Aces', home: homeStats.aces || 0, away: awayStats.aces || 0, icon: 'ri-star-line' },
    { name: 'Bloqueios', home: homeStats.blocks || 0, away: awayStats.blocks || 0, icon: 'ri-shield-line' },
    { name: 'Ataques', home: homeStats.attacks || 0, away: awayStats.attacks || 0, icon: 'ri-sword-line' },
    { name: 'Erros', home: homeStats.errors || 0, away: awayStats.errors || 0, icon: 'ri-error-warning-line' },
    { name: 'Digs', home: homeStats.digs || 0, away: awayStats.digs || 0, icon: 'ri-hand-coin-line' },
  ];

  setCache(cacheKey, stats);
  console.log(`✅ Estatísticas vôlei carregadas`);
  return stats;
}

/**
 * Busca estatísticas de ANDEBOL
 */
export async function fetchHandballStats(gameId: number): Promise<StatItem[] | null> {
  const cacheKey = `handball_stats_${gameId}`;
  const cached = getCached<StatItem[]>(cacheKey, CACHE_TTL.live);
  if (cached) return cached;

  const data = await fetchFromProxy<any[]>('handball', 'games/statistics', { id: String(gameId) });

  if (!data || data.length < 2) return null;

  const homeStats = data[0].statistics || {};
  const awayStats = data[1].statistics || {};

  const stats: StatItem[] = [
    { name: 'Golos 1ª Parte', home: homeStats.goals_first_half || 0, away: awayStats.goals_first_half || 0, icon: 'ri-basketball-line' },
    { name: 'Golos 2ª Parte', home: homeStats.goals_second_half || 0, away: awayStats.goals_second_half || 0, icon: 'ri-basketball-line' },
    { name: 'Remates', home: homeStats.shots || 0, away: awayStats.shots || 0, icon: 'ri-focus-3-line' },
    { name: 'Defesas', home: homeStats.saves || 0, away: awayStats.saves || 0, icon: 'ri-shield-line' },
    { name: '% Eficácia', home: homeStats.shooting_percentage || 0, away: awayStats.shooting_percentage || 0, icon: 'ri-percent-line', isPercentage: true },
    { name: 'Faltas', home: homeStats.fouls || 0, away: awayStats.fouls || 0, icon: 'ri-error-warning-line' },
    { name: 'Exclusões', home: homeStats.suspensions || 0, away: awayStats.suspensions || 0, icon: 'ri-user-forbid-line' },
    { name: 'Turnovers', home: homeStats.turnovers || 0, away: awayStats.turnovers || 0, icon: 'ri-refresh-line' },
  ];

  setCache(cacheKey, stats);
  console.log(`✅ Estatísticas andebol carregadas`);
  return stats;
}

/**
 * Busca estatísticas de AFL
 */
export async function fetchAFLStats(gameId: number): Promise<StatItem[] | null> {
  const cacheKey = `afl_stats_${gameId}`;
  const cached = getCached<StatItem[]>(cacheKey, CACHE_TTL.live);
  if (cached) return cached;

  const data = await fetchFromProxy<any[]>('afl', 'games/statistics', { id: String(gameId) });

  if (!data || data.length < 2) return null;

  const homeStats = data[0].statistics || {};
  const awayStats = data[1].statistics || {};

  const stats: StatItem[] = [
    { name: 'Goals', home: homeStats.goals || 0, away: awayStats.goals || 0, icon: 'ri-football-line' },
    { name: 'Behinds', home: homeStats.behinds || 0, away: awayStats.behinds || 0, icon: 'ri-subtract-line' },
    { name: 'Disposals', home: homeStats.disposals || 0, away: awayStats.disposals || 0, icon: 'ri-hand-coin-line' },
    { name: 'Marks', home: homeStats.marks || 0, away: awayStats.marks || 0, icon: 'ri-check-line' },
    { name: 'Tackles', home: homeStats.tackles || 0, away: awayStats.tackles || 0, icon: 'ri-shield-line' },
    { name: 'Clearances', home: homeStats.clearances || 0, away: awayStats.clearances || 0, icon: 'ri-arrow-right-circle-line' },
    { name: 'Inside 50s', home: homeStats.inside_50s || 0, away: awayStats.inside_50s || 0, icon: 'ri-focus-2-line' },
    { name: 'Contested Poss.', home: homeStats.contested_possessions || 0, away: awayStats.contested_possessions || 0, icon: 'ri-boxing-line' },
  ];

  setCache(cacheKey, stats);
  console.log(`✅ Estatísticas AFL carregadas`);
  return stats;
}

/**
 * Busca estatísticas de MMA
 */
export async function fetchMMAStats(fightId: number): Promise<StatItem[] | null> {
  const cacheKey = `mma_stats_${fightId}`;
  const cached = getCached<StatItem[]>(cacheKey, CACHE_TTL.live);
  if (cached) return cached;

  const data = await fetchFromProxy<any[]>('mma', 'fights', { id: String(fightId) });

  if (!data || data.length === 0) return null;

  const fight = data[0];
  const fighter1 = fight.fighters?.[0]?.statistics || {};
  const fighter2 = fight.fighters?.[1]?.statistics || {};

  const stats: StatItem[] = [
    { name: 'Golpes Totais', home: fighter1.total_strikes || 0, away: fighter2.total_strikes || 0, icon: 'ri-boxing-line' },
    { name: 'Golpes Significativos', home: fighter1.significant_strikes || 0, away: fighter2.significant_strikes || 0, icon: 'ri-fire-line' },
    { name: 'Takedowns', home: fighter1.takedowns || 0, away: fighter2.takedowns || 0, icon: 'ri-arrow-down-circle-line' },
    { name: 'Defesas Takedown', home: fighter1.takedown_defense || 0, away: fighter2.takedown_defense || 0, icon: 'ri-shield-line' },
    { name: 'Submissões Tent.', home: fighter1.submission_attempts || 0, away: fighter2.submission_attempts || 0, icon: 'ri-lock-line' },
    { name: 'Controlo (seg)', home: fighter1.control_time || 0, away: fighter2.control_time || 0, icon: 'ri-time-line' },
    { name: 'Golpes Cabeça', home: fighter1.head_strikes || 0, away: fighter2.head_strikes || 0, icon: 'ri-user-line' },
    { name: 'Golpes Corpo', home: fighter1.body_strikes || 0, away: fighter2.body_strikes || 0, icon: 'ri-body-scan-line' },
  ];

  setCache(cacheKey, stats);
  console.log(`✅ Estatísticas MMA carregadas`);
  return stats;
}

// ═══════════════════════════════════════════════════════════
// FUNÇÃO GENÉRICA PARA BUSCAR ESTATÍSTICAS
// ═══════════════════════════════════════════════════════════

export async function fetchMultiSportStats(
  sport: SportType,
  gameId: number
): Promise<StatItem[] | null> {
  console.log(`📊 Buscando estatísticas: ${sport} (ID: ${gameId})`);

  switch (sport) {
    case 'football':
      return fetchFootballStats(gameId);
    case 'basketball':
      return fetchBasketballStats(gameId);
    case 'hockey':
      return fetchHockeyStats(gameId);
    case 'baseball':
      return fetchBaseballStats(gameId);
    case 'rugby':
      return fetchRugbyStats(gameId);
    case 'volleyball':
      return fetchVolleyballStats(gameId);
    case 'handball':
      return fetchHandballStats(gameId);
    case 'afl':
      return fetchAFLStats(gameId);
    case 'mma':
      return fetchMMAStats(gameId);
    default:
      console.warn(`⚠️ Desporto não suportado para estatísticas: ${sport}`);
      return null;
  }
}

// ═══════════════════════════════════════════════════════════
// HEAD-TO-HEAD MULTI-DESPORTO
// ═══════════════════════════════════════════════════════════

export async function fetchMultiSportH2H(
  sport: SportType,
  homeTeamId: number,
  awayTeamId: number
): Promise<H2HData | null> {
  const cacheKey = `h2h_${sport}_${homeTeamId}_${awayTeamId}`;
  const cached = getCached<H2HData>(cacheKey, CACHE_TTL.h2h);
  if (cached) return cached;

  let endpoint = '';
  let params: Record<string, string> = {};

  switch (sport) {
    case 'football':
      endpoint = 'fixtures/headtohead';
      params = { h2h: `${homeTeamId}-${awayTeamId}`, last: '10' };
      break;
    case 'basketball':
    case 'hockey':
    case 'baseball':
    case 'rugby':
    case 'volleyball':
    case 'handball':
      endpoint = 'games/h2h';
      params = { h2h: `${homeTeamId}-${awayTeamId}`, last: '10' };
      break;
    default:
      return null;
  }

  const data = await fetchFromProxy<any[]>(sport, endpoint, params);

  if (!data || data.length === 0) return null;

  let homeWins = 0;
  let awayWins = 0;
  let draws = 0;

  const recentMatches: H2HMatch[] = data.map((match: any) => {
    const fixture = match.fixture || match;
    const teams = match.teams || {};
    const goals = match.goals || match.scores || {};

    const hScore = goals.home ?? teams.home?.score ?? 0;
    const aScore = goals.away ?? teams.away?.score ?? 0;

    const isHomeTeamHome = teams.home?.id === homeTeamId;

    if (hScore > aScore) {
      if (isHomeTeamHome) homeWins++;
      else awayWins++;
    } else if (aScore > hScore) {
      if (isHomeTeamHome) awayWins++;
      else homeWins++;
    } else {
      draws++;
    }

    return {
      date: new Date(fixture.date || fixture.timestamp * 1000).toLocaleDateString('pt-PT'),
      homeTeam: teams.home?.name || 'Casa',
      awayTeam: teams.away?.name || 'Fora',
      homeScore: hScore,
      awayScore: aScore,
      competition: match.league?.name || '',
      homeTeamLogo: teams.home?.logo,
      awayTeamLogo: teams.away?.logo,
    };
  });

  const result: H2HData = {
    totalMatches: data.length,
    homeWins,
    awayWins,
    draws,
    recentMatches: recentMatches.sort((a, b) => {
      const aDate = new Date(a.date.split('/').reverse().join('-')).getTime();
      const bDate = new Date(b.date.split('/').reverse().join('-')).getTime();
      return bDate - aDate;
    }),
  };

  setCache(cacheKey, result);
  console.log(`✅ H2H ${sport} carregado: ${data.length} jogos`);
  return result;
}

// ═══════════════════════════════════════════════════════════
// ODDS MULTI-DESPORTO
// ═══════════════════════════════════════════════════════════

export interface MultiSportOdds {
  home: number;
  draw?: number;
  away: number;
  overUnder?: {
    line: number;
    over: number;
    under: number;
  }[];
  handicap?: {
    line: number;
    home: number;
    away: number;
  }[];
  meta?: {
    provider: 'api-football';
    bookmaker: string;
    markets: { id: number; name: string }[];
    lastUpdate?: string;
  };
}

function mapFootballOddsResponseToMultiSportOdds(
  data: any[] | null | undefined,
): MultiSportOdds | null {
  if (!data?.length) return null;

  const fixture = data[0];
  const bookmakers = fixture?.bookmakers;
  if (!Array.isArray(bookmakers) || !bookmakers.length) return null;

  const bookmaker = bookmakers[0];

  const matchWinner = bookmaker.bets?.find(
    (b: any) => b.id === 1 || String(b.name).toLowerCase().includes('match winner'),
  );

  if (!matchWinner) return null;

  const home = parseFloat(matchWinner.values?.find((v: any) => v.value === 'Home')?.odd);
  const draw = parseFloat(matchWinner.values?.find((v: any) => v.value === 'Draw')?.odd);
  const away = parseFloat(matchWinner.values?.find((v: any) => v.value === 'Away')?.odd);

  if (!home || !away) return null;

  return {
    home,
    draw,
    away,
    meta: {
      provider: 'api-football',
      bookmaker: String(bookmaker.name || ''),
      markets:
        bookmaker.bets?.map((b: any) => ({
          id: Number(b.id) || 0,
          name: String(b.name || ''),
        })) || [],
      lastUpdate: fixture.update,
    },
  };
}

export async function fetchMultiSportOdds(
  sport: SportType,
  gameId: number
): Promise<MultiSportOdds | null> {
  const cacheKey = `odds_${sport}_${gameId}`;
  const cached = getCached<MultiSportOdds>(cacheKey, CACHE_TTL.live);
  if (cached) return cached;

  // Apenas futebol tem odds na API-Football
  if (sport !== 'football') {
    console.log(`⚠️ Odds não disponíveis via API para ${sport}`);
    return null;
  }

  const data = await fetchFromProxy<any[]>('football', 'odds', { fixture: String(gameId) });
  const result = mapFootballOddsResponseToMultiSportOdds(data);
  if (!result) {
    console.warn('⚠️ Odds vazias', sport, gameId);
    return null;
  }

  setCache(cacheKey, result);
  console.log(`✅ Odds ${sport} carregadas`);
  return result;
}

export async function fetchFootballLiveOdds(
  fixtureId: number
): Promise<MultiSportOdds | null> {
  const cacheKey = `live_odds_football_${fixtureId}`;
  const cached = getCached<MultiSportOdds>(cacheKey, CACHE_TTL.live);
  if (cached) return cached;

  const data = await fetchFromProxy<any[]>('football', 'odds/live', {
    fixture: String(fixtureId),
  });

  const result = mapFootballOddsResponseToMultiSportOdds(data);
  if (!result) return null;

  setCache(cacheKey, result);
  console.log(`✅ Odds ao vivo futebol carregadas (fixture ${fixtureId})`);
  return result;
}

export async function fetchAllFootballLiveOddsMap(): Promise<Record<number, MultiSportOdds>> {
  const map: Record<number, MultiSportOdds> = {};

  try {
    const data = await apiFetch('/football/odds/live', { method: 'GET' });
    if (!data || !Array.isArray(data)) return map;

    for (const item of data as { matchId: string | number; odds: { home: number; draw: number; away: number } }[]) {
      const idNum = parseInt(String(item.matchId), 10);
      if (!idNum || !Number.isFinite(item.odds.home) || !Number.isFinite(item.odds.away)) continue;

      map[idNum] = {
        home: item.odds.home,
        draw: item.odds.draw,
        away: item.odds.away,
        meta: {
          provider: 'api-football',
          bookmaker: 'api-football',
          markets: [{ id: 1, name: 'Match Winner 1X2' }],
          lastUpdate: new Date().toISOString(),
        },
      };
    }
  } catch (error) {
    console.error('❌ Erro ao carregar odds ao vivo de futebol:', error);
  }

  return map;
}

export async function fetchTodayFootballOddsBatch(
  fixtureIds: number[],
): Promise<Record<number, MultiSportOdds>> {
  const map: Record<number, MultiSportOdds> = {};

  await Promise.all(
    fixtureIds.map(async (id) => {
      const odds = await fetchMultiSportOdds('football', id);
      if (odds) {
        map[id] = odds;
      }
    }),
  );

  return map;
}

// ═══════════════════════════════════════════════════════════
// DETECTAR DESPORTO A PARTIR DO MATCH
// ═══════════════════════════════════════════════════════════

export function detectSportType(match: any): SportType {
  const sport = (match.sport || '').toLowerCase();
  const league = (match.league || '').toLowerCase();

  if (sport.includes('basket') || league.includes('nba') || league.includes('euroleague')) {
    return 'basketball';
  }
  if (sport.includes('hockey') || sport.includes('nhl') || league.includes('nhl')) {
    return 'hockey';
  }
  if (sport.includes('baseball') || sport.includes('mlb') || league.includes('mlb')) {
    return 'baseball';
  }
  if (sport.includes('rugby') || league.includes('rugby')) {
    return 'rugby';
  }
  if (sport.includes('volley') || sport.includes('vôlei')) {
    return 'volleyball';
  }
  if (sport.includes('mma') || sport.includes('ufc') || league.includes('ufc')) {
    return 'mma';
  }
  if (sport.includes('handball') || sport.includes('andebol')) {
    return 'handball';
  }
  if (sport.includes('afl') || sport.includes('aussie')) {
    return 'afl';
  }
  if (sport.includes('formula') || sport.includes('f1')) {
    return 'formula1';
  }

  return 'football';
}

// ═══════════════════════════════════════════════════════════
// EXTRAIR ID DO JOGO
// ═══════════════════════════════════════════════════════════

export function extractGameId(matchId: string | number): number | null {
  const idStr = String(matchId);

  // Se tem prefixo, extrair número
  if (idStr.includes('-')) {
    const parts = idStr.split('-');
    for (let i = parts.length - 1; i >= 0; i--) {
      const num = parseInt(parts[i], 10);
      if (!isNaN(num) && num > 0) return num;
    }
  }

  // Se é número direto
  const num = parseInt(idStr, 10);
  return isNaN(num) || num <= 0 ? null : num;
}

export default {
  fetchMultiSportStats,
  fetchMultiSportH2H,
  fetchMultiSportOdds,
  fetchFootballLiveOdds,
  fetchAllFootballLiveOddsMap,
  detectSportType,
  extractGameId,
};
