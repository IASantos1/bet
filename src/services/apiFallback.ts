
/**
 * Sistema de Fallback Automático para APIs
 * - Monitoriza saúde das APIs em tempo real
 * - Alterna automaticamente entre API principal e secundária
 * - Regista métricas de performance e disponibilidade
 */

import { fetchLiveOdds as fetchLiveOddsApi2 } from './sportsApi2';
import { fetchLiveFixtures as fetchLiveFixturesApi1 } from './sportsApi1';

// Estado de saúde das APIs
export interface ApiHealthStatus {
  name: string;
  isHealthy: boolean;
  lastCheck: Date;
  lastError: string | null;
  responseTime: number;
  successRate: number;
  totalRequests: number;
  failedRequests: number;
  consecutiveFailures: number;
  isCircuitOpen: boolean;
  circuitOpenUntil: Date | null;
}

// Configuração do Circuit Breaker
const CIRCUIT_BREAKER_CONFIG = {
  failureThreshold: 3,        // Falhas consecutivas para abrir circuito
  recoveryTimeout: 30000,     // 30 segundos para tentar recuperar
  halfOpenRequests: 2,        // Requisições de teste em half-open
  successThreshold: 2,        // Sucessos para fechar circuito
};

// Estado interno das APIs
const apiHealth: Record<string, ApiHealthStatus> = {
  api1: {
    name: 'API-Football',
    isHealthy: true,
    lastCheck: new Date(),
    lastError: null,
    responseTime: 0,
    successRate: 100,
    totalRequests: 0,
    failedRequests: 0,
    consecutiveFailures: 0,
    isCircuitOpen: false,
    circuitOpenUntil: null,
  },
  api2: {
    name: 'The Odds API',
    isHealthy: true,
    lastCheck: new Date(),
    lastError: null,
    responseTime: 0,
    successRate: 100,
    totalRequests: 0,
    failedRequests: 0,
    consecutiveFailures: 0,
    isCircuitOpen: false,
    circuitOpenUntil: null,
  },
};

// Histórico de latência para cálculo de média
const latencyHistory: Record<string, number[]> = {
  api1: [],
  api2: [],
};

// Listeners para mudanças de estado
type HealthChangeListener = (apiKey: string, status: ApiHealthStatus) => void;
const healthListeners: HealthChangeListener[] = [];

/**
 * Regista listener para mudanças de saúde das APIs
 */
export function onHealthChange(listener: HealthChangeListener): () => void {
  healthListeners.push(listener);
  return () => {
    const idx = healthListeners.indexOf(listener);
    if (idx > -1) healthListeners.splice(idx, 1);
  };
}

/**
 * Notifica listeners sobre mudança de estado
 */
function notifyHealthChange(apiKey: string): void {
  const status = apiHealth[apiKey];
  healthListeners.forEach(listener => {
    try {
      listener(apiKey, { ...status });
    } catch (e) {
      console.error('Erro no listener de saúde:', e);
    }
  });
}

/**
 * Verifica se o circuito está aberto para uma API
 */
function isCircuitOpen(apiKey: string): boolean {
  const health = apiHealth[apiKey];
  
  if (!health.isCircuitOpen) return false;
  
  // Verificar se já passou o tempo de recuperação
  if (health.circuitOpenUntil && new Date() > health.circuitOpenUntil) {
    // Entrar em modo half-open
    console.log(`🔄 ${health.name}: Circuito em modo half-open, testando...`);
    return false;
  }
  
  return true;
}

/**
 * Regista sucesso de uma requisição
 */
function recordSuccess(apiKey: string, responseTime: number): void {
  const health = apiHealth[apiKey];
  
  health.totalRequests++;
  health.lastCheck = new Date();
  health.responseTime = responseTime;
  health.consecutiveFailures = 0;
  health.lastError = null;
  
  // Atualizar histórico de latência
  latencyHistory[apiKey].push(responseTime);
  if (latencyHistory[apiKey].length > 20) {
    latencyHistory[apiKey].shift();
  }
  
  // Calcular taxa de sucesso
  health.successRate = ((health.totalRequests - health.failedRequests) / health.totalRequests) * 100;
  
  // Se estava em circuit open, fechar
  if (health.isCircuitOpen) {
    health.isCircuitOpen = false;
    health.circuitOpenUntil = null;
    health.isHealthy = true;
    console.log(`✅ ${health.name}: Circuito fechado - API recuperada`);
  }
  
  notifyHealthChange(apiKey);
}

/**
 * Regista falha de uma requisição
 */
function recordFailure(apiKey: string, error: string): void {
  const health = apiHealth[apiKey];
  
  health.totalRequests++;
  health.failedRequests++;
  health.lastCheck = new Date();
  health.lastError = error;
  health.consecutiveFailures++;
  
  // Calcular taxa de sucesso
  health.successRate = ((health.totalRequests - health.failedRequests) / health.totalRequests) * 100;
  
  // Verificar se deve abrir o circuito
  if (health.consecutiveFailures >= CIRCUIT_BREAKER_CONFIG.failureThreshold) {
    health.isCircuitOpen = true;
    health.isHealthy = false;
    health.circuitOpenUntil = new Date(Date.now() + CIRCUIT_BREAKER_CONFIG.recoveryTimeout);
    console.warn(`🔴 ${health.name}: Circuito aberto - ${health.consecutiveFailures} falhas consecutivas`);
  }
  
  notifyHealthChange(apiKey);
}

/**
 * Calcula latência média de uma API
 */
function getAverageLatency(apiKey: string): number {
  const history = latencyHistory[apiKey];
  if (history.length === 0) return 0;
  return history.reduce((a, b) => a + b, 0) / history.length;
}

/**
 * Determina qual API usar (principal ou fallback)
 */
function selectApi(): 'api1' | 'api2' {
  const api1Open = isCircuitOpen('api1');
  const api2Open = isCircuitOpen('api2');
  
  // Se ambas estão com circuito aberto, tentar a com menor tempo de espera
  if (api1Open && api2Open) {
    const api1Wait = apiHealth.api1.circuitOpenUntil?.getTime() || 0;
    const api2Wait = apiHealth.api2.circuitOpenUntil?.getTime() || 0;
    return api1Wait < api2Wait ? 'api1' : 'api2';
  }
  
  // Se API1 está com circuito aberto, usar API2
  if (api1Open) {
    console.log('🔄 Usando API secundária (The Odds API) - API principal indisponível');
    return 'api2';
  }
  
  // Se API2 está com circuito aberto, usar API1
  if (api2Open) {
    console.log('🔄 Usando API principal (API-Football) - API secundária indisponível');
    return 'api1';
  }
  
  // Ambas disponíveis - usar a com melhor performance
  const api1Latency = getAverageLatency('api1');
  const api2Latency = getAverageLatency('api2');
  
  // Preferir API2 (The Odds API) para odds, pois é mais especializada
  // Mas se a latência for muito maior, usar API1
  if (api2Latency > 0 && api1Latency > 0 && api2Latency > api1Latency * 2) {
    return 'api1';
  }
  
  return 'api2';
}

/**
 * Executa requisição com fallback automático
 */
export async function fetchWithFallback<T>(
  api1Fn: () => Promise<T>,
  api2Fn: () => Promise<T>,
  operationName: string
): Promise<{ data: T; usedApi: 'api1' | 'api2'; responseTime: number }> {
  const selectedApi = selectApi();
  const primaryFn = selectedApi === 'api1' ? api1Fn : api2Fn;
  const fallbackFn = selectedApi === 'api1' ? api2Fn : api1Fn;
  const fallbackApiKey = selectedApi === 'api1' ? 'api2' : 'api1';
  
  // Tentar API primária
  const startTime = Date.now();
  
  try {
    if (!isCircuitOpen(selectedApi)) {
      const data = await primaryFn();
      const responseTime = Date.now() - startTime;
      recordSuccess(selectedApi, responseTime);
      
      console.log(`✅ ${operationName}: ${apiHealth[selectedApi].name} (${responseTime}ms)`);
      
      return { data, usedApi: selectedApi, responseTime };
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Erro desconhecido';
    recordFailure(selectedApi, errorMsg);
    console.warn(`⚠️ ${operationName}: Falha na ${apiHealth[selectedApi].name} - ${errorMsg}`);
  }
  
  // Tentar fallback
  const fallbackStartTime = Date.now();
  
  try {
    if (!isCircuitOpen(fallbackApiKey)) {
      const data = await fallbackFn();
      const responseTime = Date.now() - fallbackStartTime;
      recordSuccess(fallbackApiKey, responseTime);
      
      console.log(`🔄 ${operationName}: Fallback para ${apiHealth[fallbackApiKey].name} (${responseTime}ms)`);
      
      return { data, usedApi: fallbackApiKey, responseTime };
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Erro desconhecido';
    recordFailure(fallbackApiKey, errorMsg);
    console.error(`❌ ${operationName}: Falha no fallback - ${errorMsg}`);
  }
  
  // Ambas falharam - lançar erro
  throw new Error(`Todas as APIs falharam para ${operationName}`);
}

/**
 * Obtém estado de saúde de todas as APIs
 */
export function getApiHealthStatus(): Record<string, ApiHealthStatus> {
  return {
    api1: { ...apiHealth.api1, responseTime: getAverageLatency('api1') },
    api2: { ...apiHealth.api2, responseTime: getAverageLatency('api2') },
  };
}

/**
 * Força reset do circuit breaker de uma API
 */
export function resetCircuitBreaker(apiKey: 'api1' | 'api2'): void {
  const health = apiHealth[apiKey];
  health.isCircuitOpen = false;
  health.circuitOpenUntil = null;
  health.consecutiveFailures = 0;
  health.isHealthy = true;
  console.log(`🔄 ${health.name}: Circuit breaker resetado manualmente`);
  notifyHealthChange(apiKey);
}

/**
 * Health check manual de uma API
 */
export async function healthCheck(apiKey: 'api1' | 'api2'): Promise<boolean> {
  const startTime = Date.now();
  
  try {
    if (apiKey === 'api1') {
      await fetchLiveFixturesApi1(true);
    } else {
      await fetchLiveOddsApi2();
    }
    
    const responseTime = Date.now() - startTime;
    recordSuccess(apiKey, responseTime);
    return true;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Erro desconhecido';
    recordFailure(apiKey, errorMsg);
    return false;
  }
}

/**
 * Obtém métricas detalhadas do sistema de fallback
 */
export function getFallbackMetrics() {
  return {
    api1: {
      ...apiHealth.api1,
      averageLatency: getAverageLatency('api1'),
      latencyHistory: [...latencyHistory.api1],
    },
    api2: {
      ...apiHealth.api2,
      averageLatency: getAverageLatency('api2'),
      latencyHistory: [...latencyHistory.api2],
    },
    circuitBreakerConfig: { ...CIRCUIT_BREAKER_CONFIG },
  };
}
