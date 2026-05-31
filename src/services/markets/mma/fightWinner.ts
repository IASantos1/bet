// 🥊 MMA - Fight Winner
import type { Market, MarketOutcome } from '../../../types/sports';

export interface FightWinnerMarket extends Market {
  type: 'fight_winner';
  outcomes: {
    fighter1: MarketOutcome;
    fighter2: MarketOutcome;
  };
}

export function createFightWinnerMarket(
  fighter1Name: string,
  fighter2Name: string,
  fighter1Odds: number,
  fighter2Odds: number
): FightWinnerMarket {
  return {
    id: `mma_fight_winner_${Date.now()}`,
    type: 'fight_winner',
    name: 'Vencedor da Luta',
    description: 'Aposte em quem vencerá a luta',
    sport: 'mma',
    priority: 1,
    isLive: true,
    outcomes: {
      fighter1: {
        id: 'fighter1',
        name: fighter1Name,
        odds: fighter1Odds,
        probability: 1 / fighter1Odds,
        isAvailable: true
      },
      fighter2: {
        id: 'fighter2',
        name: fighter2Name,
        odds: fighter2Odds,
        probability: 1 / fighter2Odds,
        isAvailable: true
      }
    }
  };
}
