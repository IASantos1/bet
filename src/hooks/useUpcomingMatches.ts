
import { useState, useEffect, useCallback, useRef } from 'react';
import { getUpcomingMatches } from '../services/sportsDataHub';

/**
 * @typedef {Object} Match
 * @property {string} id
 * @property {string} homeTeam
 * @property {string} awayTeam
 * @property {Date} startTime
 */

/**
 * @typedef {Object} UseUpcomingMatchesOptions
 * @property {boolean} [autoRefresh=false]
 * @property {number} [interval=30000]
 * @property {number} [hoursAhead=4]
 */

const LOCAL_STORAGE_KEY = 'upcoming_matches_cache_v1';

const upcomingCache = {
  data: null as any[] | null,
  timestamp: 0,
  ttl: 300000,
  isLoading: false,
  promise: null as Promise<any[] | null> | null,
  hoursAhead: 4,
};

const loadCacheFromStorage = () => {
  if (typeof window === 'undefined') return;
  if (upcomingCache.data) return;
  try {
    const raw = window.localStorage.getItem(LOCAL_STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as { data: any[]; timestamp: number; hoursAhead?: number };
    if (!parsed || !Array.isArray(parsed.data)) return;
    if (Date.now() - parsed.timestamp > upcomingCache.ttl) return;
    upcomingCache.data = parsed.data;
    upcomingCache.timestamp = parsed.timestamp;
    if (typeof parsed.hoursAhead === 'number') {
      upcomingCache.hoursAhead = parsed.hoursAhead;
    }
  } catch {
    return;
  }
};

const persistCacheToStorage = () => {
  if (typeof window === 'undefined') return;
  if (!upcomingCache.data) return;
  try {
    window.localStorage.setItem(
      LOCAL_STORAGE_KEY,
      JSON.stringify({
        data: upcomingCache.data,
        timestamp: upcomingCache.timestamp,
        hoursAhead: upcomingCache.hoursAhead,
      })
    );
  } catch {
    return;
  }
};

const fetchWithDedup = async (hoursAhead: number) => {
  if (
    upcomingCache.isLoading &&
    upcomingCache.promise &&
    upcomingCache.hoursAhead === hoursAhead
  ) {
    return upcomingCache.promise;
  }

  upcomingCache.isLoading = true;
  upcomingCache.hoursAhead = hoursAhead;

  upcomingCache.promise = getUpcomingMatches()
    .then((data) => {
      if (
        Array.isArray(data) &&
        data.length === 0 &&
        Array.isArray(upcomingCache.data) &&
        upcomingCache.data.length > 0
      ) {
        upcomingCache.isLoading = false;
        upcomingCache.promise = null;
        return upcomingCache.data;
      }
      upcomingCache.data = data || [];
      upcomingCache.timestamp = Date.now();
      upcomingCache.isLoading = false;
      upcomingCache.promise = null;
      persistCacheToStorage();
      return upcomingCache.data;
    })
    .catch((err) => {
      upcomingCache.isLoading = false;
      upcomingCache.promise = null;
      throw err;
    });

  return upcomingCache.promise;
};

interface UseUpcomingMatchesOptions {
  autoRefresh?: boolean;
  interval?: number;
  hoursAhead?: number;
}

export function useUpcomingMatches(options: UseUpcomingMatchesOptions = {}) {
  loadCacheFromStorage();

  const {
    autoRefresh = false,
    interval = 30000, // ✅ 30 segundos
    hoursAhead = 4,
  } = options;

  const [matches, setMatches] = useState(() => upcomingCache.data || []);
  const [loading, setLoading] = useState(!upcomingCache.data);
  const [error, setError] = useState(null);
  const [lastUpdate, setLastUpdate] = useState(upcomingCache.timestamp);

  const isMountedRef = useRef(true);
  const intervalRef = useRef(null); // ✅ Ref para intervalo

  const fetchMatches = useCallback(
    async (forceRefresh = false) => {
      const now = Date.now();

      if (
        !forceRefresh &&
        upcomingCache.data &&
        now - upcomingCache.timestamp < upcomingCache.ttl &&
        upcomingCache.hoursAhead === hoursAhead
      ) {
        if (isMountedRef.current) {
          setMatches(upcomingCache.data);
          setLoading(false);
          setLastUpdate(upcomingCache.timestamp);
        }
        return;
      }

      try {
        setError(null);
        const upcomingMatches = await fetchWithDedup(hoursAhead);
        const finalMatches = upcomingMatches;
        upcomingCache.data = finalMatches;
        upcomingCache.timestamp = Date.now();
        persistCacheToStorage();

        if (!isMountedRef.current) return;

        setMatches(finalMatches);
        setLoading(false);
        setLastUpdate(Date.now());
      } catch (err) {
        if (err && err.name === 'AbortError') return;

        console.error('❌ Erro ao buscar pré-jogos:', err);

        if (!isMountedRef.current) return;

        if (upcomingCache.data) {
          setMatches(upcomingCache.data);
        }
        setError(err?.message || 'Erro ao carregar pré-jogos');
        setLoading(false);
      }
    },
    [hoursAhead]
  );

  // Carregar na montagem
  useEffect(() => {
    isMountedRef.current = true;
    fetchMatches();

    return () => {
      isMountedRef.current = false;
    };
  }, [fetchMatches]);

  // ✅ Auto-refresh com limpeza garantida
  useEffect(() => {
    // Limpar intervalo anterior
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    if (!autoRefresh) return;

    console.log(`🔄 [useUpcomingMatches] Auto-refresh ativo - intervalo: ${interval}ms`);

    intervalRef.current = setInterval(() => {
      if (isMountedRef.current) {
        fetchMatches();
      }
    }, interval);

    // ✅ Cleanup garantido
    return () => {
      if (intervalRef.current) {
        console.log('🧹 [useUpcomingMatches] Limpando intervalo');
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [autoRefresh, interval, fetchMatches]);

  // ✅ Cleanup final na desmontagem
  useEffect(() => {
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, []);

  const refetch = useCallback(async () => {
    setLoading(true);
    await fetchMatches(true);
  }, [fetchMatches]);

  return {
    matches,
    loading,
    error,
    refetch,
    lastUpdate,
  };
}

export const preloadUpcomingMatches = (hoursAhead = 4) => {
  const now = Date.now();
  if (!upcomingCache.data || now - upcomingCache.timestamp > upcomingCache.ttl) {
    fetchWithDedup(hoursAhead).catch(() => {});
  }
};
