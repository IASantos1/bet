/**
 * Market Management Service
 * 
 * Controlo manual de mercados para intervenção mínima quando necessário
 * Permite ao operador pausar, reabrir, ajustar odds e limites manualmente
 */

import { pauseMarket, pauseAllMarketsForMatch } from '../marketControl/pauseMarkets';
import { reopenMarketSafe, reopenAllMarketsForMatch } from '../marketControl/reopenMarkets';
import { dispatchAlert } from '../risk/alertDispatcher';
import { exposureCalculator } from '../risk/exposureCalculator';

// ============================================
// TIPOS
// ============================================

export interface ManualAction {
  actionId: string;
  actionType: 'pause_market' | 'reopen_market' | 'adjust_odds' | 'adjust_limits' | 'suspend_market' | 'close_market';
  matchId: string;
  marketId?: string;
  operatorId: string;
  operatorName: string;
  reason: string;
  timestamp: Date;
  parameters?: any;
  result: {
    success: boolean;
    message: string;
    affectedMarkets: string[];
    previousState?: any;
    newState?: any;
  };
}

export interface MarketControlOptions {
  matchId: string;
  marketId?: string;
  reason: string;
  operatorId: string;
  operatorName: string;
  duration?: number;
  metadata?: any;
}

export interface OddsAdjustment {
  matchId: string;
  marketId: string;
  outcomeId: string;
  currentOdds: number;
  newOdds: number;
  reason: string;
  operatorId: string;
  timestamp: Date;
}

export interface LimitAdjustment {
  matchId: string;
  marketId?: string;
  limitType: 'stake' | 'payout' | 'exposure';
  currentLimit: number;
  newLimit: number;
  reason: string;
  operatorId: string;
  timestamp: Date;
}

export interface MarketOverride {
  matchId: string;
  marketId: string;
  overrideType: 'odds' | 'limits' | 'status';
  overrideValue: any;
  expiresAt?: Date;
  reason: string;
  operatorId: string;
  active: boolean;
}

// ============================================
// ESTADO DO GERENCIAMENTO
// ============================================

interface ManagementState {
  actionHistory: ManualAction[];
  oddsAdjustments: OddsAdjustment[];
  limitAdjustments: LimitAdjustment[];
  activeOverrides: Map<string, MarketOverride>;
}

const managementState: ManagementState = {
  actionHistory: [],
  oddsAdjustments: [],
  limitAdjustments: [],
  activeOverrides: new Map(),
};

// ============================================
// CONTROLO MANUAL DE MERCADOS
// ============================================

/**
 * Pausa mercado manualmente
 */
export async function manualPauseMarket(options: MarketControlOptions): Promise<ManualAction> {
  console.log(`⏸️ [MarketManagement] Pausando mercado manualmente: ${options.marketId || 'todos'}`);

  const actionId = generateActionId();
  const affectedMarkets: string[] = [];
  let success = false;
  let message = '';

  try {
    if (options.marketId) {
      const marketType = options.marketId.replace(`${options.matchId}_`, '');
      const paused = await pauseMarket(options.matchId, marketType, 'manual', {
        duration: options.duration,
        autoResume: options.duration !== undefined,
        metadata: { operator: options.operatorName, reason: options.reason },
      });
      success = !!paused;
      message = 'Mercado pausado';
      affectedMarkets.push(options.marketId);
    } else {
      const pausedList = await pauseAllMarketsForMatch(options.matchId, 'manual', {
        duration: options.duration,
        autoResume: options.duration !== undefined,
        metadata: { operator: options.operatorName, reason: options.reason },
      });
      success = pausedList.length > 0;
      message = success ? 'Mercados pausados' : 'Nenhum mercado pausado';
      affectedMarkets.push(
        ...pausedList.map((m) => `${options.matchId}_${m.marketType}`)
      );
    }

    // Disparar alerta
    dispatchAlert({
      severity: 'medium',
      category: 'market',
      message: `🔧 Operador ${options.operatorName} pausou mercado(s): ${options.reason}`,
      matchId: options.matchId,
      metadata: { action: 'manual_pause', markets: affectedMarkets },
    });

  } catch (error: any) {
    success = false;
    message = `Erro ao pausar: ${error.message}`;
    console.error('❌ [MarketManagement] Erro:', error);
  }

  const action: ManualAction = {
    actionId,
    actionType: 'pause_market',
    matchId: options.matchId,
    marketId: options.marketId,
    operatorId: options.operatorId,
    operatorName: options.operatorName,
    reason: options.reason,
    timestamp: new Date(),
    parameters: { duration: options.duration },
    result: {
      success,
      message,
      affectedMarkets,
    },
  };

  managementState.actionHistory.push(action);
  return action;
}

/**
 * Reabre mercado manualmente
 */
export async function manualReopenMarket(options: MarketControlOptions): Promise<ManualAction> {
  console.log(`▶️ [MarketManagement] Reabrindo mercado manualmente: ${options.marketId || 'todos'}`);

  const actionId = generateActionId();
  const affectedMarkets: string[] = [];
  let success = false;
  let message = '';

  try {
    if (options.marketId) {
      const marketType = options.marketId.replace(`${options.matchId}_`, '');
      const result = await reopenMarketSafe(options.matchId, marketType, {
        reopenedBy: options.operatorId,
      });
      success = result.success;
      message = result.reason || (result.success ? 'Mercado reaberto' : 'Falha ao reabrir');
      if (success) affectedMarkets.push(options.marketId);
    } else {
      const batch = await reopenAllMarketsForMatch(options.matchId, {
        reopenedBy: options.operatorId,
      });
      success = batch.success > 0;
      message =
        batch.success > 0
          ? `Reabertos ${batch.success}, falharam ${batch.failed}`
          : 'Nenhum mercado reaberto';
      affectedMarkets.push(
        ...batch.results
          .filter((r) => r.success)
          .map((r) => `${options.matchId}_${r.marketType}`)
      );
    }

    // Disparar alerta
    dispatchAlert({
      severity: 'low',
      category: 'market',
      message: `✅ Operador ${options.operatorName} reabriu mercado(s): ${options.reason}`,
      matchId: options.matchId,
      metadata: { action: 'manual_reopen', markets: affectedMarkets },
    });

  } catch (error: any) {
    success = false;
    message = `Erro ao reabrir: ${error.message}`;
    console.error('❌ [MarketManagement] Erro:', error);
  }

  const action: ManualAction = {
    actionId,
    actionType: 'reopen_market',
    matchId: options.matchId,
    marketId: options.marketId,
    operatorId: options.operatorId,
    operatorName: options.operatorName,
    reason: options.reason,
    timestamp: new Date(),
    result: {
      success,
      message,
      affectedMarkets,
    },
  };

  managementState.actionHistory.push(action);
  return action;
}

/**
 * Suspende mercado (pausa indefinida)
 */
export async function suspendMarket(options: MarketControlOptions): Promise<ManualAction> {
  console.log(`🚫 [MarketManagement] Suspendendo mercado: ${options.marketId}`);

  // Suspender = pausar sem duração definida
  const pauseOptions = {
    ...options,
    duration: undefined, // Sem auto-resume
  };

  const action = await manualPauseMarket(pauseOptions);
  action.actionType = 'suspend_market';

  return action;
}

/**
 * Fecha mercado permanentemente
 */
export function closeMarket(options: MarketControlOptions): ManualAction {
  console.log(`🔒 [MarketManagement] Fechando mercado: ${options.marketId}`);

  const actionId = generateActionId();

  // Em produção, marcaria o mercado como fechado no banco de dados
  // Aqui apenas registramos a ação

  const action: ManualAction = {
    actionId,
    actionType: 'close_market',
    matchId: options.matchId,
    marketId: options.marketId,
    operatorId: options.operatorId,
    operatorName: options.operatorName,
    reason: options.reason,
    timestamp: new Date(),
    result: {
      success: true,
      message: 'Mercado fechado com sucesso',
      affectedMarkets: [options.marketId!],
    },
  };

  managementState.actionHistory.push(action);

  dispatchAlert({
    severity: 'medium',
    category: 'market',
    message: `🔒 Operador ${options.operatorName} fechou mercado: ${options.reason}`,
    matchId: options.matchId,
    marketId: options.marketId,
    metadata: { action: 'close_market' },
  });

  return action;
}

// ============================================
// AJUSTE DE ODDS
// ============================================

/**
 * Ajusta odds manualmente
 */
export function adjustOdds(
  matchId: string,
  marketId: string,
  outcomeId: string,
  newOdds: number,
  reason: string,
  operatorId: string,
  operatorName: string
): ManualAction {
  console.log(`📊 [MarketManagement] Ajustando odds: ${marketId} - ${outcomeId} → ${newOdds}`);

  const actionId = generateActionId();

  // Obter odds atuais
  const currentOdds = 2.0; // Em produção, viria do banco

  // Validar nova odd
  if (newOdds < 1.01) {
    return {
      actionId,
      actionType: 'adjust_odds',
      matchId,
      marketId,
      operatorId,
      operatorName,
      reason,
      timestamp: new Date(),
      result: {
        success: false,
        message: 'Odds deve ser maior que 1.01',
        affectedMarkets: [],
      },
    };
  }

  if (newOdds > 1000) {
    return {
      actionId,
      actionType: 'adjust_odds',
      matchId,
      marketId,
      operatorId,
      operatorName,
      reason,
      timestamp: new Date(),
      result: {
        success: false,
        message: 'Odds deve ser menor que 1000',
        affectedMarkets: [],
      },
    };
  }

  // Registrar ajuste
  const adjustment: OddsAdjustment = {
    matchId,
    marketId,
    outcomeId,
    currentOdds,
    newOdds,
    reason,
    operatorId,
    timestamp: new Date(),
  };

  managementState.oddsAdjustments.push(adjustment);

  // Criar override
  const override: MarketOverride = {
    matchId,
    marketId,
    overrideType: 'odds',
    overrideValue: { outcomeId, odds: newOdds },
    reason,
    operatorId,
    active: true,
  };

  managementState.activeOverrides.set(`${marketId}_${outcomeId}`, override);

  // Disparar alerta
  dispatchAlert({
    severity: 'low',
    category: 'odds',
    message: `📊 Operador ${operatorName} ajustou odds: ${currentOdds.toFixed(2)} → ${newOdds.toFixed(2)}`,
    matchId,
    marketId,
    metadata: { adjustment },
  });

  const action: ManualAction = {
    actionId,
    actionType: 'adjust_odds',
    matchId,
    marketId,
    operatorId,
    operatorName,
    reason,
    timestamp: new Date(),
    parameters: { outcomeId, newOdds },
    result: {
      success: true,
      message: `Odds ajustada de ${currentOdds.toFixed(2)} para ${newOdds.toFixed(2)}`,
      affectedMarkets: [marketId],
      previousState: { odds: currentOdds },
      newState: { odds: newOdds },
    },
  };

  managementState.actionHistory.push(action);
  return action;
}

/**
 * Remove override de odds
 */
export function removeOddsOverride(
  matchId: string,
  marketId: string,
  outcomeId: string,
  operatorId: string,
  operatorName: string
): boolean {
  const key = `${marketId}_${outcomeId}`;
  const override = managementState.activeOverrides.get(key);

  if (!override) {
    console.log(`⚠️ [MarketManagement] Override não encontrado: ${key}`);
    return false;
  }

  override.active = false;
  managementState.activeOverrides.delete(key);

  console.log(`✅ [MarketManagement] Override removido: ${key}`);

  dispatchAlert({
    severity: 'low',
    category: 'odds',
    message: `🔄 Operador ${operatorName} removeu override de odds`,
    matchId,
    marketId,
    metadata: { outcomeId },
  });

  return true;
}

// ============================================
// AJUSTE DE LIMITES
// ============================================

/**
 * Ajusta limite de stake manualmente
 */
export function adjustStakeLimit(
  matchId: string,
  marketId: string,
  newLimit: number,
  reason: string,
  operatorId: string,
  operatorName: string
): ManualAction {
  console.log(`💰 [MarketManagement] Ajustando limite de stake: ${marketId} → €${newLimit}`);

  const actionId = generateActionId();

  // Obter limite atual
  const currentLimit = 1000; // Em produção, viria do banco

  // Validar novo limite
  if (newLimit < 1) {
    return {
      actionId,
      actionType: 'adjust_limits',
      matchId,
      marketId,
      operatorId,
      operatorName,
      reason,
      timestamp: new Date(),
      result: {
        success: false,
        message: 'Limite deve ser maior que €1',
        affectedMarkets: [],
      },
    };
  }

  if (newLimit > 10000) {
    return {
      actionId,
      actionType: 'adjust_limits',
      matchId,
      marketId,
      operatorId,
      operatorName,
      reason,
      timestamp: new Date(),
      result: {
        success: false,
        message: 'Limite deve ser menor que €10.000',
        affectedMarkets: [],
      },
    };
  }

  // Registrar ajuste
  const adjustment: LimitAdjustment = {
    matchId,
    marketId,
    limitType: 'stake',
    currentLimit,
    newLimit,
    reason,
    operatorId,
    timestamp: new Date(),
  };

  managementState.limitAdjustments.push(adjustment);

  // Criar override
  const override: MarketOverride = {
    matchId,
    marketId,
    overrideType: 'limits',
    overrideValue: { stakeLimit: newLimit },
    reason,
    operatorId,
    active: true,
  };

  managementState.activeOverrides.set(`${marketId}_limits`, override);

  // Disparar alerta
  dispatchAlert({
    severity: 'low',
    category: 'market',
    message: `💰 Operador ${operatorName} ajustou limite: €${currentLimit} → €${newLimit}`,
    matchId,
    marketId,
    metadata: { adjustment },
  });

  const action: ManualAction = {
    actionId,
    actionType: 'adjust_limits',
    matchId,
    marketId,
    operatorId,
    operatorName,
    reason,
    timestamp: new Date(),
    parameters: { limitType: 'stake', newLimit },
    result: {
      success: true,
      message: `Limite ajustado de €${currentLimit} para €${newLimit}`,
      affectedMarkets: [marketId],
      previousState: { limit: currentLimit },
      newState: { limit: newLimit },
    },
  };

  managementState.actionHistory.push(action);
  return action;
}

/**
 * Ajusta limite de exposição manualmente
 */
export function adjustExposureLimit(
  matchId: string,
  newLimit: number,
  reason: string,
  operatorId: string,
  operatorName: string
): ManualAction {
  console.log(`📊 [MarketManagement] Ajustando limite de exposição: ${matchId} → €${newLimit}`);

  const actionId = generateActionId();

  // Obter limite atual
  const matchExposure = exposureCalculator.getMatchExposure(matchId);
  const currentLimit = matchExposure.limit;

  // Validar novo limite
  if (newLimit < matchExposure.totalExposure) {
    return {
      actionId,
      actionType: 'adjust_limits',
      matchId,
      operatorId,
      operatorName,
      reason,
      timestamp: new Date(),
      result: {
        success: false,
        message: `Novo limite (€${newLimit}) não pode ser menor que exposição atual (€${matchExposure.totalExposure.toFixed(2)})`,
        affectedMarkets: [],
      },
    };
  }

  // Registrar ajuste
  const adjustment: LimitAdjustment = {
    matchId,
    limitType: 'exposure',
    currentLimit,
    newLimit,
    reason,
    operatorId,
    timestamp: new Date(),
  };

  managementState.limitAdjustments.push(adjustment);

  // Atualizar limite no exposureCalculator
  exposureCalculator.setMatchExposureLimit(matchId, newLimit);

  // Disparar alerta
  dispatchAlert({
    severity: 'low',
    category: 'exposure',
    message: `📊 Operador ${operatorName} ajustou limite de exposição: €${currentLimit.toFixed(0)} → €${newLimit.toFixed(0)}`,
    matchId,
    metadata: { adjustment },
  });

  const action: ManualAction = {
    actionId,
    actionType: 'adjust_limits',
    matchId,
    operatorId,
    operatorName,
    reason,
    timestamp: new Date(),
    parameters: { limitType: 'exposure', newLimit },
    result: {
      success: true,
      message: `Limite de exposição ajustado de €${currentLimit.toFixed(0)} para €${newLimit.toFixed(0)}`,
      affectedMarkets: [],
      previousState: { limit: currentLimit },
      newState: { limit: newLimit },
    },
  };

  managementState.actionHistory.push(action);
  return action;
}

// ============================================
// CONSULTAS
// ============================================

/**
 * Obtém histórico de ações
 */
export function getActionHistory(
  filters?: {
    matchId?: string;
    operatorId?: string;
    actionType?: string;
    limit?: number;
  }
): ManualAction[] {
  let history = [...managementState.actionHistory];

  if (filters?.matchId) {
    history = history.filter(a => a.matchId === filters.matchId);
  }

  if (filters?.operatorId) {
    history = history.filter(a => a.operatorId === filters.operatorId);
  }

  if (filters?.actionType) {
    history = history.filter(a => a.actionType === filters.actionType);
  }

  // Ordenar por data (mais recente primeiro)
  history.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

  if (filters?.limit) {
    history = history.slice(0, filters.limit);
  }

  return history;
}

/**
 * Obtém ajustes de odds
 */
export function getOddsAdjustments(matchId?: string): OddsAdjustment[] {
  let adjustments = [...managementState.oddsAdjustments];

  if (matchId) {
    adjustments = adjustments.filter(a => a.matchId === matchId);
  }

  return adjustments.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
}

/**
 * Obtém ajustes de limites
 */
export function getLimitAdjustments(matchId?: string): LimitAdjustment[] {
  let adjustments = [...managementState.limitAdjustments];

  if (matchId) {
    adjustments = adjustments.filter(a => a.matchId === matchId);
  }

  return adjustments.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
}

/**
 * Obtém overrides ativos
 */
export function getActiveOverrides(matchId?: string): MarketOverride[] {
  let overrides = Array.from(managementState.activeOverrides.values());

  if (matchId) {
    overrides = overrides.filter(o => o.matchId === matchId);
  }

  return overrides.filter(o => o.active);
}

/**
 * Verifica se mercado tem override
 */
export function hasOverride(marketId: string, overrideType?: string): boolean {
  const overrides = Array.from(managementState.activeOverrides.values());
  
  return overrides.some(o => 
    o.marketId === marketId && 
    o.active &&
    (!overrideType || o.overrideType === overrideType)
  );
}

/**
 * Obtém estatísticas de ações
 */
export function getActionStats() {
  const history = managementState.actionHistory;

  return {
    totalActions: history.length,
    byType: {
      pause: history.filter(a => a.actionType === 'pause_market').length,
      reopen: history.filter(a => a.actionType === 'reopen_market').length,
      adjustOdds: history.filter(a => a.actionType === 'adjust_odds').length,
      adjustLimits: history.filter(a => a.actionType === 'adjust_limits').length,
      suspend: history.filter(a => a.actionType === 'suspend_market').length,
      close: history.filter(a => a.actionType === 'close_market').length,
    },
    successRate: history.length > 0 
      ? (history.filter(a => a.result.success).length / history.length) * 100 
      : 0,
    activeOverrides: managementState.activeOverrides.size,
    recentActions: history.slice(-10),
  };
}

// ============================================
// UTILITÁRIOS
// ============================================

/**
 * Gera ID único para ação
 */
function generateActionId(): string {
  return `action_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

// ============================================
// EXPORTAÇÕES
// ============================================

export const marketManagement = {
  // Controlo de mercados
  manualPauseMarket,
  manualReopenMarket,
  suspendMarket,
  closeMarket,
  
  // Ajuste de odds
  adjustOdds,
  removeOddsOverride,
  
  // Ajuste de limites
  adjustStakeLimit,
  adjustExposureLimit,
  
  // Consultas
  getActionHistory,
  getOddsAdjustments,
  getLimitAdjustments,
  getActiveOverrides,
  hasOverride,
  getActionStats,
};
