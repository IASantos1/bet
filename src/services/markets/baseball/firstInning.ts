// ⚾ NCAA Baseball - First Inning Markets
import type { Market, MarketOutcome } from '../../../types/sports';

export interface FirstInningMarket extends Market {
  type: 'first_inning';
  outcomes: {
    over: MarketOutcome;
    under: MarketOutcome;
  };
}

/**
 * First Inning Over/Under
 */
export function createFirstInningMarket(
  line: number = 0.5,
  overOdds: number = 1.90,
  underOdds: number = 1.90
): FirstInningMarket {
  return {
    id: `baseball_first_inning_${line}_${Date.now()}`,
    type: 'first_inning',
    name: `1º Inning - Mais/Menos ${line}`,
    description: `Total de corridas no primeiro inning`,
    sport: 'baseball',
    priority: 4,
    isLive: true,
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

/**
 * First Inning Winner
 */
export interface FirstInningWinnerMarket extends Market {
  type: 'first_inning_winner';
  outcomes: {
    home: MarketOutcome;
    draw: MarketOutcome;
    away: MarketOutcome;
  };
}

export function createFirstInningWinnerMarket(
  homeTeam: string,
  awayTeam: string,
  homeOdds: number = 2.80,
  drawOdds: number = 2.20,
  awayOdds: number = 2.80
): FirstInningWinnerMarket {
  return {
    id: `baseball_first_inning_winner_${Date.now()}`,
    type: 'first_inning_winner',
    name: '1º Inning - Vencedor',
    description: 'Qual equipa marca mais corridas no 1º inning',
    sport: 'baseball',
    priority: 5,
    isLive: true,
    outcomes: {
      home: {
        id: 'home',
        name: homeTeam,
        odds: homeOdds,
        probability: 1 / homeOdds,
        isAvailable: true
      },
      draw: {
        id: 'draw',
        name: 'Empate',
        odds: drawOdds,
        probability: 1 / drawOdds,
        isAvailable: true
      },
      away: {
        id: 'away',
        name: awayTeam,
        odds: awayOdds,
        probability: 1 / awayOdds,
        isAvailable: true
      }
    }
  };
}
