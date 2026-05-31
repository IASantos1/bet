// ⚽ Futebol - Correct Score
import type { Market, MarketOutcome } from '../../../types/sports';

export interface CorrectScoreMarket extends Market {
  type: 'correct_score';
  outcomes: MarketOutcome[];
}

export function createCorrectScoreMarket(
  scores: Array<{ home: number; away: number; odds: number }>
): CorrectScoreMarket {
  return {
    id: `correct_score_${Date.now()}`,
    type: 'correct_score',
    name: 'Resultado Exato',
    description: 'Aposte no resultado exato do jogo',
    sport: 'football',
    priority: 4,
    isLive: false,
    outcomes: scores.map(score => ({
      id: `${score.home}-${score.away}`,
      name: `${score.home}-${score.away}`,
      odds: score.odds,
      probability: 1 / score.odds,
      isAvailable: true
    }))
  };
}

// Resultados mais comuns
export const COMMON_SCORES = [
  { home: 0, away: 0, odds: 9.0 },
  { home: 1, away: 0, odds: 7.5 },
  { home: 0, away: 1, odds: 8.0 },
  { home: 1, away: 1, odds: 6.5 },
  { home: 2, away: 0, odds: 9.5 },
  { home: 0, away: 2, odds: 10.0 },
  { home: 2, away: 1, odds: 8.5 },
  { home: 1, away: 2, odds: 9.0 },
  { home: 2, away: 2, odds: 12.0 },
  { home: 3, away: 0, odds: 15.0 },
  { home: 0, away: 3, odds: 16.0 },
  { home: 3, away: 1, odds: 18.0 }
];
