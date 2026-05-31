// 🏎️ Fórmula 1 - Podium (Top 3)
import type { Market, MarketOutcome } from '../../../types/sports';

export interface PodiumMarket extends Market {
  type: 'podium';
  outcomes: MarketOutcome[];
}

export function createPodiumMarket(
  drivers: Array<{ id: string; name: string; odds: number }>
): PodiumMarket {
  return {
    id: `f1_podium_${Date.now()}`,
    type: 'podium',
    name: 'Pódio (Top 3)',
    description: 'Aposte em quem terminará no pódio (1º, 2º ou 3º)',
    sport: 'formula1',
    priority: 2,
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
