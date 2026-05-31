// ⚽ Futebol - Both Teams to Score (BTTS)
import type { Market, MarketOutcome } from '../../../types/sports';

export interface BothTeamsToScoreMarket extends Market {
  type: 'both_teams_score';
  outcomes: {
    yes: MarketOutcome;
    no: MarketOutcome;
  };
}

export function createBothTeamsToScoreMarket(
  yesOdds: number,
  noOdds: number
): BothTeamsToScoreMarket {
  return {
    id: `btts_${Date.now()}`,
    type: 'both_teams_score',
    name: 'Ambas Marcam',
    description: 'Aposte se ambas as equipas marcarão pelo menos 1 golo',
    sport: 'football',
    priority: 2,
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
