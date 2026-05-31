/**
 * 🎭 Orquestrador de Cache Multi-Serviço
 * Coordena todos os serviços de cache e fornece métricas consolidadas
 */

import { oddsCacheService } from './oddsCache';
import { eventsCacheService } from './eventsCache';
import { userCacheService } from './userCache';

interface ConsolidatedMetrics {
  odds: any;
  events: any;
  user: any;
  overall: {
    totalHits: number;
    totalMisses: number;
    totalInvalidations: number;
    overallHitRate: number;
    totalCacheSize: number;
    lastUpdate: number;
  };
}

class CacheOrchestrator {
  /**
   * Obter métricas consolidadas de todos os serviços
   */
  getConsolidatedMetrics(): ConsolidatedMetrics {
    const oddsMetrics = oddsCacheService.getMetrics();
    const eventsMetrics = eventsCacheService.getMetrics();
    const userMetrics = userCacheService.getMetrics();

    const totalHits = oddsMetrics.hits + eventsMetrics.hits + userMetrics.hits;
    const totalMisses = oddsMetrics.misses + eventsMetrics.misses + userMetrics.misses;
    const totalInvalidations = 
      oddsMetrics.invalidations + 
      eventsMetrics.invalidations + 
      userMetrics.invalidations;

    const overallHitRate = 
      totalHits + totalMisses > 0 
        ? (totalHits / (totalHits + totalMisses)) * 100 
        : 0;

    const oddsStats = oddsCacheService.getStats();
    const eventsStats = eventsCacheService.getStats();
    const userStats = userCacheService.getStats();

    return {
      odds: oddsMetrics,
      events: eventsMetrics,
      user: userMetrics,
      overall: {
        totalHits,
        totalMisses,
        totalInvalidations,
        overallHitRate,
        totalCacheSize: oddsStats.size + eventsStats.size + userStats.size,
        lastUpdate: Math.max(
          oddsMetrics.lastUpdate,
          eventsMetrics.lastUpdate,
          userMetrics.lastUpdate
        )
      }
    };
  }

  /**
   * Obter estatísticas detalhadas de todos os serviços
   */
  getDetailedStats() {
    return {
      odds: oddsCacheService.getStats(),
      events: eventsCacheService.getStats(),
      user: userCacheService.getStats(),
      consolidated: this.getConsolidatedMetrics()
    };
  }

  /**
   * Invalidar cache por domínio
   */
  invalidateDomain(domain: 'odds' | 'events' | 'user'): void {
    switch (domain) {
      case 'odds':
        oddsCacheService.clear();
        break;
      case 'events':
        eventsCacheService.clear();
        break;
      case 'user':
        userCacheService.clear();
        break;
    }
  }

  /**
   * Invalidar todos os caches
   */
  invalidateAll(): void {
    oddsCacheService.clear();
    eventsCacheService.clear();
    userCacheService.clear();
  }

  /**
   * Resetar todas as métricas
   */
  resetAllMetrics(): void {
    oddsCacheService.resetMetrics();
    eventsCacheService.resetMetrics();
    userCacheService.resetMetrics();
  }

  /**
   * Limpar caches expirados de todos os serviços
   */
  cleanupExpired(): {
    odds: number;
    events: number;
    user: number;
    total: number;
  } {
    const oddsCleared = oddsCacheService.invalidateExpired();
    const eventsCleared = eventsCacheService.invalidateExpired();
    const userCleared = userCacheService.invalidateExpired();

    return {
      odds: oddsCleared,
      events: eventsCleared,
      user: userCleared,
      total: oddsCleared + eventsCleared + userCleared
    };
  }

  /**
   * Verificar saúde dos serviços de cache
   */
  healthCheck(): {
    odds: { healthy: boolean; hitRate: number; size: number };
    events: { healthy: boolean; hitRate: number; size: number };
    user: { healthy: boolean; hitRate: number; size: number };
    overall: { healthy: boolean; message: string };
  } {
    const oddsMetrics = oddsCacheService.getMetrics();
    const eventsMetrics = eventsCacheService.getMetrics();
    const userMetrics = userCacheService.getMetrics();

    const oddsStats = oddsCacheService.getStats();
    const eventsStats = eventsCacheService.getStats();
    const userStats = userCacheService.getStats();

    const oddsHealthy = oddsMetrics.hitRate > 50 && oddsStats.size < oddsStats.maxSize;
    const eventsHealthy = eventsMetrics.hitRate > 50 && eventsStats.size < eventsStats.maxSize;
    const userHealthy = userMetrics.hitRate > 50 && userStats.size < userStats.maxSize;

    const overallHealthy = oddsHealthy && eventsHealthy && userHealthy;

    return {
      odds: {
        healthy: oddsHealthy,
        hitRate: oddsMetrics.hitRate,
        size: oddsStats.size
      },
      events: {
        healthy: eventsHealthy,
        hitRate: eventsMetrics.hitRate,
        size: eventsStats.size
      },
      user: {
        healthy: userHealthy,
        hitRate: userMetrics.hitRate,
        size: userStats.size
      },
      overall: {
        healthy: overallHealthy,
        message: overallHealthy 
          ? 'Todos os serviços de cache estão saudáveis' 
          : 'Alguns serviços de cache precisam de atenção'
      }
    };
  }

  /**
   * Destruir todos os serviços
   */
  destroy(): void {
    oddsCacheService.destroy();
    eventsCacheService.destroy();
    userCacheService.destroy();
  }
}

// Singleton
export const cacheOrchestrator = new CacheOrchestrator();

// Exportar serviços individuais
export { oddsCacheService, eventsCacheService, userCacheService };
