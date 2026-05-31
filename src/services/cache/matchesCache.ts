/**
 * 🎯 Cache Especializado para Jogos do Dia
 * TTL: 10-30 segundos
 * Persistência em IndexedDB
 */

import { cacheManager, CacheStrategy } from './cacheManager';

interface MatchData {
  fixtureId: number;
  homeTeam: string;
  awayTeam: string;
  league: string;
  date: string;
  status: string;
  score?: {
    home: number;
    away: number;
  };
  lastUpdate: number;
}

interface DailyMatchesCache {
  date: string;
  matches: MatchData[];
  lastUpdate: number;
}

class MatchesCacheService {
  private readonly CACHE_PREFIX = 'matches:';
  private readonly strategy = CacheStrategy.DAILY_MATCHES;

  /**
   * 🔍 Obter jogos de uma data
   */
  async getMatches(date: string): Promise<DailyMatchesCache | null> {
    const key = `${this.CACHE_PREFIX}${date}`;
    return await cacheManager.get<DailyMatchesCache>(key, this.strategy);
  }

  /**
   * 💾 Salvar jogos de uma data
   */
  async setMatches(date: string, matches: MatchData[]): Promise<void> {
    const key = `${this.CACHE_PREFIX}${date}`;
    const data: DailyMatchesCache = {
      date,
      matches,
      lastUpdate: Date.now()
    };
    await cacheManager.set(key, data, this.strategy);
  }

  /**
   * 🔍 Obter jogo específico
   */
  async getMatch(fixtureId: number): Promise<MatchData | null> {
    const key = `${this.CACHE_PREFIX}match:${fixtureId}`;
    return await cacheManager.get<MatchData>(key, this.strategy);
  }

  /**
   * 💾 Salvar jogo específico
   */
  async setMatch(match: MatchData): Promise<void> {
    const key = `${this.CACHE_PREFIX}match:${match.fixtureId}`;
    await cacheManager.set(key, match, this.strategy);
  }

  /**
   * 🔄 Atualizar jogo específico
   */
  async updateMatch(
    fixtureId: number,
    updater: (match: MatchData) => MatchData
  ): Promise<void> {
    const key = `${this.CACHE_PREFIX}match:${fixtureId}`;
    await cacheManager.update(key, updater, this.strategy);
  }

  /**
   * 🗑️ Invalidar jogos de uma data
   */
  async invalidateMatches(date: string): Promise<void> {
    const key = `${this.CACHE_PREFIX}${date}`;
    await cacheManager.invalidate(key, this.strategy);
  }

  /**
   * 🧹 Limpar todos os jogos
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

export const matchesCacheService = new MatchesCacheService();
