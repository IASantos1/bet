import { useState, useEffect, useCallback, useRef } from 'react';

/**
 * Tipos de mercado com diferentes prioridades de atualização
 */
export type MarketPriority = 'primary' | 'secondary' | 'special';

/**
 * Intensidade do jogo baseada em eventos recentes
 */
export type GameIntensity = 'calm' | 'moderate' | 'intense';

/**
 * Configuração de intervalos por tipo de mercado
 * 
 * ✅ OTIMIZADO: Intervalos mais longos para reduzir carga
 */
export const MARKET_PRIORITY_CONFIG: Record<MarketPriority, {
  liveMultiplier: number;
  preMatchMultiplier: number;
  minInterval: number;
  maxInterval: number;
}> = {
  primary: {
    liveMultiplier: 1,
    preMatchMultiplier: 20,
    minInterval: 15000,           // ✅ 15 segundos mínimo (otimizado)
    maxInterval: 300000           // ✅ 5 minutos máximo
  },
  secondary: {
    liveMultiplier: 2,
    preMatchMultiplier: 30,
    minInterval: 30000,           // ✅ 30 segundos mínimo
    maxInterval: 600000           // ✅ 10 minutos máximo
  },
  special: {
    liveMultiplier: 3,
    preMatchMultiplier: 40,
    minInterval: 60000,           // ✅ 60 segundos mínimo
    maxInterval: 900000           // ✅ 15 minutos máximo
  }
};

/**
 * Configuração de intervalos baseados na intensidade do jogo
 * ✅ OTIMIZADO: Intervalos mais longos
 */
export const INTENSITY_INTERVALS: Record<GameIntensity, number> = {
  intense: 15000,    // ✅ 15 segundos - Múltiplos eventos recentes (otimizado)
  moderate: 30000,   // ✅ 30 segundos - Evento recente (otimizado)
  calm: 300000       // ✅ 5 minutos - Sem eventos (otimizado)
};

/**
 * Mapeamento de mercados para suas prioridades
 */
export const MARKET_PRIORITY_MAP: Record<string, MarketPriority> = {
  // Primary - Atualizam mais rápido
  '1x2': 'primary',
  '1X2': 'primary',
  'moneyline': 'primary',
  'dupla_chance': 'primary',
  'double_chance': 'primary',
  
  // Secondary - Atualizam depois
  'overunder': 'primary',
  'over_under': 'primary',
  'btts': 'secondary',
  'ambas_marcam': 'secondary',
  'handicap': 'secondary',
  'asian_handicap': 'secondary',
  'corners': 'secondary',
  'escanteios': 'secondary',
  
  // Special - Atualizam bem menos
  'correctscore': 'special',
  'correct_score': 'special',
  'resultado_correto': 'special',
  'htft': 'special',
  'ht_ft': 'special',
  'intervalo_final': 'special',
  'exactgoals': 'special',
  'exact_goals': 'special',
  'gols_exatos': 'special',
  'firstlast': 'special',
  'first_last_goal': 'special',
  'primeiro_ultimo': 'special',
  'margin': 'special',
  'winning_margin': 'special',
  'margem_vitoria': 'special'
};

/**
 * Obtém a prioridade de um mercado
 */
export function getMarketPriority(marketId: string): MarketPriority {
  const normalizedId = marketId.toLowerCase().replace(/[\s-]/g, '_');
  return MARKET_PRIORITY_MAP[normalizedId] || 'secondary';
}

/**
 * Calcula a intensidade do jogo baseado em eventos recentes
 */
export function calculateGameIntensity(lastEventTime: number | null): GameIntensity {
  if (!lastEventTime) return 'calm';
  
  const timeSinceEvent = Date.now() - lastEventTime;
  
  // Evento há menos de 30 segundos - Jogo intenso
  if (timeSinceEvent < 30000) return 'intense';
  
  // Evento há menos de 2 minutos - Jogo moderado
  if (timeSinceEvent < 120000) return 'moderate';
  
  // Sem eventos recentes - Jogo calmo
  return 'calm';
}

/**
 * Calcula o intervalo de atualização baseado na intensidade do jogo
 * 
 * ✅ OTIMIZADO: Intervalos mais longos para reduzir carga
 */
export function calculateRefreshInterval(
  startTime: string, 
  isLive: boolean = false,
  marketPriority: MarketPriority = 'primary',
  gameIntensity: GameIntensity = 'calm'
): number {
  const config = MARKET_PRIORITY_CONFIG[marketPriority];
  
  // ✅ AO VIVO - Baseado na intensidade do jogo
  if (isLive) {
    const intensityInterval = INTENSITY_INTERVALS[gameIntensity];
    const interval = intensityInterval * config.liveMultiplier;
    return Math.max(config.minInterval, Math.min(interval, config.maxInterval));
  }

  // ✅ PRÉ-JOGO - Intervalos muito longos
  const now = new Date().getTime();
  const matchTime = new Date(startTime).getTime();
  const hoursUntilMatch = (matchTime - now) / (1000 * 60 * 60);
  const minutesUntilMatch = (matchTime - now) / (1000 * 60);

  let baseInterval: number;

  if (hoursUntilMatch <= 0) {
    baseInterval = 300000; // 5 minutos
  }
  else if (minutesUntilMatch <= 10) {
    baseInterval = 600000; // 10 minutos
  }
  else if (minutesUntilMatch <= 30) {
    baseInterval = 900000; // 15 minutos
  }
  else if (hoursUntilMatch <= 1) {
    baseInterval = 1200000; // 20 minutos
  }
  else if (hoursUntilMatch <= 2) {
    baseInterval = 1800000; // 30 minutos
  }
  else if (hoursUntilMatch <= 6) {
    baseInterval = 3600000; // 60 minutos
  }
  else {
    baseInterval = 7200000; // 120 minutos
  }

  const interval = baseInterval * config.preMatchMultiplier;
  return Math.max(config.minInterval, Math.min(interval, config.maxInterval));
}

/**
 * Calcula intervalos para todos os tipos de mercado de uma vez
 */
export function calculateAllMarketIntervals(
  startTime: string,
  isLive: boolean = false,
  gameIntensity: GameIntensity = 'calm'
): Record<MarketPriority, number> {
  return {
    primary: calculateRefreshInterval(startTime, isLive, 'primary', gameIntensity),
    secondary: calculateRefreshInterval(startTime, isLive, 'secondary', gameIntensity),
    special: calculateRefreshInterval(startTime, isLive, 'special', gameIntensity)
  };
}

/**
 * Hook para gerenciar atualização dinâmica de odds baseada em intensidade
 */
export function useDynamicOddsRefresh(
  startTime: string | null,
  isLive: boolean = false,
  onRefresh: () => void,
  marketPriority: MarketPriority = 'primary',
  lastEventTime: number | null = null
) {
  const [currentInterval, setCurrentInterval] = useState<number>(60000);
  const [timeUntilMatch, setTimeUntilMatch] = useState<string>('');
  const [gameIntensity, setGameIntensity] = useState<GameIntensity>('calm');
  const lastRefreshRef = useRef<number>(0);

  const calculateTimeUntilMatch = useCallback(() => {
    if (!startTime) return '';

    const now = new Date().getTime();
    const matchTime = new Date(startTime).getTime();
    const diff = matchTime - now;

    if (diff <= 0) return 'Ao vivo';

    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

    if (hours > 0) {
      return `${hours}h ${minutes}min`;
    }
    return `${minutes}min`;
  }, [startTime]);

  // Atualizar intensidade do jogo
  useEffect(() => {
    if (!isLive) {
      setGameIntensity('calm');
      return;
    }

    const intensity = calculateGameIntensity(lastEventTime);
    setGameIntensity(intensity);
  }, [isLive, lastEventTime]);

  useEffect(() => {
    if (!startTime) return;

    const updateInterval = () => {
      const newInterval = calculateRefreshInterval(startTime, isLive, marketPriority, gameIntensity);
      setCurrentInterval(newInterval);
      setTimeUntilMatch(calculateTimeUntilMatch());
    };

    updateInterval();
    const intervalChecker = setInterval(updateInterval, 30000); // Verificar a cada 30 segundos

    return () => clearInterval(intervalChecker);
  }, [startTime, isLive, marketPriority, gameIntensity, calculateTimeUntilMatch]);

  useEffect(() => {
    if (!startTime) return;

    const intervalId = setInterval(() => {
      const now = Date.now();
      if (now - lastRefreshRef.current >= currentInterval * 0.9) {
        lastRefreshRef.current = now;
        onRefresh();
      }
    }, currentInterval);

    return () => clearInterval(intervalId);
  }, [currentInterval, onRefresh, startTime]);

  return {
    currentInterval,
    timeUntilMatch,
    refreshRate: `${(currentInterval / 1000).toFixed(0)}s`,
    marketPriority,
    gameIntensity
  };
}

/**
 * Hook para gerenciar múltiplos mercados com diferentes intervalos
 */
export function useMultiMarketOddsRefresh(
  startTime: string | null,
  isLive: boolean = false,
  onRefreshPrimary: () => void,
  onRefreshSecondary: () => void,
  onRefreshSpecial: () => void,
  lastEventTime: number | null = null
) {
  const [intervals, setIntervals] = useState<Record<MarketPriority, number>>({
    primary: 30000,
    secondary: 60000,
    special: 120000
  });
  const [gameIntensity, setGameIntensity] = useState<GameIntensity>('calm');
  const lastRefreshRef = useRef<Record<MarketPriority, number>>({
    primary: 0,
    secondary: 0,
    special: 0
  });

  // Atualizar intensidade do jogo
  useEffect(() => {
    if (!isLive) {
      setGameIntensity('calm');
      return;
    }

    const intensity = calculateGameIntensity(lastEventTime);
    setGameIntensity(intensity);
  }, [isLive, lastEventTime]);

  useEffect(() => {
    if (!startTime) return;

    const updateIntervals = () => {
      const newIntervals = calculateAllMarketIntervals(startTime, isLive, gameIntensity);
      setIntervals(newIntervals);
    };

    updateIntervals();
    const checker = setInterval(updateIntervals, 30000);

    return () => clearInterval(checker);
  }, [startTime, isLive, gameIntensity]);

  useEffect(() => {
    if (!startTime) return;

    const intervalId = setInterval(() => {
      const now = Date.now();
      if (now - lastRefreshRef.current.primary >= intervals.primary * 0.9) {
        lastRefreshRef.current.primary = now;
        onRefreshPrimary();
      }
    }, intervals.primary);

    return () => clearInterval(intervalId);
  }, [intervals.primary, onRefreshPrimary, startTime]);

  useEffect(() => {
    if (!startTime) return;

    const intervalId = setInterval(() => {
      const now = Date.now();
      if (now - lastRefreshRef.current.secondary >= intervals.secondary * 0.9) {
        lastRefreshRef.current.secondary = now;
        onRefreshSecondary();
      }
    }, intervals.secondary);

    return () => clearInterval(intervalId);
  }, [intervals.secondary, onRefreshSecondary, startTime]);

  useEffect(() => {
    if (!startTime) return;

    const intervalId = setInterval(() => {
      const now = Date.now();
      if (now - lastRefreshRef.current.special >= intervals.special * 0.9) {
        lastRefreshRef.current.special = now;
        onRefreshSpecial();
      }
    }, intervals.special);

    return () => clearInterval(intervalId);
  }, [intervals.special, onRefreshSpecial, startTime]);

  return {
    intervals,
    gameIntensity,
    refreshRates: {
      primary: `${(intervals.primary / 1000).toFixed(0)}s`,
      secondary: `${(intervals.secondary / 1000).toFixed(0)}s`,
      special: `${(intervals.special / 1000).toFixed(0)}s`
    }
  };
}

/**
 * Retorna a intensidade de atualização baseado no intervalo
 */
export function getRefreshIntensity(interval: number): 'low' | 'medium' | 'high' | 'extreme' {
  if (interval <= 30000) return 'high';
  if (interval <= 60000) return 'medium';
  return 'low';
}

/**
 * Formata o intervalo para exibição amigável
 */
export function formatRefreshInterval(interval: number): string {
  if (interval < 60000) {
    return `${Math.round(interval / 1000)}s`;
  }
  return `${Math.round(interval / 60000)}min`;
}

/**
 * Formata a intensidade do jogo para exibição
 */
export function formatGameIntensity(intensity: GameIntensity): string {
  const labels: Record<GameIntensity, string> = {
    calm: '🟢 Calmo',
    moderate: '🟡 Moderado',
    intense: '🔴 Intenso'
  };
  return labels[intensity];
}
