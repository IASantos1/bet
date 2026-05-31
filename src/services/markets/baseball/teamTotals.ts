// ⚾ NCAA Baseball - Team Totals
import type { Market, MarketOutcome } from '../../../types/sports';

export interface TeamTotalsMarket extends Market {
  type: 'team_totals';
  team: 'home' | 'away';
  line: number;
  outcomes: {
    over: MarketOutcome;
    under: MarketOutcome;
  };
}

/**
 * Team Total Runs Over/Under
 */
export function createTeamTotalsMarket(
  teamName: string,
  team: 'home' | 'away',
  line: number,
  overOdds: number = 1.90,
  underOdds: number = 1.90
): TeamTotalsMarket {
  return {
    id: `baseball_team_totals_${team}_${line}_${Date.now()}`,
    type: 'team_totals',
    name: `${teamName} - Total de Corridas`,
    description: `Total de corridas de ${teamName}`,
    sport: 'baseball',
    priority: 6,
    isLive: true,
    team,
    line,
    outcomes: {
      over: {
        id: 'over',
        name: `Mais de ${line}`,
        odds: overOdds,
        probability: 1 / overOdds,
        isAvailable: true
      },
      under: {
        id: 'under',
        name: `Menos de ${line}`,
        odds: underOdds,
        probability: 1 / underOdds,
        isAvailable: true
      }
    }
  };
}

// Linhas comuns para team totals NCAA
export const COMMON_NCAA_TEAM_TOTALS = [3.5, 4.5, 5.5, 6.5];
