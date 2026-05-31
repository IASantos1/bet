// 🏀 Basquetebol - Handicap
import type { Market, MarketOutcome } from '../../../types/sports';

export interface BasketballHandicapMarket extends Market {
  type: 'handicap';
  line: number;
  outcomes: {
    home: MarketOutcome;
    away: MarketOutcome;
  };
}

export function createBasketballHandicapMarket(
  homeTeam: string,
  awayTeam: string,
  line: number,
  homeOdds: number,
  awayOdds: number
): BasketballHandicapMarket {
  return {
    id: `basketball_handicap_${line}_${Date.now()}`,
    type: 'handicap',
    name: `Handicap ${line > 0 ? '+' : ''}${line}`,
    description: `${homeTeam} começa com ${line > 0 ? '+' : ''}${line} pontos`,
    sport: 'basketball',
    priority: 2,
    isLive: true,
    line,
    outcomes: {
      home: {
        id: 'home',
        name: `${homeTeam} (${line > 0 ? '+' : ''}${line})`,
        odds: homeOdds,
        probability: 1 / homeOdds,
        isAvailable: true
      },
      away: {
        id: 'away',
        name: `${awayTeam} (${-line > 0 ? '+' : ''}${-line})`,
        odds: awayOdds,
        probability: 1 / awayOdds,
        isAvailable: true
      }
    }
  };
}

// Linhas comuns de handicap no basquetebol
export const COMMON_BASKETBALL_HANDICAPS = [-12.5, -9.5, -7.5, -5.5, -3.5, -1.5, 1.5, 3.5, 5.5, 7.5, 9.5, 12.5];
