/**
 * 🎯 Cache Especializado para Conteúdo Estático
 * TTL: 1-24 horas
 * Persistência em IndexedDB
 */

import { cacheManager, CacheStrategy } from './cacheManager';

interface StaticContent {
  key: string;
  data: any;
  lastUpdate: number;
}

class StaticContentCacheService {
  private readonly CACHE_PREFIX = 'static:';
  private readonly strategy = CacheStrategy.STATIC_CONTENT;

  /**
   * 🔍 Obter conteúdo estático
   */
  async get<T>(key: string): Promise<T | null> {
    const cacheKey = `${this.CACHE_PREFIX}${key}`;
    const cached = await cacheManager.get<StaticContent>(cacheKey, this.strategy);
    return cached ? cached.data : null;
  }

  /**
   * 💾 Salvar conteúdo estático
   */
  async set<T>(key: string, data: T): Promise<void> {
    const cacheKey = `${this.CACHE_PREFIX}${key}`;
    const content: StaticContent = {
      key,
      data,
      lastUpdate: Date.now()
    };
    await cacheManager.set(cacheKey, content, this.strategy);
  }

  /**
   * 🗑️ Invalidar conteúdo
   */
  async invalidate(key: string): Promise<void> {
    const cacheKey = `${this.CACHE_PREFIX}${key}`;
    await cacheManager.invalidate(cacheKey, this.strategy);
  }

  /**
   * 🧹 Limpar todo o conteúdo estático
   */
  async clearAll(): Promise<void> {
    await cacheManager.invalidateByStrategy(this.strategy);
  }

  /**
   * 📊 Obter métricas
   */
  getMetrics() {
    return cacheManager.getMetrics(this.strategy);
  }

  /**
   * 📊 Taxa de hit
   */
  getHitRate(): number {
    return cacheManager.getHitRate(this.strategy);
  }
}

export const staticContentCacheService = new StaticContentCacheService();
