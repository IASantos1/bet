/**
 * 🎯 Serviço de Cache de Odds
 * TTL: 1-3 segundos (ultra-rápido)
 * Prioridade: ALTA
 * Isolamento: Falhas não afetam outros serviços
 */

interface OddsCacheEntry {
  data: any;
  timestamp: number;
  ttl: number;
  hits: number;
}

interface OddsCacheMetrics {
  hits: number;
  misses: number;
  invalidations: number;
  lastUpdate: number;
  hitRate: number;
}

class OddsCacheService {
  private cache: Map<string, OddsCacheEntry> = new Map();
  private metrics: OddsCacheMetrics = {
    hits: 0,
    misses: 0,
    invalidations: 0,
    lastUpdate: Date.now(),
    hitRate: 0
  };
  
  private readonly DEFAULT_TTL = 2000; // 2 segundos
  private readonly MAX_CACHE_SIZE = 1000;
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor() {
    this.startCleanupTask();
  }

  /**
   * Obter odds do cache
   */
  get(key: string): any | null {
    const entry = this.cache.get(key);
    
    if (!entry) {
      this.metrics.misses++;
      this.updateHitRate();
      return null;
    }

    const now = Date.now();
    const age = now - entry.timestamp;

    // Verificar se expirou
    if (age > entry.ttl) {
      this.cache.delete(key);
      this.metrics.misses++;
      this.updateHitRate();
      return null;
    }

    // Cache hit
    entry.hits++;
    this.metrics.hits++;
    this.updateHitRate();
    
    return entry.data;
  }

  setOdds(fixtureId: number, data: any, ttl: number = this.DEFAULT_TTL): void {
    const key = `fixture:${fixtureId}`;
    // Limitar tamanho do cache
    if (this.cache.size >= this.MAX_CACHE_SIZE) {
      this.evictLeastUsed();
    }

    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      ttl,
      hits: 0
    });

    this.metrics.lastUpdate = Date.now();
  }

  invalidateOdds(fixtureId: number): void {
    const key = `fixture:${fixtureId}`;
    if (this.cache.delete(key)) {
      this.metrics.invalidations++;
    }
  }

  /**
   * Invalidar por padrão (ex: todas odds de um jogo)
   */
  invalidatePattern(pattern: string): number {
    let count = 0;
    
    for (const key of this.cache.keys()) {
      if (key.includes(pattern)) {
        this.cache.delete(key);
        count++;
      }
    }

    this.metrics.invalidations += count;
    return count;
  }

  /**
   * Invalidar odds expiradas
   */
  invalidateExpired(): number {
    const now = Date.now();
    let count = 0;

    for (const [key, entry] of this.cache.entries()) {
      const age = now - entry.timestamp;
      if (age > entry.ttl) {
        this.cache.delete(key);
        count++;
      }
    }

    this.metrics.invalidations += count;
    return count;
  }

  /**
   * Limpar todo o cache
   */
  clear(): void {
    const size = this.cache.size;
    this.cache.clear();
    this.metrics.invalidations += size;
  }

  /**
   * Obter métricas do cache
   */
  getMetrics(): OddsCacheMetrics {
    return { ...this.metrics };
  }

  /**
   * Resetar métricas
   */
  resetMetrics(): void {
    this.metrics = {
      hits: 0,
      misses: 0,
      invalidations: 0,
      lastUpdate: Date.now(),
      hitRate: 0
    };
  }

  /**
   * Obter estatísticas detalhadas
   */
  getStats() {
    const entries = Array.from(this.cache.entries());
    const now = Date.now();

    return {
      size: this.cache.size,
      maxSize: this.MAX_CACHE_SIZE,
      metrics: this.metrics,
      entries: entries.map(([key, entry]) => ({
        key,
        age: now - entry.timestamp,
        ttl: entry.ttl,
        hits: entry.hits,
        expired: (now - entry.timestamp) > entry.ttl
      }))
    };
  }

  /**
   * Atualizar taxa de acerto
   */
  private updateHitRate(): void {
    const total = this.metrics.hits + this.metrics.misses;
    this.metrics.hitRate = total > 0 ? (this.metrics.hits / total) * 100 : 0;
  }

  /**
   * Remover entrada menos usada (LRU)
   */
  private evictLeastUsed(): void {
    let minHits = Infinity;
    let keyToEvict: string | null = null;

    for (const [key, entry] of this.cache.entries()) {
      if (entry.hits < minHits) {
        minHits = entry.hits;
        keyToEvict = key;
      }
    }

    if (keyToEvict) {
      this.cache.delete(keyToEvict);
      this.metrics.invalidations++;
    }
  }

  /**
   * Tarefa de limpeza automática
   */
  private startCleanupTask(): void {
    // Limpar cache expirado a cada 5 segundos
    this.cleanupInterval = setInterval(() => {
      this.invalidateExpired();
    }, 5000);
  }

  /**
   * Parar tarefa de limpeza
   */
  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    this.clear();
  }
}

// Singleton
export const oddsCacheService = new OddsCacheService();
