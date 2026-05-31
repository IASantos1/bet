/**
 * 📊 Exposure Calculator
 * 
 * Calcula a exposição de risco global e por jogo
 * Considera todas as apostas ativas e potenciais perdas
 */

export interface BetExposure {
  betId: string;
  matchId: string;
  market: string;
  selection: string;
  stake: number;
  potentialPayout: number;
  potentialLoss: number;
  odds: number;
  status: 'pending' | 'live' | 'settled';
}

export interface MatchExposure {
  matchId: string;
  matchName: string;
  sport: string;
  league: string;
  totalStake: number;
  totalPotentialPayout: number;
  maxLoss: number;
  netExposure: number;
  betsCount: number;
  markets: Record<string, MarketExposure>;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  isLive: boolean;
}

export interface MarketExposure {
  market: string;
  totalStake: number;
  selections: Record<string, SelectionExposure>;
  balancedRisk: number; // 0-100, quanto mais próximo de 50, mais balanceado
}

export interface SelectionExposure {
  selection: string;
  stake: number;
  potentialPayout: number;
  betsCount: number;
}

export interface GlobalExposure {
  totalStake: number;
  totalPotentialPayout: number;
  maxPossibleLoss: number;
  netExposure: number;
  totalBets: number;
  liveBets: number;
  preLiveBets: number;
  byMatch: Record<string, MatchExposure>;
  bySport: Record<string, SportExposure>;
  riskDistribution: {
    low: number;
    medium: number;
    high: number;
    critical: number;
  };
  timestamp: string;
}

export interface SportExposure {
  sport: string;
  totalStake: number;
  totalPotentialPayout: number;
  maxLoss: number;
  matchesCount: number;
  betsCount: number;
}

export interface RiskLimits {
  maxStakePerBet: number;
  maxPayoutPerBet: number;
  maxExposurePerMatch: number;
  maxExposurePerSport: number;
  maxGlobalExposure: number;
  maxOdds: number;
  minOdds: number;
  maxLiveStake: number; // Stake menor em live
}

// Limites padrão do sistema
export const DEFAULT_RISK_LIMITS: RiskLimits = {
  maxStakePerBet: 1000, // €1000 por aposta
  maxPayoutPerBet: 50000, // €50k payout máximo
  maxExposurePerMatch: 100000, // €100k por jogo
  maxExposurePerSport: 500000, // €500k por desporto
  maxGlobalExposure: 2000000, // €2M global
  maxOdds: 100,
  minOdds: 1.01,
  maxLiveStake: 500, // €500 em live (50% do pré-jogo)
};

/**
 * Calcula exposição de uma aposta individual
 */
export function calculateBetExposure(
  stake: number,
  odds: number,
  status: 'pending' | 'live' | 'settled'
): BetExposure {
  const potentialPayout = stake * odds;
  const potentialLoss = stake;

  return {
    betId: '',
    matchId: '',
    market: '',
    selection: '',
    stake,
    potentialPayout,
    potentialLoss,
    odds,
    status,
  };
}

/**
 * Calcula exposição de um mercado específico
 */
export function calculateMarketExposure(
  betsOrMatchId: BetExposure[] | string,
  market: string
): MarketExposure {
  const bets = Array.isArray(betsOrMatchId) ? betsOrMatchId : [];
  const marketBets = bets.filter((b) => b.market === market);
  
  const selections: Record<string, SelectionExposure> = {};
  let totalStake = 0;

  marketBets.forEach((bet) => {
    totalStake += bet.stake;

    if (!selections[bet.selection]) {
      selections[bet.selection] = {
        selection: bet.selection,
        stake: 0,
        potentialPayout: 0,
        betsCount: 0,
      };
    }

    selections[bet.selection].stake += bet.stake;
    selections[bet.selection].potentialPayout += bet.potentialPayout;
    selections[bet.selection].betsCount += 1;
  });

  // Calcula o quão balanceado está o risco (0-100)
  // 50 = perfeitamente balanceado, 0 ou 100 = todo risco numa seleção
  const stakes = Object.values(selections).map((s) => s.stake);
  const maxStake = Math.max(...stakes);
  const minStake = Math.min(...stakes);
  const balancedRisk = totalStake > 0 
    ? ((minStake / maxStake) * 100) 
    : 50;

  return {
    market,
    totalStake,
    selections,
    balancedRisk,
  };
}

/**
 * Calcula exposição de um jogo específico
 */
export function calculateMatchExposure(
  matchId: string,
  matchName: string,
  sport: string,
  league: string,
  bets: BetExposure[],
  isLive: boolean
): MatchExposure;

export function calculateMatchExposure(
  matchId: string
): MatchExposure;

export function calculateMatchExposure(
  matchId: string,
  matchName?: string,
  sport?: string,
  league?: string,
  bets: BetExposure[] = [],
  isLive: boolean = false
): MatchExposure {
  const matchBets = bets.filter((b) => b.matchId === matchId);
  
  let totalStake = 0;
  let totalPotentialPayout = 0;
  const markets: Record<string, MarketExposure> = {};

  // Agrupa por mercado
  const marketGroups: Record<string, BetExposure[]> = {};
  matchBets.forEach((bet) => {
    totalStake += bet.stake;
    totalPotentialPayout += bet.potentialPayout;

    if (!marketGroups[bet.market]) {
      marketGroups[bet.market] = [];
    }
    marketGroups[bet.market].push(bet);
  });

  // Calcula exposição por mercado
  Object.keys(marketGroups).forEach((market) => {
    markets[market] = calculateMarketExposure(matchBets, market);
  });

  // Pior cenário: todas as apostas perdem
  const maxLoss = totalStake;
  
  // Exposição líquida (quanto podemos perder no pior caso)
  const netExposure = maxLoss;

  // Determina nível de risco
  let riskLevel: 'low' | 'medium' | 'high' | 'critical' = 'low';
  if (netExposure > DEFAULT_RISK_LIMITS.maxExposurePerMatch * 0.8) {
    riskLevel = 'critical';
  } else if (netExposure > DEFAULT_RISK_LIMITS.maxExposurePerMatch * 0.6) {
    riskLevel = 'high';
  } else if (netExposure > DEFAULT_RISK_LIMITS.maxExposurePerMatch * 0.3) {
    riskLevel = 'medium';
  }

  return {
    matchId,
    matchName: matchName ?? matchId,
    sport: sport ?? 'unknown',
    league: league ?? 'unknown',
    totalStake,
    totalPotentialPayout,
    maxLoss,
    netExposure,
    betsCount: matchBets.length,
    markets,
    riskLevel,
    isLive,
  };
}

/**
 * Calcula exposição por desporto
 */
export function calculateSportExposure(
  sport: string,
  matches: MatchExposure[]
): SportExposure {
  const sportMatches = matches.filter((m) => m.sport === sport);
  
  let totalStake = 0;
  let totalPotentialPayout = 0;
  let maxLoss = 0;

  sportMatches.forEach((match) => {
    totalStake += match.totalStake;
    totalPotentialPayout += match.totalPotentialPayout;
    maxLoss += match.maxLoss;
  });

  return {
    sport,
    totalStake,
    totalPotentialPayout,
    maxLoss,
    matchesCount: sportMatches.length,
    betsCount: sportMatches.reduce((sum, m) => sum + m.betsCount, 0),
  };
}

/**
 * Calcula exposição global de todas as apostas
 */
export function calculateGlobalExposure(
  allBets: BetExposure[],
  matchesInfo: Array<{
    matchId: string;
    matchName: string;
    sport: string;
    league: string;
    isLive: boolean;
  }>
): GlobalExposure {
  const byMatch: Record<string, MatchExposure> = {};
  
  // Calcula exposição por jogo
  matchesInfo.forEach((info) => {
    const matchBets = allBets.filter((b) => b.matchId === info.matchId);
    if (matchBets.length > 0) {
      byMatch[info.matchId] = calculateMatchExposure(
        info.matchId,
        info.matchName,
        info.sport,
        info.league,
        allBets,
        info.isLive
      );
    }
  });

  // Calcula exposição por desporto
  const bySport: Record<string, SportExposure> = {};
  const sports = [...new Set(matchesInfo.map((m) => m.sport))];
  
  sports.forEach((sport) => {
    const sportMatches = Object.values(byMatch).filter((m) => m.sport === sport);
    if (sportMatches.length > 0) {
      bySport[sport] = calculateSportExposure(sport, sportMatches);
    }
  });

  // Totais globais
  const totalStake = allBets.reduce((sum, bet) => sum + bet.stake, 0);
  const totalPotentialPayout = allBets.reduce((sum, bet) => sum + bet.potentialPayout, 0);
  const maxPossibleLoss = totalStake;
  const netExposure = maxPossibleLoss;

  // Contadores
  const liveBets = allBets.filter((b) => b.status === 'live').length;
  const preLiveBets = allBets.filter((b) => b.status === 'pending').length;

  // Distribuição de risco
  const matches = Object.values(byMatch);
  const riskDistribution = {
    low: matches.filter((m) => m.riskLevel === 'low').length,
    medium: matches.filter((m) => m.riskLevel === 'medium').length,
    high: matches.filter((m) => m.riskLevel === 'high').length,
    critical: matches.filter((m) => m.riskLevel === 'critical').length,
  };

  return {
    totalStake,
    totalPotentialPayout,
    maxPossibleLoss,
    netExposure,
    totalBets: allBets.length,
    liveBets,
    preLiveBets,
    byMatch,
    bySport,
    riskDistribution,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Verifica se adicionar uma nova aposta excede os limites
 */
export function wouldExceedLimits(
  newBet: {
    matchId: string;
    sport: string;
    stake: number;
    odds: number;
    isLive: boolean;
  },
  currentExposure: GlobalExposure,
  limits: RiskLimits = DEFAULT_RISK_LIMITS
): {
  allowed: boolean;
  reason?: string;
  limit?: number;
  current?: number;
} {
  const potentialPayout = newBet.stake * newBet.odds;

  // 1. Verifica stake máximo
  const maxStake = newBet.isLive ? limits.maxLiveStake : limits.maxStakePerBet;
  if (newBet.stake > maxStake) {
    return {
      allowed: false,
      reason: newBet.isLive 
        ? 'Stake excede o limite para apostas ao vivo'
        : 'Stake excede o limite por aposta',
      limit: maxStake,
      current: newBet.stake,
    };
  }

  // 2. Verifica payout máximo
  if (potentialPayout > limits.maxPayoutPerBet) {
    return {
      allowed: false,
      reason: 'Payout potencial excede o limite',
      limit: limits.maxPayoutPerBet,
      current: potentialPayout,
    };
  }

  // 3. Verifica odds
  if (newBet.odds > limits.maxOdds) {
    return {
      allowed: false,
      reason: 'Odds excedem o limite máximo',
      limit: limits.maxOdds,
      current: newBet.odds,
    };
  }

  if (newBet.odds < limits.minOdds) {
    return {
      allowed: false,
      reason: 'Odds abaixo do limite mínimo',
      limit: limits.minOdds,
      current: newBet.odds,
    };
  }

  // 4. Verifica exposição por jogo
  const matchExposure = currentExposure.byMatch[newBet.matchId];
  const newMatchExposure = (matchExposure?.netExposure || 0) + newBet.stake;
  
  if (newMatchExposure > limits.maxExposurePerMatch) {
    return {
      allowed: false,
      reason: 'Exposição no jogo excede o limite',
      limit: limits.maxExposurePerMatch,
      current: newMatchExposure,
    };
  }

  // 5. Verifica exposição por desporto
  const sportExposure = currentExposure.bySport[newBet.sport];
  const newSportExposure = (sportExposure?.maxLoss || 0) + newBet.stake;
  
  if (newSportExposure > limits.maxExposurePerSport) {
    return {
      allowed: false,
      reason: 'Exposição no desporto excede o limite',
      limit: limits.maxExposurePerSport,
      current: newSportExposure,
    };
  }

  // 6. Verifica exposição global
  const newGlobalExposure = currentExposure.netExposure + newBet.stake;
  
  if (newGlobalExposure > limits.maxGlobalExposure) {
    return {
      allowed: false,
      reason: 'Exposição global excede o limite',
      limit: limits.maxGlobalExposure,
      current: newGlobalExposure,
    };
  }

  return { allowed: true };
}

/**
 * Calcula métricas de risco em tempo real
 */
export function calculateRiskMetrics(exposure: GlobalExposure) {
  const totalRevenue = exposure.totalStake;
  const potentialLoss = exposure.maxPossibleLoss;
  const potentialProfit = exposure.totalStake - exposure.totalPotentialPayout;
  
  // ROI esperado (assumindo 5% de margem)
  const expectedROI = totalRevenue * 0.05;
  
  // Rácio de risco/retorno
  const riskRewardRatio = potentialLoss > 0 
    ? expectedROI / potentialLoss 
    : 0;

  // Percentagem de exposição usada
  const exposureUsage = {
    global: (exposure.netExposure / DEFAULT_RISK_LIMITS.maxGlobalExposure) * 100,
    bySport: Object.entries(exposure.bySport).map(([sport, exp]) => ({
      sport,
      usage: (exp.maxLoss / DEFAULT_RISK_LIMITS.maxExposurePerSport) * 100,
    })),
  };

  return {
    totalRevenue,
    potentialLoss,
    potentialProfit,
    expectedROI,
    riskRewardRatio,
    exposureUsage,
  };
}

/**
 * Serviço simplificado de exposição para uso pelos dashboards
 * e pelo sportsbookApi.
 *
 * Mantém estado mínimo em memória com limites por jogo e
 * devolve estruturas agregadas utilizadas apenas para
 * visualização e validação básica.
 */
interface InternalMatchState {
  limit: number;
  totalExposure: number;
  markets: Map<string, { totalExposure: number; betCount: number; totalStake: number }>;
  outcomes: Map<string, { totalExposure: number; betCount: number }>;
}

const exposureState: {
  matches: Map<string, InternalMatchState>;
  globalLimit: number;
} = {
  matches: new Map(),
  globalLimit: DEFAULT_RISK_LIMITS.maxGlobalExposure,
};

function getMatchState(matchId: string): InternalMatchState {
  let state = exposureState.matches.get(matchId);
  if (!state) {
    state = {
      limit: DEFAULT_RISK_LIMITS.maxExposurePerMatch,
      totalExposure: 0,
      markets: new Map(),
      outcomes: new Map(),
    };
    exposureState.matches.set(matchId, state);
  }
  return state;
}

export const exposureCalculator = {
  getGlobalExposure(): {
    totalExposure: number;
    limit: number;
    percentage: number;
  } {
    let totalExposure = 0;
    exposureState.matches.forEach((m) => {
      totalExposure += m.totalExposure;
    });

    const limit = exposureState.globalLimit;
    const percentage = limit > 0 ? (totalExposure / limit) * 100 : 0;

    return {
      totalExposure,
      limit,
      percentage,
    };
  },

  getMatchExposure(matchId: string): {
    matchId: string;
    totalExposure: number;
    limit: number;
    percentage: number;
    betCount: number;
    totalStake: number;
  } {
    const state = getMatchState(matchId);

    let totalStake = 0;
    let betCount = 0;
    state.markets.forEach((m) => {
      totalStake += m.totalStake;
      betCount += m.betCount;
    });

    const percentage = state.limit > 0 ? (state.totalExposure / state.limit) * 100 : 0;

    return {
      matchId,
      totalExposure: state.totalExposure,
      limit: state.limit,
      percentage,
      betCount,
      totalStake,
    };
  },

  getMarketExposure(
    matchId: string,
    market: string
  ): {
    matchId: string;
    market: string;
    totalExposure: number;
    percentage: number;
    betCount: number;
    totalStake: number;
  } {
    const state = getMatchState(matchId);
    const marketState =
      state.markets.get(market) || { totalExposure: 0, betCount: 0, totalStake: 0 };

    const percentage =
      state.limit > 0 ? (marketState.totalExposure / state.limit) * 100 : 0;

    return {
      matchId,
      market,
      totalExposure: marketState.totalExposure,
      percentage,
      betCount: marketState.betCount,
      totalStake: marketState.totalStake,
    };
  },

  getOutcomeExposure(
    matchId: string,
    market: string,
    outcomeId: string
  ): {
    matchId: string;
    market: string;
    outcomeId: string;
    totalExposure: number;
    betCount: number;
  } {
    const state = getMatchState(matchId);
    const key = `${market}_${outcomeId}`;
    const outcomeState =
      state.outcomes.get(key) || { totalExposure: 0, betCount: 0 };

    return {
      matchId,
      market,
      outcomeId,
      totalExposure: outcomeState.totalExposure,
      betCount: outcomeState.betCount,
    };
  },

  setMatchExposureLimit(matchId: string, newLimit: number): void {
    const state = getMatchState(matchId);
    state.limit = Math.max(0, newLimit);
  },

  checkExposureLimit(
    matchId: string,
    potentialPayout: number
  ): {
    allowed: boolean;
    reason?: string;
    warning?: string;
  } {
    const state = getMatchState(matchId);
    const newExposure = state.totalExposure + potentialPayout;

    if (newExposure > state.limit) {
      return {
        allowed: false,
        reason: 'Exposição no jogo excede o limite configurado',
      };
    }

    const global = this.getGlobalExposure();
    if (global.totalExposure + potentialPayout > global.limit) {
      return {
        allowed: false,
        reason: 'Exposição global excede o limite configurado',
      };
    }

    const usage = state.limit > 0 ? (newExposure / state.limit) * 100 : 0;
    const warning =
      usage > 80
        ? `Exposição do jogo atingiu ${usage.toFixed(1)}% do limite`
        : undefined;

    return {
      allowed: true,
      warning,
    };
  },
};
