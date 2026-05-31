/**
 * 🚀 Sistema de Cache Multi-Camada com TTL Inteligente
 * 
 * Estratégias de TTL:
 * - Odds ao vivo: 1-3 segundos
 * - Jogos do dia: 10-30 segundos
 * - Tabelas de campeonato: 5-10 minutos
 * - Conteúdo estático: 1-24 horas
 * 
 * Separação de dados:
 * - Dados "quentes" (odds, eventos): Cache agressivo
 * - Dados "críticos" (saldo, apostas): NUNCA em cache
 */

export enum CacheStrategy {
  LIVE_ODDS = 'live_odds',           // TTL: 1-3 segundos
  DAILY_MATCHES = 'daily_matches',   // TTL: 10-30 segundos
  STANDINGS = 'standings',           // TTL: 5-10 minutos
  STATIC_CONTENT = 'static_content', // TTL: 1-24 horas
  NO_CACHE = 'no_cache'              // Dados críticos
}

interface CacheConfig {
  ttl: number;           // Time to live em milissegundos
  maxSize: number;       // Tamanho máximo do cache
  persistToIndexedDB: boolean;
  broadcastUpdates: boolean;
}

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  expiresAt: number;
  strategy: CacheStrategy;
  version: number;
}

interface CacheMetrics {
  hits: number;
  misses: number;
  evictions: number;
  lastUpdate: number;
}

const CACHE_CONFIGS: Record<CacheStrategy, CacheConfig> = {
  [CacheStrategy.LIVE_ODDS]: {
    ttl: 2000,              // 2 segundos
    maxSize: 1000,
    persistToIndexedDB: false,
    broadcastUpdates: true
  },
  [CacheStrategy.DAILY_MATCHES]: {
    ttl: 20000,             // 20 segundos
    maxSize: 500,
    persistToIndexedDB: true,
    broadcastUpdates: true
  },
  [CacheStrategy.STANDINGS]: {
    ttl: 300000,            // 5 minutos
    maxSize: 200,
    persistToIndexedDB: true,
    broadcastUpdates: false
  },
  [CacheStrategy.STATIC_CONTENT]: {
    ttl: 3600000,           // 1 hora
    maxSize: 100,
    persistToIndexedDB: true,
    broadcastUpdates: false
  },
  [CacheStrategy.NO_CACHE]: {
    ttl: 0,
    maxSize: 0,
    persistToIndexedDB: false,
    broadcastUpdates: false
  }
};

class CacheManager {
  private memoryCache: Map<string, CacheEntry<any>>;
  private metrics: Map<CacheStrategy, CacheMetrics>;
  private broadcastChannel: BroadcastChannel | null;
  private dbName = 'sportsbook_cache';
  private dbVersion = 1;
  private db: IDBDatabase | null = null;

  constructor() {
    this.memoryCache = new Map();
    this.metrics = new Map();
    this.broadcastChannel = null;
    this.initializeBroadcastChannel();
    this.initializeIndexedDB();
    this.startCleanupInterval();
    this.initializeMetrics();
  }

  /**
   * 📡 Inicializar BroadcastChannel para sincronização entre abas
   */
  private initializeBroadcastChannel(): void {
    try {
      this.broadcastChannel = new BroadcastChannel('cache_sync');
      this.broadcastChannel.onmessage = (event) => {
        const { action, key, data, strategy: _strategy } = event.data;
        
        if (action === 'update') {
          this.memoryCache.set(key, data);
        } else if (action === 'invalidate') {
          this.memoryCache.delete(key);
        }
      };
    } catch (error) {
      console.warn('BroadcastChannel não suportado:', error);
    }
  }

  /**
   * 💾 Inicializar IndexedDB para persistência
   */
  private async initializeIndexedDB(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.dbVersion);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        
        if (!db.objectStoreNames.contains('cache')) {
          const store = db.createObjectStore('cache', { keyPath: 'key' });
          store.createIndex('strategy', 'strategy', { unique: false });
          store.createIndex('expiresAt', 'expiresAt', { unique: false });
        }
      };
    });
  }

  /**
   * 📊 Inicializar métricas
   */
  private initializeMetrics(): void {
    Object.values(CacheStrategy).forEach(strategy => {
      this.metrics.set(strategy, {
        hits: 0,
        misses: 0,
        evictions: 0,
        lastUpdate: Date.now()
      });
    });
  }

  /**
   * 🔍 Obter dados do cache
   */
  async get<T>(key: string, strategy: CacheStrategy): Promise<T | null> {
    // Dados críticos NUNCA são cacheados
    if (strategy === CacheStrategy.NO_CACHE) {
      this.recordMiss(strategy);
      return null;
    }

    // Verificar cache em memória
    const cached = this.memoryCache.get(key);
    
    if (cached && cached.expiresAt > Date.now()) {
      this.recordHit(strategy);
      return cached.data as T;
    }

    // Se expirou, remover da memória
    if (cached) {
      this.memoryCache.delete(key);
    }

    // Verificar IndexedDB se configurado
    const config = CACHE_CONFIGS[strategy];
    if (config.persistToIndexedDB) {
      const persistedData = await this.getFromIndexedDB<T>(key);
      if (persistedData) {
        // Restaurar para memória
        this.memoryCache.set(key, persistedData);
        this.recordHit(strategy);
        return persistedData.data;
      }
    }

    this.recordMiss(strategy);
    return null;
  }

  /**
   * 💾 Salvar dados no cache
   */
  async set<T>(key: string, data: T, strategy: CacheStrategy): Promise<void> {
    // Dados críticos NUNCA são cacheados
    if (strategy === CacheStrategy.NO_CACHE) {
      return;
    }

    const config = CACHE_CONFIGS[strategy];
    const now = Date.now();
    
    const entry: CacheEntry<T> = {
      data,
      timestamp: now,
      expiresAt: now + config.ttl,
      strategy,
      version: 1
    };

    // Salvar em memória
    this.memoryCache.set(key, entry);

    // Verificar limite de tamanho
    if (this.memoryCache.size > config.maxSize) {
      this.evictOldest(strategy);
    }

    // Persistir no IndexedDB se configurado
    if (config.persistToIndexedDB) {
      await this.saveToIndexedDB(key, entry);
    }

    // Broadcast para outras abas se configurado
    if (config.broadcastUpdates && this.broadcastChannel) {
      this.broadcastChannel.postMessage({
        action: 'update',
        key,
        data: entry,
        strategy
      });
    }

    // Atualizar métricas
    const metrics = this.metrics.get(strategy);
    if (metrics) {
      metrics.lastUpdate = now;
    }
  }

  /**
   * 🗑️ Invalidar cache
   */
  async invalidate(key: string, strategy?: CacheStrategy): Promise<void> {
    this.memoryCache.delete(key);

    if (this.db) {
      await this.deleteFromIndexedDB(key);
    }

    if (this.broadcastChannel) {
      this.broadcastChannel.postMessage({
        action: 'invalidate',
        key,
        strategy
      });
    }
  }

  /**
   * 🧹 Invalidar por estratégia
   */
  async invalidateByStrategy(strategy: CacheStrategy): Promise<void> {
    const keysToDelete: string[] = [];

    this.memoryCache.forEach((entry, key) => {
      if (entry.strategy === strategy) {
        keysToDelete.push(key);
      }
    });

    keysToDelete.forEach(key => this.memoryCache.delete(key));

    if (this.db) {
      await this.deleteByStrategyFromIndexedDB(strategy);
    }
  }

  /**
   * 🔄 Atualizar dados existentes
   */
  async update<T>(key: string, updater: (data: T) => T, strategy: CacheStrategy): Promise<void> {
    const cached = await this.get<T>(key, strategy);
    if (cached) {
      const updated = updater(cached);
      await this.set(key, updated, strategy);
    }
  }

  /**
   * 💾 Salvar no IndexedDB
   */
  private async saveToIndexedDB<T>(key: string, entry: CacheEntry<T>): Promise<void> {
    if (!this.db) return;

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['cache'], 'readwrite');
      const store = transaction.objectStore('cache');
      
      const request = store.put({ key, ...entry });
      
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * 🔍 Obter do IndexedDB
   */
  private async getFromIndexedDB<T>(key: string): Promise<CacheEntry<T> | null> {
    if (!this.db) return null;

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['cache'], 'readonly');
      const store = transaction.objectStore('cache');
      
      const request = store.get(key);
      
      request.onsuccess = () => {
        const result = request.result;
        if (result && result.expiresAt > Date.now()) {
          resolve(result as CacheEntry<T>);
        } else {
          resolve(null);
        }
      };
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * 🗑️ Deletar do IndexedDB
   */
  private async deleteFromIndexedDB(key: string): Promise<void> {
    if (!this.db) return;

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['cache'], 'readwrite');
      const store = transaction.objectStore('cache');
      
      const request = store.delete(key);
      
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * 🗑️ Deletar por estratégia do IndexedDB
   */
  private async deleteByStrategyFromIndexedDB(strategy: CacheStrategy): Promise<void> {
    if (!this.db) return;

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['cache'], 'readwrite');
      const store = transaction.objectStore('cache');
      const index = store.index('strategy');
      
      const request = index.openCursor(IDBKeyRange.only(strategy));
      
      request.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest).result;
        if (cursor) {
          cursor.delete();
          cursor.continue();
        } else {
          resolve();
        }
      };
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * 🧹 Remover entradas mais antigas
   */
  private evictOldest(strategy: CacheStrategy): void {
    const entries = Array.from(this.memoryCache.entries())
      .filter(([_, entry]) => entry.strategy === strategy)
      .sort((a, b) => a[1].timestamp - b[1].timestamp);

    if (entries.length > 0) {
      const [oldestKey] = entries[0];
      this.memoryCache.delete(oldestKey);
      
      const metrics = this.metrics.get(strategy);
      if (metrics) {
        metrics.evictions++;
      }
    }
  }

  /**
   * 🧹 Limpeza automática de entradas expiradas
   */
  private startCleanupInterval(): void {
    setInterval(() => {
      const now = Date.now();
      const keysToDelete: string[] = [];

      this.memoryCache.forEach((entry, key) => {
        if (entry.expiresAt < now) {
          keysToDelete.push(key);
        }
      });

      keysToDelete.forEach(key => this.memoryCache.delete(key));

      // Limpar IndexedDB também
      this.cleanupIndexedDB();
    }, 10000); // A cada 10 segundos
  }

  /**
   * 🧹 Limpar IndexedDB de entradas expiradas
   */
  private async cleanupIndexedDB(): Promise<void> {
    if (!this.db) return;

    const now = Date.now();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['cache'], 'readwrite');
      const store = transaction.objectStore('cache');
      const index = store.index('expiresAt');
      
      const request = index.openCursor(IDBKeyRange.upperBound(now));
      
      request.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest).result;
        if (cursor) {
          cursor.delete();
          cursor.continue();
        } else {
          resolve();
        }
      };
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * 📊 Registrar hit
   */
  private recordHit(strategy: CacheStrategy): void {
    const metrics = this.metrics.get(strategy);
    if (metrics) {
      metrics.hits++;
    }
  }

  /**
   * 📊 Registrar miss
   */
  private recordMiss(strategy: CacheStrategy): void {
    const metrics = this.metrics.get(strategy);
    if (metrics) {
      metrics.misses++;
    }
  }

  /**
   * 📊 Obter métricas
   */
  getMetrics(strategy?: CacheStrategy): Map<CacheStrategy, CacheMetrics> | CacheMetrics | null {
    if (strategy) {
      return this.metrics.get(strategy) || null;
    }
    return this.metrics;
  }

  /**
   * 📊 Obter taxa de hit
   */
  getHitRate(strategy: CacheStrategy): number {
    const metrics = this.metrics.get(strategy);
    if (!metrics) return 0;

    const total = metrics.hits + metrics.misses;
    return total > 0 ? (metrics.hits / total) * 100 : 0;
  }

  /**
   * 🧹 Limpar todo o cache
   */
  async clearAll(): Promise<void> {
    this.memoryCache.clear();
    
    if (this.db) {
      return new Promise((resolve, reject) => {
        const transaction = this.db!.transaction(['cache'], 'readwrite');
        const store = transaction.objectStore('cache');
        
        const request = store.clear();
        
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
    }
  }

  /**
   * 📊 Obter estatísticas do cache
   */
  getStats() {
    const stats: Record<string, any> = {
      memorySize: this.memoryCache.size,
      strategies: {}
    };

    Object.values(CacheStrategy).forEach(strategy => {
      const metrics = this.metrics.get(strategy);
      if (metrics) {
        stats.strategies[strategy] = {
          hits: metrics.hits,
          misses: metrics.misses,
          evictions: metrics.evictions,
          hitRate: this.getHitRate(strategy).toFixed(2) + '%',
          lastUpdate: new Date(metrics.lastUpdate).toISOString()
        };
      }
    });

    return stats;
  }
}

// Singleton instance
export const cacheManager = new CacheManager();
