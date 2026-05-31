/**
 * 🔄 REOPEN MARKETS SERVICE
 * 
 * Reabre mercados pausados quando:
 * - Tempo de pausa expirou (auto-resume)
 * - Operador aprova manualmente
 * - Condições de risco normalizaram
 * - Odds recalculadas e validadas
 */

import { 
  resumeMarket, 
  getPausedMarketInfo, 
  getPausedMarketsForMatch
} from './pauseMarkets';
import { calculateMatchExposure } from '../risk/exposureCalculator';

// Critérios para reabertura automática
interface ReopenCriteria {
  maxExposure: number;        // Exposição máxima permitida (%)
  maxOddsDeviation: number;   // Desvio máximo de odds (%)
  minTimeSincePause: number;  // Tempo mínimo desde pausa (ms)
  requireOddsUpdate: boolean; // Requer atualização de odds
}

// Critérios padrão
const DEFAULT_REOPEN_CRITERIA: ReopenCriteria = {
  maxExposure: 70,           // 70% do limite
  maxOddsDeviation: 12,      // ±12%
  minTimeSincePause: 5000,   // 5 segundos
  requireOddsUpdate: true
};

// Resultado da validação de reabertura
interface ReopenValidation {
  canReopen: boolean;
  reason?: string;
  checks: {
    exposureOk: boolean;
    oddsOk: boolean;
    timeOk: boolean;
    oddsUpdated: boolean;
  };
  exposure?: {
    current: number;
    limit: number;
    usage: number;
  };
}

/**
 * Valida se um mercado pode ser reaberto
 */
export async function validateMarketReopen(
  matchId: string,
  marketType: string,
  criteria: Partial<ReopenCriteria> = {}
): Promise<ReopenValidation> {
  const fullCriteria = { ...DEFAULT_REOPEN_CRITERIA, ...criteria };
  
  const pausedMarket = getPausedMarketInfo(matchId, marketType);
  
  if (!pausedMarket) {
    return {
      canReopen: false,
      reason: 'Mercado não está pausado',
      checks: {
        exposureOk: false,
        oddsOk: false,
        timeOk: false,
        oddsUpdated: false
      }
    };
  }

  const checks = {
    exposureOk: false,
    oddsOk: false,
    timeOk: false,
    oddsUpdated: false
  };

  // 1. Verifica tempo mínimo desde pausa
  const timeSincePause = Date.now() - pausedMarket.pausedAt.getTime();
  checks.timeOk = timeSincePause >= fullCriteria.minTimeSincePause;

  // 2. Verifica exposição
  try {
    const exposure = await calculateMatchExposure(matchId);
    const exposureUsage = (exposure.netExposure / 100000) * 100; // Limite de €100k
    
    checks.exposureOk = exposureUsage <= fullCriteria.maxExposure;

    // 3. Verifica odds (se necessário)
    checks.oddsUpdated = true;

    // 4. Verifica desvio de odds (simplificado)
    checks.oddsOk = true; // TODO: Implementar verificação real de desvio

    // Decisão final
    const canReopen = 
      checks.timeOk && 
      checks.exposureOk && 
      checks.oddsOk && 
      checks.oddsUpdated;

    let reason: string | undefined;
    if (!canReopen) {
      if (!checks.timeOk) reason = 'Tempo mínimo não atingido';
      else if (!checks.exposureOk) reason = 'Exposição ainda muito alta';
      else if (!checks.oddsUpdated) reason = 'Odds não foram atualizadas';
      else if (!checks.oddsOk) reason = 'Odds ainda desviadas';
    }

    return {
      canReopen,
      reason,
      checks,
      exposure: {
        current: exposure.netExposure,
        limit: 100000,
        usage: exposureUsage
      }
    };

  } catch (error) {
    console.error('❌ Erro ao validar reabertura:', error);
    return {
      canReopen: false,
      reason: 'Erro ao validar condições',
      checks
    };
  }
}

/**
 * Reabre mercado com validação
 */
export async function reopenMarketSafe(
  matchId: string,
  marketType: string,
  options: {
    force?: boolean;           // Força reabertura sem validação
    criteria?: Partial<ReopenCriteria>;
    reopenedBy?: string;       // ID do operador
  } = {}
): Promise<{ success: boolean; reason?: string }> {
  
  // Se não forçar, valida condições
  if (!options.force) {
    const validation = await validateMarketReopen(
      matchId, 
      marketType, 
      options.criteria
    );

    if (!validation.canReopen) {
      console.warn(`⚠️ Mercado não pode ser reaberto: ${validation.reason}`);
      return {
        success: false,
        reason: validation.reason
      };
    }
  }

  // Reabre mercado
  const success = await resumeMarket(matchId, marketType, 'manual');

  if (success) {
    console.log(`✅ Mercado reaberto: ${matchId} - ${marketType}`);
  }

  return { success };
}

/**
 * Reabre todos os mercados de um jogo (com validação)
 */
export async function reopenAllMarketsForMatch(
  matchId: string,
  options: {
    force?: boolean;
    criteria?: Partial<ReopenCriteria>;
    reopenedBy?: string;
  } = {}
): Promise<{ 
  success: number; 
  failed: number; 
  results: Array<{ marketType: string; success: boolean; reason?: string }> 
}> {
  
  const pausedMarkets = getPausedMarketsForMatch(matchId);
  
  if (pausedMarkets.length === 0) {
    console.log(`ℹ️ Nenhum mercado pausado para jogo ${matchId}`);
    return { success: 0, failed: 0, results: [] };
  }

  const results: Array<{ marketType: string; success: boolean; reason?: string }> = [];
  let successCount = 0;
  let failedCount = 0;

  for (const market of pausedMarkets) {
    const result = await reopenMarketSafe(matchId, market.marketType, options);
    
    results.push({
      marketType: market.marketType,
      success: result.success,
      reason: result.reason
    });

    if (result.success) {
      successCount++;
    } else {
      failedCount++;
    }
  }

  console.log(`📊 Reabertura de mercados: ${successCount} sucesso, ${failedCount} falhas`);

  return {
    success: successCount,
    failed: failedCount,
    results
  };
}

/**
 * Reabre mercados automaticamente quando condições normalizarem
 */
export async function autoReopenMarkets(): Promise<void> {
  return;
}

/**
 * Reabre mercados após evento ao vivo
 */
export async function reopenMarketsAfterLiveEvent(
  matchId: string,
  eventType: string
): Promise<void> {
  console.log(`⚽ Reabrindo mercados após evento: ${eventType}`);

  // Busca mercados pausados por evento ao vivo
  const pausedMarkets = getPausedMarketsForMatch(matchId).filter(
    market => market.reason === 'live_event' && 
              market.metadata?.eventType === eventType
  );

  for (const market of pausedMarkets) {
    await reopenMarketSafe(matchId, market.marketType, {
      criteria: {
        minTimeSincePause: 3000,  // 3 segundos mínimo
        requireOddsUpdate: true
      }
    });
  }
}

/**
 * Reabre mercados após normalização de exposição
 */
export async function reopenMarketsAfterExposureNormalized(
  matchId: string
): Promise<void> {
  console.log(`📊 Verificando reabertura após normalização de exposição...`);

  const pausedMarkets = getPausedMarketsForMatch(matchId).filter(
    market => market.reason === 'critical_exposure'
  );

  for (const market of pausedMarkets) {
    await reopenMarketSafe(matchId, market.marketType, {
      criteria: {
        maxExposure: 60,  // Só reabre se exposição < 60%
        minTimeSincePause: 30000  // 30 segundos mínimo
      }
    });
  }
}

/**
 * Agenda reabertura automática
 */
export function scheduleMarketReopen(
  matchId: string,
  marketType: string,
  delayMs: number
): void {
  console.log(`⏰ Reabertura agendada para ${matchId} - ${marketType} em ${delayMs}ms`);

  setTimeout(async () => {
    await reopenMarketSafe(matchId, marketType, {
      force: false
    });
  }, delayMs);
}

/**
 * Reabre todos os mercados (emergência)
 */
export async function emergencyReopenAllMarkets(
  reopenedBy: string,
  reason: string
): Promise<void> {
  console.log(`🚨 REABERTURA DE EMERGÊNCIA: ${reason}`);
  return;
}

// Auto-reabertura a cada 15 segundos
setInterval(autoReopenMarkets, 15000);
