// 🏈 NFL - Match Winner (Moneyline)
import type { Market, MarketOutcome } from '../../../types/sports';

export interface NFLMatchWinnerMarket extends Market {
  type: 'match_winner';
  outcomes: {
    home: MarketOutcome;
    away: MarketOutcome;
  };
}

export function createNFLMatchWinnerMarket(
  homeTeam: string,
  awayTeam: string,
  homeOdds: number,
  awayOdds: number
): NFLMatchWinnerMarket {
  return {
    id: `nfl_match_winner_${Date.now()}`,
    type: 'match_winner',
    name: 'Vencedor do Jogo',
    description: 'Aposte em quem vencerá o jogo (Moneyline)',
    sport: 'nfl',
    priority: 1,
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
