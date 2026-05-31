// 🏐 Voleibol - Set Winner
import type { Market, MarketOutcome } from '../../../types/sports';

export interface SetWinnerMarket extends Market {
  type: 'set_winner';
  setNumber: number;
  outcomes: {
    home: MarketOutcome;
    away: MarketOutcome;
  };
}

export function createSetWinnerMarket(
  homeTeam: string,
  awayTeam: string,
  setNumber: number,
  homeOdds: number,
  awayOdds: number
): SetWinnerMarket {
  return {
    id: `volleyball_set_winner_${setNumber}_${Date.now()}`,
    type: 'set_winner',
    name: `Vencedor do ${setNumber}º Set`,
    description: `Aposte em quem vencerá o ${setNumber}º set`,
    sport: 'volleyball',
    priority: 3,
    isLive: true,
    setNumber,
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
