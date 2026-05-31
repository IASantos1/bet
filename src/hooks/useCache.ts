/**
 * 🎯 Hook para Integração do Sistema de Cache Multi-Camada
 * 
 * Facilita o uso do cache em componentes React
 */

import { useState, useEffect, useCallback } from 'react';
import { oddsCacheService } from '../services/cache/oddsCache';
import { matchesCacheService } from '../services/cache/matchesCache';
import { standingsCacheService } from '../services/cache/standingsCache';
import { staticContentCacheService } from '../services/cache/staticContentCache';
import { criticalDataService } from '../services/cache/criticalDataService';

interface UseCacheOptions<T> {
  key: string;
  fetcher: () => Promise<T>;
  cacheType: 'odds' | 'matches' | 'standings' | 'static' | 'critical';
  enabled?: boolean;
  onSuccess?: (data: T) => void;
  onError?: (error: Error) => void;
}

interface UseCacheReturn<T> {
  data: T | null;
  isLoading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
  invalidate: () => Promise<void>;
  hitRate: number;
}

export function useCache<T>({
  key,
  fetcher,
  cacheType,
  enabled = true,
  onSuccess,
  onError
}: UseCacheOptions<T>): UseCacheReturn<T> {
  const [data, setData] = useState<T | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [hitRate, setHitRate] = useState(0);

  const getCacheService = useCallback(() => {
    switch (cacheType) {
      case 'odds':
        return oddsCacheService;
      case 'matches':
        return matchesCacheService;
      case 'standings':
        return standingsCacheService;
      case 'static':
        return staticContentCacheService;
      case 'critical':
        return criticalDataService;
      default:
        return staticContentCacheService;
    }
  }, [cacheType]);

  const fetchData = useCallback(async () => {
    if (!enabled) return;

    setIsLoading(true);
    setError(null);

    try {
      const cacheService = getCacheService();

      // Para dados críticos, sempre buscar do servidor
      if (cacheType === 'critical') {
        const freshData = await fetcher();
        setData(freshData);
        onSuccess?.(freshData);
        return;
      }

      // Tentar obter do cache primeiro
      let cachedData: T | null = null;

      if (cacheType === 'odds') {
        const fixtureId = parseInt(key.split(':')[1] || '0');
        const cacheKey = `fixture:${fixtureId}`;
        cachedData = (cacheService as typeof oddsCacheService).get(cacheKey) as T | null;
      } else if (cacheType === 'matches') {
        if (key.includes('match:')) {
          const fixtureId = parseInt(key.split(':')[1] || '0');
          cachedData = await (cacheService as typeof matchesCacheService).getMatch(fixtureId) as T | null;
        } else {
          const date = key.split(':')[1] || '';
          cachedData = await (cacheService as typeof matchesCacheService).getMatches(date) as T | null;
        }
      } else if (cacheType === 'standings') {
        const [leagueId, season] = key.split(':').slice(1).map(Number);
        cachedData = await (cacheService as typeof standingsCacheService).getStandings(leagueId, season) as T | null;
      } else if (cacheType === 'static') {
        cachedData = await (cacheService as typeof staticContentCacheService).get<T>(key);
      }

      if (cachedData) {
        setData(cachedData);
        onSuccess?.(cachedData);

        const rate =
          cacheType === 'matches'
            ? (cacheService as typeof matchesCacheService).getHitRate()
            : cacheType === 'standings'
            ? (cacheService as typeof standingsCacheService).getHitRate()
            : cacheType === 'static'
            ? (cacheService as typeof staticContentCacheService).getHitRate()
            : 0;
        setHitRate(rate);
      } else {
        // Cache miss - buscar do servidor
        const freshData = await fetcher();
        setData(freshData);

        // Salvar no cache
        if (cacheType === 'odds') {
          const fixtureId = parseInt(key.split(':')[1] || '0');
          (cacheService as typeof oddsCacheService).setOdds(fixtureId, freshData as any);
        } else if (cacheType === 'matches') {
          if (key.includes('match:')) {
            await (cacheService as typeof matchesCacheService).setMatch(freshData as any);
          } else {
            const date = key.split(':')[1] || '';
            await (cacheService as typeof matchesCacheService).setMatches(date, freshData as any);
          }
        } else if (cacheType === 'standings') {
          await (cacheService as typeof standingsCacheService).setStandings(freshData as any);
        } else if (cacheType === 'static') {
          await (cacheService as typeof staticContentCacheService).set(key, freshData);
        }

        onSuccess?.(freshData);
        
        // Atualizar hit rate
        const rate =
          cacheType === 'matches'
            ? (cacheService as typeof matchesCacheService).getHitRate()
            : cacheType === 'standings'
            ? (cacheService as typeof standingsCacheService).getHitRate()
            : cacheType === 'static'
            ? (cacheService as typeof staticContentCacheService).getHitRate()
            : 0;
        setHitRate(rate);
      }
    } catch (err) {
      const error = err as Error;
      setError(error);
      onError?.(error);
    } finally {
      setIsLoading(false);
    }
  }, [key, fetcher, cacheType, enabled, getCacheService, onSuccess, onError]);

  const refetch = useCallback(async () => {
    await fetchData();
  }, [fetchData]);

  const invalidate = useCallback(async () => {
    const cacheService = getCacheService();

    if (cacheType === 'odds') {
      const fixtureId = parseInt(key.split(':')[1] || '0');
      (cacheService as typeof oddsCacheService).invalidateOdds(fixtureId);
    } else if (cacheType === 'matches') {
      if (key.includes('match:')) {
        const fixtureId = parseInt(key.split(':')[1] || '0');
        await (cacheService as typeof matchesCacheService).invalidateMatches(fixtureId.toString());
      } else {
        const date = key.split(':')[1] || '';
        await (cacheService as typeof matchesCacheService).invalidateMatches(date);
      }
    } else if (cacheType === 'standings') {
      const [leagueId, season] = key.split(':').slice(1).map(Number);
      await (cacheService as typeof standingsCacheService).invalidateStandings(leagueId, season);
    } else if (cacheType === 'static') {
      await (cacheService as typeof staticContentCacheService).invalidate(key);
    }

    await refetch();
  }, [key, cacheType, getCacheService, refetch]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return {
    data,
    isLoading,
    error,
    refetch,
    invalidate,
    hitRate
  };
}

/**
 * 🎯 Hook especializado para Odds ao Vivo
 */
export function useLiveOddsCache(fixtureId: number, fetcher: () => Promise<any>) {
  return useCache({
    key: `odds:${fixtureId}`,
    fetcher,
    cacheType: 'odds'
  });
}

/**
 * 🎯 Hook especializado para Jogos do Dia
 */
export function useDailyMatchesCache(date: string, fetcher: () => Promise<any>) {
  return useCache({
    key: `matches:${date}`,
    fetcher,
    cacheType: 'matches'
  });
}

/**
 * 🎯 Hook especializado para Tabelas
 */
export function useStandingsCache(leagueId: number, season: number, fetcher: () => Promise<any>) {
  return useCache({
    key: `standings:${leagueId}:${season}`,
    fetcher,
    cacheType: 'standings'
  });
}

/**
 * 🎯 Hook especializado para Conteúdo Estático
 */
export function useStaticContentCache<T>(key: string, fetcher: () => Promise<T>) {
  return useCache({
    key,
    fetcher,
    cacheType: 'static'
  });
}

/**
 * 🚫 Hook para Dados Críticos (SEM CACHE)
 */
export function useCriticalData<T>(key: string, fetcher: () => Promise<T>) {
  return useCache({
    key,
    fetcher,
    cacheType: 'critical'
  });
}
