// ⚾ Basebol - Total Runs (Over/Under)
import type { Market, MarketOutcome } from '../../../types/sports';

export interface TotalRunsMarket extends Market {
  type: 'total_runs';
  line: number;
  outcomes: {
    over: MarketOutcome;
    under: MarketOutcome;
  };
}

export function createTotalRunsMarket(
  line: number,
  overOdds: number,
  underOdds: number
): TotalRunsMarket {
  return {
    id: `baseball_total_runs_${line}_${Date.now()}`,
    type: 'total_runs',
    name: `Mais/Menos ${line} Corridas`,
    description: `Aposte se o total de corridas será mais ou menos de ${line}`,
    sport: 'baseball',
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

// Linhas comuns de corridas totais (MLB: ~7-10)
export const COMMON_MLB_TOTALS = [6.5, 7.5, 8.5, 9.5, 10.5];
