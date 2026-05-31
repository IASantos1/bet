/**
 * Operator View Service
 * 
 * Exibe odds híbridas, risco, alertas e eventos em tempo real
 * Dashboard principal para operador monitorizar toda a operação
 */

import { exposureCalculator } from '../risk/exposureCalculator';
import {
  getActiveAlerts as getOddsAlerts,
  removeAlert,
  markAlertAsNotified,
  type OddsAlert,
} from '../oddsAlerts';
import { getPausedMarketsStats, getPausedMarketInfo } from '../marketControl/pauseMarkets';
import { hybridOddsEngine } from '../modeling/hybridOddsEngine';

// ============================================
// TIPOS
// ============================================

export interface OperatorDashboardData {
  overview: DashboardOverview;
  liveMatches: LiveMatchDashboard[];
  upcomingMatches: UpcomingMatchDashboard[];
  alerts: AlertSummary[];
  marketStatus: MarketStatusSummary;
  riskMetrics: RiskMetricsSummary;
  systemHealth: SystemHealthStatus;
}

export interface DashboardOverview {
  totalLiveMatches: number;
  totalUpcomingMatches: number;
  totalActiveAlerts: number;
  totalPausedMarkets: number;
  globalExposure: {
    current: number;
    limit: number;
    percentage: number;
    status: 'safe' | 'warning' | 'critical';
  };
  activeBets: {
    count: number;
    totalStake: number;
    potentialPayout: number;
  };
  lastUpdate: Date;
}

export interface LiveMatchDashboard {
  matchId: string;
  sport: string;
  league: string;
  homeTeam: string;
  awayTeam: string;
  score: {
    home: number;
    away: number;
  };
  minute: number;
  status: string;
  markets: MarketDashboard[];
  exposure: {
    current: number;
    limit: number;
    percentage: number;
    riskLevel: 'low' | 'medium' | 'high' | 'critical';
  };
  recentEvents: LiveEventDashboard[];
  alerts: string[];
  isPaused: boolean;
}

export interface UpcomingMatchDashboard {
  matchId: string;
  sport: string;
  league: string;
  homeTeam: string;
  awayTeam: string;
  startTime: Date;
  markets: MarketDashboard[];
  exposure: {
    current: number;
    limit: number;
    percentage: number;
  };
  alerts: string[];
}

export interface MarketDashboard {
  marketId: string;
  marketType: string;
  marketName: string;
  isPaused: boolean;
  pauseReason?: string;
  outcomes: OutcomeDashboard[];
  exposure: {
    current: number;
    limit: number;
    percentage: number;
  };
  oddsDeviation?: number;
  lastUpdate: Date;
}

export interface OutcomeDashboard {
  outcomeId: string;
  outcomeName: string;
  odds: {
    current: number;
    model: number;
    market: number;
    hybrid: number;
    deviation: number;
  };
  exposure: number;
  betCount: number;
  totalStake: number;
  potentialPayout: number;
  probability: number;
}

export interface LiveEventDashboard {
  eventType: 'goal' | 'red_card' | 'penalty' | 'var' | 'injury' | 'substitution';
  team: string;
  minute: number;
  description: string;
  timestamp: Date;
  marketsPaused: boolean;
}

export interface AlertSummary {
  id: string;
  type: 'critical' | 'high' | 'medium' | 'low';
  category: 'exposure' | 'odds' | 'market' | 'system' | 'suspicious';
  message: string;
  matchId?: string;
  marketId?: string;
  timestamp: Date;
  acknowledged: boolean;
  autoResolved: boolean;
}

export interface MarketStatusSummary {
  totalMarkets: number;
  activeMarkets: number;
  pausedMarkets: number;
  pausedByReason: {
    liveEvent: number;
    exposure: number;
    oddsDeviation: number;
    suspicious: number;
    manual: number;
    apiFailure: number;
  };
}

export interface RiskMetricsSummary {
  globalExposure: {
    current: number;
    limit: number;
    percentage: number;
    trend: 'increasing' | 'stable' | 'decreasing';
  };
  topExposedMatches: {
    matchId: string;
    matchName: string;
    exposure: number;
    percentage: number;
  }[];
  topExposedMarkets: {
    marketId: string;
    marketName: string;
    matchName: string;
    exposure: number;
    percentage: number;
  }[];
  oddsDeviations: {
    marketId: string;
    marketName: string;
    matchName: string;
    deviation: number;
    status: 'normal' | 'warning' | 'critical';
  }[];
}

export interface SystemHealthStatus {
  apiFootball: {
    status: 'online' | 'degraded' | 'offline';
    lastSuccess: Date;
    errorRate: number;
    responseTime: number;
  };
  oddsApi: {
    status: 'online' | 'degraded' | 'offline';
    lastSuccess: Date;
    errorRate: number;
    responseTime: number;
  };
  database: {
    status: 'online' | 'degraded' | 'offline';
    connectionPool: number;
    queryTime: number;
  };
  cache: {
    hitRate: number;
    size: number;
    evictions: number;
  };
}

// ============================================
// ESTADO DO DASHBOARD
// ============================================

interface DashboardState {
  lastUpdate: Date;
  exposureHistory: { timestamp: Date; value: number }[];
  alertHistory: AlertSummary[];
  systemMetrics: {
    apiFootballCalls: number;
    oddsApiCalls: number;
    cacheHits: number;
    cacheMisses: number;
  };
}

const dashboardState: DashboardState = {
  lastUpdate: new Date(),
  exposureHistory: [],
  alertHistory: [],
  systemMetrics: {
    apiFootballCalls: 0,
    oddsApiCalls: 0,
    cacheHits: 0,
    cacheMisses: 0,
  },
};

// ============================================
// FUNÇÕES PRINCIPAIS
// ============================================

/**
 * Obtém dados completos do dashboard
 */
export async function getDashboardData(
  liveMatches: any[],
  upcomingMatches: any[]
): Promise<OperatorDashboardData> {
  console.log('📊 [OperatorView] Gerando dados do dashboard...');

  const overview = await generateOverview(liveMatches, upcomingMatches);
  const liveMatchesDashboard = await generateLiveMatchesDashboard(liveMatches);
  const upcomingMatchesDashboard = await generateUpcomingMatchesDashboard(upcomingMatches);
  const alerts = getActiveAlerts();
  const marketStatus = getMarketStatusSummary(liveMatches, upcomingMatches);
  const riskMetrics = await generateRiskMetrics(liveMatches, upcomingMatches);
  const systemHealth = getSystemHealth();

  dashboardState.lastUpdate = new Date();

  return {
    overview,
    liveMatches: liveMatchesDashboard,
    upcomingMatches: upcomingMatchesDashboard,
    alerts,
    marketStatus,
    riskMetrics,
    systemHealth,
  };
}

/**
 * Gera overview geral do dashboard
 */
async function generateOverview(
  liveMatches: any[],
  upcomingMatches: any[]
): Promise<DashboardOverview> {
  const globalExposure = exposureCalculator.getGlobalExposure();
  const alerts = getActiveAlerts();
  const pausedStats = getPausedMarketsStats();

  // Simular dados de apostas ativas (em produção viria do banco)
  const activeBets = {
    count: 1247,
    totalStake: 45680,
    potentialPayout: 123450,
  };

  return {
    totalLiveMatches: liveMatches.length,
    totalUpcomingMatches: upcomingMatches.length,
    totalActiveAlerts: alerts.filter(a => !a.acknowledged).length,
    totalPausedMarkets: pausedStats.total,
    globalExposure: {
      current: globalExposure.totalExposure,
      limit: globalExposure.limit,
      percentage: globalExposure.percentage,
      status: globalExposure.percentage > 90 ? 'critical' : 
              globalExposure.percentage > 70 ? 'warning' : 'safe',
    },
    activeBets,
    lastUpdate: new Date(),
  };
}

/**
 * Gera dashboard de jogos ao vivo
 */
async function generateLiveMatchesDashboard(
  liveMatches: any[]
): Promise<LiveMatchDashboard[]> {
  const dashboards: LiveMatchDashboard[] = [];

  for (const match of liveMatches) {
    const matchExposure = exposureCalculator.getMatchExposure(match.id);
    const markets = await generateMarketsDashboard(match.id, match.markets || []);
    const recentEvents = generateRecentEvents(match);
    const matchAlerts = getMatchAlerts(match.id);

    let riskLevel: 'low' | 'medium' | 'high' | 'critical' = 'low';
    if (matchExposure.percentage > 90) riskLevel = 'critical';
    else if (matchExposure.percentage > 70) riskLevel = 'high';
    else if (matchExposure.percentage > 50) riskLevel = 'medium';

    dashboards.push({
      matchId: match.id,
      sport: match.sport || 'soccer',
      league: match.league || 'Unknown League',
      homeTeam: match.homeTeam,
      awayTeam: match.awayTeam,
      score: {
        home: match.homeScore || 0,
        away: match.awayScore || 0,
      },
      minute: match.elapsed || 0,
      status: match.status || 'LIVE',
      markets,
      exposure: {
        current: matchExposure.totalExposure,
        limit: matchExposure.limit,
        percentage: matchExposure.percentage,
        riskLevel,
      },
      recentEvents,
      alerts: matchAlerts,
      isPaused: markets.some(m => m.isPaused),
    });
  }

  return dashboards;
}

/**
 * Gera dashboard de jogos futuros
 */
async function generateUpcomingMatchesDashboard(
  upcomingMatches: any[]
): Promise<UpcomingMatchDashboard[]> {
  const dashboards: UpcomingMatchDashboard[] = [];

  for (const match of upcomingMatches.slice(0, 20)) { // Top 20
    const matchExposure = exposureCalculator.getMatchExposure(match.id);
    const markets = await generateMarketsDashboard(match.id, match.markets || []);
    const matchAlerts = getMatchAlerts(match.id);

    dashboards.push({
      matchId: match.id,
      sport: match.sport || 'soccer',
      league: match.league || 'Unknown League',
      homeTeam: match.homeTeam,
      awayTeam: match.awayTeam,
      startTime: new Date(match.startTime),
      markets,
      exposure: {
        current: matchExposure.totalExposure,
        limit: matchExposure.limit,
        percentage: matchExposure.percentage,
      },
      alerts: matchAlerts,
    });
  }

  return dashboards;
}

/**
 * Gera dashboard de mercados
 */
async function generateMarketsDashboard(
  matchId: string,
  markets: any[]
): Promise<MarketDashboard[]> {
  const dashboards: MarketDashboard[] = [];

  for (const market of markets) {
    const marketId = `${matchId}_${market.type}`;
    const pausedInfo = getPausedMarketInfo(matchId, market.type);
    const marketExposure = exposureCalculator.getMarketExposure(matchId, market.type);
    const matchExposure = exposureCalculator.getMatchExposure(matchId);
    const outcomes = await generateOutcomesDashboard(matchId, market);

    // Calcular desvio médio de odds
    const avgDeviation = outcomes.reduce((sum, o) => sum + Math.abs(o.odds.deviation), 0) / outcomes.length;

    dashboards.push({
      marketId,
      marketType: market.type,
      marketName: market.name || market.type,
      isPaused: !!pausedInfo,
      pauseReason: pausedInfo?.reason,
      outcomes,
      exposure: {
        current: marketExposure.totalExposure,
        limit: matchExposure.limit,
        percentage: marketExposure.percentage,
      },
      oddsDeviation: avgDeviation,
      lastUpdate: new Date(),
    });
  }

  return dashboards;
}

/**
 * Gera dashboard de outcomes
 */
async function generateOutcomesDashboard(
  matchId: string,
  market: any
): Promise<OutcomeDashboard[]> {
  const dashboards: OutcomeDashboard[] = [];

  for (const outcome of market.outcomes || []) {
    const outcomeId = outcome.id || outcome.name;
    const outcomeExposure = exposureCalculator.getOutcomeExposure(matchId, market.type, outcomeId);

    // Obter odds híbridas
    const hybridOdds = await hybridOddsEngine.getHybridOdds(
      matchId,
      market.type,
      outcomeId,
      outcome.odds || 2.0
    );

    const totalStake = outcomeExposure.totalExposure;
    const potentialPayout = outcomeExposure.totalExposure;

    dashboards.push({
      outcomeId,
      outcomeName: outcome.name,
      odds: {
        current: hybridOdds.finalOdds,
        model: hybridOdds.modelOdds,
        market: hybridOdds.marketOdds,
        hybrid: hybridOdds.hybridOdds,
        deviation: hybridOdds.deviation,
      },
      exposure: outcomeExposure.totalExposure,
      betCount: outcomeExposure.betCount,
      totalStake,
      potentialPayout,
      probability: hybridOdds.probability,
    });
  }

  return dashboards;
}

/**
 * Gera eventos recentes do jogo
 */
function generateRecentEvents(match: any): LiveEventDashboard[] {
  const events: LiveEventDashboard[] = [];

  // Em produção, viria do liveEvents.ts
  // Aqui simulamos alguns eventos
  if (match.events && Array.isArray(match.events)) {
    for (const event of match.events.slice(-5)) { // Últimos 5 eventos
      events.push({
        eventType: event.type,
        team: event.team,
        minute: event.minute,
        description: event.description || `${event.type} - ${event.team}`,
        timestamp: new Date(event.timestamp),
        marketsPaused: event.marketsPaused || false,
      });
    }
  }

  return events;
}

/**
 * Obtém alertas ativos
 */
function mapOddsAlertSeverity(alert: OddsAlert): AlertSummary['type'] {
  if (alert.type === 'steam_move') return 'critical';
  if (alert.type === 'value_bet') return 'high';
  if (alert.type === 'variation') return 'medium';
  return 'low';
}

function buildOddsAlertMessage(alert: OddsAlert): string {
  const teams = `${alert.homeTeam} vs ${alert.awayTeam}`;
  const market = alert.market.toUpperCase();
  if (alert.type === 'variation') {
    return `Variação de odds em ${teams} (${market})`;
  }
  if (alert.type === 'value_bet') {
    return `Value bet detetada em ${teams} (${market})`;
  }
  if (alert.type === 'steam_move') {
    return `Steam move em ${teams} (${market})`;
  }
  return `Alerta de odds em ${teams} (${market})`;
}

function getActiveAlerts(): AlertSummary[] {
  const alerts = getOddsAlerts();

  return alerts.map(alert => ({
    id: alert.id,
    type: mapOddsAlertSeverity(alert),
    category: 'odds',
    message: buildOddsAlertMessage(alert),
    matchId: alert.matchId,
    marketId: alert.market,
    timestamp: alert.triggeredAt || alert.createdAt,
    acknowledged: alert.notified,
    autoResolved: false,
  }));
}

/**
 * Obtém alertas de um jogo específico
 */
function getMatchAlerts(matchId: string): string[] {
  const alerts = getOddsAlerts();
  return alerts
    .filter(a => a.matchId === matchId && !a.notified)
    .map(a => buildOddsAlertMessage(a));
}

/**
 * Obtém resumo de status dos mercados
 */
function getMarketStatusSummary(
  liveMatches: any[],
  upcomingMatches: any[]
): MarketStatusSummary {
  const pausedStats = getPausedMarketsStats();
  
  const totalMarkets = [...liveMatches, ...upcomingMatches].reduce(
    (sum, match) => sum + (match.markets?.length || 0),
    0
  );

  const pausedByReason = {
    liveEvent: pausedStats.byReason.live_event || 0,
    exposure:
      (pausedStats.byReason.critical_exposure || 0) +
      (pausedStats.byReason.risk_limit || 0),
    oddsDeviation: pausedStats.byReason.odds_deviation || 0,
    suspicious: pausedStats.byReason.suspicious_activity || 0,
    manual: pausedStats.byReason.manual || 0,
    apiFailure: pausedStats.byReason.api_failure || 0,
  };

  return {
    totalMarkets,
    activeMarkets: totalMarkets - pausedStats.total,
    pausedMarkets: pausedStats.total,
    pausedByReason,
  };
}

/**
 * Gera métricas de risco
 */
async function generateRiskMetrics(
  liveMatches: any[],
  upcomingMatches: any[]
): Promise<RiskMetricsSummary> {
  const globalExposure = exposureCalculator.getGlobalExposure();

  // Calcular tendência de exposição
  dashboardState.exposureHistory.push({
    timestamp: new Date(),
    value: globalExposure.totalExposure,
  });

  // Manter apenas últimos 60 pontos (5 minutos se atualizar a cada 5s)
  if (dashboardState.exposureHistory.length > 60) {
    dashboardState.exposureHistory.shift();
  }

  const trend = calculateExposureTrend();

  // Top jogos com maior exposição
  const allMatches = [...liveMatches, ...upcomingMatches];
  const topExposedMatches = allMatches
    .map(match => {
      const exposure = exposureCalculator.getMatchExposure(match.id);
      return {
        matchId: match.id,
        matchName: `${match.homeTeam} vs ${match.awayTeam}`,
        exposure: exposure.totalExposure,
        percentage: exposure.percentage,
      };
    })
    .sort((a, b) => b.exposure - a.exposure)
    .slice(0, 10);

  // Top mercados com maior exposição
  const topExposedMarkets: any[] = [];
  for (const match of allMatches) {
    for (const market of match.markets || []) {
      const exposure = exposureCalculator.getMarketExposure(match.id, market.type);
      topExposedMarkets.push({
        marketId: `${match.id}_${market.type}`,
        marketName: market.name || market.type,
        matchName: `${match.homeTeam} vs ${match.awayTeam}`,
        exposure: exposure.totalExposure,
        percentage: exposure.percentage,
      });
    }
  }
  topExposedMarkets.sort((a, b) => b.exposure - a.exposure);

  // Desvios de odds
  const oddsDeviations: any[] = [];
  for (const match of allMatches) {
    for (const market of match.markets || []) {
      for (const outcome of market.outcomes || []) {
        const hybridOdds = await hybridOddsEngine.getHybridOdds(
          match.id,
          market.type,
          outcome.id || outcome.name,
          outcome.odds || 2.0
        );

        if (Math.abs(hybridOdds.deviation) > 5) {
          oddsDeviations.push({
            marketId: `${match.id}_${market.type}`,
            marketName: `${market.name || market.type} - ${outcome.name}`,
            matchName: `${match.homeTeam} vs ${match.awayTeam}`,
            deviation: hybridOdds.deviation,
            status: Math.abs(hybridOdds.deviation) > 15 ? 'critical' :
                    Math.abs(hybridOdds.deviation) > 10 ? 'warning' : 'normal',
          });
        }
      }
    }
  }
  oddsDeviations.sort((a, b) => Math.abs(b.deviation) - Math.abs(a.deviation));

  return {
    globalExposure: {
      current: globalExposure.totalExposure,
      limit: globalExposure.limit,
      percentage: globalExposure.percentage,
      trend,
    },
    topExposedMatches,
    topExposedMarkets: topExposedMarkets.slice(0, 10),
    oddsDeviations: oddsDeviations.slice(0, 10),
  };
}

/**
 * Calcula tendência de exposição
 */
function calculateExposureTrend(): 'increasing' | 'stable' | 'decreasing' {
  if (dashboardState.exposureHistory.length < 10) {
    return 'stable';
  }

  const recent = dashboardState.exposureHistory.slice(-10);
  const older = dashboardState.exposureHistory.slice(-20, -10);

  const recentAvg = recent.reduce((sum, p) => sum + p.value, 0) / recent.length;
  const olderAvg = older.reduce((sum, p) => sum + p.value, 0) / older.length;

  const change = ((recentAvg - olderAvg) / olderAvg) * 100;

  if (change > 5) return 'increasing';
  if (change < -5) return 'decreasing';
  return 'stable';
}

/**
 * Obtém status de saúde do sistema
 */
function getSystemHealth(): SystemHealthStatus {
  // Em produção, viria de métricas reais
  return {
    apiFootball: {
      status: 'online',
      lastSuccess: new Date(),
      errorRate: 0.5,
      responseTime: 245,
    },
    oddsApi: {
      status: 'online',
      lastSuccess: new Date(),
      errorRate: 1.2,
      responseTime: 180,
    },
    database: {
      status: 'online',
      connectionPool: 45,
      queryTime: 12,
    },
    cache: {
      hitRate: 87.5,
      size: 2456,
      evictions: 123,
    },
  };
}

// ============================================
// AÇÕES DO OPERADOR
// ============================================

/**
 * Reconhece um alerta
 */
export function acknowledgeAlert(alertId: string): boolean {
  console.log(`✅ [OperatorView] Alerta reconhecido: ${alertId}`);
  markAlertAsNotified(alertId);
  return true;
}

/**
 * Resolve um alerta manualmente
 */
export function resolveAlert(alertId: string, resolution: string): boolean {
  console.log(`✅ [OperatorView] Alerta resolvido: ${alertId} - ${resolution}`);
  return removeAlert(alertId);
}

/**
 * Obtém histórico de exposição
 */
export function getExposureHistory(): { timestamp: Date; value: number }[] {
  return [...dashboardState.exposureHistory];
}

/**
 * Obtém histórico de alertas
 */
export function getAlertHistory(limit: number = 100): AlertSummary[] {
  return dashboardState.alertHistory.slice(-limit);
}

/**
 * Obtém métricas do sistema
 */
export function getSystemMetrics() {
  return { ...dashboardState.systemMetrics };
}

/**
 * Reseta métricas do sistema
 */
export function resetSystemMetrics(): void {
  dashboardState.systemMetrics = {
    apiFootballCalls: 0,
    oddsApiCalls: 0,
    cacheHits: 0,
    cacheMisses: 0,
  };
  console.log('🔄 [OperatorView] Métricas do sistema resetadas');
}

// ============================================
// EXPORTAÇÕES
// ============================================

export const operatorView = {
  getDashboardData,
  acknowledgeAlert,
  resolveAlert,
  getExposureHistory,
  getAlertHistory,
  getSystemMetrics,
  resetSystemMetrics,
};
