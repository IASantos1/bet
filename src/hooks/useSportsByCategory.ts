import { useState, useEffect, useCallback } from 'react';
import sportsDataNormalizer from '../services/sportsDataNormalizer';
import type { NormalizedMatch } from '../types/sports';

interface UseSportsByCategoryReturn {
  matches: NormalizedMatch[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

/**
 * Hook para buscar jogos por categoria/esporte
 * @param category - Categoria do esporte (ex: 'football', 'basketball', 'tennis')
 * @param isLive - Buscar apenas jogos ao vivo (padrão: false)
 * @param autoRefresh - Ativar atualização automática (padrão: true)
 * @param refreshInterval - Intervalo de atualização em ms (padrão: 30000 = 30s)
 */
export function useSportsByCategory(
  category: string,
  isLive: boolean = false,
  autoRefresh: boolean = true,
  refreshInterval: number = 30000
): UseSportsByCategoryReturn {
  const [matches, setMatches] = useState<NormalizedMatch[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      setError(null);
      const allMatches = await sportsDataNormalizer.getLiveMatches();
      const data = allMatches.filter(m => {
        if (category !== 'all' && m.sport !== category) return false;
        if (isLive && !m.isLive) return false;
        if (!isLive && m.isLive) return false;
        return true;
      });
      setMatches(data);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Erro ao carregar jogos';
      setError(errorMessage);
      console.error('Erro ao buscar jogos por categoria:', err);
    } finally {
      setLoading(false);
    }
  }, [category, isLive]);

  const refresh = useCallback(async () => {
    setLoading(true);
    await fetchData();
  }, [fetchData]);

  useEffect(() => {
    // Busca inicial
    fetchData();

    // Configurar polling se autoRefresh estiver ativo
    if (autoRefresh) {
      const intervalId = setInterval(() => {
        fetchData();
      }, refreshInterval);

      return () => clearInterval(intervalId);
    }
  }, [fetchData, autoRefresh, refreshInterval]);

  return {
    matches,
    loading,
    error,
    refresh,
  };
}
