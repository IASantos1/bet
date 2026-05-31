// 🏀 Basquetebol - Over/Under Points
import type { Market, MarketOutcome } from '../../../types/sports';

export interface OverUnderPointsMarket extends Market {
  type: 'over_under_points';
  line: number;
  outcomes: {
    over: MarketOutcome;
    under: MarketOutcome;
  };
}

export function createOverUnderPointsMarket(
  line: number,
  overOdds: number,
  underOdds: number
): OverUnderPointsMarket {
  return {
    id: `basketball_over_under_${line}_${Date.now()}`,
    type: 'over_under_points',
    name: `Mais/Menos ${line} Pontos`,
    description: `Aposte se o total de pontos será mais ou menos de ${line}`,
    sport: 'basketball',
    priority: 2,
    isLive: true,
    line,
    outcomes: {
      over: {
        id: 'over',
        name: `Mais de ${line}`,
        odds: overOdds,
        probability: 1 / overOdds,
        isAvailable: true
      },
      under: {
        id: 'under',
        name: `Menos de ${line}`,
        odds: underOdds,
        probability: 1 / underOdds,
        isAvailable: true
      }
    }
  };
}

// Linhas comuns de pontos totais (NBA: ~215-230, Euroliga: ~160-175)
export const COMMON_NBA_TOTALS = [205.5, 210.5, 215.5, 220.5, 225.5, 230.5];
export const COMMON_EUROLEAGUE_TOTALS = [155.5, 160.5, 165.5, 170.5, 175.5, 180.5];
