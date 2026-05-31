// 🏐 Voleibol - Match Winner
import type { Market, MarketOutcome } from '../../../types/sports';

export interface VolleyballMatchWinnerMarket extends Market {
  type: 'match_winner';
  outcomes: {
    home: MarketOutcome;
    away: MarketOutcome;
  };
}

export function createVolleyballMatchWinnerMarket(
  homeTeam: string,
  awayTeam: string,
  homeOdds: number,
  awayOdds: number
): VolleyballMatchWinnerMarket {
  return {
    id: `volleyball_match_winner_${Date.now()}`,
    type: 'match_winner',
    name: 'Vencedor do Jogo',
    description: 'Aposte em quem vencerá o jogo',
    sport: 'volleyball',
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
