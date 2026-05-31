// ⚾ NCAA Baseball - Innings Markets
import type { Market, MarketOutcome } from '../../../types/sports';

export interface InningMarket extends Market {
  type: 'inning_total';
  inning: number;
  line: number;
  outcomes: {
    over: MarketOutcome;
    under: MarketOutcome;
  };
}

/**
 * Specific Inning Total
 */
export function createInningTotalMarket(
  inning: number,
  line: number = 0.5,
  overOdds: number = 1.90,
  underOdds: number = 1.90
): InningMarket {
  return {
    id: `baseball_inning_${inning}_total_${line}_${Date.now()}`,
    type: 'inning_total',
    name: `${inning}º Inning - Mais/Menos ${line}`,
    description: `Total de corridas no ${inning}º inning`,
    sport: 'baseball',
    priority: 7,
    isLive: true,
    inning,
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

/**
 * First 5 Innings Winner (F5)
 */
export interface First5InningsMarket extends Market {
  type: 'first_5_innings';
  outcomes: {
    home: MarketOutcome;
    away: MarketOutcome;
  };
}

export function createFirst5InningsMarket(
  homeTeam: string,
  awayTeam: string,
  homeOdds: number = 1.95,
  awayOdds: number = 1.95
): First5InningsMarket {
  return {
    id: `baseball_first_5_innings_${Date.now()}`,
    type: 'first_5_innings',
    name: 'Primeiros 5 Innings - Vencedor',
    description: 'Qual equipa lidera após 5 innings',
    sport: 'baseball',
    priority: 3,
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
 * First 5 Innings Run Line
 */
export interface First5RunLineMarket extends Market {
  type: 'first_5_run_line';
  line: number;
  outcomes: {
    home: MarketOutcome;
    away: MarketOutcome;
  };
}

export function createFirst5RunLineMarket(
  homeTeam: string,
  awayTeam: string,
  line: number = 0.5,
  homeOdds: number = 1.90,
  awayOdds: number = 1.90
): First5RunLineMarket {
  return {
    id: `baseball_first_5_run_line_${line}_${Date.now()}`,
    type: 'first_5_run_line',
    name: `Primeiros 5 Innings - Run Line ${line > 0 ? '+' : ''}${line}`,
    description: `Run line nos primeiros 5 innings`,
    sport: 'baseball',
    priority: 4,
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

/**
 * First 5 Innings Total
 */
export interface First5TotalMarket extends Market {
  type: 'first_5_total';
  line: number;
  outcomes: {
    over: MarketOutcome;
    under: MarketOutcome;
  };
}

export function createFirst5TotalMarket(
  line: number = 4.5,
  overOdds: number = 1.90,
  underOdds: number = 1.90
): First5TotalMarket {
  return {
    id: `baseball_first_5_total_${line}_${Date.now()}`,
    type: 'first_5_total',
    name: `Primeiros 5 Innings - Mais/Menos ${line}`,
    description: `Total de corridas nos primeiros 5 innings`,
    sport: 'baseball',
    priority: 3,
    isLive: true,
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
