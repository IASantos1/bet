/**
 * 💰 STAKE LIMITER SERVICE
 * 
 * Limita aposta máxima dinamicamente baseado em:
 * - Exposição atual do jogo/mercado
 * - Nível de risco
 * - Tipo de aposta (pré-jogo vs ao vivo)
 * - Odds da seleção
 * - Histórico do utilizador
 */

import { calculateMatchExposure, calculateMarketExposure } from '../risk/exposureCalculator';
import { apiFetch } from '../../services/backendClient';

// Limites base do sistema
const BASE_LIMITS = {
  preMatch: {
    min: 1,
    max: 1000,
    maxPayout: 50000
  },
  live: {
    min: 1,
    max: 500,      // Metade do pré-jogo
    maxPayout: 25000
  }
};

// Multiplicadores por nível de risco
const RISK_MULTIPLIERS = {
  low: 1.0,       // 100% do limite
  medium: 0.7,    // 70% do limite
  high: 0.4,      // 40% do limite
  critical: 0.1   // 10% do limite
};

// Multiplicadores por odds
const ODDS_MULTIPLIERS = {
  veryLow: 1.0,    // Odds < 1.5
  low: 0.9,        // Odds 1.5-2.0
  medium: 0.7,     // Odds 2.0-5.0
  high: 0.5,       // Odds 5.0-10.0
  veryHigh: 0.3    // Odds > 10.0
};

// Interface de limite calculado
export interface StakeLimit {
  minStake: number;
  maxStake: number;
  maxPayout: number;
  recommendedStake: number;
  restrictions: {
    riskLevel: 'low' | 'medium' | 'high' | 'critical';
    riskMultiplier: number;
    oddsMultiplier: number;
    exposureUsage: number;
    marketBalance: number;
  };
  warnings: string[];
}

/**
 * Calcula limite de stake para uma aposta
 */
export async function calculateStakeLimit(
  matchId: string,
  marketType: string,
  selection: string,
  odds: number,
  isLive: boolean,
  userId?: string
): Promise<StakeLimit> {
  
  // Limites base
  const baseLimit = isLive ? BASE_LIMITS.live : BASE_LIMITS.preMatch;
  
  let maxStake = baseLimit.max;
  const maxPayout = baseLimit.maxPayout;
  const warnings: string[] = [];

  // 1. Ajusta por exposição do jogo
  try {
    const matchExposure = await calculateMatchExposure(matchId);
    const exposureUsage = (matchExposure.netExposure / 100000) * 100; // Limite €100k
    
    let riskMultiplier = 1.0;
    let riskLevel: 'low' | 'medium' | 'high' | 'critical' = 'low';

    if (matchExposure.riskLevel === 'critical') {
      riskMultiplier = RISK_MULTIPLIERS.critical;
      riskLevel = 'critical';
      warnings.push('⚠️ Exposição crítica - Stake muito limitado');
    } else if (matchExposure.riskLevel === 'high') {
      riskMultiplier = RISK_MULTIPLIERS.high;
      riskLevel = 'high';
      warnings.push('⚠️ Exposição alta - Stake reduzido');
    } else if (matchExposure.riskLevel === 'medium') {
      riskMultiplier = RISK_MULTIPLIERS.medium;
      riskLevel = 'medium';
    }

    maxStake *= riskMultiplier;

    // 2. Ajusta por balance do mercado
    const marketExposure = await calculateMarketExposure(matchId, marketType);
    const marketBalance = marketExposure.balancedRisk;

    if (marketBalance < 30) {
      // Mercado muito desbalanceado
      const balanceMultiplier = 0.5;
      maxStake *= balanceMultiplier;
      warnings.push('⚖️ Mercado desbalanceado - Stake limitado');
    }

    // 3. Ajusta por odds
    let oddsMultiplier = 1.0;
    
    if (odds < 1.5) {
      oddsMultiplier = ODDS_MULTIPLIERS.veryLow;
    } else if (odds < 2.0) {
      oddsMultiplier = ODDS_MULTIPLIERS.low;
    } else if (odds < 5.0) {
      oddsMultiplier = ODDS_MULTIPLIERS.medium;
    } else if (odds < 10.0) {
      oddsMultiplier = ODDS_MULTIPLIERS.high;
      warnings.push('📈 Odds altas - Stake reduzido');
    } else {
      oddsMultiplier = ODDS_MULTIPLIERS.veryHigh;
      warnings.push('📈 Odds muito altas - Stake muito limitado');
    }

    maxStake *= oddsMultiplier;

    // 4. Garante que payout não excede limite
    const maxStakeByPayout = maxPayout / odds;
    if (maxStakeByPayout < maxStake) {
      maxStake = maxStakeByPayout;
      warnings.push('💰 Limitado pelo payout máximo');
    }

    // 5. Limites pessoais do utilizador (se aplicável)
    if (userId) {
      const userLimits = await getUserStakeLimits(userId);
      if (userLimits && userLimits.maxStake < maxStake) {
        maxStake = userLimits.maxStake;
        warnings.push('👤 Limitado pelos seus limites pessoais');
      }
    }

    // 6. Arredonda para baixo
    maxStake = Math.floor(maxStake);

    // 7. Garante mínimo
    if (maxStake < baseLimit.min) {
      maxStake = baseLimit.min;
    }

    // 8. Calcula stake recomendado (50% do máximo)
    const recommendedStake = Math.floor(maxStake * 0.5);

    return {
      minStake: baseLimit.min,
      maxStake,
      maxPayout,
      recommendedStake,
      restrictions: {
        riskLevel,
        riskMultiplier,
        oddsMultiplier,
        exposureUsage,
        marketBalance
      },
      warnings
    };

  } catch (error) {
    console.error('❌ Erro ao calcular limite de stake:', error);
    
    // Retorna limites conservadores em caso de erro
    return {
      minStake: baseLimit.min,
      maxStake: baseLimit.min * 10, // €10 conservador
      maxPayout: baseLimit.min * 10 * odds,
      recommendedStake: baseLimit.min * 5,
      restrictions: {
        riskLevel: 'high',
        riskMultiplier: 0.1,
        oddsMultiplier: 0.1,
        exposureUsage: 100,
        marketBalance: 0
      },
      warnings: ['⚠️ Erro ao calcular limites - Usando valores conservadores']
    };
  }
}

/**
 * Obtém limites pessoais do utilizador
 */
async function getUserStakeLimits(_userId: string): Promise<{
  maxStake: number;
  maxPayout: number;
} | null> {
  try {
    const resp = await apiFetch('/risk/user-limits', { method: 'GET' });

    if (!resp) return null;

    const maxStake = Number(resp.maxStakePerBet ?? resp.max_stake_per_bet);
    const maxPayout = Number(resp.maxPayout ?? resp.max_payout);

    if (!maxStake || !maxPayout) return null;

    return {
      maxStake,
      maxPayout,
    };
  } catch (error) {
    console.error('❌ Erro ao buscar limites do utilizador no backend:', error);
    return null;
  }
}

/**
 * Valida se stake está dentro dos limites
 */
export async function validateStake(
  matchId: string,
  marketType: string,
  selection: string,
  odds: number,
  stake: number,
  isLive: boolean,
  userId?: string
): Promise<{
  valid: boolean;
  reason?: string;
  adjustedStake?: number;
  limits: StakeLimit;
}> {
  
  const limits = await calculateStakeLimit(
    matchId,
    marketType,
    selection,
    odds,
    isLive,
    userId
  );

  // Verifica mínimo
  if (stake < limits.minStake) {
    return {
      valid: false,
      reason: `Aposta mínima é €${limits.minStake}`,
      adjustedStake: limits.minStake,
      limits
    };
  }

  // Verifica máximo
  if (stake > limits.maxStake) {
    return {
      valid: false,
      reason: `Aposta máxima é €${limits.maxStake}`,
      adjustedStake: limits.maxStake,
      limits
    };
  }

  // Verifica payout
  const payout = stake * odds;
  if (payout > limits.maxPayout) {
    const adjustedStake = Math.floor(limits.maxPayout / odds);
    return {
      valid: false,
      reason: `Payout máximo é €${limits.maxPayout}`,
      adjustedStake,
      limits
    };
  }

  return {
    valid: true,
    limits
  };
}

/**
 * Ajusta stake automaticamente para o máximo permitido
 */
export async function adjustStakeToMax(
  matchId: string,
  marketType: string,
  selection: string,
  odds: number,
  requestedStake: number,
  isLive: boolean,
  userId?: string
): Promise<{
  adjustedStake: number;
  wasAdjusted: boolean;
  reason?: string;
  limits: StakeLimit;
}> {
  
  const limits = await calculateStakeLimit(
    matchId,
    marketType,
    selection,
    odds,
    isLive,
    userId
  );

  if (requestedStake <= limits.maxStake) {
    return {
      adjustedStake: requestedStake,
      wasAdjusted: false,
      limits
    };
  }

  return {
    adjustedStake: limits.maxStake,
    wasAdjusted: true,
    reason: `Stake ajustado de €${requestedStake} para €${limits.maxStake} devido aos limites atuais`,
    limits
  };
}

/**
 * Calcula stake máximo para múltiplas seleções (acumulada)
 */
export async function calculateAccumulatorStakeLimit(
  selections: Array<{
    matchId: string;
    marketType: string;
    selection: string;
    odds: number;
  }>,
  isLive: boolean,
  userId?: string
): Promise<StakeLimit> {
  
  // Calcula limite para cada seleção
  const limits = await Promise.all(
    selections.map(sel => 
      calculateStakeLimit(
        sel.matchId,
        sel.marketType,
        sel.selection,
        sel.odds,
        isLive,
        userId
      )
    )
  );

  // Usa o limite mais restritivo
  const minMaxStake = Math.min(...limits.map(l => l.maxStake));
  const minMaxPayout = Math.min(...limits.map(l => l.maxPayout));

  // Odds total da acumulada
  const totalOdds = selections.reduce((acc, sel) => acc * sel.odds, 1);

  // Ajusta stake pelo payout total
  let maxStake = minMaxStake;
  const maxStakeByPayout = minMaxPayout / totalOdds;
  
  if (maxStakeByPayout < maxStake) {
    maxStake = maxStakeByPayout;
  }

  // Acumuladas têm limite adicional de 50% do pré-jogo
  maxStake *= 0.5;

  const allWarnings = limits.flatMap(l => l.warnings);
  const uniqueWarnings = [...new Set(allWarnings)];

  return {
    minStake: BASE_LIMITS.preMatch.min,
    maxStake: Math.floor(maxStake),
    maxPayout: minMaxPayout,
    recommendedStake: Math.floor(maxStake * 0.5),
    restrictions: {
      riskLevel: 'high', // Acumuladas sempre têm risco alto
      riskMultiplier: 0.5,
      oddsMultiplier: 0.5,
      exposureUsage: Math.max(...limits.map(l => l.restrictions.exposureUsage)),
      marketBalance: Math.min(...limits.map(l => l.restrictions.marketBalance))
    },
    warnings: [
      ...uniqueWarnings,
      '🎲 Acumulada - Stake reduzido para 50%'
    ]
  };
}

/**
 * Obtém estatísticas de limites aplicados
 */
export async function getStakeLimitsStats(
  _timeRange: 'hour' | 'day' | 'week' = 'day'
): Promise<{
  totalBets: number;
  limitedBets: number;
  limitedPercentage: number;
  averageReduction: number;
  byReason: Record<string, number>;
}> {
  
  return {
    totalBets: 0,
    limitedBets: 0,
    limitedPercentage: 0,
    averageReduction: 0,
    byReason: {}
  };
}

export const stakeLimiter = {
  getStakeLimits(_matchId: string): Record<string, number> {
    return {};
  },
};
