// 🏈 NFL - Point Spread (Handicap)
import type { Market, MarketOutcome } from '../../../types/sports';

export interface PointSpreadMarket extends Market {
  type: 'point_spread';
  line: number;
  outcomes: {
    home: MarketOutcome;
    away: MarketOutcome;
  };
}

export function createPointSpreadMarket(
  homeTeam: string,
  awayTeam: string,
  line: number,
  homeOdds: number,
  awayOdds: number
): PointSpreadMarket {
  return {
    id: `nfl_point_spread_${line}_${Date.now()}`,
    type: 'point_spread',
    name: `Point Spread ${line > 0 ? '+' : ''}${line}`,
    description: `${homeTeam} começa com ${line > 0 ? '+' : ''}${line} pontos`,
    sport: 'nfl',
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

// Linhas comuns de point spread na NFL
export const COMMON_NFL_SPREADS = [-14.5, -10.5, -7.5, -6.5, -3.5, -2.5, -1.5, 1.5, 2.5, 3.5, 6.5, 7.5, 10.5, 14.5];
