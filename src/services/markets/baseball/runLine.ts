// ⚾ Basebol - Run Line (Handicap)
import type { Market, MarketOutcome } from '../../../types/sports';

export interface RunLineMarket extends Market {
  type: 'run_line';
  line: number;
  outcomes: {
    home: MarketOutcome;
    away: MarketOutcome;
  };
}

export function createRunLineMarket(
  homeTeam: string,
  awayTeam: string,
  line: number,
  homeOdds: number,
  awayOdds: number
): RunLineMarket {
  return {
    id: `baseball_run_line_${line}_${Date.now()}`,
    type: 'run_line',
    name: `Run Line ${line > 0 ? '+' : ''}${line}`,
    description: `${homeTeam} começa com ${line > 0 ? '+' : ''}${line} corridas`,
    sport: 'baseball',
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

// Run Line padrão no basebol é ±1.5
export const STANDARD_RUN_LINE = 1.5;
