/**
 * Live Monitor Service
 * 
 * Monitoramento de jogos ao vivo com métricas de risco em tempo real
 * Atualização automática e detecção de eventos críticos
 */

import { exposureCalculator } from '../risk/exposureCalculator';
import { dispatchAlert } from '../risk/alertDispatcher';
import { getActiveAlerts as getOddsAlerts } from '../oddsAlerts';
import { pauseMarketForLiveEvent } from '../marketControl/pauseMarkets';
import { hybridOddsEngine } from '../modeling/hybridOddsEngine';

// ============================================
// TIPOS
// ============================================

export interface LiveMonitorData {
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
  metrics: LiveMatchMetrics;
  events: LiveEventMonitor[];
  markets: LiveMarketMonitor[];
  riskIndicators: RiskIndicator[];
  recommendations: OperatorRecommendation[];
  lastUpdate: Date;
}

export interface LiveMatchMetrics {
  exposure: {
    current: number;
    limit: number;
    percentage: number;
    trend: 'increasing' | 'stable' | 'decreasing';
    changeRate: number; // €/min
  };
  betting: {
    totalBets: number;
    totalStake: number;
    potentialPayout: number;
    avgStake: number;
    betsPerMinute: number;
  };
  odds: {
    avgDeviation: number;
    maxDeviation: number;
    volatility: number;
    updatesPerMinute: number;
  };
  markets: {
    total: number;
    active: number;
    paused: number;
    suspended: number;
  };
  alerts: {
    critical: number;
    high: number;
    medium: number;
    low: number;
  };
}

export interface LiveEventMonitor {
  eventId: string;
  eventType: 'goal' | 'red_card' | 'penalty' | 'var' | 'injury' | 'substitution' | 'corner' | 'yellow_card';
  team: string;
  player?: string;
  minute: number;
  description: string;
  timestamp: Date;
  impact: {
    marketsPaused: boolean;
    oddsChanged: boolean;
    exposureImpact: number;
    bettingSpike: boolean;
  };
  actions: {
    pausedMarkets: string[];
    triggeredAlerts: string[];
    oddsAdjustments: number;
  };
}

export interface LiveMarketMonitor {
  marketId: string;
  marketType: string;
  marketName: string;
  status: 'active' | 'paused' | 'suspended' | 'closed';
  pauseReason?: string;
  metrics: {
    exposure: number;
    exposurePercentage: number;
    betCount: number;
    totalStake: number;
    avgOddsDeviation: number;
    lastUpdate: Date;
  };
  outcomes: LiveOutcomeMonitor[];
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  warnings: string[];
}

export interface LiveOutcomeMonitor {
  outcomeId: string;
  outcomeName: string;
  odds: {
    current: number;
    previous: number;
    change: number;
    changePercentage: number;
  };
  exposure: number;
  betCount: number;
  probability: number;
  trend: 'rising' | 'stable' | 'falling';
}

export interface RiskIndicator {
  type: 'exposure' | 'odds' | 'betting' | 'event' | 'market';
  severity: 'info' | 'warning' | 'danger' | 'critical';
  message: string;
  value: number;
  threshold: number;
  recommendation: string;
}

export interface OperatorRecommendation {
  priority: 'low' | 'medium' | 'high' | 'urgent';
  action: 'monitor' | 'pause_market' | 'adjust_limits' | 'review_odds' | 'investigate';
  reason: string;
  details: string;
  affectedMarkets?: string[];
  estimatedImpact?: string;
}

// ============================================
// ESTADO DO MONITOR
// ============================================

interface MonitorState {
  activeMonitors: Map<string, LiveMonitorData>;
  eventHistory: Map<string, LiveEventMonitor[]>;
  metricsHistory: Map<string, LiveMatchMetrics[]>;
  updateIntervals: Map<string, NodeJS.Timeout>;
}

const monitorState: MonitorState = {
  activeMonitors: new Map(),
  eventHistory: new Map(),
  metricsHistory: new Map(),
  updateIntervals: new Map(),
};

// ============================================
// FUNÇÕES PRINCIPAIS
// ============================================

/**
 * Inicia monitoramento de um jogo ao vivo
 */
export function startMonitoring(
  matchId: string,
  matchData: any,
  updateInterval: number = 5000
): void {
  console.log(`🎮 [LiveMonitor] Iniciando monitoramento: ${matchId}`);

  // Se já está monitorando, para primeiro
  if (monitorState.updateIntervals.has(matchId)) {
    stopMonitoring(matchId);
  }

  // Inicializa históricos
  if (!monitorState.eventHistory.has(matchId)) {
    monitorState.eventHistory.set(matchId, []);
  }
  if (!monitorState.metricsHistory.has(matchId)) {
    monitorState.metricsHistory.set(matchId, []);
  }

  // Primeira atualização imediata
  updateMonitorData(matchId, matchData);

  // Configura atualização automática
  const interval = setInterval(() => {
    updateMonitorData(matchId, matchData);
  }, updateInterval);

  monitorState.updateIntervals.set(matchId, interval);
}

/**
 * Para monitoramento de um jogo
 */
export function stopMonitoring(matchId: string): void {
  console.log(`⏹️ [LiveMonitor] Parando monitoramento: ${matchId}`);

  const interval = monitorState.updateIntervals.get(matchId);
  if (interval) {
    clearInterval(interval);
    monitorState.updateIntervals.delete(matchId);
  }

  monitorState.activeMonitors.delete(matchId);
}

/**
 * Atualiza dados do monitor
 */
async function updateMonitorData(matchId: string, matchData: any): Promise<void> {
  try {
    const metrics = await calculateLiveMetrics(matchId, matchData);
    const events = await getRecentEvents(matchId, matchData);
    const markets = await monitorMarkets(matchId, matchData);
    const riskIndicators = generateRiskIndicators(matchId, metrics, markets);
    const recommendations = generateRecommendations(matchId, metrics, riskIndicators);

    const monitorData: LiveMonitorData = {
      matchId,
      sport: matchData.sport || 'soccer',
      league: matchData.league || 'Unknown League',
      homeTeam: matchData.homeTeam,
      awayTeam: matchData.awayTeam,
      score: {
        home: matchData.homeScore || 0,
        away: matchData.awayScore || 0,
      },
      minute: matchData.elapsed || 0,
      status: matchData.status || 'LIVE',
      metrics,
      events,
      markets,
      riskIndicators,
      recommendations,
      lastUpdate: new Date(),
    };

    monitorState.activeMonitors.set(matchId, monitorData);

    // Salva métricas no histórico
    const history = monitorState.metricsHistory.get(matchId) || [];
    history.push(metrics);
    if (history.length > 100) history.shift(); // Mantém últimas 100
    monitorState.metricsHistory.set(matchId, history);

    // Processa recomendações urgentes
    processUrgentRecommendations(matchId, recommendations);

  } catch (error) {
    console.error(`❌ [LiveMonitor] Erro ao atualizar ${matchId}:`, error);
  }
}

/**
 * Calcula métricas ao vivo
 */
async function calculateLiveMetrics(
  matchId: string,
  matchData: any
): Promise<LiveMatchMetrics> {
  const matchExposure = exposureCalculator.getMatchExposure(matchId);
  const alerts = getOddsAlerts().filter(a => a.matchId === matchId);

  // Calcular tendência de exposição
  const history = monitorState.metricsHistory.get(matchId) || [];
  let trend: 'increasing' | 'stable' | 'decreasing' = 'stable';
  let changeRate = 0;

  if (history.length >= 5) {
    const recent = history.slice(-5);
    const older = history.slice(-10, -5);
    
    if (older.length > 0) {
      const recentAvg = recent.reduce((sum, m) => sum + m.exposure.current, 0) / recent.length;
      const olderAvg = older.reduce((sum, m) => sum + m.exposure.current, 0) / older.length;
      const change = recentAvg - olderAvg;
      
      if (change > 1000) trend = 'increasing';
      else if (change < -1000) trend = 'decreasing';
      
      // €/min (assumindo 5s entre updates)
      changeRate = (change / (recent.length * 5)) * 60;
    }
  }

  // Simular dados de apostas (em produção viria do banco)
  const betting = {
    totalBets: Math.floor(Math.random() * 500) + 100,
    totalStake: matchExposure.totalExposure * 0.4,
    potentialPayout: matchExposure.totalExposure,
    avgStake: 0,
    betsPerMinute: Math.floor(Math.random() * 20) + 5,
  };
  betting.avgStake = betting.totalStake / betting.totalBets;

  // Calcular métricas de odds
  let totalDeviation = 0;
  let maxDeviation = 0;
  let oddsCount = 0;

  for (const market of matchData.markets || []) {
    for (const outcome of market.outcomes || []) {
      const hybridOdds = await hybridOddsEngine.getHybridOdds(
        matchId,
        market.type,
        outcome.id || outcome.name,
        outcome.odds || 2.0
      );
      
      totalDeviation += Math.abs(hybridOdds.deviation);
      maxDeviation = Math.max(maxDeviation, Math.abs(hybridOdds.deviation));
      oddsCount++;
    }
  }

  const avgDeviation = oddsCount > 0 ? totalDeviation / oddsCount : 0;

  // Contar mercados por status
  const markets = {
    total: matchData.markets?.length || 0,
    active: 0,
    paused: 0,
    suspended: 0,
  };

  const alertCounts = {
    critical: alerts.filter(a => a.type === 'steam_move').length,
    high: alerts.filter(a => a.type === 'value_bet').length,
    medium: alerts.filter(a => a.type === 'variation').length,
    low: alerts.filter(a => a.type === 'threshold').length,
  };

  return {
    exposure: {
      current: matchExposure.totalExposure,
      limit: matchExposure.limit,
      percentage: matchExposure.percentage,
      trend,
      changeRate,
    },
    betting,
    odds: {
      avgDeviation,
      maxDeviation,
      volatility: maxDeviation - avgDeviation,
      updatesPerMinute: 12, // Simulado
    },
    markets,
    alerts: alertCounts,
  };
}

async function getRecentEvents(matchId: string, matchData: any): Promise<LiveEventMonitor[]> {
  const events: LiveEventMonitor[] = [];
  const history = monitorState.eventHistory.get(matchId) || [];

  // Processar novos eventos
  if (matchData.events && Array.isArray(matchData.events)) {
    for (const event of matchData.events) {
      const eventId = `${matchId}_${event.type}_${event.minute}_${event.team}`;
      
      // Verifica se já foi processado
      if (!history.find(e => e.eventId === eventId)) {
        const eventMonitor: LiveEventMonitor = {
          eventId,
          eventType: event.type,
          team: event.team,
          player: event.player,
          minute: event.minute,
          description: event.description || `${event.type} - ${event.team}`,
          timestamp: new Date(event.timestamp || Date.now()),
          impact: {
            marketsPaused: false,
            oddsChanged: false,
            exposureImpact: 0,
            bettingSpike: false,
          },
          actions: {
            pausedMarkets: [],
            triggeredAlerts: [],
            oddsAdjustments: 0,
          },
        };

        processEventImpact(matchId, eventMonitor);

        events.push(eventMonitor);
        history.push(eventMonitor);
      }
    }
  }

  // Manter apenas últimos 50 eventos
  if (history.length > 50) {
    history.splice(0, history.length - 50);
  }
  monitorState.eventHistory.set(matchId, history);

  return history.slice(-10);
}

async function processEventImpact(matchId: string, event: LiveEventMonitor): Promise<void> {
  const criticalEvents = ['goal', 'red_card', 'penalty', 'var'];
  
  if (criticalEvents.includes(event.eventType)) {
    const pausedMarkets = await pauseMarketForLiveEvent(matchId, event.eventType as any, {
      metadata: { team: event.team, minute: event.minute },
    });

    event.impact.marketsPaused = true;
    event.actions.pausedMarkets = pausedMarkets.map(
      m => `${matchId}_${m.marketType}`
    );

    // Disparar alerta
    dispatchAlert({
      severity: 'high',
      category: 'market',
      message: `🚨 Evento crítico: ${event.description}`,
      matchId,
      metadata: { event: event.eventType, team: event.team },
    });

    event.actions.triggeredAlerts.push('critical_event');
  }

  // Simular impacto na exposição
  if (event.eventType === 'goal') {
    event.impact.exposureImpact = Math.random() * 5000 + 2000;
    event.impact.bettingSpike = true;
  }

  event.impact.oddsChanged = true;
  event.actions.oddsAdjustments = Math.floor(Math.random() * 10) + 5;
}

/**
 * Monitora mercados ao vivo
 */
async function monitorMarkets(
  matchId: string,
  matchData: any
): Promise<LiveMarketMonitor[]> {
  const monitors: LiveMarketMonitor[] = [];

  for (const market of matchData.markets || []) {
    const marketId = `${matchId}_${market.type}`;
    const marketExposure = exposureCalculator.getMarketExposure(matchId, market.type);
    
    const outcomes = await monitorOutcomes(matchId, market);
    
    // Calcular desvio médio
    let totalDeviation = 0;
    for (const outcome of outcomes) {
      const hybridOdds = await hybridOddsEngine.getHybridOdds(
        matchId,
        market.type,
        outcome.outcomeId,
        outcome.odds.current
      );
      totalDeviation += Math.abs(hybridOdds.deviation);
    }
    const avgDeviation = outcomes.length > 0 ? totalDeviation / outcomes.length : 0;

    // Determinar nível de risco
    let riskLevel: 'low' | 'medium' | 'high' | 'critical' = 'low';
    if (marketExposure.percentage > 90) riskLevel = 'critical';
    else if (marketExposure.percentage > 70) riskLevel = 'high';
    else if (marketExposure.percentage > 50) riskLevel = 'medium';

    // Gerar avisos
    const warnings: string[] = [];
    if (marketExposure.percentage > 80) {
      warnings.push(`⚠️ Exposição alta: ${marketExposure.percentage.toFixed(1)}%`);
    }
    if (avgDeviation > 10) {
      warnings.push(`📊 Desvio de odds: ${avgDeviation.toFixed(1)}%`);
    }

    monitors.push({
      marketId,
      marketType: market.type,
      marketName: market.name || market.type,
      status: 'active', // Simplificado
      metrics: {
        exposure: marketExposure.totalExposure,
        exposurePercentage: marketExposure.percentage,
        betCount: marketExposure.betCount,
        totalStake: marketExposure.totalStake,
        avgOddsDeviation: avgDeviation,
        lastUpdate: new Date(),
      },
      outcomes,
      riskLevel,
      warnings,
    });
  }

  return monitors;
}

/**
 * Monitora outcomes
 */
async function monitorOutcomes(
  matchId: string,
  market: any
): Promise<LiveOutcomeMonitor[]> {
  const monitors: LiveOutcomeMonitor[] = [];

  for (const outcome of market.outcomes || []) {
    const outcomeId = outcome.id || outcome.name;
    const currentOdds = outcome.odds || 2.0;
    const previousOdds = outcome.previousOdds || currentOdds;
    
    const change = currentOdds - previousOdds;
    const changePercentage = previousOdds > 0 ? (change / previousOdds) * 100 : 0;

    const outcomeExposure = exposureCalculator.getOutcomeExposure(matchId, market.type, outcomeId);
    
    const hybridOdds = await hybridOddsEngine.getHybridOdds(
      matchId,
      market.type,
      outcomeId,
      currentOdds
    );

    let trend: 'rising' | 'stable' | 'falling' = 'stable';
    if (changePercentage > 2) trend = 'rising';
    else if (changePercentage < -2) trend = 'falling';

    monitors.push({
      outcomeId,
      outcomeName: outcome.name,
      odds: {
        current: currentOdds,
        previous: previousOdds,
        change,
        changePercentage,
      },
      exposure: outcomeExposure.totalExposure,
      betCount: outcomeExposure.betCount,
      probability: hybridOdds.probability,
      trend,
    });
  }

  return monitors;
}

/**
 * Gera indicadores de risco
 */
function generateRiskIndicators(
  _matchId: string,
  metrics: LiveMatchMetrics,
  _markets: LiveMarketMonitor[]
): RiskIndicator[] {
  const indicators: RiskIndicator[] = [];

  // Indicador de exposição
  if (metrics.exposure.percentage > 90) {
    indicators.push({
      type: 'exposure',
      severity: 'critical',
      message: 'Exposição crítica no jogo',
      value: metrics.exposure.percentage,
      threshold: 90,
      recommendation: 'Pausar mercados de alto risco imediatamente',
    });
  } else if (metrics.exposure.percentage > 70) {
    indicators.push({
      type: 'exposure',
      severity: 'warning',
      message: 'Exposição elevada no jogo',
      value: metrics.exposure.percentage,
      threshold: 70,
      recommendation: 'Monitorar de perto e considerar limitar stakes',
    });
  }

  // Indicador de tendência de exposição
  if (metrics.exposure.trend === 'increasing' && metrics.exposure.changeRate > 500) {
    indicators.push({
      type: 'exposure',
      severity: 'danger',
      message: 'Exposição aumentando rapidamente',
      value: metrics.exposure.changeRate,
      threshold: 500,
      recommendation: 'Reduzir limites de stake imediatamente',
    });
  }

  // Indicador de desvio de odds
  if (metrics.odds.maxDeviation > 15) {
    indicators.push({
      type: 'odds',
      severity: 'danger',
      message: 'Desvio crítico de odds detectado',
      value: metrics.odds.maxDeviation,
      threshold: 15,
      recommendation: 'Revisar odds manualmente e pausar mercado se necessário',
    });
  } else if (metrics.odds.avgDeviation > 10) {
    indicators.push({
      type: 'odds',
      severity: 'warning',
      message: 'Desvio elevado de odds',
      value: metrics.odds.avgDeviation,
      threshold: 10,
      recommendation: 'Verificar fonte de odds e recalibrar modelo',
    });
  }

  // Indicador de volatilidade
  if (metrics.odds.volatility > 10) {
    indicators.push({
      type: 'odds',
      severity: 'warning',
      message: 'Alta volatilidade nas odds',
      value: metrics.odds.volatility,
      threshold: 10,
      recommendation: 'Aumentar frequência de atualização de odds',
    });
  }

  // Indicador de atividade de apostas
  if (metrics.betting.betsPerMinute > 50) {
    indicators.push({
      type: 'betting',
      severity: 'info',
      message: 'Volume alto de apostas',
      value: metrics.betting.betsPerMinute,
      threshold: 50,
      recommendation: 'Monitorar padrões de apostas suspeitas',
    });
  }

  // Indicador de mercados pausados
  if (metrics.markets.paused > metrics.markets.total * 0.5) {
    indicators.push({
      type: 'market',
      severity: 'warning',
      message: 'Muitos mercados pausados',
      value: metrics.markets.paused,
      threshold: metrics.markets.total * 0.5,
      recommendation: 'Verificar razões e considerar reabrir mercados seguros',
    });
  }

  // Indicador de alertas críticos
  if (metrics.alerts.critical > 0) {
    indicators.push({
      type: 'event',
      severity: 'critical',
      message: `${metrics.alerts.critical} alerta(s) crítico(s) ativo(s)`,
      value: metrics.alerts.critical,
      threshold: 0,
      recommendation: 'Revisar e resolver alertas críticos imediatamente',
    });
  }

  return indicators;
}

/**
 * Gera recomendações para o operador
 */
function generateRecommendations(
  matchId: string,
  metrics: LiveMatchMetrics,
  indicators: RiskIndicator[]
): OperatorRecommendation[] {
  const recommendations: OperatorRecommendation[] = [];

  // Recomendações baseadas em indicadores críticos
  const criticalIndicators = indicators.filter(i => i.severity === 'critical');
  if (criticalIndicators.length > 0) {
    recommendations.push({
      priority: 'urgent',
      action: 'pause_market',
      reason: 'Múltiplos indicadores críticos detectados',
      details: criticalIndicators.map(i => i.message).join('; '),
      estimatedImpact: 'Alto risco de perda significativa',
    });
  }

  // Recomendação de exposição
  if (metrics.exposure.percentage > 85) {
    recommendations.push({
      priority: 'high',
      action: 'adjust_limits',
      reason: 'Exposição próxima do limite',
      details: `Exposição atual: ${metrics.exposure.percentage.toFixed(1)}%. Reduzir stake máximo em 50%.`,
      estimatedImpact: 'Redução de risco de €10.000-€20.000',
    });
  }

  // Recomendação de odds
  if (metrics.odds.maxDeviation > 12) {
    recommendations.push({
      priority: 'high',
      action: 'review_odds',
      reason: 'Desvio significativo de odds',
      details: `Desvio máximo: ${metrics.odds.maxDeviation.toFixed(1)}%. Verificar fonte de dados.`,
      estimatedImpact: 'Possível arbitragem ou erro de dados',
    });
  }

  // Recomendação de tendência
  if (metrics.exposure.trend === 'increasing' && metrics.exposure.changeRate > 300) {
    recommendations.push({
      priority: 'medium',
      action: 'monitor',
      reason: 'Exposição crescendo rapidamente',
      details: `Taxa de crescimento: €${metrics.exposure.changeRate.toFixed(0)}/min. Monitorar próximos 5 minutos.`,
      estimatedImpact: 'Risco moderado se continuar',
    });
  }

  // Recomendação de atividade suspeita
  if (metrics.betting.betsPerMinute > 60) {
    recommendations.push({
      priority: 'medium',
      action: 'investigate',
      reason: 'Volume anormal de apostas',
      details: `${metrics.betting.betsPerMinute} apostas/min. Verificar padrões suspeitos.`,
      estimatedImpact: 'Possível atividade coordenada',
    });
  }

  return recommendations;
}

/**
 * Processa recomendações urgentes automaticamente
 */
function processUrgentRecommendations(
  matchId: string,
  recommendations: OperatorRecommendation[]
): void {
  const urgent = recommendations.filter(r => r.priority === 'urgent');
  
  for (const rec of urgent) {
    console.log(`🚨 [LiveMonitor] Recomendação urgente para ${matchId}:`, rec.reason);
    
    // Disparar alerta
    dispatchAlert({
      severity: 'critical',
      category: 'market',
      message: `⚠️ URGENTE: ${rec.reason}`,
      matchId,
      metadata: { recommendation: rec },
    });
  }
}

// ============================================
// FUNÇÕES DE CONSULTA
// ============================================

/**
 * Obtém dados de monitoramento de um jogo
 */
export function getMonitorData(matchId: string): LiveMonitorData | null {
  return monitorState.activeMonitors.get(matchId) || null;
}

/**
 * Obtém todos os jogos sendo monitorados
 */
export function getAllMonitoredMatches(): LiveMonitorData[] {
  return Array.from(monitorState.activeMonitors.values());
}

/**
 * Obtém histórico de eventos de um jogo
 */
export function getEventHistory(matchId: string): LiveEventMonitor[] {
  return monitorState.eventHistory.get(matchId) || [];
}

/**
 * Obtém histórico de métricas de um jogo
 */
export function getMetricsHistory(matchId: string): LiveMatchMetrics[] {
  return monitorState.metricsHistory.get(matchId) || [];
}

/**
 * Obtém jogos com risco crítico
 */
export function getCriticalRiskMatches(): LiveMonitorData[] {
  return Array.from(monitorState.activeMonitors.values())
    .filter(m => m.metrics.exposure.percentage > 90 || m.metrics.alerts.critical > 0);
}

/**
 * Obtém estatísticas gerais do monitor
 */
export function getMonitorStats() {
  const matches = Array.from(monitorState.activeMonitors.values());
  
  return {
    totalMonitored: matches.length,
    criticalRisk: matches.filter(m => m.metrics.exposure.percentage > 90).length,
    highRisk: matches.filter(m => m.metrics.exposure.percentage > 70).length,
    totalExposure: matches.reduce((sum, m) => sum + m.metrics.exposure.current, 0),
    totalAlerts: matches.reduce((sum, m) => 
      sum + m.metrics.alerts.critical + m.metrics.alerts.high, 0
    ),
    avgOddsDeviation: matches.reduce((sum, m) => sum + m.metrics.odds.avgDeviation, 0) / matches.length || 0,
  };
}

// ============================================
// EXPORTAÇÕES
// ============================================

export const liveMonitor = {
  startMonitoring,
  stopMonitoring,
  getMonitorData,
  getAllMonitoredMatches,
  getEventHistory,
  getMetricsHistory,
  getCriticalRiskMatches,
  getMonitorStats,
};
