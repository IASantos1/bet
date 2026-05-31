// ⚽ Futebol - Over/Under Goals
import type { Market, MarketOutcome } from '../../../types/sports';

export interface OverUnderGoalsMarket extends Market {
  type: 'over_under_goals';
  line: number;
  outcomes: {
    over: MarketOutcome;
    under: MarketOutcome;
  };
}

export function createOverUnderGoalsMarket(
  line: number,
  overOdds: number,
  underOdds: number
): OverUnderGoalsMarket {
  return {
    id: `over_under_${line}_${Date.now()}`,
    type: 'over_under_goals',
    name: `Mais/Menos ${line} Golos`,
    description: `Aposte se haverá mais ou menos de ${line} golos no jogo`,
    sport: 'football',
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

// Linhas comuns: 0.5, 1.5, 2.5, 3.5, 4.5
export const COMMON_GOAL_LINES = [0.5, 1.5, 2.5, 3.5, 4.5];
