// ⚾ NCAA Baseball - Special Markets
import type { Market, MarketOutcome } from '../../../types/sports';

/**
 * Winning Margin
 */
export interface WinningMarginMarket extends Market {
  type: 'winning_margin';
  outcomes: MarketOutcome[];
}

export function createWinningMarginMarket(
  homeTeam: string,
  awayTeam: string
): WinningMarginMarket {
  const margins = [
    { range: '1-2', odds: 4.50 },
    { range: '3-4', odds: 5.00 },
    { range: '5-6', odds: 6.00 },
    { range: '7+', odds: 7.50 }
  ];

  const outcomes: MarketOutcome[] = [];

  margins.forEach(({ range, odds }) => {
    outcomes.push({
      id: `home_${range}`,
      name: `${homeTeam} por ${range}`,
      odds,
      probability: 1 / odds,
      isAvailable: true
    });
    outcomes.push({
      id: `away_${range}`,
      name: `${awayTeam} por ${range}`,
      odds,
      probability: 1 / odds,
      isAvailable: true
    });
  });

  return {
    id: `baseball_winning_margin_${Date.now()}`,
    type: 'winning_margin',
    name: 'Margem de Vitória',
    description: 'Por quantas corridas a equipa vencerá',
    sport: 'baseball',
    priority: 8,
    isLive: false,
    outcomes
  };
}

/**
 * Total Runs Odd/Even
 */
export interface OddEvenMarket extends Market {
  type: 'odd_even';
  outcomes: {
    odd: MarketOutcome;
    even: MarketOutcome;
  };
}

export function createOddEvenMarket(
  oddOdds: number = 1.95,
  evenOdds: number = 1.95
): OddEvenMarket {
  return {
    id: `baseball_odd_even_${Date.now()}`,
    type: 'odd_even',
    name: 'Total de Corridas - Ímpar/Par',
    description: 'Total de corridas será ímpar ou par',
    sport: 'baseball',
    priority: 9,
    isLive: true,
    outcomes: {
      odd: {
        id: 'odd',
        name: 'Ímpar',
        odds: oddOdds,
        probability: 1 / oddOdds,
        isAvailable: true
      },
      even: {
        id: 'even',
        name: 'Par',
        odds: evenOdds,
        probability: 1 / evenOdds,
        isAvailable: true
      }
    }
  };
}

/**
 * First Team to Score
 */
export interface FirstToScoreMarket extends Market {
  type: 'first_to_score';
  outcomes: {
    home: MarketOutcome;
    away: MarketOutcome;
  };
}

export function createFirstToScoreMarket(
  homeTeam: string,
  awayTeam: string,
  homeOdds: number = 1.90,
  awayOdds: number = 1.90
): FirstToScoreMarket {
  return {
    id: `baseball_first_to_score_${Date.now()}`,
    type: 'first_to_score',
    name: 'Primeira Equipa a Marcar',
    description: 'Qual equipa marca a primeira corrida',
    sport: 'baseball',
    priority: 7,
    isLive: true,
    outcomes: {
      home: {
        id: 'home',
        name: homeTeam,
        odds: homeOdds,
        probability: 1 / homeOdds,
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

/**
 * Race to X Runs
 */
export interface RaceToRunsMarket extends Market {
  type: 'race_to_runs';
  target: number;
  outcomes: {
    home: MarketOutcome;
    away: MarketOutcome;
    neither: MarketOutcome;
  };
}

export function createRaceToRunsMarket(
  homeTeam: string,
  awayTeam: string,
  target: number = 5,
  homeOdds: number = 2.00,
  awayOdds: number = 2.00,
  neitherOdds: number = 8.00
): RaceToRunsMarket {
  return {
    id: `baseball_race_to_${target}_${Date.now()}`,
    type: 'race_to_runs',
    name: `Corrida para ${target} Corridas`,
    description: `Primeira equipa a atingir ${target} corridas`,
    sport: 'baseball',
    priority: 8,
    isLive: true,
    target,
    outcomes: {
      home: {
        id: 'home',
        name: homeTeam,
        odds: homeOdds,
        probability: 1 / homeOdds,
        isAvailable: true
      },
      away: {
        id: 'away',
        name: awayTeam,
        odds: awayOdds,
        probability: 1 / awayOdds,
        isAvailable: true
      },
      neither: {
        id: 'neither',
        name: 'Nenhuma',
        odds: neitherOdds,
        probability: 1 / neitherOdds,
        isAvailable: true
      }
    }
  };
}

/**
 * Both Teams to Score
 */
export interface BothTeamsScoreMarket extends Market {
  type: 'both_teams_score';
  outcomes: {
    yes: MarketOutcome;
    no: MarketOutcome;
  };
}

export function createBothTeamsScoreMarket(
  yesOdds: number = 1.30,
  noOdds: number = 3.50
): BothTeamsScoreMarket {
  return {
    id: `baseball_both_teams_score_${Date.now()}`,
    type: 'both_teams_score',
    name: 'Ambas as Equipas Marcam',
    description: 'Ambas as equipas marcarão pelo menos 1 corrida',
    sport: 'baseball',
    priority: 6,
    isLive: true,
    outcomes: {
      yes: {
        id: 'yes',
        name: 'Sim',
        odds: yesOdds,
        probability: 1 / yesOdds,
        isAvailable: true
      },
      no: {
        id: 'no',
        name: 'Não',
        odds: noOdds,
        probability: 1 / noOdds,
        isAvailable: true
      }
    }
  };
}

/**
 * Extra Innings
 */
export interface ExtraInningsMarket extends Market {
  type: 'extra_innings';
  outcomes: {
    yes: MarketOutcome;
    no: MarketOutcome;
  };
}

export function createExtraInningsMarket(
  yesOdds: number = 5.00,
  noOdds: number = 1.15
): ExtraInningsMarket {
  return {
    id: `baseball_extra_innings_${Date.now()}`,
    type: 'extra_innings',
    name: 'Innings Extra',
    description: 'O jogo irá para innings extra',
    sport: 'baseball',
    priority: 9,
    isLive: true,
    outcomes: {
      yes: {
        id: 'yes',
        name: 'Sim',
        odds: yesOdds,
        probability: 1 / yesOdds,
        isAvailable: true
      },
      no: {
        id: 'no',
        name: 'Não',
        odds: noOdds,
        probability: 1 / noOdds,
        isAvailable: true
      }
    }
  };
}

// Targets comuns para Race to Runs
export const COMMON_RACE_TARGETS = [3, 5, 7, 10];
