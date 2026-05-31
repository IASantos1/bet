/**
 * 👤 Serviço de Cache de Utilizador
 * TTL: Variável (perfil, preferências, histórico)
 * Prioridade: CRÍTICA (dados sensíveis)
 * Isolamento: Nunca cachear saldo ou apostas confirmadas
 */

interface UserCacheEntry {
  data: any;
  timestamp: number;
  ttl: number;
  hits: number;
  type: 'profile' | 'preferences' | 'history' | 'stats';
  sensitive: boolean;
}

interface UserCacheMetrics {
  hits: number;
  misses: number;
  invalidations: number;
  lastUpdate: number;
  hitRate: number;
  byType: {
    profile: number;
    preferences: number;
    history: number;
    stats: number;
  };
}

class UserCacheService {
  private cache: Map<string, UserCacheEntry> = new Map();
  private metrics: UserCacheMetrics = {
    hits: 0,
    misses: 0,
    invalidations: 0,
    lastUpdate: Date.now(),
    hitRate: 0,
    byType: {
      profile: 0,
      preferences: 0,
      history: 0,
      stats: 0
    }
  };

  private readonly TTL_CONFIG = {
    profile: 60000,      // 1 minuto - dados do perfil
    preferences: 300000, // 5 minutos - preferências
    history: 30000,      // 30 segundos - histórico recente
    stats: 60000         // 1 minuto - estatísticas
  };

  // ⚠️ DADOS CRÍTICOS - NUNCA CACHEAR
  private readonly FORBIDDEN_KEYS = [
    'balance',
    'wallet',
    'confirmed_bets',
    'pending_bets',
    'transactions',
    'withdrawals',
    'deposits'
  ];

  private readonly MAX_CACHE_SIZE = 200;
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor() {
    this.startCleanupTask();
  }

  /**
   * Verificar se a chave é permitida para cache
   */
  private isAllowedKey(key: string): boolean {
    return !this.FORBIDDEN_KEYS.some(forbidden => key.includes(forbidden));
  }

  /**
   * Obter dados do utilizador do cache
   */
  get(key: string): any | null {
    // ⚠️ PROTEÇÃO: Nunca retornar dados críticos do cache
    if (!this.isAllowedKey(key)) {
      console.warn(`[UserCache] Tentativa de acesso a dados críticos: ${key}`);
      return null;
    }

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
   * Armazenar dados do utilizador no cache
   */
  set(
    key: string, 
    data: any, 
    type: 'profile' | 'preferences' | 'history' | 'stats' = 'profile',
    sensitive: boolean = false
  ): boolean {
    // ⚠️ PROTEÇÃO: Nunca cachear dados críticos
    if (!this.isAllowedKey(key)) {
      console.warn(`[UserCache] Bloqueado cache de dados críticos: ${key}`);
      return false;
    }

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
      type,
      sensitive
    });

    this.metrics.lastUpdate = Date.now();
    return true;
  }

  /**
   * Invalidar dados específicos do utilizador
   */
  invalidate(key: string): void {
    if (this.cache.delete(key)) {
      this.metrics.invalidations++;
    }
  }

  /**
   * Invalidar por tipo
   */
  invalidateByType(type: 'profile' | 'preferences' | 'history' | 'stats'): number {
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
   * Invalidar todos os dados de um utilizador
   */
  invalidateUser(userId: string): number {
    let count = 0;
    
    for (const key of this.cache.keys()) {
      if (key.includes(userId)) {
        this.cache.delete(key);
        count++;
      }
    }

    this.metrics.invalidations += count;
    return count;
  }

  /**
   * Invalidar dados sensíveis
   */
  invalidateSensitive(): number {
    let count = 0;
    
    for (const [key, entry] of this.cache.entries()) {
      if (entry.sensitive) {
        this.cache.delete(key);
        count++;
      }
    }

    this.metrics.invalidations += count;
    return count;
  }

  /**
   * Invalidar dados expirados
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
  getMetrics(): UserCacheMetrics {
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
        profile: 0,
        preferences: 0,
        history: 0,
        stats: 0
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
      profile: 0,
      preferences: 0,
      history: 0,
      stats: 0
    };

    let sensitiveCount = 0;

    entries.forEach(([, entry]) => {
      byType[entry.type]++;
      if (entry.sensitive) sensitiveCount++;
    });

    return {
      size: this.cache.size,
      maxSize: this.MAX_CACHE_SIZE,
      metrics: this.metrics,
      distribution: byType,
      sensitiveCount,
      forbiddenKeys: this.FORBIDDEN_KEYS,
      entries: entries.map(([key, entry]) => ({
        key: entry.sensitive ? '***' : key,
        type: entry.type,
        age: now - entry.timestamp,
        ttl: entry.ttl,
        hits: entry.hits,
        sensitive: entry.sensitive,
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
    // Limpar cache expirado a cada 15 segundos
    this.cleanupInterval = setInterval(() => {
      this.invalidateExpired();
    }, 15000);
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
export const userCacheService = new UserCacheService();
