import { useSmartAutoRefresh } from './useSmartAutoRefresh';
import { staticContentCacheService } from '../services/cache/staticContentCache';

interface StandingsData {
  leagueId: number;
  standings: any[];
  timestamp: number;
}

/**
 * Hook especializado para atualização automática de tabelas de campeonato
 * Atualiza a cada 5 minutos com prioridade baixa
 */
export function useStandingsAutoRefresh(
  leagueId: number,
  fetchFn: () => Promise<any[]>,
  enabled: boolean = true
) {
  const { data, isLoading, error, lastUpdate, isLive, forceRefresh } =
    useSmartAutoRefresh<StandingsData>({
      fetchFn: async () => {
        const cacheKey = `standings_${leagueId}`;
        const cached = await staticContentCacheService.get<any[]>(cacheKey);
        if (cached) {
          return {
            leagueId,
            standings: cached,
            timestamp: Date.now(),
          };
        }

        const freshStandings = await fetchFn();

        await staticContentCacheService.set(cacheKey, freshStandings);

        return {
          leagueId,
          standings: freshStandings,
          timestamp: Date.now(),
        };
      },
      interval: 300000, // 5 minutos
      enabled,
      priority: 'low',
      compareData: (oldData, newData) => {
        if (!oldData) return true;
        
        // Comparar apenas posições e pontos
        const oldPositions = oldData.standings.map((s: any) => 
          `${s.team?.id}:${s.rank}:${s.points}`
        ).join(',');
        const newPositions = newData.standings.map((s: any) => 
          `${s.team?.id}:${s.rank}:${s.points}`
        ).join(',');

        return oldPositions !== newPositions;
      },
      onUpdate: (newData, oldData) => {
        if (oldData) {
          console.log('[Standings] Tabela atualizada:', {
            leagueId,
            teams: newData.standings.length,
          });
        }
      },
    });

  return {
    standings: data?.standings || [],
    isLoading,
    error,
    lastUpdate,
    isLive,
    forceRefresh,
  };
}
