/**
 * 🛡️ Limits Manager
 * 
 * Verifica limites de stake e odds
 * Valida apostas antes de serem aceites
 */

import {
  GlobalExposure,
  RiskLimits,
  DEFAULT_RISK_LIMITS,
  wouldExceedLimits,
} from './exposureCalculator';

export interface BetValidationRequest {
  userId: string;
  matchId: string;
  matchName: string;
  sport: string;
  league: string;
  market: string;
  selection: string;
  stake: number;
  odds: number;
  isLive: boolean;
  timestamp: string;
}

export interface BetValidationResult {
  allowed: boolean;
  reason?: string;
  adjustedStake?: number;
  warnings: string[];
  limits: {
    maxStake: number;
    maxPayout: number;
    maxOdds: number;
    minOdds: number;
  };
  exposure: {
    current: number;
    afterBet: number;
    limit: number;
    usage: number; // Percentagem
  };
}

export interface UserLimits {
  userId: string;
  dailyStakeLimit: number;
  weeklyStakeLimit: number;
  monthlyStakeLimit: number;
  maxStakePerBet: number;
  maxOdds: number;
  selfExcluded: boolean;
  coolingOffUntil?: string;
  depositLimit?: number;
}

export interface StakeHistory {
  userId: string;
  daily: number;
  weekly: number;
  monthly: number;
  lastBetTimestamp: string;
}

/**
 * Valida uma aposta antes de ser aceite
 */
export function validateBet(
  request: BetValidationRequest,
  currentExposure: GlobalExposure,
  userLimits?: UserLimits,
  stakeHistory?: StakeHistory,
  systemLimits: RiskLimits = DEFAULT_RISK_LIMITS
): BetValidationResult {
  const warnings: string[] = [];
  const potentialPayout = request.stake * request.odds;

  // Limites aplicáveis
  const maxStake = request.isLive 
    ? systemLimits.maxLiveStake 
    : systemLimits.maxStakePerBet;
  
  const maxPayout = systemLimits.maxPayoutPerBet;
  const maxOdds = systemLimits.maxOdds;
  const minOdds = systemLimits.minOdds;

  // 1. Verifica auto-exclusão
  if (userLimits?.selfExcluded) {
    return {
      allowed: false,
      reason: 'Utilizador auto-excluído. Não pode apostar.',
      warnings: [],
      limits: { maxStake, maxPayout, maxOdds, minOdds },
      exposure: {
        current: 0,
        afterBet: 0,
        limit: 0,
        usage: 0,
      },
    };
  }

  // 2. Verifica período de reflexão
  if (userLimits?.coolingOffUntil) {
    const coolingOffDate = new Date(userLimits.coolingOffUntil);
    if (new Date() < coolingOffDate) {
      return {
        allowed: false,
        reason: `Período de reflexão ativo até ${coolingOffDate.toLocaleDateString('pt-PT')}`,
        warnings: [],
        limits: { maxStake, maxPayout, maxOdds, minOdds },
        exposure: {
          current: 0,
          afterBet: 0,
          limit: 0,
          usage: 0,
        },
      };
    }
  }

  // 3. Verifica stake mínimo
  if (request.stake < 1) {
    return {
      allowed: false,
      reason: 'Stake mínimo é €1',
      warnings: [],
      limits: { maxStake, maxPayout, maxOdds, minOdds },
      exposure: {
        current: 0,
        afterBet: 0,
        limit: 0,
        usage: 0,
      },
    };
  }

  // 4. Verifica stake máximo
  if (request.stake > maxStake) {
    return {
      allowed: false,
      reason: request.isLive
        ? `Stake máximo em jogos ao vivo é €${maxStake}`
        : `Stake máximo por aposta é €${maxStake}`,
      adjustedStake: maxStake,
      warnings: [],
      limits: { maxStake, maxPayout, maxOdds, minOdds },
      exposure: {
        current: 0,
        afterBet: 0,
        limit: maxStake,
        usage: (request.stake / maxStake) * 100,
      },
    };
  }

  // 5. Verifica payout máximo
  if (potentialPayout > maxPayout) {
    const adjustedStake = Math.floor(maxPayout / request.odds);
    return {
      allowed: false,
      reason: `Payout máximo é €${maxPayout.toLocaleString('pt-PT')}`,
      adjustedStake,
      warnings: [`Stake ajustado para €${adjustedStake} para respeitar o limite de payout`],
      limits: { maxStake, maxPayout, maxOdds, minOdds },
      exposure: {
        current: 0,
        afterBet: potentialPayout,
        limit: maxPayout,
        usage: (potentialPayout / maxPayout) * 100,
      },
    };
  }

  // 6. Verifica odds
  if (request.odds > maxOdds) {
    return {
      allowed: false,
      reason: `Odds máximas são ${maxOdds.toFixed(2)}`,
      warnings: [],
      limits: { maxStake, maxPayout, maxOdds, minOdds },
      exposure: {
        current: 0,
        afterBet: 0,
        limit: maxOdds,
        usage: 0,
      },
    };
  }

  if (request.odds < minOdds) {
    return {
      allowed: false,
      reason: `Odds mínimas são ${minOdds.toFixed(2)}`,
      warnings: [],
      limits: { maxStake, maxPayout, maxOdds, minOdds },
      exposure: {
        current: 0,
        afterBet: 0,
        limit: minOdds,
        usage: 0,
      },
    };
  }

  // 7. Verifica limites do utilizador
  if (userLimits) {
    // Stake por aposta
    if (request.stake > userLimits.maxStakePerBet) {
      return {
        allowed: false,
        reason: `O seu limite pessoal de stake é €${userLimits.maxStakePerBet}`,
        adjustedStake: userLimits.maxStakePerBet,
        warnings: [],
        limits: { 
          maxStake: userLimits.maxStakePerBet, 
          maxPayout, 
          maxOdds: userLimits.maxOdds, 
          minOdds 
        },
        exposure: {
          current: 0,
          afterBet: 0,
          limit: userLimits.maxStakePerBet,
          usage: (request.stake / userLimits.maxStakePerBet) * 100,
        },
      };
    }

    // Odds pessoais
    if (request.odds > userLimits.maxOdds) {
      return {
        allowed: false,
        reason: `O seu limite pessoal de odds é ${userLimits.maxOdds.toFixed(2)}`,
        warnings: [],
        limits: { maxStake, maxPayout, maxOdds: userLimits.maxOdds, minOdds },
        exposure: {
          current: 0,
          afterBet: 0,
          limit: userLimits.maxOdds,
          usage: 0,
        },
      };
    }
  }

  // 8. Verifica histórico de stakes
  if (stakeHistory && userLimits) {
    // Limite diário
    if (userLimits.dailyStakeLimit > 0) {
      const newDaily = stakeHistory.daily + request.stake;
      if (newDaily > userLimits.dailyStakeLimit) {
        const remaining = userLimits.dailyStakeLimit - stakeHistory.daily;
        return {
          allowed: false,
          reason: `Limite diário de €${userLimits.dailyStakeLimit} atingido`,
          adjustedStake: remaining > 0 ? remaining : 0,
          warnings: remaining > 0 
            ? [`Pode ainda apostar €${remaining.toFixed(2)} hoje`]
            : ['Limite diário esgotado'],
          limits: { maxStake, maxPayout, maxOdds, minOdds },
          exposure: {
            current: stakeHistory.daily,
            afterBet: newDaily,
            limit: userLimits.dailyStakeLimit,
            usage: (newDaily / userLimits.dailyStakeLimit) * 100,
          },
        };
      }

      // Aviso se próximo do limite
      if (newDaily > userLimits.dailyStakeLimit * 0.8) {
        warnings.push(
          `Atenção: Já usou ${((newDaily / userLimits.dailyStakeLimit) * 100).toFixed(0)}% do seu limite diário`
        );
      }
    }

    // Limite semanal
    if (userLimits.weeklyStakeLimit > 0) {
      const newWeekly = stakeHistory.weekly + request.stake;
      if (newWeekly > userLimits.weeklyStakeLimit) {
        const remaining = userLimits.weeklyStakeLimit - stakeHistory.weekly;
        return {
          allowed: false,
          reason: `Limite semanal de €${userLimits.weeklyStakeLimit} atingido`,
          adjustedStake: remaining > 0 ? remaining : 0,
          warnings: remaining > 0 
            ? [`Pode ainda apostar €${remaining.toFixed(2)} esta semana`]
            : ['Limite semanal esgotado'],
          limits: { maxStake, maxPayout, maxOdds, minOdds },
          exposure: {
            current: stakeHistory.weekly,
            afterBet: newWeekly,
            limit: userLimits.weeklyStakeLimit,
            usage: (newWeekly / userLimits.weeklyStakeLimit) * 100,
          },
        };
      }
    }

    // Limite mensal
    if (userLimits.monthlyStakeLimit > 0) {
      const newMonthly = stakeHistory.monthly + request.stake;
      if (newMonthly > userLimits.monthlyStakeLimit) {
        const remaining = userLimits.monthlyStakeLimit - stakeHistory.monthly;
        return {
          allowed: false,
          reason: `Limite mensal de €${userLimits.monthlyStakeLimit} atingido`,
          adjustedStake: remaining > 0 ? remaining : 0,
          warnings: remaining > 0 
            ? [`Pode ainda apostar €${remaining.toFixed(2)} este mês`]
            : ['Limite mensal esgotado'],
          limits: { maxStake, maxPayout, maxOdds, minOdds },
          exposure: {
            current: stakeHistory.monthly,
            afterBet: newMonthly,
            limit: userLimits.monthlyStakeLimit,
            usage: (newMonthly / userLimits.monthlyStakeLimit) * 100,
          },
        };
      }
    }
  }

  // 9. Verifica exposição do sistema
  const exposureCheck = wouldExceedLimits(
    {
      matchId: request.matchId,
      sport: request.sport,
      stake: request.stake,
      odds: request.odds,
      isLive: request.isLive,
    },
    currentExposure,
    systemLimits
  );

  if (!exposureCheck.allowed) {
    return {
      allowed: false,
      reason: exposureCheck.reason || 'Limite de exposição excedido',
      warnings: ['O sistema atingiu o limite de risco para este jogo/desporto'],
      limits: { maxStake, maxPayout, maxOdds, minOdds },
      exposure: {
        current: exposureCheck.current || 0,
        afterBet: exposureCheck.current || 0,
        limit: exposureCheck.limit || 0,
        usage: exposureCheck.limit 
          ? ((exposureCheck.current || 0) / exposureCheck.limit) * 100 
          : 0,
      },
    };
  }

  // 10. Avisos adicionais
  if (request.isLive) {
    warnings.push('Aposta ao vivo: odds podem mudar rapidamente');
  }

  if (request.odds > 10) {
    warnings.push('Odds elevadas: risco maior, probabilidade menor');
  }

  if (potentialPayout > 10000) {
    warnings.push(`Payout potencial: €${potentialPayout.toLocaleString('pt-PT')}`);
  }

  // Aposta aprovada
  const matchExposure = currentExposure.byMatch[request.matchId];
  const currentMatchExposure = matchExposure?.netExposure || 0;

  return {
    allowed: true,
    warnings,
    limits: { maxStake, maxPayout, maxOdds, minOdds },
    exposure: {
      current: currentMatchExposure,
      afterBet: currentMatchExposure + request.stake,
      limit: systemLimits.maxExposurePerMatch,
      usage: ((currentMatchExposure + request.stake) / systemLimits.maxExposurePerMatch) * 100,
    },
  };
}

/**
 * Calcula stake máximo permitido para uma aposta
 */
export function calculateMaxAllowedStake(
  request: Omit<BetValidationRequest, 'stake'>,
  currentExposure: GlobalExposure,
  userLimits?: UserLimits,
  stakeHistory?: StakeHistory,
  systemLimits: RiskLimits = DEFAULT_RISK_LIMITS
): number {
  const limits: number[] = [];

  // 1. Limite do sistema
  const systemMax = request.isLive 
    ? systemLimits.maxLiveStake 
    : systemLimits.maxStakePerBet;
  limits.push(systemMax);

  // 2. Limite por payout
  const maxByPayout = Math.floor(systemLimits.maxPayoutPerBet / request.odds);
  limits.push(maxByPayout);

  // 3. Limites do utilizador
  if (userLimits) {
    limits.push(userLimits.maxStakePerBet);

    if (stakeHistory) {
      // Limite diário
      if (userLimits.dailyStakeLimit > 0) {
        const dailyRemaining = userLimits.dailyStakeLimit - stakeHistory.daily;
        limits.push(Math.max(0, dailyRemaining));
      }

      // Limite semanal
      if (userLimits.weeklyStakeLimit > 0) {
        const weeklyRemaining = userLimits.weeklyStakeLimit - stakeHistory.weekly;
        limits.push(Math.max(0, weeklyRemaining));
      }

      // Limite mensal
      if (userLimits.monthlyStakeLimit > 0) {
        const monthlyRemaining = userLimits.monthlyStakeLimit - stakeHistory.monthly;
        limits.push(Math.max(0, monthlyRemaining));
      }
    }
  }

  // 4. Limite por exposição do jogo
  const matchExposure = currentExposure.byMatch[request.matchId];
  const currentMatchExposure = matchExposure?.netExposure || 0;
  const matchRemaining = systemLimits.maxExposurePerMatch - currentMatchExposure;
  limits.push(Math.max(0, matchRemaining));

  // 5. Limite por exposição do desporto
  const sportExposure = currentExposure.bySport[request.sport];
  const currentSportExposure = sportExposure?.maxLoss || 0;
  const sportRemaining = systemLimits.maxExposurePerSport - currentSportExposure;
  limits.push(Math.max(0, sportRemaining));

  // 6. Limite por exposição global
  const globalRemaining = systemLimits.maxGlobalExposure - currentExposure.netExposure;
  limits.push(Math.max(0, globalRemaining));

  // Retorna o menor de todos os limites
  return Math.floor(Math.min(...limits));
}

/**
 * Verifica se um mercado deve ser limitado ou fechado
 */
export function shouldLimitMarket(
  matchId: string,
  market: string,
  currentExposure: GlobalExposure,
  systemLimits: RiskLimits = DEFAULT_RISK_LIMITS
): {
  shouldLimit: boolean;
  shouldClose: boolean;
  reason?: string;
  maxStake?: number;
} {
  const matchExposure = currentExposure.byMatch[matchId];
  
  if (!matchExposure) {
    return { shouldLimit: false, shouldClose: false };
  }

  const exposurePercentage = 
    (matchExposure.netExposure / systemLimits.maxExposurePerMatch) * 100;

  // Fecha mercado se exposição > 90%
  if (exposurePercentage > 90) {
    return {
      shouldLimit: true,
      shouldClose: true,
      reason: 'Exposição crítica no jogo',
      maxStake: 0,
    };
  }

  // Limita stake se exposição > 70%
  if (exposurePercentage > 70) {
    const remainingExposure = systemLimits.maxExposurePerMatch - matchExposure.netExposure;
    const maxStake = Math.min(
      systemLimits.maxStakePerBet * 0.5, // 50% do stake normal
      remainingExposure
    );

    return {
      shouldLimit: true,
      shouldClose: false,
      reason: 'Exposição elevada no jogo',
      maxStake: Math.floor(maxStake),
    };
  }

  // Verifica se mercado específico está desbalanceado
  const marketExposure = matchExposure.markets[market];
  if (marketExposure && marketExposure.balancedRisk < 30) {
    return {
      shouldLimit: true,
      shouldClose: false,
      reason: 'Mercado desbalanceado',
      maxStake: Math.floor(systemLimits.maxStakePerBet * 0.3), // 30% do stake normal
    };
  }

  return { shouldLimit: false, shouldClose: false };
}

/**
 * Serviço simplificado de limites para uso pelo SportsbookApi.
 *
 * Fornece validação básica de stake por jogo/mercado utilizando
 * apenas os limites globais do sistema.
 */
export const limitsManager = {
  validateStake(
    matchId: string,
    _marketId: string,
    stake: number,
    systemLimits: RiskLimits = DEFAULT_RISK_LIMITS
  ): {
    valid: boolean;
    reason?: string;
    maxStake?: number;
    adjusted?: boolean;
    adjustedStake?: number;
  } {
    const maxStake = systemLimits.maxStakePerBet;

    if (stake <= 0) {
      return {
        valid: false,
        reason: 'Stake deve ser maior que zero',
        maxStake,
      };
    }

    if (stake > maxStake) {
      return {
        valid: false,
        reason: `Stake máxima por aposta é €${maxStake}`,
        maxStake,
        adjusted: true,
        adjustedStake: maxStake,
      };
    }

    console.log(
      `✅ [LimitsManager] Stake validada para ${matchId}: €${stake.toFixed(2)} (máx: €${maxStake})`
    );

    return {
      valid: true,
      maxStake,
      adjusted: false,
    };
  },
};
