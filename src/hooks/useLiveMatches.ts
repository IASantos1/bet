
 
import * as React from 'react';
const { useState, useEffect, useCallback, useRef } = React;

import type { Match } from '../types/sports';
import { getLiveMatches } from '../services/sportsDataHub';
import { liveScoresWS, LiveScoreUpdate, LiveOddsUpdate } from '../services/websocket/liveScoresWebSocket';

interface UseLiveMatchesOptions {
  autoRefresh?: boolean;
  interval?: number;
  useWebSocket?: boolean; // ✅ NOVO: Usar WebSocket por padrão
}

interface UseLiveMatchesReturn {
  matches: Match[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  lastUpdate: number;
  isWebSocketConnected: boolean; // ✅ NOVO: Estado da conexão WebSocket
}

// ═══════════════════════════════════════════════════════════════════════════
// ✅ CACHE AGRESSIVO - 5 minutos (WebSocket atualiza em tempo real)
// ═══════════════════════════════════════════════════════════════════════════

const LOCAL_STORAGE_KEY = 'live_matches_cache_v1';

const matchesCache = {
  data: null as Match[] | null,
  timestamp: 0,
  ttl: 120000,
  isLoading: false,
  promise: null as Promise<Match[]> | null,
};

const loadCacheFromStorage = () => {
  if (typeof window === 'undefined') return;
  if (matchesCache.data) return;
  try {
    const raw = window.localStorage.getItem(LOCAL_STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as { data: Match[]; timestamp: number };
    if (!parsed || !Array.isArray(parsed.data)) return;
    if (Date.now() - parsed.timestamp > matchesCache.ttl) return;
    matchesCache.data = parsed.data;
    matchesCache.timestamp = parsed.timestamp;
  } catch {
    return;
  }
};

const persistCacheToStorage = () => {
  if (typeof window === 'undefined') return;
  if (!matchesCache.data) return;
  try {
    window.localStorage.setItem(
      LOCAL_STORAGE_KEY,
      JSON.stringify({
        data: matchesCache.data,
        timestamp: matchesCache.timestamp,
      })
    );
  } catch {
    return;
  }
};

// ✅ Função de fetch com deduplicação
const fetchWithDedup = async (): Promise<Match[]> => {
  if (matchesCache.isLoading && matchesCache.promise) {
    return matchesCache.promise;
  }

  matchesCache.isLoading = true;
  matchesCache.promise = (async () => {
    const previous = matchesCache.data;
    const data = await getLiveMatches();
    let merged = data;
    if (previous && previous.length && data && data.length) {
      const previousMap = new Map<string, Match>();
      previous.forEach((m) => {
        previousMap.set(String(m.id), m);
      });
      merged = data.map((m) => {
        const key = String(m.id);
        const prev = previousMap.get(key);
        if (!prev || !prev.odds || m.odds) {
          return m;
        }
        const prevOdds = prev.odds;
        const hasPrevOdds =
          typeof prevOdds.home === 'number' &&
          typeof prevOdds.away === 'number' &&
          prevOdds.home > 1.01 &&
          prevOdds.away > 1.01;
        if (!hasPrevOdds) {
          return m;
        }
        return {
          ...m,
          odds: {
            home: prevOdds.home,
            draw: prevOdds.draw ?? 0,
            away: prevOdds.away,
          },
        };
      });
    }
    matchesCache.data = merged;
    matchesCache.timestamp = Date.now();
    matchesCache.isLoading = false;
    matchesCache.promise = null;
    persistCacheToStorage();
    return merged;
  })();

  return matchesCache.promise;
};

export function useLiveMatches(
  options: UseLiveMatchesOptions = {}
): UseLiveMatchesReturn {
  loadCacheFromStorage();
  const { 
    autoRefresh = false, 
    interval = 15000, // ✅ 15 segundos
    useWebSocket = true
  } = options;

  const [matches, setMatches] = useState<Match[]>(() => matchesCache.data || []);
  const [loading, setLoading] = useState(!matchesCache.data);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState(matchesCache.timestamp);
  const [isWebSocketConnected, setIsWebSocketConnected] = useState(false);

  const isMountedRef = useRef(true);
  const matchesMapRef = useRef<Map<string, Match>>(new Map());
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null); // ✅ Ref para intervalo
  const oddsIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ═══════════════════════════════════════════════════════════════════════════
  // ✅ WEBSOCKET: Atualizações em tempo real SEM polling
  // ═══════════════════════════════════════════════════════════════════════════

  useEffect(() => {
    if (!useWebSocket) return;

    const handleScoreUpdate = (update: LiveScoreUpdate) => {
      setMatches(prev => {
        const updated = prev.map(match => {
          if (String(match.id) === update.matchId) {
            return {
              ...match,
              homeScore: update.homeScore,
              awayScore: update.awayScore,
              elapsed: update.minute,
              minute: String(update.minute),
              statusShort: update.statusShort,
              period: update.period,
            };
          }
          return match;
        });
        matchesCache.data = updated;
        matchesCache.timestamp = Date.now();
        persistCacheToStorage();
        return updated;
      });
      
      setLastUpdate(Date.now());
    };

    const handleOddsUpdate = (update: LiveOddsUpdate) => {
      setMatches(prev => {
        const updated = prev.map(match => {
          if (String(match.id) === update.matchId) {
            return {
              ...match,
              odds: {
                home: update.odds.home,
                draw: update.odds.draw,
                away: update.odds.away,
              },
            };
          }
          return match;
        });
        matchesCache.data = updated;
        persistCacheToStorage();
        return updated;
      });
    };

    const handleConnectionChange = (state: { connected: boolean }) => {
      setIsWebSocketConnected(state.connected);
      if (state.connected) {
        console.log('🔌 [useLiveMatches] WebSocket conectado');
      } else {
        console.log('🔌 [useLiveMatches] WebSocket desconectado');
      }
    };

    const unsubScore = liveScoresWS.on('score_update', handleScoreUpdate);
    const unsubOdds = liveScoresWS.on('odds_update', handleOddsUpdate);
    const unsubConnection = liveScoresWS.on('connection_change', handleConnectionChange);

    setIsWebSocketConnected(liveScoresWS.getConnectionState().connected);

    return () => {
      unsubScore();
      unsubOdds();
      unsubConnection();
    };
  }, [useWebSocket]);

  // ═══════════════════════════════════════════════════════════════════════════
  // ✅ FETCH INICIAL: Carregar dados uma vez, WebSocket atualiza depois
  // ═══════════════════════════════════════════════════════════════════════════

  const fetchMatches = useCallback(async (forceRefresh = false) => {
    const now = Date.now();

    // Retornar cache se válido e não forçado
    if (!forceRefresh && matchesCache.data && (now - matchesCache.timestamp) < matchesCache.ttl) {
      if (isMountedRef.current) {
        setMatches(matchesCache.data);
        setLoading(false);
        setLastUpdate(matchesCache.timestamp);
      }
      return;
    }

    try {
      setError(null);

      const liveMatches = await fetchWithDedup();

      if (!isMountedRef.current) return;

      setMatches(liveMatches);
      setLoading(false);
      setLastUpdate(Date.now());

      // ✅ Registar jogos no WebSocket para receber atualizações
      if (useWebSocket && liveMatches.length > 0) {
        liveScoresWS.registerMatches(liveMatches);
      }

      // Atualizar mapa de referência
      matchesMapRef.current.clear();
      liveMatches.forEach(match => {
        matchesMapRef.current.set(String(match.id), match);
      });

    } catch (err: any) {
      if (err.name === 'AbortError') return;

      console.error('❌ Erro ao buscar jogos ao vivo:', err);

      if (!isMountedRef.current) return;

      if (matchesCache.data) {
        setMatches(matchesCache.data);
        setError('Erro ao atualizar. Usando dados em cache.');
      } else {
        setError('Não foi possível carregar jogos ao vivo.');
      }
      setLoading(false);
    }
  }, [useWebSocket]);

  // Carregar dados na montagem
  useEffect(() => {
    isMountedRef.current = true;
    fetchMatches();

    return () => {
      isMountedRef.current = false;
    };
  }, [fetchMatches]);

  useEffect(() => {
    if (!useWebSocket) return;
    if (!isWebSocketConnected) return;
    if (!matchesCache.data) return;

    console.log('WS conectado → invalidando cache e forçando refetch');
    matchesCache.timestamp = 0;
    fetchMatches(true);
  }, [useWebSocket, isWebSocketConnected, fetchMatches]);

  const syncOdds = useCallback(async () => {}, []);

  useEffect(() => {
    if (oddsIntervalRef.current) {
      clearInterval(oddsIntervalRef.current);
      oddsIntervalRef.current = null;
    }
    return;

    if (useWebSocket && isWebSocketConnected) {
      console.log('WS ativo → polling de odds desativado');
      syncOdds();
      return;
    }

    console.log('WS inativo → ativando polling de odds a cada 15s');

    syncOdds();

    oddsIntervalRef.current = setInterval(() => {
      if (!isMountedRef.current) return;
      syncOdds();
    }, 15000);

    return () => {
      if (oddsIntervalRef.current) {
        clearInterval(oddsIntervalRef.current);
        oddsIntervalRef.current = null;
      }
    };
  }, [syncOdds, useWebSocket, isWebSocketConnected]);

  // ═══════════════════════════════════════════════════════════════════════════
  // ✅ FALLBACK: Polling apenas se WebSocket não estiver conectado
  // ═══════════════════════════════════════════════════════════════════════════

  useEffect(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    if (useWebSocket && isWebSocketConnected) {
      console.log('✅ [useLiveMatches] WebSocket ativo - polling desativado');
      return;
    }

    if (!autoRefresh) return;

    console.log(`🔄 [useLiveMatches] Usando polling como fallback - intervalo: ${interval}ms`);

    intervalRef.current = setInterval(() => {
      if (isMountedRef.current) {
        fetchMatches();
      }
    }, interval);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [autoRefresh, interval, fetchMatches, useWebSocket, isWebSocketConnected]);

  useEffect(() => {
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    if (useWebSocket && !isWebSocketConnected) {
      reconnectTimer = setTimeout(() => {
        console.log('Forçando reconexão manual após 30s sem WS');
        liveScoresWS.connect();
      }, 30000);
    }

    return () => {
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
      }
    };
  }, [isWebSocketConnected, useWebSocket]);

  // ✅ Cleanup na desmontagem
  useEffect(() => {
    return () => {
      isMountedRef.current = false;
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
    isWebSocketConnected,
  };
}

// ✅ PRÉ-CARREGAMENTO
export const preloadLiveMatches = () => {
  const now = Date.now();
  if (!matchesCache.data || (now - matchesCache.timestamp) > matchesCache.ttl) {
    fetchWithDedup().catch(() => {});
  }
};
