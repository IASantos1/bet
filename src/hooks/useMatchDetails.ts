import { useState, useEffect, useCallback } from 'react';
import type { Match } from '../types/sports';
import { sportsDataHub } from '../services/sportsDataHub';

// Cache local para detalhes de jogos
const CACHE_KEY_PREFIX = 'match_details_';
const CACHE_TTL = 5 * 60 * 1000; // 5 minutos

interface CacheData {
  match: Match;
  timestamp: number;
}

export function useMatchDetails(matchId: string) {
  const [match, setMatch] = useState<Match | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Função para buscar do cache
  const getFromCache = useCallback((id: string): Match | null => {
    try {
      const cached = localStorage.getItem(CACHE_KEY_PREFIX + id);
      if (!cached) return null;

      const data: CacheData = JSON.parse(cached);
      const now = Date.now();

      if (now - data.timestamp < CACHE_TTL) {
        console.log('✅ Usando cache local para jogo', id);
        return data.match;
      }

      localStorage.removeItem(CACHE_KEY_PREFIX + id);
      return null;
    } catch (err) {
      console.error('Erro ao ler cache:', err);
      return null;
    }
  }, []);

  // Função para salvar no cache
  const saveToCache = useCallback((id: string, matchData: Match) => {
    try {
      const cacheData: CacheData = {
        match: matchData,
        timestamp: Date.now()
      };
      localStorage.setItem(CACHE_KEY_PREFIX + id, JSON.stringify(cacheData));
    } catch (err) {
      console.error('Erro ao salvar cache:', err);
    }
  }, []);

  const fetchMatchDetails = useCallback(async () => {
    if (!matchId) return;

    try {
      // Tentar buscar do cache primeiro
      const cachedMatch = getFromCache(matchId);
      if (cachedMatch) {
        setMatch(cachedMatch);
        setLoading(false);
        return;
      }

      console.log('📡 Buscando detalhes do jogo', matchId);
      setLoading(true);
      
      const matchData = await sportsDataHub.getMatchDetails(matchId);
      
      if (matchData) {
        saveToCache(matchId, matchData);
        setMatch(matchData);
        setError(null);
      } else {
        setError('Jogo não encontrado');
      }
    } catch (err) {
      console.error('Erro ao buscar detalhes do jogo:', err);
      setError('Erro ao carregar detalhes do jogo');
      
      // Tentar usar cache expirado
      const cachedMatch = getFromCache(matchId);
      if (cachedMatch) {
        console.log('⚠️ Usando cache expirado');
        setMatch(cachedMatch);
      }
    } finally {
      setLoading(false);
    }
  }, [matchId, getFromCache, saveToCache]);

  useEffect(() => {
    fetchMatchDetails();

    // Atualizar a cada 5 minutos
    const interval = setInterval(fetchMatchDetails, CACHE_TTL);

    return () => clearInterval(interval);
  }, [fetchMatchDetails]);

  return {
    match,
    loading,
    error,
    refetch: fetchMatchDetails
  };
}
