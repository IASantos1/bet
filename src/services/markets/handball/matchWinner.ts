// 🤾 Andebol - Match Winner
import type { Market, MarketOutcome } from '../../../types/sports';

export interface HandballMatchWinnerMarket extends Market {
  type: 'match_winner';
  outcomes: {
    home: MarketOutcome;
    draw: MarketOutcome;
    away: MarketOutcome;
  };
}

export function createHandballMatchWinnerMarket(
  homeTeam: string,
  awayTeam: string,
  homeOdds: number,
  drawOdds: number,
  awayOdds: number
): HandballMatchWinnerMarket {
  return {
    id: `handball_match_winner_${Date.now()}`,
    type: 'match_winner',
    name: 'Vencedor do Jogo',
    description: 'Aposte em quem vencerá o jogo',
    sport: 'handball',
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
