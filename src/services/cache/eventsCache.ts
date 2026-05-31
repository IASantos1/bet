/**
 * 🏆 Serviço de Cache de Eventos
 * TTL: 10-30 segundos (jogos do dia)
 * Prioridade: MÉDIA
 * Isolamento: Independente de odds e utilizador
 */

interface EventsCacheEntry {
  data: any;
  timestamp: number;
  ttl: number;
  hits: number;
  type: 'live' | 'upcoming' | 'standings' | 'statistics';
}

interface EventsCacheMetrics {
  hits: number;
  misses: number;
  invalidations: number;
  lastUpdate: number;
  hitRate: number;
  byType: {
    live: number;
    upcoming: number;
    standings: number;
    statistics: number;
  };
}

class EventsCacheService {
  private cache: Map<string, EventsCacheEntry> = new Map();
  private metrics: EventsCacheMetrics = {
    hits: 0,
    misses: 0,
    invalidations: 0,
    lastUpdate: Date.now(),
    hitRate: 0,
    byType: {
      live: 0,
      upcoming: 0,
      standings: 0,
      statistics: 0
    }
  };

  private readonly TTL_CONFIG = {
    live: 10000,        // 10 segundos - eventos ao vivo
    upcoming: 30000,    // 30 segundos - jogos futuros
    standings: 300000,  // 5 minutos - tabelas
    statistics: 600000  // 10 minutos - estatísticas
  };

  private readonly MAX_CACHE_SIZE = 500;
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor() {
    this.startCleanupTask();
  }

  /**
   * Obter evento do cache
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
    this.metrics.byType[entry.type]++;
    this.updateHitRate();
    
    return entry.data;
  }

  /**
   * Armazenar evento no cache
   */
  set(
    key: string, 
    data: any, 
    type: 'live' | 'upcoming' | 'standings' | 'statistics' = 'upcoming'
  ): void {
    // Limitar tamanho do cache
    if (this.cache.size >= this.MAX_CACHE_SIZE) {
      this.evictLeastUsed();
    }

    const ttl = this.TTL_CONFIG[type];

    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      ttl,
      hits: 0,
      type
    });

    this.metrics.lastUpdate = Date.now();
  }

  /**
   * Invalidar evento específico
   */
  invalidate(key: string): void {
    if (this.cache.delete(key)) {
      this.metrics.invalidations++;
    }
  }

  /**
   * Invalidar por tipo
   */
  invalidateByType(type: 'live' | 'upcoming' | 'standings' | 'statistics'): number {
    let count = 0;
    
    for (const [key, entry] of this.cache.entries()) {
      if (entry.type === type) {
        this.cache.delete(key);
        count++;
      }
    }

    this.metrics.invalidations += count;
    return count;
  }

  /**
   * Invalidar por padrão
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
   * Invalidar eventos expirados
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
  getMetrics(): EventsCacheMetrics {
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
      hitRate: 0,
      byType: {
        live: 0,
        upcoming: 0,
        standings: 0,
        statistics: 0
      }
    };
  }

  /**
   * Obter estatísticas detalhadas
   */
  getStats() {
    const entries = Array.from(this.cache.entries());
    const now = Date.now();

    const byType = {
      live: 0,
      upcoming: 0,
      standings: 0,
      statistics: 0
    };

    entries.forEach(([, entry]) => {
      byType[entry.type]++;
    });

    return {
      size: this.cache.size,
      maxSize: this.MAX_CACHE_SIZE,
      metrics: this.metrics,
      distribution: byType,
      entries: entries.map(([key, entry]) => ({
        key,
        type: entry.type,
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
    // Limpar cache expirado a cada 10 segundos
    this.cleanupInterval = setInterval(() => {
      this.invalidateExpired();
    }, 10000);
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
export const eventsCacheService = new EventsCacheService();
