// ⚽ Futebol - Double Chance (1X, X2, 12)
import type { Market, MarketOutcome } from '../../../types/sports';

export interface DoubleChanceMarket extends Market {
  type: 'double_chance';
  outcomes: {
    homeOrDraw: MarketOutcome;
    drawOrAway: MarketOutcome;
    homeOrAway: MarketOutcome;
  };
}

export function createDoubleChanceMarket(
  homeTeam: string,
  awayTeam: string,
  homeOrDrawOdds: number,
  drawOrAwayOdds: number,
  homeOrAwayOdds: number
): DoubleChanceMarket {
  return {
    id: `double_chance_${Date.now()}`,
    type: 'double_chance',
    name: 'Dupla Hipótese',
    description: 'Aposte em duas possibilidades de resultado',
    sport: 'football',
    priority: 2,
    isLive: false,
    outcomes: {
      homeOrDraw: {
        id: '1X',
        name: `${homeTeam} ou Empate`,
        odds: homeOrDrawOdds,
        probability: 1 / homeOrDrawOdds,
        isAvailable: true
      },
      drawOrAway: {
        id: 'X2',
        name: `Empate ou ${awayTeam}`,
        odds: drawOrAwayOdds,
        probability: 1 / drawOrAwayOdds,
        isAvailable: true
      },
      homeOrAway: {
        id: '12',
        name: `${homeTeam} ou ${awayTeam}`,
        odds: homeOrAwayOdds,
        probability: 1 / homeOrAwayOdds,
        isAvailable: true
      }
    }
  };
}
