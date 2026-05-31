// 🏉 Rugby - Handicap
import type { Market, MarketOutcome } from '../../../types/sports';

export interface RugbyHandicapMarket extends Market {
  type: 'handicap';
  line: number;
  outcomes: {
    home: MarketOutcome;
    away: MarketOutcome;
  };
}

export function createRugbyHandicapMarket(
  homeTeam: string,
  awayTeam: string,
  line: number,
  homeOdds: number,
  awayOdds: number
): RugbyHandicapMarket {
  return {
    id: `rugby_handicap_${line}_${Date.now()}`,
    type: 'handicap',
    name: `Handicap ${line > 0 ? '+' : ''}${line}`,
    description: `${homeTeam} começa com ${line > 0 ? '+' : ''}${line} pontos`,
    sport: 'rugby',
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

// Linhas comuns de handicap no rugby
export const COMMON_RUGBY_HANDICAPS = [-21.5, -14.5, -10.5, -7.5, -3.5, 3.5, 7.5, 10.5, 14.5, 21.5];
