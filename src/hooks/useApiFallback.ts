
import { useState, useEffect, useCallback } from 'react';
import {
  getApiHealthStatus,
  getFallbackMetrics,
  onHealthChange,
  resetCircuitBreaker,
  healthCheck,
  type ApiHealthStatus,
} from '../services/apiFallback';

interface UseApiFallbackReturn {
  // Estado de saúde
  api1Health: ApiHealthStatus;
  api2Health: ApiHealthStatus;
  
  // Métricas
  metrics: ReturnType<typeof getFallbackMetrics>;
  
  // Ações
  resetApi1: () => void;
  resetApi2: () => void;
  checkApi1Health: () => Promise<boolean>;
  checkApi2Health: () => Promise<boolean>;
  refreshStatus: () => void;
  
  // Estado geral
  isAnyApiDown: boolean;
  activeApi: 'api1' | 'api2' | 'both';
}

export function useApiFallback(): UseApiFallbackReturn {
  const [healthStatus, setHealthStatus] = useState(getApiHealthStatus());
  const [metrics, setMetrics] = useState(getFallbackMetrics());

  useEffect(() => {
    // Listener para mudanças de saúde
    const unsubscribe = onHealthChange((apiKey, status) => {
      setHealthStatus(prev => ({
        ...prev,
        [apiKey]: status,
      }));
      setMetrics(getFallbackMetrics());
    });

    // Atualizar periodicamente
    const interval = setInterval(() => {
      setHealthStatus(getApiHealthStatus());
      setMetrics(getFallbackMetrics());
    }, 5000);

    return () => {
      unsubscribe();
      clearInterval(interval);
    };
  }, []);

  const refreshStatus = useCallback(() => {
    setHealthStatus(getApiHealthStatus());
    setMetrics(getFallbackMetrics());
  }, []);

  const resetApi1 = useCallback(() => {
    resetCircuitBreaker('api1');
    refreshStatus();
  }, [refreshStatus]);

  const resetApi2 = useCallback(() => {
    resetCircuitBreaker('api2');
    refreshStatus();
  }, [refreshStatus]);

  const checkApi1Health = useCallback(async () => {
    const result = await healthCheck('api1');
    refreshStatus();
    return result;
  }, [refreshStatus]);

  const checkApi2Health = useCallback(async () => {
    const result = await healthCheck('api2');
    refreshStatus();
    return result;
  }, [refreshStatus]);

  const isAnyApiDown = !healthStatus.api1.isHealthy || !healthStatus.api2.isHealthy;
  
  const activeApi = healthStatus.api1.isHealthy && healthStatus.api2.isHealthy
    ? 'both'
    : healthStatus.api1.isHealthy
      ? 'api1'
      : 'api2';

  return {
    api1Health: healthStatus.api1,
    api2Health: healthStatus.api2,
    metrics,
    resetApi1,
    resetApi2,
    checkApi1Health,
    checkApi2Health,
    refreshStatus,
    isAnyApiDown,
    activeApi,
  };
}
