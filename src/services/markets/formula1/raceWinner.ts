// 🏎️ Fórmula 1 - Race Winner
import type { Market, MarketOutcome } from '../../../types/sports';

export interface RaceWinnerMarket extends Market {
  type: 'race_winner';
  outcomes: MarketOutcome[];
}

export function createRaceWinnerMarket(
  drivers: Array<{ id: string; name: string; odds: number }>
): RaceWinnerMarket {
  return {
    id: `f1_race_winner_${Date.now()}`,
    type: 'race_winner',
    name: 'Vencedor da Corrida',
    description: 'Aposte em quem vencerá a corrida',
    sport: 'formula1',
    priority: 1,
    isLive: true,
    outcomes: drivers.map(driver => ({
      id: driver.id,
      name: driver.name,
      odds: driver.odds,
      probability: 1 / driver.odds,
      isAvailable: true
    }))
  };
}
