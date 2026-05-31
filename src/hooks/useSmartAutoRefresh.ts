import { useEffect, useRef, useCallback, useState } from 'react';

interface AutoRefreshOptions<T> {
  fetchFn: () => Promise<T>;
  interval?: number;
  enabled?: boolean;
  onUpdate?: (newData: T, oldData: T | null) => void;
  compareData?: (oldData: T | null, newData: T) => boolean;
  priority?: 'high' | 'medium' | 'low';
}

interface AutoRefreshResult<T> {
  data: T | null;
  isLoading: boolean;
  error: Error | null;
  lastUpdate: Date | null;
  isLive: boolean;
  forceRefresh: () => Promise<void>;
}

/**
 * Hook para atualização automática silenciosa de dados
 * Atualiza a cada 3 segundos sem recarregar a página
 */
export function useSmartAutoRefresh<T>({
  fetchFn,
  interval = 3000,
  enabled = true,
  onUpdate,
  compareData,
  priority = 'medium',
}: AutoRefreshOptions<T>): AutoRefreshResult<T> {
  const [data, setData] = useState<T | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [isLive, setIsLive] = useState(false);

  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const isMountedRef = useRef(true);
  const fetchingRef = useRef(false);
  const retryCountRef = useRef(0);
  const lastDataRef = useRef<T | null>(null);

  // Função para verificar se os dados mudaram
  const hasDataChanged = useCallback(
    (oldData: T | null, newData: T): boolean => {
      if (compareData) {
        return compareData(oldData, newData);
      }
      return JSON.stringify(oldData) !== JSON.stringify(newData);
    },
    [compareData]
  );

  // Função de fetch com retry e throttling
  const fetchData = useCallback(
    async (isInitial = false) => {
      if (fetchingRef.current) return;
      if (!enabled) return;

      fetchingRef.current = true;

      try {
        if (isInitial) {
          setIsLoading(true);
        }

        const newData = await fetchFn();

        if (!isMountedRef.current) return;

        // Verificar se os dados mudaram
        const dataChanged = hasDataChanged(lastDataRef.current, newData);

        if (dataChanged || isInitial) {
          // Atualização silenciosa - sem loading spinner
          setData(newData);
          setLastUpdate(new Date());
          setIsLive(true);

          // Callback de atualização
          if (onUpdate && lastDataRef.current !== null) {
            onUpdate(newData, lastDataRef.current);
          }

          lastDataRef.current = newData;
        }

        setError(null);
        retryCountRef.current = 0;
      } catch (err) {
        console.error('[AutoRefresh] Erro ao buscar dados:', err);

        if (!isMountedRef.current) return;

        setError(err as Error);
        retryCountRef.current += 1;

        // Fallback gracioso - manter dados antigos
        if (retryCountRef.current >= 3) {
          setIsLive(false);
        }
      } finally {
        if (isMountedRef.current) {
          setIsLoading(false);
          fetchingRef.current = false;
        }
      }
    },
    [fetchFn, enabled, hasDataChanged, onUpdate]
  );

  // Força atualização manual
  const forceRefresh = useCallback(async () => {
    await fetchData(false);
  }, [fetchData]);

  // Configurar intervalo de atualização
  useEffect(() => {
    if (!enabled) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    // Fetch inicial
    fetchData(true);

    // Configurar intervalo baseado na prioridade
    let adjustedInterval = interval;
    if (priority === 'high') {
      adjustedInterval = Math.max(interval, 2000); // Mínimo 2s
    } else if (priority === 'low') {
      adjustedInterval = Math.max(interval, 5000); // Mínimo 5s
    }

    // Iniciar atualização automática
    intervalRef.current = setInterval(() => {
      fetchData(false);
    }, adjustedInterval);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [enabled, interval, priority, fetchData]);

  // Cleanup ao desmontar
  useEffect(() => {
    return () => {
      isMountedRef.current = false;
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, []);

  return {
    data,
    isLoading,
    error,
    lastUpdate,
    isLive,
    forceRefresh,
  };
}
