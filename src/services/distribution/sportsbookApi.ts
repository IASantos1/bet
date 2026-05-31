
/**
 * 🚀 Sportsbook API
 * 
 * API principal consumida pelo frontend/app
 * Expõe odds híbridas, mercados, status e eventos
 * 
 * Endpoints:
 * - getOdds() - Odds pré-jogo e live
 * - getMarkets() - Mercados disponíveis
 * - getMarketStatus() - Status de mercados (ativo, pausado, suspenso)
 * - getLiveEvents() - Eventos ao vivo
 * - getMatchDetails() - Detalhes completos do jogo
 * - validateBet() - Valida aposta antes de aceitar
 */

import { hybridOddsEngine } from '../modeling/hybridOddsEngine';
import { exposureCalculator } from '../risk/exposureCalculator';
import { limitsManager } from '../risk/limitsManager';
import {
  getPausedMarketsForMatch,
  getPausedMarketInfo,
} from '../marketControl/pauseMarkets';
import { stakeLimiter } from '../marketControl/stakeLimiter';
async function getLiveEventsBySport(_sport: string): Promise<any[]> { return []; }
async function getFixtureById(_id: number): Promise<any> { return null; }
async function getAllLiveFixtures(): Promise<any[]> { return []; }
async function getAllUpcomingFixtures(): Promise<any[]> { return []; }
async function getStatisticsBySport(_sport: string, _fixtureId: number): Promise<any> { return null; }

// ============================================
// TIPOS
// ============================================

export interface OddsResponse {
  matchId: string;
  sport: string;
  league: string;
  homeTeam: string;
  awayTeam: string;
  startTime: string;
  isLive: boolean;
  status: 'scheduled' | 'live' | 'finished' | 'postponed' | 'cancelled';
  score?: {
    home: number;
    away: number;
  };
  elapsed?: number;
  markets: MarketOdds[];
  lastUpdate: string;
  delay?: number; // Delay em segundos (live)
}

export interface MarketOdds {
  marketId: string;
  marketType: string;
  marketName: string;
  status: 'active' | 'paused' | 'suspended' | 'closed';
  pauseReason?: string;
  outcomes: OutcomeOdds[];
  maxStake?: number;
  minStake?: number;
  lastUpdate: string;
}

export interface OutcomeOdds {
  outcomeId: string;
  outcomeName: string;
  odds: number;
  source: 'hybrid' | 'model' | 'market' | 'manual';
  confidence: number; // 0-100
  available: boolean;
  maxStake?: number;
}

export interface MarketStatusResponse {
  matchId: string;
  marketId: string;
  status: 'active' | 'paused' | 'suspended' | 'closed';
  reason?: string;
  pausedAt?: string;
  pausedBy?: string;
  resumeAt?: string;
  canBet: boolean;
}

export interface LiveEventResponse {
  matchId: string;
  events: Array<{
    id: string;
    type: 'goal' | 'red_card' | 'yellow_card' | 'penalty' | 'var' | 'substitution' | 'injury';
    team: 'home' | 'away';
    player?: string;
    minute: number;
    timestamp: string;
    impact: {
      marketsPaused: string[];
      oddsChanged: boolean;
      exposureImpact: number;
    };
  }>;
  lastUpdate: string;
}

export interface MatchDetailsResponse {
  matchId: string;
  sport: string;
  league: string;
  homeTeam: string;
  awayTeam: string;
  startTime: string;
  isLive: boolean;
  status: string;
  score?: { home: number; away: number };
  elapsed?: number;
  statistics?: any;
  events?: any[];
  markets: MarketOdds[];
  exposure: {
    current: number;
    limit: number;
    percentage: number;
    status: 'safe' | 'warning' | 'critical';
  };
  risk: {
    level: 'low' | 'medium' | 'high' | 'critical';
    indicators: string[];
  };
  lastUpdate: string;
}

export interface BetValidationRequest {
  matchId: string;
  marketId: string;
  outcomeId: string;
  stake: number;
  odds: number;
  userId: string;
}

export interface BetValidationResponse {
  valid: boolean;
  accepted: boolean;
  reason?: string;
  adjustedOdds?: number;
  adjustedStake?: number;
  maxStake?: number;
  warnings: string[];
  delay?: number; // Delay adicional se necessário
}

// ============================================
// SPORTSBOOK API
// ============================================

class SportsbookApi {
  private cache = new Map<string, { data: any; timestamp: number; ttl: number }>();
  private readonly CACHE_TTL_PREGAME = 30000; // 30s pré-jogo
  private readonly CACHE_TTL_LIVE = 5000; // 5s live
  private readonly LIVE_DELAY = 3000; // 3s delay em live

  /**
   * 📊 Obter odds de um jogo
   */
  async getOdds(matchId: string): Promise<OddsResponse | null> {
    try {
      // Verifica cache
      const cached = this.getFromCache(`odds_${matchId}`);
      if (cached) return cached;

      // Busca dados do jogo normalizados (API-Football)
      const fixture = await getFixtureById('football', matchId);
      if (!fixture) return null;

      const statusShort = fixture.status.short?.toUpperCase() || 'NS';
      const isLive =
        statusShort === 'LIVE' ||
        statusShort === '1H' ||
        statusShort === '2H' ||
        statusShort === 'ET';

      let status: OddsResponse['status'] = 'scheduled';
      if (['LIVE', '1H', '2H', 'ET', 'HT'].includes(statusShort)) {
        status = 'live';
      } else if (['FT', 'AET', 'PEN'].includes(statusShort)) {
        status = 'finished';
      } else if (['PST'].includes(statusShort)) {
        status = 'postponed';
      } else if (['CANC', 'ABD', 'WO'].includes(statusShort)) {
        status = 'cancelled';
      }

      // Busca odds híbridas
      const hybridOdds = await hybridOddsEngine.getHybridOdds(matchId);
      if (!hybridOdds) return null;

      // Busca status dos mercados
      const pausedMarkets = getPausedMarketsForMatch(matchId);

      // Busca limites de stake
      const stakeLimits = stakeLimiter.getStakeLimits(matchId);

      // Monta resposta
      const response: OddsResponse = {
        matchId,
        sport: fixture.sport,
        league: fixture.league.name,
        homeTeam: fixture.teams.home.name,
        awayTeam: fixture.teams.away.name,
        startTime: fixture.date,
        isLive,
        status,
        score: {
          home: fixture.score.home ?? 0,
          away: fixture.score.away ?? 0,
        },
        elapsed: fixture.status.elapsed ?? undefined,
        markets: this.buildMarkets(hybridOdds, pausedMarkets, stakeLimits),
        lastUpdate: new Date().toISOString(),
        delay: isLive ? this.LIVE_DELAY / 1000 : undefined,
      };

      // Cacheia
      const ttl = isLive ? this.CACHE_TTL_LIVE : this.CACHE_TTL_PREGAME;
      this.setCache(`odds_${matchId}`, response, ttl);

      return response;
    } catch (error) {
      console.error('❌ Erro ao obter odds:', error);
      return null;
    }
  }

  /**
   * 📋 Obter mercados disponíveis
   */
  async getMarkets(matchId: string): Promise<MarketOdds[]> {
    try {
      const odds = await this.getOdds(matchId);
      return odds?.markets || [];
    } catch (error) {
      console.error('❌ Erro ao obter mercados:', error);
      return [];
    }
  }

  /**
   * 🎛️ Obter status de um mercado
   */
  getMarketStatus(matchId: string, marketId: string): MarketStatusResponse {
    const pauseInfo = getPausedMarketInfo(matchId, marketId);

    if (!pauseInfo) {
      return {
        matchId,
        marketId,
        status: 'active',
        canBet: true,
      };
    }

    return {
      matchId,
      marketId,
      status: 'paused',
      reason: pauseInfo.reason,
      pausedAt: pauseInfo.pausedAt.toISOString(),
      pausedBy: 'system',
      resumeAt: pauseInfo.resumeAt ? pauseInfo.resumeAt.toISOString() : undefined,
      canBet: false,
    };
  }

  /**
   * ⚡ Obter eventos ao vivo
   */
  async getLiveEvents(matchId: string): Promise<LiveEventResponse | null> {
    try {
      const events = await getLiveEventsBySport('football', matchId);
      if (!events || events.length === 0) return null;

      // Busca impacto de cada evento
      const eventsWithImpact = events.map((event) => {
        const pausedMarkets = getPausedMarketsForMatch(matchId);
        const marketsPausedByEvent = pausedMarkets
          .filter((m) => m.reason?.includes(event.type))
          .map((m) => m.marketType);

        return {
          id: event.id,
          type: 'goal' as const,
          team: 'home' as const,
          player: event.player?.name,
          minute: event.time.elapsed,
          timestamp: new Date().toISOString(),
          impact: {
            marketsPaused: marketsPausedByEvent,
            oddsChanged: true, // Sempre muda após evento
            exposureImpact: 0, // TODO: calcular impacto real
          },
        };
      });

      return {
        matchId,
        events: eventsWithImpact,
        lastUpdate: new Date().toISOString(),
      };
    } catch (error) {
      console.error('❌ Erro ao obter eventos ao vivo:', error);
      return null;
    }
  }

  /**
   * 📖 Obter detalhes completos do jogo
   */
  async getMatchDetails(matchId: string): Promise<MatchDetailsResponse | null> {
    try {
      // Busca dados básicos
      const odds = await this.getOdds(matchId);
      if (!odds) return null;

      // Busca estatísticas
      const stats = await getStatisticsBySport('football', matchId);

      // Busca eventos
      const liveEvents = await this.getLiveEvents(matchId);

      // Busca exposição
      const matchExposure = exposureCalculator.getMatchExposure(matchId);

      // Calcula nível de risco
      const riskLevel = this.calculateRiskLevel(matchExposure);
      const riskIndicators = this.getRiskIndicators(matchId, matchExposure);

      const exposureSummary: MatchDetailsResponse['exposure'] = matchExposure
        ? {
            current: matchExposure.totalExposure,
            limit: matchExposure.limit,
            percentage: matchExposure.percentage,
            status:
              matchExposure.percentage >= 90
                ? 'critical'
                : matchExposure.percentage >= 70
                ? 'warning'
                : 'safe',
          }
        : {
            current: 0,
            limit: 0,
            percentage: 0,
            status: 'safe',
          };

      return {
        matchId,
        sport: odds.sport,
        league: odds.league,
        homeTeam: odds.homeTeam,
        awayTeam: odds.awayTeam,
        startTime: odds.startTime,
        isLive: odds.isLive,
        status: odds.status,
        score: odds.score,
        elapsed: odds.elapsed,
        statistics: stats,
        events: liveEvents?.events,
        markets: odds.markets,
        exposure: exposureSummary,
        risk: {
          level: riskLevel,
          indicators: riskIndicators,
        },
        lastUpdate: new Date().toISOString(),
      };
    } catch (error) {
      console.error('❌ Erro ao obter detalhes do jogo:', error);
      return null;
    }
  }

  /**
   * ✅ Validar aposta antes de aceitar
   */
  async validateBet(request: BetValidationRequest): Promise<BetValidationResponse> {
    const warnings: string[] = [];

    try {
      // 1. Verifica se mercado está ativo
      const marketStatus = this.getMarketStatus(request.matchId, request.marketId);
      if (!marketStatus.canBet) {
        return {
          valid: false,
          accepted: false,
          reason: `Mercado ${marketStatus.status}: ${marketStatus.reason || 'Indisponível'}`,
          warnings,
        };
      }

      // 2. Busca odds atuais
      const currentOdds = await this.getOdds(request.matchId);
      if (!currentOdds) {
        return {
          valid: false,
          accepted: false,
          reason: 'Jogo não encontrado',
          warnings,
        };
      }

      const market = currentOdds.markets.find((m) => m.marketId === request.marketId);
      if (!market) {
        return {
          valid: false,
          accepted: false,
          reason: 'Mercado não encontrado',
          warnings,
        };
      }

      const outcome = market.outcomes.find((o) => o.outcomeId === request.outcomeId);
      if (!outcome || !outcome.available) {
        return {
          valid: false,
          accepted: false,
          reason: 'Outcome não disponível',
          warnings,
        };
      }

      // 3. Verifica mudança de odds
      const oddsChanged = Math.abs(outcome.odds - request.odds) > 0.01;
      if (oddsChanged) {
        warnings.push(`Odds mudaram de ${request.odds.toFixed(2)} para ${outcome.odds.toFixed(2)}`);
      }

      // 4. Verifica limites de stake
      const stakeValidation = limitsManager.validateStake(
        request.matchId,
        request.marketId,
        request.stake
      );

      if (!stakeValidation.valid) {
        return {
          valid: false,
          accepted: false,
          reason: stakeValidation.reason,
          maxStake: stakeValidation.maxStake,
          warnings,
        };
      }

      if (stakeValidation.adjusted) {
        warnings.push(`Stake ajustada de €${request.stake} para €${stakeValidation.adjustedStake}`);
      }

      // 5. Verifica exposição
      const potentialPayout = (stakeValidation.adjustedStake || request.stake) * outcome.odds;
      const exposureCheck = exposureCalculator.checkExposureLimit(request.matchId, potentialPayout);

      if (!exposureCheck.allowed) {
        return {
          valid: false,
          accepted: false,
          reason: exposureCheck.reason,
          warnings,
        };
      }

      if (exposureCheck.warning) {
        warnings.push(exposureCheck.warning);
      }

      // 6. Delay em live
      let delay = 0;
      if (currentOdds.isLive) {
        delay = this.LIVE_DELAY / 1000;
        warnings.push(`Aposta em jogo ao vivo - delay de ${delay}s`);
      }

      // ✅ Aposta válida
      return {
        valid: true,
        accepted: true,
        adjustedOdds: oddsChanged ? outcome.odds : undefined,
        adjustedStake: stakeValidation.adjustedStake,
        maxStake: outcome.maxStake || market.maxStake,
        warnings,
        delay,
      };
    } catch (error) {
      console.error('❌ Erro ao validar aposta:', error);
      return {
        valid: false,
        accepted: false,
        reason: 'Erro ao validar aposta',
        warnings,
      };
    }
  }

  /**
   * 🔄 Obter múltiplos jogos (batch)
   */
  async getMultipleOdds(matchIds: string[]): Promise<OddsResponse[]> {
    const results = await Promise.all(matchIds.map((id) => this.getOdds(id)));
    return results.filter((r) => r !== null) as OddsResponse[];
  }

  /**
   * 🏆 Obter jogos por liga
   */
  async getOddsByLeague(league: string, isLive?: boolean): Promise<OddsResponse[]> {
    try {
      const fixtures = isLive
        ? await getAllLiveFixtures()
        : await getAllUpcomingFixtures();

      const leagueLower = league.toLowerCase();
      const matchIds = fixtures
        .filter((f) => f.league.name.toLowerCase().includes(leagueLower))
        .map((f) => f.id);
      return this.getMultipleOdds(matchIds);
    } catch (error) {
      console.error('❌ Erro ao obter odds por liga:', error);
      return [];
    }
  }

  /**
   * ⚽ Obter jogos por desporto
   */
  async getOddsBySport(sport: string, isLive?: boolean): Promise<OddsResponse[]> {
    try {
      const fixtures = isLive
        ? await getAllLiveFixtures()
        : await getAllUpcomingFixtures();

      const matchIds = fixtures.filter((f) => f.sport === sport).map((f) => f.id);
      return this.getMultipleOdds(matchIds);
    } catch (error) {
      console.error('❌ Erro ao obter odds por desporto:', error);
      return [];
    }
  }

  // ============================================
  // MÉTODOS AUXILIARES
  // ============================================

  private buildMarkets(
    hybridOdds: any,
    pausedMarkets: any[],
    stakeLimits: any
  ): MarketOdds[] {
    const markets: MarketOdds[] = [];

    const marketEntries = Object.entries(
      hybridOdds.markets as Record<string, { outcomes?: Record<string, any> }>
    );

    for (const [marketType, data] of marketEntries) {
      const marketId = `${hybridOdds.matchId}_${marketType}`;
      const isPaused = pausedMarkets.some((m) => m.marketId === marketId);
      const pauseInfo = pausedMarkets.find((m) => m.marketId === marketId);

      const outcomes: OutcomeOdds[] = [];
      const marketData = data as { outcomes?: Record<string, any> };

      for (const [outcomeName, outcomeData] of Object.entries(marketData.outcomes || {})) {
        const od = outcomeData as any;
        outcomes.push({
          outcomeId: `${marketId}_${outcomeName}`,
          outcomeName,
          odds: od.odds,
          source: od.source,
          confidence: od.confidence,
          available: !isPaused,
          maxStake: stakeLimits[marketId] || undefined,
        });
      }

      markets.push({
        marketId,
        marketType: marketType as string,
        marketName: this.getMarketName(marketType as string),
        status: isPaused ? 'paused' : 'active',
        pauseReason: pauseInfo?.reason,
        outcomes,
        maxStake: stakeLimits[marketId],
        minStake: 1,
        lastUpdate: new Date().toISOString(),
      });
    }

    return markets;
  }

  private getMarketName(marketType: string): string {
    const names: Record<string, string> = {
      match_winner: 'Vencedor do Jogo',
      over_under_2_5: 'Mais/Menos 2.5 Golos',
      both_teams_score: 'Ambas Marcam',
      double_chance: 'Dupla Hipótese',
      next_goal: 'Próximo Golo',
      correct_score: 'Resultado Exato',
      half_time_result: 'Resultado ao Intervalo',
    };
    return names[marketType] || marketType;
  }

  private calculateRiskLevel(exposure: any): 'low' | 'medium' | 'high' | 'critical' {
    if (exposure.percentage >= 90) return 'critical';
    if (exposure.percentage >= 70) return 'high';
    if (exposure.percentage >= 50) return 'medium';
    return 'low';
  }

  private getRiskIndicators(matchId: string, exposure: any): string[] {
    const indicators: string[] = [];

    if (exposure.percentage >= 80) {
      indicators.push('Exposição crítica');
    }

    const pausedMarkets = getPausedMarketsForMatch(matchId);
    if (pausedMarkets.length > 3) {
      indicators.push('Múltiplos mercados pausados');
    }

    // TODO: Adicionar mais indicadores (desvio de odds, volume de apostas, etc.)

    return indicators;
  }

  // ============================================
  // CACHE
  // ============================================

  private getFromCache(key: string): any | null {
    const cached = this.cache.get(key);
    if (!cached) return null;

    const now = Date.now();
    if (now - cached.timestamp > cached.ttl) {
      this.cache.delete(key);
      return null;
    }

    return cached.data;
  }

  private setCache(key: string, data: any, ttl: number): void {
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      ttl,
    });
  }

  clearCache(matchId?: string): void {
    if (matchId) {
      this.cache.delete(`odds_${matchId}`);
    } else {
      this.cache.clear();
    }
  }
}

export const sportsbookApi = new SportsbookApi();
