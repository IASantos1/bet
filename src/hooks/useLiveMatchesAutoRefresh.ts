import { useSmartAutoRefresh } from './useSmartAutoRefresh';
import { matchesCacheService } from '../services/cache/matchesCache';

interface LiveMatchesData {
  matches: any[];
  timestamp: number;
}

/**
 * Hook especializado para atualização automática de jogos ao vivo
 * Atualiza a cada 3 segundos com prioridade média
 */
export function useLiveMatchesAutoRefresh(
  fetchFn: () => Promise<any[]>,
  enabled: boolean = true
) {
  const { data, isLoading, error, lastUpdate, isLive, forceRefresh } =
    useSmartAutoRefresh<LiveMatchesData>({
      fetchFn: async () => {
        // Tentar buscar do cache primeiro
        const today = new Date().toISOString().split('T')[0];
        const cached = await matchesCacheService.getMatches(today);
        if (cached) {
          return {
            matches: cached.matches,
            timestamp: Date.now(),
          };
        }

        // Buscar dados frescos
        const freshMatches = await fetchFn();

        // Salvar no cache
        await matchesCacheService.setMatches(today, freshMatches.map((m: any) => ({
          fixtureId: m.fixture?.id || 0,
          homeTeam: m.teams?.home?.name || '',
          awayTeam: m.teams?.away?.name || '',
          league: m.league?.name || '',
          date: m.fixture?.date || '',
          status: m.fixture?.status?.short || '',
          score: {
            home: m.goals?.home || 0,
            away: m.goals?.away || 0,
          },
          lastUpdate: Date.now(),
        })));

        return {
          matches: freshMatches,
          timestamp: Date.now(),
        };
      },
      interval: 3000, // 3 segundos
      enabled,
      priority: 'medium',
      compareData: (oldData, newData) => {
        if (!oldData) return true;
        
        // Comparar apenas campos relevantes para evitar re-renders desnecessários
        const oldIds = oldData.matches.map((m: any) => m.fixture?.id).sort();
        const newIds = newData.matches.map((m: any) => m.fixture?.id).sort();
        
        if (JSON.stringify(oldIds) !== JSON.stringify(newIds)) {
          return true;
        }

        // Comparar scores
        const oldScores = oldData.matches.map((m: any) => 
          `${m.fixture?.id}:${m.goals?.home}-${m.goals?.away}`
        ).join(',');
        const newScores = newData.matches.map((m: any) => 
          `${m.fixture?.id}:${m.goals?.home}-${m.goals?.away}`
        ).join(',');

        return oldScores !== newScores;
      },
      onUpdate: (newData, oldData) => {
        if (oldData) {
          const oldCount = oldData.matches.length;
          const newCount = newData.matches.length;
          
          if (oldCount !== newCount) {
            console.log('[LiveMatches] Número de jogos alterado:', {
              old: oldCount,
              new: newCount,
            });
          }
        }
      },
    });

  return {
    matches: data?.matches || [],
    isLoading,
    error,
    lastUpdate,
    isLive,
    forceRefresh,
  };
}
