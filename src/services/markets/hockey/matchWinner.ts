// 🏒 Hóquei - Match Winner
import type { Market, MarketOutcome } from '../../../types/sports';

export interface HockeyMatchWinnerMarket extends Market {
  type: 'match_winner';
  includesOvertime: boolean;
  outcomes: {
    home: MarketOutcome;
    away: MarketOutcome;
  };
}

export function createHockeyMatchWinnerMarket(
  homeTeam: string,
  awayTeam: string,
  homeOdds: number,
  awayOdds: number,
  includesOvertime: boolean = true
): HockeyMatchWinnerMarket {
  return {
    id: `hockey_match_winner_${Date.now()}`,
    type: 'match_winner',
    name: includesOvertime ? 'Vencedor (inc. OT/SO)' : 'Vencedor (60 min)',
    description: includesOvertime 
      ? 'Aposte em quem vencerá incluindo prolongamento e shootout'
      : 'Aposte em quem vencerá nos 60 minutos regulares',
    sport: 'hockey',
    priority: 1,
    isLive: true,
    includesOvertime,
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
