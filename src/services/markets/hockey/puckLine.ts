// 🏒 Hóquei - Puck Line (Handicap)
import type { Market, MarketOutcome } from '../../../types/sports';

export interface PuckLineMarket extends Market {
  type: 'puck_line';
  line: number;
  outcomes: {
    home: MarketOutcome;
    away: MarketOutcome;
  };
}

export function createPuckLineMarket(
  homeTeam: string,
  awayTeam: string,
  line: number,
  homeOdds: number,
  awayOdds: number
): PuckLineMarket {
  return {
    id: `hockey_puck_line_${line}_${Date.now()}`,
    type: 'puck_line',
    name: `Puck Line ${line > 0 ? '+' : ''}${line}`,
    description: `${homeTeam} começa com ${line > 0 ? '+' : ''}${line} golos`,
    sport: 'hockey',
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

// Puck Line padrão no hóquei é ±1.5
export const STANDARD_PUCK_LINE = 1.5;
