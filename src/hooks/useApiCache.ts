
import { useState, useEffect, useCallback } from 'react';
import { apiCache } from '../services/apiCache';

/**
 * Hook para monitorar e controlar o sistema de cache
 */
export function useApiCache() {
  const [stats, setStats] = useState(apiCache.getStats());
  const [popularKeys, setPopularKeys] = useState(apiCache.getPopularKeys());

  // Atualizar estatísticas periodicamente
  useEffect(() => {
    const interval = setInterval(() => {
      setStats(apiCache.getStats());
      setPopularKeys(apiCache.getPopularKeys(5));
    }, 5000);

    return () => clearInterval(interval);
  }, []);

  // Escutar sincronizações entre abas
  useEffect(() => {
    const unsub = apiCache.onSync(() => {
      setStats(apiCache.getStats());
    });
    return unsub;
  }, []);

  const clearCache = useCallback(async () => {
    await apiCache.clearAll();
    setStats(apiCache.getStats());
  }, []);

  const invalidateByPrefix = useCallback(async (prefix: string) => {
    await apiCache.invalidateByPrefix(prefix);
    setStats(apiCache.getStats());
  }, []);

  const invalidate = useCallback(async (key: string) => {
    await apiCache.invalidate(key);
    setStats(apiCache.getStats());
  }, []);

  const refreshStats = useCallback(() => {
    setStats(apiCache.getStats());
    setPopularKeys(apiCache.getPopularKeys(5));
  }, []);

  return {
    stats,
    popularKeys,
    clearCache,
    invalidateByPrefix,
    invalidate,
    refreshStats
  };
}
