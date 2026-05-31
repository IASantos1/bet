/**
 * 🎯 Cache Especializado para Tabelas de Campeonato
 * TTL: 5-10 minutos
 * Persistência em IndexedDB
 */

import { cacheManager, CacheStrategy } from './cacheManager';

interface StandingTeam {
  rank: number;
  team: {
    id: number;
    name: string;
    logo: string;
  };
  points: number;
  played: number;
  win: number;
  draw: number;
  lose: number;
  goalsFor: number;
  goalsAgainst: number;
  goalsDiff: number;
}

interface StandingsData {
  leagueId: number;
  leagueName: string;
  season: number;
  standings: StandingTeam[];
  lastUpdate: number;
}

class StandingsCacheService {
  private readonly CACHE_PREFIX = 'standings:';
  private readonly strategy = CacheStrategy.STANDINGS;

  /**
   * 🔍 Obter tabela de um campeonato
   */
  async getStandings(leagueId: number, season: number): Promise<StandingsData | null> {
    const key = `${this.CACHE_PREFIX}${leagueId}:${season}`;
    return await cacheManager.get<StandingsData>(key, this.strategy);
  }

  /**
   * 💾 Salvar tabela de um campeonato
   */
  async setStandings(data: StandingsData): Promise<void> {
    const key = `${this.CACHE_PREFIX}${data.leagueId}:${data.season}`;
    await cacheManager.set(key, data, this.strategy);
  }

  /**
   * 🔄 Atualizar tabela
   */
  async updateStandings(
    leagueId: number,
    season: number,
    updater: (standings: StandingsData) => StandingsData
  ): Promise<void> {
    const key = `${this.CACHE_PREFIX}${leagueId}:${season}`;
    await cacheManager.update(key, updater, this.strategy);
  }

  /**
   * 🗑️ Invalidar tabela
   */
  async invalidateStandings(leagueId: number, season: number): Promise<void> {
    const key = `${this.CACHE_PREFIX}${leagueId}:${season}`;
    await cacheManager.invalidate(key, this.strategy);
  }

  /**
   * 🧹 Limpar todas as tabelas
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

export const standingsCacheService = new StandingsCacheService();

// ✅ Exportar também como standingsCache para compatibilidade
export const standingsCache = standingsCacheService;
export default standingsCacheService;
