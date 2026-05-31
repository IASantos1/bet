import { useState, useEffect, useCallback } from 'react';

// Cache local para odds
const CACHE_KEY_PREFIX = 'odds_';
const CACHE_TTL = 5 * 60 * 1000; // 5 minutos

interface CacheData {
  odds: any;
  timestamp: number;
}

export function useSportsOdds(matchId?: string) {
  const [odds, setOdds] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Função para buscar do cache
  const getFromCache = useCallback((id: string): any | null => {
    try {
      const cached = localStorage.getItem(CACHE_KEY_PREFIX + id);
      if (!cached) return null;

      const data: CacheData = JSON.parse(cached);
      const now = Date.now();

      if (now - data.timestamp < CACHE_TTL) {
        console.log('✅ Usando cache local para odds', id);
        return data.odds;
      }

      localStorage.removeItem(CACHE_KEY_PREFIX + id);
      return null;
    } catch (err) {
      console.error('Erro ao ler cache de odds:', err);
      return null;
    }
  }, []);

  // Função para salvar no cache
  const saveToCache = useCallback((id: string, oddsData: any) => {
    try {
      const cacheData: CacheData = {
        odds: oddsData,
        timestamp: Date.now()
      };
      localStorage.setItem(CACHE_KEY_PREFIX + id, JSON.stringify(cacheData));
    } catch (err) {
      console.error('Erro ao salvar cache de odds:', err);
    }
  }, []);

  const fetchOdds = useCallback(async () => {
    if (!matchId) return;

    try {
      // Tentar buscar do cache primeiro
      const cachedOdds = getFromCache(matchId);
      if (cachedOdds) {
        setOdds(cachedOdds);
        setLoading(false);
        return;
      }

      console.log('📡 Buscando odds do jogo', matchId);
      setLoading(true);
      
      // Buscar odds da API
      const oddsData = await fetchOddsFromApi(matchId);
      
      if (oddsData) {
        saveToCache(matchId, oddsData);
        setOdds(oddsData);
        setError(null);
      }
    } catch (err) {
      console.error('Erro ao buscar odds:', err);
      setError('Erro ao carregar odds');
      
      // Tentar usar cache expirado
      const cachedOdds = getFromCache(matchId);
      if (cachedOdds) {
        console.log('⚠️ Usando cache expirado de odds');
        setOdds(cachedOdds);
      }
    } finally {
      setLoading(false);
    }
  }, [matchId, getFromCache, saveToCache]);

  // Função para buscar odds de um jogo específico
  const getOddsForMatch = useCallback((id: string) => {
    return getFromCache(id);
  }, [getFromCache]);

  useEffect(() => {
    if (matchId) {
      fetchOdds();

      // Atualizar a cada 5 minutos
      const interval = setInterval(fetchOdds, CACHE_TTL);

      return () => clearInterval(interval);
    }
  }, [fetchOdds, matchId]);

  return {
    odds,
    loading,
    error,
    refetch: fetchOdds,
    getOddsForMatch
  };
}

// Função auxiliar para buscar odds da API
async function fetchOddsFromApi(_matchId: string) {
  // Implementar busca de odds
  return null;
}
