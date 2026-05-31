// 🥊 MMA - Method of Victory
import type { Market, MarketOutcome } from '../../../types/sports';

export interface MethodOfVictoryMarket extends Market {
  type: 'method_of_victory';
  outcomes: {
    ko: MarketOutcome;
    submission: MarketOutcome;
    decision: MarketOutcome;
  };
}

export function createMethodOfVictoryMarket(
  koOdds: number,
  submissionOdds: number,
  decisionOdds: number
): MethodOfVictoryMarket {
  return {
    id: `mma_method_of_victory_${Date.now()}`,
    type: 'method_of_victory',
    name: 'Método de Vitória',
    description: 'Aposte em como a luta terminará',
    sport: 'mma',
    priority: 2,
    isLive: true,
    outcomes: {
      ko: {
        id: 'ko',
        name: 'KO/TKO',
        odds: koOdds,
        probability: 1 / koOdds,
        isAvailable: true
      },
      submission: {
        id: 'submission',
        name: 'Finalização',
        odds: submissionOdds,
        probability: 1 / submissionOdds,
        isAvailable: true
      },
      decision: {
        id: 'decision',
        name: 'Decisão',
        odds: decisionOdds,
        probability: 1 / decisionOdds,
        isAvailable: true
      }
    }
  };
}
