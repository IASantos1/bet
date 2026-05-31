/**
 * 🚨 Alert Dispatcher
 * 
 * Dispara alertas para o operador quando:
 * - Odds fora do limite
 * - Exposição acima do máximo
 * - Evento crítico detectado
 */

import { GlobalExposure, RiskLimits, DEFAULT_RISK_LIMITS } from './exposureCalculator';

export type AlertSeverity = 'info' | 'warning' | 'critical' | 'emergency';

export type AlertType = 
  | 'odds_deviation'
  | 'exposure_high'
  | 'exposure_critical'
  | 'market_unbalanced'
  | 'suspicious_betting'
  | 'live_event'
  | 'system_limit'
  | 'api_failure'
  | 'manual_intervention';

export interface Alert {
  id: string;
  type: AlertType;
  severity: AlertSeverity;
  title: string;
  message: string;
  matchId?: string;
  matchName?: string;
  sport?: string;
  market?: string;
  data?: Record<string, any>;
  timestamp: string;
  acknowledged: boolean;
  acknowledgedBy?: string;
  acknowledgedAt?: string;
  resolved: boolean;
  resolvedAt?: string;
  actions?: AlertAction[];
}

export interface AlertAction {
  label: string;
  action: 'pause_market' | 'close_market' | 'limit_stake' | 'adjust_odds' | 'manual_review';
  params?: Record<string, any>;
}

export interface AlertRule {
  type: AlertType;
  condition: (data: any) => boolean;
  severity: AlertSeverity;
  title: string;
  messageTemplate: (data: any) => string;
  actions?: AlertAction[];
}

// Regras de alertas configuráveis
export const ALERT_RULES: AlertRule[] = [
  // 1. Desvio de odds
  {
    type: 'odds_deviation',
    condition: (data) => Math.abs(data.deviation) > 15,
    severity: 'warning',
    title: 'Desvio de Odds Elevado',
    messageTemplate: (data) => 
      `Odds de ${data.market} em ${data.matchName} desviaram ${data.deviation.toFixed(1)}% do mercado`,
    actions: [
      { label: 'Ajustar Odds', action: 'adjust_odds' },
      { label: 'Pausar Mercado', action: 'pause_market' },
    ],
  },
  
  // 2. Exposição elevada por jogo
  {
    type: 'exposure_high',
    condition: (data) => data.exposurePercentage > 70,
    severity: 'warning',
    title: 'Exposição Elevada',
    messageTemplate: (data) => 
      `Exposição em ${data.matchName} atingiu ${data.exposurePercentage.toFixed(0)}% (€${data.exposure.toLocaleString('pt-PT')})`,
    actions: [
      { label: 'Limitar Stakes', action: 'limit_stake', params: { factor: 0.5 } },
      { label: 'Fechar Mercado', action: 'close_market' },
    ],
  },
  
  // 3. Exposição crítica por jogo
  {
    type: 'exposure_critical',
    condition: (data) => data.exposurePercentage > 90,
    severity: 'critical',
    title: '🚨 Exposição Crítica',
    messageTemplate: (data) => 
      `CRÍTICO: Exposição em ${data.matchName} atingiu ${data.exposurePercentage.toFixed(0)}% (€${data.exposure.toLocaleString('pt-PT')})`,
    actions: [
      { label: 'Fechar Mercado Imediatamente', action: 'close_market' },
      { label: 'Revisão Manual', action: 'manual_review' },
    ],
  },
  
  // 4. Mercado desbalanceado
  {
    type: 'market_unbalanced',
    condition: (data) => data.balancedRisk < 30,
    severity: 'warning',
    title: 'Mercado Desbalanceado',
    messageTemplate: (data) => 
      `Mercado ${data.market} em ${data.matchName} está desbalanceado (${data.balancedRisk.toFixed(0)}% de equilíbrio)`,
    actions: [
      { label: 'Ajustar Odds', action: 'adjust_odds' },
      { label: 'Limitar Stakes', action: 'limit_stake', params: { factor: 0.3 } },
    ],
  },
  
  // 5. Padrão de apostas suspeito
  {
    type: 'suspicious_betting',
    condition: (data) => data.suspicionScore > 80,
    severity: 'critical',
    title: '⚠️ Atividade Suspeita',
    messageTemplate: (data) => 
      `Padrão suspeito detectado em ${data.matchName}: ${data.reason}`,
    actions: [
      { label: 'Pausar Mercado', action: 'pause_market' },
      { label: 'Revisão Manual Urgente', action: 'manual_review' },
    ],
  },
  
  // 6. Evento ao vivo crítico
  {
    type: 'live_event',
    condition: (data) => ['goal', 'red_card', 'penalty', 'var'].includes(data.eventType),
    severity: 'info',
    title: 'Evento Ao Vivo',
    messageTemplate: (data) => 
      `${data.eventName} em ${data.matchName} (${data.minute}')`,
    actions: [
      { label: 'Pausar Mercado (Auto)', action: 'pause_market', params: { duration: 10 } },
    ],
  },
  
  // 7. Limite do sistema atingido
  {
    type: 'system_limit',
    condition: (data) => data.limitUsage > 85,
    severity: 'warning',
    title: 'Limite do Sistema',
    messageTemplate: (data) => 
      `${data.limitType} atingiu ${data.limitUsage.toFixed(0)}% (€${data.current.toLocaleString('pt-PT')} / €${data.limit.toLocaleString('pt-PT')})`,
    actions: [
      { label: 'Limitar Novas Apostas', action: 'limit_stake', params: { factor: 0.5 } },
    ],
  },
  
  // 8. Falha de API
  {
    type: 'api_failure',
    condition: (data) => data.failureCount > 3,
    severity: 'critical',
    title: '🔴 Falha de API',
    messageTemplate: (data) => 
      `API ${data.apiName} falhou ${data.failureCount} vezes. Último erro: ${data.lastError}`,
    actions: [
      { label: 'Pausar Mercados Afetados', action: 'pause_market' },
      { label: 'Ativar Fallback', action: 'manual_review' },
    ],
  },
];

/**
 * Gera um ID único para o alerta
 */
function generateAlertId(): string {
  return `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Cria um alerta baseado numa regra
 */
export function createAlert(
  rule: AlertRule,
  data: any,
  matchId?: string,
  matchName?: string,
  sport?: string,
  market?: string
): Alert {
  return {
    id: generateAlertId(),
    type: rule.type,
    severity: rule.severity,
    title: rule.title,
    message: rule.messageTemplate(data),
    matchId,
    matchName,
    sport,
    market,
    data,
    timestamp: new Date().toISOString(),
    acknowledged: false,
    resolved: false,
    actions: rule.actions,
  };
}

/**
 * Verifica exposição e gera alertas
 */
export function checkExposureAlerts(
  exposure: GlobalExposure,
  limits: RiskLimits = DEFAULT_RISK_LIMITS
): Alert[] {
  const alerts: Alert[] = [];

  // 1. Verifica exposição global
  const globalUsage = (exposure.netExposure / limits.maxGlobalExposure) * 100;
  if (globalUsage > 85) {
    const rule = ALERT_RULES.find((r) => r.type === 'system_limit');
    if (rule) {
      alerts.push(
        createAlert(rule, {
          limitType: 'Exposição Global',
          limitUsage: globalUsage,
          current: exposure.netExposure,
          limit: limits.maxGlobalExposure,
        })
      );
    }
  }

  // 2. Verifica exposição por jogo
  Object.values(exposure.byMatch).forEach((match) => {
    const matchUsage = (match.netExposure / limits.maxExposurePerMatch) * 100;

    // Crítico > 90%
    if (matchUsage > 90) {
      const rule = ALERT_RULES.find((r) => r.type === 'exposure_critical');
      if (rule) {
        alerts.push(
          createAlert(
            rule,
            {
              exposurePercentage: matchUsage,
              exposure: match.netExposure,
            },
            match.matchId,
            match.matchName,
            match.sport
          )
        );
      }
    }
    // Elevado > 70%
    else if (matchUsage > 70) {
      const rule = ALERT_RULES.find((r) => r.type === 'exposure_high');
      if (rule) {
        alerts.push(
          createAlert(
            rule,
            {
              exposurePercentage: matchUsage,
              exposure: match.netExposure,
            },
            match.matchId,
            match.matchName,
            match.sport
          )
        );
      }
    }

    // 3. Verifica mercados desbalanceados
    Object.entries(match.markets).forEach(([marketName, marketData]) => {
      if (marketData.balancedRisk < 30) {
        const rule = ALERT_RULES.find((r) => r.type === 'market_unbalanced');
        if (rule) {
          alerts.push(
            createAlert(
              rule,
              {
                market: marketName,
                balancedRisk: marketData.balancedRisk,
              },
              match.matchId,
              match.matchName,
              match.sport,
              marketName
            )
          );
        }
      }
    });
  });

  // 4. Verifica exposição por desporto
  Object.values(exposure.bySport).forEach((sport) => {
    const sportUsage = (sport.maxLoss / limits.maxExposurePerSport) * 100;
    if (sportUsage > 85) {
      const rule = ALERT_RULES.find((r) => r.type === 'system_limit');
      if (rule) {
        alerts.push(
          createAlert(rule, {
            limitType: `Exposição ${sport.sport}`,
            limitUsage: sportUsage,
            current: sport.maxLoss,
            limit: limits.maxExposurePerSport,
          })
        );
      }
    }
  });

  return alerts;
}

/**
 * Verifica desvio de odds e gera alertas
 */
export function checkOddsDeviationAlert(
  matchId: string,
  matchName: string,
  sport: string,
  market: string,
  modelOdds: number,
  marketOdds: number,
  maxDeviation: number = 12
): Alert | null {
  const deviation = Math.abs(((modelOdds - marketOdds) / marketOdds) * 100);

  if (deviation > maxDeviation) {
    const rule = ALERT_RULES.find((r) => r.type === 'odds_deviation');
    if (rule) {
      return createAlert(
        rule,
        {
          market,
          deviation,
          modelOdds,
          marketOdds,
          matchName,
        },
        matchId,
        matchName,
        sport,
        market
      );
    }
  }

  return null;
}

/**
 * Cria alerta para evento ao vivo
 */
export function createLiveEventAlert(
  matchId: string,
  matchName: string,
  sport: string,
  eventType: 'goal' | 'red_card' | 'penalty' | 'var' | 'substitution',
  eventName: string,
  minute: number
): Alert {
  const rule = ALERT_RULES.find((r) => r.type === 'live_event');
  
  if (!rule) {
    // Fallback se regra não existir
    return {
      id: generateAlertId(),
      type: 'live_event',
      severity: 'info',
      title: 'Evento Ao Vivo',
      message: `${eventName} em ${matchName} (${minute}')`,
      matchId,
      matchName,
      sport,
      data: { eventType, eventName, minute },
      timestamp: new Date().toISOString(),
      acknowledged: false,
      resolved: false,
    };
  }

  return createAlert(
    rule,
    { eventType, eventName, minute, matchName },
    matchId,
    matchName,
    sport
  );
}

/**
 * Detecta padrões suspeitos de apostas
 */
export function detectSuspiciousBetting(
  matchId: string,
  matchName: string,
  sport: string,
  bets: Array<{
    userId: string;
    stake: number;
    odds: number;
    timestamp: string;
    market: string;
    selection: string;
  }>
): Alert | null {
  let suspicionScore = 0;
  const reasons: string[] = [];

  // 1. Múltiplas apostas grandes do mesmo utilizador
  const userBets = new Map<string, number>();
  bets.forEach((bet) => {
    const current = userBets.get(bet.userId) || 0;
    userBets.set(bet.userId, current + bet.stake);
  });

  userBets.forEach((totalStake, userId) => {
    if (totalStake > 5000) {
      suspicionScore += 20;
      reasons.push(`Utilizador ${userId} apostou €${totalStake.toLocaleString('pt-PT')}`);
    }
  });

  // 2. Apostas concentradas numa seleção
  const selections = new Map<string, number>();
  bets.forEach((bet) => {
    const key = `${bet.market}:${bet.selection}`;
    const current = selections.get(key) || 0;
    selections.set(key, current + bet.stake);
  });

  const totalStake = bets.reduce((sum, bet) => sum + bet.stake, 0);
  selections.forEach((stake, selection) => {
    const percentage = (stake / totalStake) * 100;
    if (percentage > 80) {
      suspicionScore += 30;
      reasons.push(`${percentage.toFixed(0)}% das apostas em ${selection}`);
    }
  });

  // 3. Apostas em odds muito altas
  const highOddsBets = bets.filter((bet) => bet.odds > 20);
  if (highOddsBets.length > 5) {
    suspicionScore += 15;
    reasons.push(`${highOddsBets.length} apostas em odds > 20.00`);
  }

  // 4. Apostas em curto espaço de tempo
  const timestamps = bets.map((bet) => new Date(bet.timestamp).getTime());
  const timeSpan = Math.max(...timestamps) - Math.min(...timestamps);
  if (timeSpan < 60000 && bets.length > 10) {
    // < 1 minuto
    suspicionScore += 25;
    reasons.push(`${bets.length} apostas em menos de 1 minuto`);
  }

  // 5. Apostas todas no mesmo mercado
  const markets = new Set(bets.map((bet) => bet.market));
  if (markets.size === 1 && bets.length > 15) {
    suspicionScore += 10;
    reasons.push(`Todas as apostas no mercado ${Array.from(markets)[0]}`);
  }

  if (suspicionScore > 80) {
    const rule = ALERT_RULES.find((r) => r.type === 'suspicious_betting');
    if (rule) {
      return createAlert(
        rule,
        {
          suspicionScore,
          reason: reasons.join('; '),
          betsCount: bets.length,
          totalStake,
          matchName,
        },
        matchId,
        matchName,
        sport
      );
    }
  }

  return null;
}

/**
 * Cria alerta de falha de API
 */
export function createApiFailureAlert(
  apiName: string,
  failureCount: number,
  lastError: string
): Alert {
  const rule = ALERT_RULES.find((r) => r.type === 'api_failure');
  
  if (!rule) {
    return {
      id: generateAlertId(),
      type: 'api_failure',
      severity: 'critical',
      title: '🔴 Falha de API',
      message: `API ${apiName} falhou ${failureCount} vezes`,
      data: { apiName, failureCount, lastError },
      timestamp: new Date().toISOString(),
      acknowledged: false,
      resolved: false,
    };
  }

  return createAlert(rule, { apiName, failureCount, lastError });
}

/**
 * Reconhece um alerta
 */
export function acknowledgeAlert(
  alert: Alert,
  operatorId: string
): Alert {
  return {
    ...alert,
    acknowledged: true,
    acknowledgedBy: operatorId,
    acknowledgedAt: new Date().toISOString(),
  };
}

/**
 * Resolve um alerta
 */
export function resolveAlert(alert: Alert): Alert {
  return {
    ...alert,
    resolved: true,
    resolvedAt: new Date().toISOString(),
  };
}

/**
 * Filtra alertas por severidade
 */
export function filterAlertsBySeverity(
  alerts: Alert[],
  severity: AlertSeverity | AlertSeverity[]
): Alert[] {
  const severities = Array.isArray(severity) ? severity : [severity];
  return alerts.filter((alert) => severities.includes(alert.severity));
}

/**
 * Filtra alertas não reconhecidos
 */
export function getUnacknowledgedAlerts(alerts: Alert[]): Alert[] {
  return alerts.filter((alert) => !alert.acknowledged && !alert.resolved);
}

/**
 * Filtra alertas ativos (não resolvidos)
 */
export function getActiveAlerts(alerts: Alert[]): Alert[] {
  return alerts.filter((alert) => !alert.resolved);
}

/**
 * Agrupa alertas por jogo
 */
export function groupAlertsByMatch(alerts: Alert[]): Record<string, Alert[]> {
  const grouped: Record<string, Alert[]> = {};
  
  alerts.forEach((alert) => {
    if (alert.matchId) {
      if (!grouped[alert.matchId]) {
        grouped[alert.matchId] = [];
      }
      grouped[alert.matchId].push(alert);
    }
  });

  return grouped;
}

/**
 * Obtém estatísticas de alertas
 */
export function getAlertStats(alerts: Alert[]) {
  const total = alerts.length;
  const active = getActiveAlerts(alerts).length;
  const unacknowledged = getUnacknowledgedAlerts(alerts).length;
  
  const bySeverity = {
    info: alerts.filter((a) => a.severity === 'info').length,
    warning: alerts.filter((a) => a.severity === 'warning').length,
    critical: alerts.filter((a) => a.severity === 'critical').length,
    emergency: alerts.filter((a) => a.severity === 'emergency').length,
  };

  const byType: Record<string, number> = {};
  alerts.forEach((alert) => {
    byType[alert.type] = (byType[alert.type] || 0) + 1;
  });

  return {
    total,
    active,
    unacknowledged,
    bySeverity,
    byType,
  };
}

// Compatibilidade: função de despacho simples usada por módulos de dashboard
export function dispatchAlert(payload: any): void {
  console.log('🚨 ALERT:', payload);
}
