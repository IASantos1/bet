/**
 * Sistema de Cache para APIs de Desportos
 * - Cache em 2 níveis (Memória + IndexedDB)
 * - Sincronização entre abas (BroadcastChannel)
 * - Pré-carregamento inteligente de dados populares
 * - Desduplicação de requisições simultâneas
 */

// ✅ CONFIGURAÇÃO OTIMIZADA PARA ECONOMIZAR CRÉDITOS API
export const CACHE_TTL = {
  // Jogos ao vivo - cache aumentado para reduzir requisições
  liveMatches: 30 * 1000,          // ✅ 30 SEGUNDOS (era 15s)
  liveOdds: 25 * 1000,             // ✅ 25 SEGUNDOS (era 10s)

  // Jogos próximos - cache aumentado
  upcomingMatches: 120 * 1000,     // ✅ 2 MINUTOS (era 1min)
  upcomingOdds: 90 * 1000,         // ✅ 90 SEGUNDOS (era 45s)

  // Dados estáticos - cache longo
  leagues: 24 * 60 * 60 * 1000,    // 24 horas
  teams: 24 * 60 * 60 * 1000,      // 24 horas
  sports: 24 * 60 * 60 * 1000,     // 24 horas
  
  // ✅ NOVO: Logos das equipas - cache muito longo
  teamLogos: 7 * 24 * 60 * 60 * 1000, // 7 dias

  // Odds por prioridade de mercado
  oddsPrimary: 30 * 1000,          // ✅ 30 SEGUNDOS (era 15s)
  oddsSecondary: 60 * 1000,        // ✅ 60 SEGUNDOS (era 30s)
  oddsSpecial: 120 * 1000,         // ✅ 2 MINUTOS (era 60s)

  // Pré-jogo (multiplicadores aplicados ao TTL base)
  preMatchMultiplier: {
    farAway: 20,      // ✅ 20x (era 10x)
    medium: 10,       // ✅ 10x (era 5x)
    close: 5,         // ✅ 5x (era 2x)
    imminent: 2       // ✅ 2x (era 1x)
  }
};

// Interface para item de cache
interface CacheItem<T> {
  data: T;
  timestamp: number;
  ttl: number;
  key: string;
}

// Mensagem de sincronização entre abas
interface CacheSyncMessage {
  type: 'cache_update' | 'cache_invalidate' | 'cache_clear' | 'cache_invalidate_prefix';
  key?: string;
  prefix?: string;
  item?: CacheItem<any>;
  tabId: string;
}

// Registo de popularidade para pré-carregamento
interface PopularityEntry {
  key: string;
  fetchFn: (() => Promise<any>) | null;
  ttl: number;
  accessCount: number;
  lastAccess: number;
  options?: { startTime?: string; isLive?: boolean };
}

// Cache em memória para acesso ultra-rápido
const memoryCache = new Map<string, CacheItem<any>>();

// Nome do banco IndexedDB
const DB_NAME = 'bet62_api_cache';
const DB_VERSION = 1;
const STORE_NAME = 'cache_store';

// Instância do banco
let dbInstance: IDBDatabase | null = null;

// ============================================================
// IndexedDB helpers
// ============================================================

async function initDB(): Promise<IDBDatabase> {
  if (dbInstance) return dbInstance;

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => {
      console.error('❌ Erro ao abrir IndexedDB:', request.error);
      reject(request.error);
    };

    request.onsuccess = () => {
      dbInstance = request.result;
      resolve(dbInstance);
    };

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'key' });
        store.createIndex('timestamp', 'timestamp', { unique: false });
      }
    };
  });
}

async function saveToIndexedDB<T>(item: CacheItem<T>): Promise<void> {
  try {
    const db = await initDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(item);
  } catch (e) {
    console.warn('⚠️ Erro ao salvar no IndexedDB:', e);
  }
}

async function getFromIndexedDB<T>(key: string): Promise<CacheItem<T> | null> {
  try {
    const db = await initDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const req = tx.objectStore(STORE_NAME).get(key);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

async function removeFromIndexedDB(key: string): Promise<void> {
  try {
    const db = await initDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).delete(key);
  } catch (e) {
    console.warn('⚠️ Erro ao remover do IndexedDB:', e);
  }
}

async function cleanExpiredCache(): Promise<void> {
  try {
    const db = await initDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const request = store.index('timestamp').openCursor();
    const now = Date.now();

    request.onsuccess = (event) => {
      const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
      if (cursor) {
        const item = cursor.value as CacheItem<any>;
        if (now - item.timestamp > item.ttl) {
          cursor.delete();
        }
        cursor.continue();
      }
    };
  } catch (e) {
    console.warn('⚠️ Erro ao limpar cache expirado:', e);
  }
}

// ============================================================
// Utilidades
// ============================================================

function isExpired<T>(item: CacheItem<T>): boolean {
  return Date.now() - item.timestamp > item.ttl;
}

export function generateCacheKey(prefix: string, params?: Record<string, any>): string {
  if (!params) return prefix;
  const sortedParams = Object.keys(params)
    .sort()
    .map(key => `${key}=${params[key]}`)
    .join('&');
  return `${prefix}:${sortedParams}`;
}

export function calculateDynamicTTL(
  baseTTL: number,
  startTime?: string,
  isLive: boolean = false
): number {
  if (isLive) return baseTTL;
  if (!startTime) return baseTTL * CACHE_TTL.preMatchMultiplier.medium;

  const now = Date.now();
  const matchTime = new Date(startTime).getTime();
  const hoursUntilMatch = (matchTime - now) / (1000 * 60 * 60);

  if (hoursUntilMatch <= 0.5) return baseTTL * CACHE_TTL.preMatchMultiplier.imminent;
  if (hoursUntilMatch <= 2) return baseTTL * CACHE_TTL.preMatchMultiplier.close;
  if (hoursUntilMatch <= 6) return baseTTL * CACHE_TTL.preMatchMultiplier.medium;
  return baseTTL * CACHE_TTL.preMatchMultiplier.farAway;
}

// ============================================================
// Classe principal do sistema de cache
// ============================================================

export class ApiCache {
  private static instance: ApiCache;

  // Estatísticas
  private requestsAvoided = 0;
  private totalRequests = 0;
  private cacheHits = 0;
  private cacheMisses = 0;
  private deduplicatedRequests = 0;
  private crossTabSyncs = 0;
  private preloadedItems = 0;

  // Sincronização entre abas
  private broadcastChannel: BroadcastChannel | null = null;
  private tabId: string;

  // Desduplicação de requisições
  private inflightRequests = new Map<string, Promise<any>>();

  // Pré-carregamento inteligente
  private popularityMap = new Map<string, PopularityEntry>();
  private preloadInterval: ReturnType<typeof setInterval> | null = null;

  // Listeners para notificações de sync
  private syncListeners: Array<(msg: CacheSyncMessage) => void> = [];

  private constructor() {
    this.tabId = `tab_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    // Inicializar BroadcastChannel para sincronização entre abas
    this.initBroadcastChannel();

    // Limpar cache expirado periodicamente
    setInterval(() => {
      this.cleanMemoryCache();
      cleanExpiredCache();
    }, 60 * 1000);

    // ✅ DESATIVADO: Pré-carregamento automático (economizar créditos)
    // this.startPreloadScheduler();

    // Inicializar IndexedDB
    initDB().catch(console.error);
    
    console.log('✅ Cache otimizado para economia de créditos API');
  }

  static getInstance(): ApiCache {
    if (!ApiCache.instance) {
      ApiCache.instance = new ApiCache();
    }
    return ApiCache.instance;
  }

  // ============================================================
  // 1. SINCRONIZAÇÃO ENTRE ABAS (BroadcastChannel)
  // ============================================================

  private initBroadcastChannel(): void {
    try {
      this.broadcastChannel = new BroadcastChannel('bet62_cache_sync');

      this.broadcastChannel.onmessage = (event: MessageEvent<CacheSyncMessage>) => {
        const msg = event.data;
        // Ignorar mensagens da própria aba
        if (msg.tabId === this.tabId) return;

        this.handleSyncMessage(msg);
      };
    } catch {
      console.warn('⚠️ BroadcastChannel não suportado — sincronização entre abas desativada');
    }
  }

  private handleSyncMessage(msg: CacheSyncMessage): void {
    this.crossTabSyncs++;

    switch (msg.type) {
      case 'cache_update':
        if (msg.item) {
          // Atualizar cache em memória com dados de outra aba
          memoryCache.set(msg.item.key, msg.item);
        }
        break;

      case 'cache_invalidate':
        if (msg.key) {
          memoryCache.delete(msg.key);
        }
        break;

      case 'cache_invalidate_prefix':
        if (msg.prefix) {
          for (const key of memoryCache.keys()) {
            if (key.startsWith(msg.prefix)) {
              memoryCache.delete(key);
            }
          }
        }
        break;

      case 'cache_clear':
        memoryCache.clear();
        break;
    }

    // Notificar listeners
    this.syncListeners.forEach(fn => {
      try { fn(msg); } catch { /* ignore */ }
    });
  }

  private broadcastSync(msg: Omit<CacheSyncMessage, 'tabId'>): void {
    if (!this.broadcastChannel) return;
    try {
      this.broadcastChannel.postMessage({ ...msg, tabId: this.tabId } as CacheSyncMessage);
    } catch {
      // Canal pode estar fechado
    }
  }

  /** Registar listener para eventos de sincronização */
  onSync(listener: (msg: CacheSyncMessage) => void): () => void {
    this.syncListeners.push(listener);
    return () => {
      this.syncListeners = this.syncListeners.filter(fn => fn !== listener);
    };
  }

  // ============================================================
  // 2. DESDUPLICAÇÃO DE REQUISIÇÕES SIMULTÂNEAS
  // ============================================================

  /**
   * Se já existe uma requisição em voo para a mesma chave,
   * reutiliza a Promise existente em vez de disparar outra.
   */
  private async deduplicatedFetch<T>(key: string, fetchFn: () => Promise<T>): Promise<T> {
    // Verificar se já existe requisição em voo
    const existing = this.inflightRequests.get(key);
    if (existing) {
      this.deduplicatedRequests++;
      return existing as Promise<T>;
    }

    // Criar nova requisição e registar
    const promise = fetchFn().finally(() => {
      this.inflightRequests.delete(key);
    });

    this.inflightRequests.set(key, promise);
    return promise;
  }

  // ============================================================
  // 3. PRÉ-CARREGAMENTO INTELIGENTE
  // ============================================================

  /**
   * Regista acesso a uma chave para rastrear popularidade.
   * Chaves mais acedidas serão pré-carregadas automaticamente.
   */
  private trackPopularity(
    key: string,
    fetchFn: (() => Promise<any>) | null,
    ttl: number,
    options?: { startTime?: string; isLive?: boolean }
  ): void {
    const existing = this.popularityMap.get(key);
    if (existing) {
      existing.accessCount++;
      existing.lastAccess = Date.now();
      existing.fetchFn = fetchFn || existing.fetchFn;
      existing.ttl = ttl;
      existing.options = options;
    } else {
      this.popularityMap.set(key, {
        key,
        fetchFn,
        ttl,
        accessCount: 1,
        lastAccess: Date.now(),
        options
      });
    }
  }

  /**
   * Scheduler que pré-carrega dados populares antes de expirarem.
   * ✅ DESATIVADO POR PADRÃO - Economizar créditos API
   */
  private startPreloadScheduler(): void {
    if (this.preloadInterval) return;

    // ✅ Aumentado de 30s para 10 MINUTOS
    this.preloadInterval = setInterval(() => {
      this.runPreload();
    }, 10 * 60 * 1000); // ✅ 10 MINUTOS (era 30s)

    // Primeira execução após 5 minutos (dar tempo para dados iniciais)
    setTimeout(() => this.runPreload(), 5 * 60 * 1000); // ✅ 5 MINUTOS (era 10s)
    
    console.log('⚠️ Pré-carregamento ativado - pode aumentar uso de API');
  }

  private async runPreload(): Promise<void> {
    const now = Date.now();

    // Ordenar por popularidade (mais acedidos primeiro)
    const entries = Array.from(this.popularityMap.values())
      .filter(e => {
        // ✅ Só pré-carregar se foi acedido nos últimos 30 minutos (era 5min)
        if (now - e.lastAccess > 30 * 60 * 1000) return false;
        // Só pré-carregar se tem função de fetch
        if (!e.fetchFn) return false;
        // ✅ Só pré-carregar se foi acedido pelo menos 5 vezes (era 2)
        if (e.accessCount < 5) return false;
        return true;
      })
      .sort((a, b) => b.accessCount - a.accessCount)
      .slice(0, 5); // ✅ Máximo 5 itens por ciclo (era 10)

    for (const entry of entries) {
      const cached = memoryCache.get(entry.key);

      if (!cached) {
        // Não está em cache — pré-carregar
        await this.preloadEntry(entry);
        continue;
      }

      // ✅ Verificar se vai expirar em breve (dentro de 10% do TTL, era 20%)
      const timeLeft = cached.ttl - (now - cached.timestamp);
      const threshold = cached.ttl * 0.1;

      if (timeLeft > 0 && timeLeft <= threshold) {
        // Vai expirar em breve — pré-carregar em background
        await this.preloadEntry(entry);
      }
    }

    // ✅ Limpar entradas antigas do mapa de popularidade (> 1 hora sem acesso, era 10min)
    for (const [key, entry] of this.popularityMap.entries()) {
      if (now - entry.lastAccess > 60 * 60 * 1000) {
        this.popularityMap.delete(key);
      }
    }
  }

  private async preloadEntry(entry: PopularityEntry): Promise<void> {
    if (!entry.fetchFn) return;

    try {
      const data = await this.deduplicatedFetch(entry.key, entry.fetchFn);
      const dynamicTTL = calculateDynamicTTL(
        entry.ttl,
        entry.options?.startTime,
        entry.options?.isLive
      );

      const cacheItem: CacheItem<any> = {
        key: entry.key,
        data,
        timestamp: Date.now(),
        ttl: dynamicTTL
      };

      memoryCache.set(entry.key, cacheItem);
      saveToIndexedDB(cacheItem).catch(() => {});

      // Sincronizar com outras abas
      this.broadcastSync({ type: 'cache_update', item: cacheItem });

      this.preloadedItems++;
    } catch {
      // Falha silenciosa no pré-carregamento
    }
  }

  /** Forçar pré-carregamento de chaves específicas */
  async preloadKeys(keys: Array<{ key: string; fetchFn: () => Promise<any>; ttl: number }>): Promise<void> {
    const promises = keys.map(async ({ key, fetchFn, ttl }) => {
      const cached = memoryCache.get(key);
      if (cached && !isExpired(cached)) return; // Já em cache válido

      try {
        const data = await this.deduplicatedFetch(key, fetchFn);
        const cacheItem: CacheItem<any> = { key, data, timestamp: Date.now(), ttl };
        memoryCache.set(key, cacheItem);
        saveToIndexedDB(cacheItem).catch(() => {});
        this.broadcastSync({ type: 'cache_update', item: cacheItem });
        this.preloadedItems++;
      } catch { /* ignore */ }
    });

    await Promise.allSettled(promises);
  }

  // ============================================================
  // Cache principal (get / invalidate / clear)
  // ============================================================

  private cleanMemoryCache(): void {
    const now = Date.now();
    let cleaned = 0;

    for (const [key, item] of memoryCache.entries()) {
      if (now - item.timestamp > item.ttl) {
        memoryCache.delete(key);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      console.log(`🧹 Cache limpo: ${cleaned} itens removidos`);
    }
  }

  /**
   * Busca dados do cache ou executa a função de fetch.
   * Inclui desduplicação automática e rastreio de popularidade.
   */
  async get<T>(
    key: string,
    fetchFn: () => Promise<T>,
    ttl: number,
    options?: {
      forceRefresh?: boolean;
      startTime?: string;
      isLive?: boolean;
    }
  ): Promise<T> {
    // ✅ VALIDAÇÃO: Verificar se fetchFn é uma função válida
    if (typeof fetchFn !== 'function') {
      console.error('❌ fetchFn inválido:', fetchFn);
      throw new Error('fetchFn deve ser uma função');
    }

    this.totalRequests++;

    const dynamicTTL = calculateDynamicTTL(ttl, options?.startTime, options?.isLive);

    // Rastrear popularidade para pré-carregamento
    this.trackPopularity(key, fetchFn, ttl, {
      startTime: options?.startTime,
      isLive: options?.isLive
    });

    if (!options?.forceRefresh) {
      // 1. Cache em memória
      const memoryItem = memoryCache.get(key);
      if (memoryItem && !isExpired(memoryItem)) {
        this.cacheHits++;
        this.requestsAvoided++;
        return memoryItem.data as T;
      }

      // 2. IndexedDB
      const dbItem = await getFromIndexedDB<T>(key);
      if (dbItem && !isExpired(dbItem)) {
        this.cacheHits++;
        this.requestsAvoided++;
        memoryCache.set(key, dbItem);
        return dbItem.data;
      }
    }

    // 3. Cache miss — fetch com desduplicação
    this.cacheMisses++;

    try {
      const data = await this.deduplicatedFetch(key, fetchFn);

      const cacheItem: CacheItem<T> = {
        key,
        data,
        timestamp: Date.now(),
        ttl: dynamicTTL
      };

      memoryCache.set(key, cacheItem);
      saveToIndexedDB(cacheItem).catch(() => {});

      // Sincronizar com outras abas
      this.broadcastSync({ type: 'cache_update', item: cacheItem });

      return data;
    } catch (error) {
      // Fallback: dados stale
      const staleMemory = memoryCache.get(key);
      if (staleMemory) return staleMemory.data as T;

      const staleDB = await getFromIndexedDB<T>(key);
      if (staleDB) return staleDB.data;

      throw error;
    }
  }

  async invalidate(key: string): Promise<void> {
    memoryCache.delete(key);
    await removeFromIndexedDB(key);
    this.broadcastSync({ type: 'cache_invalidate', key });
  }

  async invalidateByPrefix(prefix: string): Promise<void> {
    for (const key of memoryCache.keys()) {
      if (key.startsWith(prefix)) {
        memoryCache.delete(key);
      }
    }

    try {
      const db = await initDB();
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const request = store.openCursor();

      request.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
        if (cursor) {
          if (cursor.key.toString().startsWith(prefix)) cursor.delete();
          cursor.continue();
        }
      };
    } catch { /* ignore */ }

    this.broadcastSync({ type: 'cache_invalidate_prefix', prefix });
  }

  async clearAll(): Promise<void> {
    memoryCache.clear();

    try {
      const db = await initDB();
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).clear();
    } catch { /* ignore */ }

    this.broadcastSync({ type: 'cache_clear' });
  }

  /**
   * Retorna todas as chaves atualmente em cache (memória)
   */
  keys(): string[] {
    return Array.from(memoryCache.keys());
  }

  /**
   * Remove uma chave específica do cache (memória + IndexedDB)
   */
  delete(key: string): void {
    this.invalidate(key).catch(() => {});
  }

  /**
   * Pré-carrega dados no cache (manual)
   */
  async preload<T>(key: string, data: T, ttl: number): Promise<void> {
    const cacheItem: CacheItem<T> = { key, data, timestamp: Date.now(), ttl };
    memoryCache.set(key, cacheItem);
    await saveToIndexedDB(cacheItem);
    this.broadcastSync({ type: 'cache_update', item: cacheItem });
  }

  // ============================================================
  // Estatísticas
  // ============================================================

  getStats() {
    const hitRate = this.totalRequests > 0
      ? ((this.cacheHits / this.totalRequests) * 100).toFixed(1)
      : '0';

    return {
      totalRequests: this.totalRequests,
      cacheHits: this.cacheHits,
      cacheMisses: this.cacheMisses,
      hitRate: `${hitRate}%`,
      requestsAvoided: this.requestsAvoided,
      memoryCacheSize: memoryCache.size,
      estimatedSavings: `~${this.requestsAvoided} requisições evitadas`,
      // Novas estatísticas
      deduplicatedRequests: this.deduplicatedRequests,
      crossTabSyncs: this.crossTabSyncs,
      preloadedItems: this.preloadedItems,
      inflightRequests: this.inflightRequests.size,
      trackedPopularKeys: this.popularityMap.size,
      tabId: this.tabId
    };
  }

  /** Retorna as chaves mais populares */
  getPopularKeys(limit = 10): Array<{ key: string; accessCount: number; lastAccess: number }> {
    return Array.from(this.popularityMap.values())
      .sort((a, b) => b.accessCount - a.accessCount)
      .slice(0, limit)
      .map(e => ({ key: e.key, accessCount: e.accessCount, lastAccess: e.lastAccess }));
  }

  /** Retorna chaves com requisições em voo */
  getInflightKeys(): string[] {
    return Array.from(this.inflightRequests.keys());
  }

  /** Destruir instância (para testes) */
  destroy(): void {
    if (this.broadcastChannel) {
      this.broadcastChannel.close();
      this.broadcastChannel = null;
    }
    if (this.preloadInterval) {
      clearInterval(this.preloadInterval);
      this.preloadInterval = null;
    }
    this.syncListeners = [];
  }
}

// Exportar instância singleton
export const apiCache = ApiCache.getInstance();

// Chaves de cache padronizadas
export const CACHE_KEYS = {
  LIVE_MATCHES: 'live_matches',
  LIVE_ODDS: 'live_odds',
  UPCOMING_MATCHES: 'upcoming_matches',
  UPCOMING_ODDS: 'upcoming_odds',
  LEAGUES: 'leagues',
  TEAMS: 'teams',
  SPORTS: 'sports',
  MATCH_DETAILS: (id: string) => `match_details:${id}`,
  MATCH_ODDS: (id: string) => `match_odds:${id}`,
  MATCH_STATS: (id: string) => `match_stats:${id}`,
  MATCH_INCIDENTS: (id: string) => `match_incidents:${id}`,
  SPORT_ODDS: (sport: string) => `sport_odds:${sport}`,
};
