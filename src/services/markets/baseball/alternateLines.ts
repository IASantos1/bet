// ⚾ NCAA Baseball - Alternate Lines
import type { Market, MarketOutcome } from '../../../types/sports';

/**
 * Alternate Run Lines
 */
export interface AlternateRunLineMarket extends Market {
  type: 'alternate_run_line';
  line: number;
  outcomes: {
    home: MarketOutcome;
    away: MarketOutcome;
  };
}

export function createAlternateRunLineMarket(
  homeTeam: string,
  awayTeam: string,
  line: number,
  homeOdds: number,
  awayOdds: number
): AlternateRunLineMarket {
  return {
    id: `baseball_alt_run_line_${line}_${Date.now()}`,
    type: 'alternate_run_line',
    name: `Run Line Alternativa ${line > 0 ? '+' : ''}${line}`,
    description: `Linha alternativa de corridas`,
    sport: 'baseball',
    priority: 10,
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
 * Alternate Totals
 */
export interface AlternateTotalMarket extends Market {
  type: 'alternate_total';
  line: number;
  outcomes: {
    over: MarketOutcome;
    under: MarketOutcome;
  };
}

export function createAlternateTotalMarket(
  line: number,
  overOdds: number,
  underOdds: number
): AlternateTotalMarket {
  return {
    id: `baseball_alt_total_${line}_${Date.now()}`,
    type: 'alternate_total',
    name: `Total Alternativo ${line}`,
    description: `Linha alternativa de corridas totais`,
    sport: 'baseball',
    priority: 10,
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

// Linhas alternativas comuns NCAA Baseball
export const ALTERNATE_RUN_LINES = [-3.5, -2.5, -1.5, -0.5, 0.5, 1.5, 2.5, 3.5];
export const ALTERNATE_TOTALS = [5.5, 6.5, 7.5, 8.5, 9.5, 10.5, 11.5, 12.5, 13.5];

/**
 * Gera múltiplas linhas alternativas com odds ajustadas
 */
export function generateAlternateRunLines(
  homeTeam: string,
  awayTeam: string,
  baseOdds: number = 1.90
): AlternateRunLineMarket[] {
  return ALTERNATE_RUN_LINES.map(line => {
    // Ajusta odds baseado na linha
    const oddsAdjustment = Math.abs(line) * 0.3;
    const homeOdds = line > 0 
      ? parseFloat((baseOdds - oddsAdjustment).toFixed(2))
      : parseFloat((baseOdds + oddsAdjustment).toFixed(2));
    const awayOdds = line > 0
      ? parseFloat((baseOdds + oddsAdjustment).toFixed(2))
      : parseFloat((baseOdds - oddsAdjustment).toFixed(2));

    return createAlternateRunLineMarket(
      homeTeam,
      awayTeam,
      line,
      Math.max(1.10, homeOdds),
      Math.max(1.10, awayOdds)
    );
  });
}

/**
 * Gera múltiplos totais alternativos com odds ajustadas
 */
export function generateAlternateTotals(baseOdds: number = 1.90): AlternateTotalMarket[] {
  return ALTERNATE_TOTALS.map(line => {
    // Odds variam ligeiramente por linha
    const variance = (Math.random() - 0.5) * 0.2;
    const overOdds = parseFloat((baseOdds + variance).toFixed(2));
    const underOdds = parseFloat((baseOdds - variance).toFixed(2));

    return createAlternateTotalMarket(
      line,
      Math.max(1.10, overOdds),
      Math.max(1.10, underOdds)
    );
  });
}
