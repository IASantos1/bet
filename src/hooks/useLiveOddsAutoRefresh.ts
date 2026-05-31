import { useSmartAutoRefresh } from './useSmartAutoRefresh';
import { oddsCacheService } from '../services/cache/oddsCache';

interface LiveOddsData {
  fixtureId: number;
  odds: any[];
  timestamp: number;
}

/**
 * Hook especializado para atualização automática de odds ao vivo
 * Atualiza a cada 2-3 segundos com prioridade alta
 */
export function useLiveOddsAutoRefresh(
  fixtureId: number,
  fetchFn: () => Promise<any[]>,
  enabled: boolean = true
) {
  const { data, isLoading, error, lastUpdate, isLive, forceRefresh } =
    useSmartAutoRefresh<LiveOddsData>({
      fetchFn: async () => {
        // Tentar buscar do cache primeiro
        const cached = oddsCacheService.get(`fixture:${fixtureId}`);
        if (cached) {
          return {
            fixtureId,
            odds: cached,
            timestamp: Date.now(),
          };
        }

        // Buscar dados frescos
        const freshOdds = await fetchFn();

        oddsCacheService.setOdds(fixtureId, freshOdds);

        return {
          fixtureId,
          odds: freshOdds,
          timestamp: Date.now(),
        };
      },
      interval: 2500, // 2.5 segundos
      enabled,
      priority: 'high',
      compareData: (oldData, newData) => {
        if (!oldData) return true;
        return JSON.stringify(oldData.odds) !== JSON.stringify(newData.odds);
      },
      onUpdate: (newData, oldData) => {
        console.log('[LiveOdds] Odds atualizadas:', {
          fixtureId,
          oldCount: oldData?.odds.length || 0,
          newCount: newData.odds.length,
        });
      },
    });

  return {
    odds: data?.odds || [],
    isLoading,
    error,
    lastUpdate,
    isLive,
    forceRefresh,
  };
}
