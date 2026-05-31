// 🤾 Andebol - Handicap
import type { Market, MarketOutcome } from '../../../types/sports';

export interface HandballHandicapMarket extends Market {
  type: 'handicap';
  line: number;
  outcomes: {
    home: MarketOutcome;
    away: MarketOutcome;
  };
}

export function createHandballHandicapMarket(
  homeTeam: string,
  awayTeam: string,
  line: number,
  homeOdds: number,
  awayOdds: number
): HandballHandicapMarket {
  return {
    id: `handball_handicap_${line}_${Date.now()}`,
    type: 'handicap',
    name: `Handicap ${line > 0 ? '+' : ''}${line}`,
    description: `${homeTeam} começa com ${line > 0 ? '+' : ''}${line} golos`,
    sport: 'handball',
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

// Linhas comuns de handicap no andebol
export const COMMON_HANDBALL_HANDICAPS = [-7.5, -5.5, -3.5, -1.5, 1.5, 3.5, 5.5, 7.5];
