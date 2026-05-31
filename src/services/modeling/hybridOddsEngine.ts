/**
 * 🎲 Hybrid Odds Engine
 * 
 * Combina odds de múltiplas fontes:
 * - 70% Modelo interno (Probability Engine)
 * - 30% Mercado externo (The Odds API)
 * - Aplica margem de 5%
 * - Validação de desvio máximo (±12%)
 */

import { probabilityToOdds, oddsToProbability, type MatchProbabilities } from './probabilityEngine';
import type { AdjustedProbabilities } from './liveAdjuster';

interface ExternalOdds {
  source: string;
  bookmaker: string;
  home: number;
  draw?: number;
  away: number;
  over25?: number;
  under25?: number;
  btts_yes?: number;
  btts_no?: number;
  timestamp: number;
}

interface HybridOddsConfig {
  modelWeight: number; // 0-1 (padrão: 0.7)
  marketWeight: number; // 0-1 (padrão: 0.3)
  margin: number; // 0-1 (padrão: 0.05 = 5%)
  maxDeviation: number; // 0-1 (padrão: 0.12 = ±12%)
  minOdds: number; // Odds mínimas (padrão: 1.01)
  maxOdds: number; // Odds máximas (padrão: 100)
}

interface HybridOdds {
  home: number;
  draw: number;
  away: number;
  over05: number;
  over15: number;
  over25: number;
  over35: number;
  btts_yes: number;
  btts_no: number;
  confidence: number;
  source: {
    model: number; // % do modelo
    market: number; // % do mercado
  };
  validation: {
    deviationFromMarket: number;
    withinLimits: boolean;
    adjustmentApplied: boolean;
  };
  margin: number;
  timestamp: number;
}

const DEFAULT_CONFIG: HybridOddsConfig = {
  modelWeight: 0.7,
  marketWeight: 0.3,
  margin: 0.05,
  maxDeviation: 0.12,
  minOdds: 1.01,
  maxOdds: 100,
};

/**
 * Calcula média ponderada de odds
 */
function calculateWeightedOdds(
  modelOdds: number,
  marketOdds: number | undefined,
  modelWeight: number,
  marketWeight: number
): number {
  if (!marketOdds || marketOdds <= 1) {
    // Sem odds do mercado, usa 100% do modelo
    return modelOdds;
  }

  // Converte para probabilidades
  const modelProb = oddsToProbability(modelOdds);
  const marketProb = oddsToProbability(marketOdds);

  // Média ponderada das probabilidades
  const hybridProb = modelProb * modelWeight + marketProb * marketWeight;

  // Converte de volta para odds
  return 1 / hybridProb;
}

/**
 * Aplica margem às odds
 */
function applyMargin(odds: number, margin: number): number {
  const probability = oddsToProbability(odds);
  const adjustedProbability = probability * (1 + margin);
  return 1 / adjustedProbability;
}

/**
 * Valida desvio entre modelo e mercado
 */
function validateDeviation(
  modelOdds: number,
  marketOdds: number | undefined,
  maxDeviation: number
): { withinLimits: boolean; deviation: number } {
  if (!marketOdds || marketOdds <= 1) {
    return { withinLimits: true, deviation: 0 };
  }

  const modelProb = oddsToProbability(modelOdds);
  const marketProb = oddsToProbability(marketOdds);

  const deviation = Math.abs(modelProb - marketProb) / marketProb;

  return {
    withinLimits: deviation <= maxDeviation,
    deviation,
  };
}

/**
 * Ajusta odds se desvio for muito grande
 */
function adjustForDeviation(
  modelOdds: number,
  marketOdds: number | undefined,
  maxDeviation: number
): { odds: number; adjusted: boolean } {
  if (!marketOdds || marketOdds <= 1) {
    return { odds: modelOdds, adjusted: false };
  }

  const validation = validateDeviation(modelOdds, marketOdds, maxDeviation);

  if (validation.withinLimits) {
    return { odds: modelOdds, adjusted: false };
  }

  // Desvio muito grande - aproxima do mercado
  const modelProb = oddsToProbability(modelOdds);
  const marketProb = oddsToProbability(marketOdds);

  // Ajusta para ficar dentro do limite
  let adjustedProb: number;
  if (modelProb > marketProb) {
    adjustedProb = marketProb * (1 + maxDeviation);
  } else {
    adjustedProb = marketProb * (1 - maxDeviation);
  }

  return {
    odds: 1 / adjustedProb,
    adjusted: true,
  };
}

/**
 * Limita odds dentro do range permitido
 */
function clampOdds(odds: number, minOdds: number, maxOdds: number): number {
  return Math.max(minOdds, Math.min(maxOdds, odds));
}

/**
 * Normaliza odds 1X2 para somar corretamente
 */
function normalize1X2Odds(
  home: number,
  draw: number,
  away: number,
  targetMargin: number
): { home: number; draw: number; away: number } {
  // Converte para probabilidades
  const homeProb = oddsToProbability(home);
  const drawProb = oddsToProbability(draw);
  const awayProb = oddsToProbability(away);

  const total = homeProb + drawProb + awayProb;

  // Ajusta para margem desejada
  const adjustmentFactor = (1 + targetMargin) / total;

  return {
    home: 1 / (homeProb * adjustmentFactor),
    draw: 1 / (drawProb * adjustmentFactor),
    away: 1 / (awayProb * adjustmentFactor),
  };
}

/**
 * Calcula odds do modelo interno
 */
function calculateModelOdds(
  probabilities: MatchProbabilities | AdjustedProbabilities
): {
  home: number;
  draw: number;
  away: number;
  over05: number;
  over15: number;
  over25: number;
  over35: number;
  btts_yes: number;
  btts_no: number;
} {
  return {
    home: probabilityToOdds(probabilities.home),
    draw: probabilityToOdds(probabilities.draw),
    away: probabilityToOdds(probabilities.away),
    over05: probabilityToOdds(probabilities.over05),
    over15: probabilityToOdds(probabilities.over15),
    over25: probabilityToOdds(probabilities.over25),
    over35: probabilityToOdds(probabilities.over35),
    btts_yes: probabilityToOdds(probabilities.btts),
    btts_no: probabilityToOdds(1 - probabilities.btts),
  };
}

/**
 * Extrai odds do mercado externo
 */
function extractMarketOdds(externalOdds: ExternalOdds[]): {
  home?: number;
  draw?: number;
  away?: number;
  over25?: number;
  under25?: number;
  btts_yes?: number;
  btts_no?: number;
} {
  if (externalOdds.length === 0) {
    return {};
  }

  // Calcula média de todos os bookmakers
  const avgHome = externalOdds.reduce((sum, o) => sum + o.home, 0) / externalOdds.length;
  const avgAway = externalOdds.reduce((sum, o) => sum + o.away, 0) / externalOdds.length;
  
  const drawOdds = externalOdds.filter(o => o.draw);
  const avgDraw = drawOdds.length > 0
    ? drawOdds.reduce((sum, o) => sum + (o.draw || 0), 0) / drawOdds.length
    : undefined;

  const over25Odds = externalOdds.filter(o => o.over25);
  const avgOver25 = over25Odds.length > 0
    ? over25Odds.reduce((sum, o) => sum + (o.over25 || 0), 0) / over25Odds.length
    : undefined;

  const under25Odds = externalOdds.filter(o => o.under25);
  const avgUnder25 = under25Odds.length > 0
    ? under25Odds.reduce((sum, o) => sum + (o.under25 || 0), 0) / under25Odds.length
    : undefined;

  const bttsYesOdds = externalOdds.filter(o => o.btts_yes);
  const avgBttsYes = bttsYesOdds.length > 0
    ? bttsYesOdds.reduce((sum, o) => sum + (o.btts_yes || 0), 0) / bttsYesOdds.length
    : undefined;

  const bttsNoOdds = externalOdds.filter(o => o.btts_no);
  const avgBttsNo = bttsNoOdds.length > 0
    ? bttsNoOdds.reduce((sum, o) => sum + (o.btts_no || 0), 0) / bttsNoOdds.length
    : undefined;

  return {
    home: avgHome,
    draw: avgDraw,
    away: avgAway,
    over25: avgOver25,
    under25: avgUnder25,
    btts_yes: avgBttsYes,
    btts_no: avgBttsNo,
  };
}

/**
 * 🎯 FUNÇÃO PRINCIPAL: Gera odds híbridas
 */
export function generateHybridOdds(
  probabilities: MatchProbabilities | AdjustedProbabilities,
  externalOdds: ExternalOdds[] = [],
  config: Partial<HybridOddsConfig> = {}
): HybridOdds {
  const finalConfig = { ...DEFAULT_CONFIG, ...config };

  console.log('🎲 Gerando odds híbridas:', {
    modelWeight: `${finalConfig.modelWeight * 100}%`,
    marketWeight: `${finalConfig.marketWeight * 100}%`,
    margin: `${finalConfig.margin * 100}%`,
    externalSources: externalOdds.length,
  });

  // 1. Calcula odds do modelo
  const modelOdds = calculateModelOdds(probabilities);

  // 2. Extrai odds do mercado
  const marketOdds = extractMarketOdds(externalOdds);

  // 3. Calcula odds híbridas (média ponderada)
  let hybridHome = calculateWeightedOdds(
    modelOdds.home,
    marketOdds.home,
    finalConfig.modelWeight,
    finalConfig.marketWeight
  );

  let hybridDraw = calculateWeightedOdds(
    modelOdds.draw,
    marketOdds.draw,
    finalConfig.modelWeight,
    finalConfig.marketWeight
  );

  let hybridAway = calculateWeightedOdds(
    modelOdds.away,
    marketOdds.away,
    finalConfig.modelWeight,
    finalConfig.marketWeight
  );

  // 4. Valida desvio
  const homeValidation = validateDeviation(modelOdds.home, marketOdds.home, finalConfig.maxDeviation);
  const drawValidation = validateDeviation(modelOdds.draw, marketOdds.draw, finalConfig.maxDeviation);
  const awayValidation = validateDeviation(modelOdds.away, marketOdds.away, finalConfig.maxDeviation);

  const maxDeviation = Math.max(
    homeValidation.deviation,
    drawValidation.deviation,
    awayValidation.deviation
  );

  const withinLimits = homeValidation.withinLimits && drawValidation.withinLimits && awayValidation.withinLimits;

  // 5. Ajusta se necessário
  let adjustmentApplied = false;
  if (!withinLimits) {
    console.warn('⚠️ Desvio acima do limite, ajustando odds...');
    const homeAdjusted = adjustForDeviation(modelOdds.home, marketOdds.home, finalConfig.maxDeviation);
    const drawAdjusted = adjustForDeviation(modelOdds.draw, marketOdds.draw, finalConfig.maxDeviation);
    const awayAdjusted = adjustForDeviation(modelOdds.away, marketOdds.away, finalConfig.maxDeviation);

    hybridHome = homeAdjusted.odds;
    hybridDraw = drawAdjusted.odds;
    hybridAway = awayAdjusted.odds;

    adjustmentApplied = homeAdjusted.adjusted || drawAdjusted.adjusted || awayAdjusted.adjusted;
  }

  // 6. Normaliza 1X2 com margem
  const normalized1X2 = normalize1X2Odds(hybridHome, hybridDraw, hybridAway, finalConfig.margin);

  // 7. Calcula outras odds híbridas
  const hybridOver25 = calculateWeightedOdds(
    modelOdds.over25,
    marketOdds.over25,
    finalConfig.modelWeight,
    finalConfig.marketWeight
  );

  const hybridBttsYes = calculateWeightedOdds(
    modelOdds.btts_yes,
    marketOdds.btts_yes,
    finalConfig.modelWeight,
    finalConfig.marketWeight
  );

  // 8. Aplica margem e limites
  const finalOdds: HybridOdds = {
    home: clampOdds(normalized1X2.home, finalConfig.minOdds, finalConfig.maxOdds),
    draw: clampOdds(normalized1X2.draw, finalConfig.minOdds, finalConfig.maxOdds),
    away: clampOdds(normalized1X2.away, finalConfig.minOdds, finalConfig.maxOdds),
    over05: clampOdds(applyMargin(modelOdds.over05, finalConfig.margin), finalConfig.minOdds, finalConfig.maxOdds),
    over15: clampOdds(applyMargin(modelOdds.over15, finalConfig.margin), finalConfig.minOdds, finalConfig.maxOdds),
    over25: clampOdds(applyMargin(hybridOver25, finalConfig.margin), finalConfig.minOdds, finalConfig.maxOdds),
    over35: clampOdds(applyMargin(modelOdds.over35, finalConfig.margin), finalConfig.minOdds, finalConfig.maxOdds),
    btts_yes: clampOdds(applyMargin(hybridBttsYes, finalConfig.margin), finalConfig.minOdds, finalConfig.maxOdds),
    btts_no: clampOdds(applyMargin(modelOdds.btts_no, finalConfig.margin), finalConfig.minOdds, finalConfig.maxOdds),
    confidence: probabilities.confidence,
    source: {
      model: marketOdds.home ? finalConfig.modelWeight * 100 : 100,
      market: marketOdds.home ? finalConfig.marketWeight * 100 : 0,
    },
    validation: {
      deviationFromMarket: maxDeviation,
      withinLimits,
      adjustmentApplied,
    },
    margin: finalConfig.margin,
    timestamp: Date.now(),
  };

  console.log('✅ Odds híbridas geradas:', {
    '1X2': `${finalOdds.home.toFixed(2)} / ${finalOdds.draw.toFixed(2)} / ${finalOdds.away.toFixed(2)}`,
    'Over 2.5': finalOdds.over25.toFixed(2),
    'BTTS': finalOdds.btts_yes.toFixed(2),
    source: `${finalOdds.source.model.toFixed(0)}% modelo / ${finalOdds.source.market.toFixed(0)}% mercado`,
    deviation: `${(maxDeviation * 100).toFixed(1)}%`,
    adjusted: adjustmentApplied,
  });

  return finalOdds;
}

/**
 * Compara odds híbridas com mercado
 */
export function compareWithMarket(
  hybridOdds: HybridOdds,
  marketOdds: ExternalOdds[]
): {
  home: { hybrid: number; market: number; diff: number };
  draw: { hybrid: number; market: number; diff: number };
  away: { hybrid: number; market: number; diff: number };
  advantage: 'hybrid' | 'market' | 'neutral';
} {
  const market = extractMarketOdds(marketOdds);

  const homeDiff = market.home ? ((hybridOdds.home - market.home) / market.home) * 100 : 0;
  const drawDiff = market.draw ? ((hybridOdds.draw - market.draw) / market.draw) * 100 : 0;
  const awayDiff = market.away ? ((hybridOdds.away - market.away) / market.away) * 100 : 0;

  const avgDiff = (Math.abs(homeDiff) + Math.abs(drawDiff) + Math.abs(awayDiff)) / 3;

  let advantage: 'hybrid' | 'market' | 'neutral' = 'neutral';
  if (avgDiff > 5) {
    advantage = homeDiff + drawDiff + awayDiff > 0 ? 'hybrid' : 'market';
  }

  return {
    home: { hybrid: hybridOdds.home, market: market.home || 0, diff: homeDiff },
    draw: { hybrid: hybridOdds.draw, market: market.draw || 0, diff: drawDiff },
    away: { hybrid: hybridOdds.away, market: market.away || 0, diff: awayDiff },
    advantage,
  };
}

/**
 * Calcula valor esperado (EV) de uma aposta
 */
export function calculateExpectedValue(
  odds: number,
  trueProbability: number,
  stake: number = 100
): {
  ev: number;
  evPercentage: number;
  isValueBet: boolean;
} {
  const expectedReturn = trueProbability * (odds * stake) + (1 - trueProbability) * 0;
  const ev = expectedReturn - stake;
  const evPercentage = (ev / stake) * 100;

  return {
    ev,
    evPercentage,
    isValueBet: evPercentage > 0,
  };
}

/**
 * Exporta tipos
 */
export type { HybridOdds, HybridOddsConfig, ExternalOdds };

/**
 * Serviço simples para integração com outros módulos
 *
 * Fornece um método getHybridOdds utilizado por serviços como
 * sportsbookApi, operatorView e liveMonitor. A implementação
 * atual devolve estruturas mínimas mas válidas para evitar
 * erros de runtime enquanto o motor completo não está ligado
 * ao fluxo de apostas real.
 */
export const hybridOddsEngine = {
  async getHybridOdds(
    matchId: string,
    marketType?: string,
    outcomeId?: string,
    currentOdds?: number
  ): Promise<any> {
    if (!marketType) {
      return {
        matchId,
        markets: {},
        generatedAt: Date.now(),
      };
    }

    return {
      matchId,
      marketType,
      outcomeId,
      currentOdds: currentOdds ?? 0,
      modelOdds: currentOdds ?? 0,
      marketOdds: currentOdds ?? 0,
      hybridOdds: currentOdds ?? 0,
      deviation: 0,
      confidence: 1,
      timestamp: Date.now(),
    };
  },
};
