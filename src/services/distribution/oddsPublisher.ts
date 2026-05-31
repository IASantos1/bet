
/**
 * 📡 Odds Publisher
 * 
 * Publica odds atualizadas (pré-jogo + live) com delay controlado
 * Gerencia subscrições e notificações em tempo real
 * 
 * Funcionalidades:
 * - Publica odds pré-jogo (atualização a cada 30s)
 * - Publica odds live (atualização a cada 5s com delay de 3-5s)
 * - Sistema de subscrições para clientes
 * - Notificações de mudanças significativas
 * - Controlo de rate limiting
 */

import { sportsbookApi, OddsResponse } from './sportsbookApi';

// ============================================
// TIPOS
// ============================================

export interface OddsUpdate {
  matchId: string;
  timestamp: string;
  updateType: 'full' | 'partial' | 'status_change';
  odds?: OddsResponse;
  changes?: OddsChange[];
  delay?: number;
}

export interface OddsChange {
  marketId: string;
  outcomeId: string;
  oldOdds: number;
  newOdds: number;
  change: number; // Percentagem
  significant: boolean; // >5% mudança
}

export interface Subscription {
  id: string;
  matchIds: string[];
  callback: (update: OddsUpdate) => void;
  filters?: {
    minChange?: number; // Só notifica se mudança >= X%
    markets?: string[]; // Só notifica mercados específicos
    significantOnly?: boolean; // Só mudanças significativas
  };
  createdAt: string;
  lastUpdate?: string;
}

export interface PublisherStats {
  totalSubscriptions: number;
  activeMatches: number;
  updatesPublished: number;
  updateRate: number; // Updates/min
  avgDelay: number; // ms
  cacheHitRate: number;
}

// ============================================
// ODDS PUBLISHER
// ============================================

class OddsPublisher {
  private subscriptions = new Map<string, Subscription>();
  private publishIntervals = new Map<string, NodeJS.Timeout>();
  private lastOdds = new Map<string, OddsResponse>();
  private stats = {
    updatesPublished: 0,
    startTime: Date.now(),
  };

  private readonly PREGAME_INTERVAL = 30000; // 30s
  private readonly LIVE_INTERVAL = 5000; // 5s
  private readonly LIVE_DELAY = 3000; // 3s delay
  private readonly MAX_DELAY = 5000; // 5s max delay

  /**
   * 📡 Iniciar publicação de odds para um jogo
   */
  startPublishing(matchId: string, isLive: boolean = false): void {
    // Para publicação existente
    this.stopPublishing(matchId);

    const interval = isLive ? this.LIVE_INTERVAL : this.PREGAME_INTERVAL;

    console.log(`📡 Iniciando publicação de odds: ${matchId} (${isLive ? 'LIVE' : 'PRÉ-JOGO'}) - ${interval}ms`);

    // Publica imediatamente
    this.publishOdds(matchId, isLive);

    // Agenda publicações periódicas
    const timer = setInterval(() => {
      this.publishOdds(matchId, isLive);
    }, interval);

    this.publishIntervals.set(matchId, timer);
  }

  /**
   * 🛑 Parar publicação de odds
   */
  stopPublishing(matchId: string): void {
    const timer = this.publishIntervals.get(matchId);
    if (timer) {
      clearInterval(timer);
      this.publishIntervals.delete(matchId);
      console.log(`🛑 Publicação parada: ${matchId}`);
    }
  }

  /**
   * 📤 Publicar odds (chamado periodicamente)
   */
  private async publishOdds(matchId: string, isLive: boolean): Promise<void> {
    try {
      // Busca odds atuais
      const currentOdds = await sportsbookApi.getOdds(matchId);
      if (!currentOdds) {
        console.warn(`⚠️ Odds não encontradas: ${matchId}`);
        return;
      }

      // Busca odds anteriores
      const previousOdds = this.lastOdds.get(matchId);

      // Calcula mudanças
      const changes = previousOdds ? this.calculateChanges(previousOdds, currentOdds) : [];

      // Determina tipo de atualização
      const updateType = this.getUpdateType(previousOdds, currentOdds, changes);

      // Aplica delay em live
      const delay = isLive ? this.calculateDelay(changes) : 0;

      // Cria update
      const update: OddsUpdate = {
        matchId,
        timestamp: new Date().toISOString(),
        updateType,
        odds: currentOdds,
        changes: changes.length > 0 ? changes : undefined,
        delay,
      };

      // Aguarda delay se necessário
      if (delay > 0) {
        await new Promise((resolve) => setTimeout(resolve, delay));
      }

      // Notifica subscritores
      this.notifySubscribers(matchId, update);

      // Atualiza cache
      this.lastOdds.set(matchId, currentOdds);

      // Atualiza stats
      this.stats.updatesPublished++;

      // Log apenas se houver mudanças significativas
      if (changes.some((c) => c.significant)) {
        console.log(`📡 Odds publicadas: ${matchId} - ${changes.length} mudanças (delay: ${delay}ms)`);
      }
    } catch (error) {
      console.error(`❌ Erro ao publicar odds: ${matchId}`, error);
    }
  }

  /**
   * 📊 Calcular mudanças entre odds
   */
  private calculateChanges(previous: OddsResponse, current: OddsResponse): OddsChange[] {
    const changes: OddsChange[] = [];

    for (const currentMarket of current.markets) {
      const previousMarket = previous.markets.find((m) => m.marketId === currentMarket.marketId);
      if (!previousMarket) continue;

      for (const currentOutcome of currentMarket.outcomes) {
        const previousOutcome = previousMarket.outcomes.find(
          (o) => o.outcomeId === currentOutcome.outcomeId
        );
        if (!previousOutcome) continue;

        const oldOdds = previousOutcome.odds;
        const newOdds = currentOutcome.odds;

        if (Math.abs(oldOdds - newOdds) > 0.01) {
          const change = ((newOdds - oldOdds) / oldOdds) * 100;
          const significant = Math.abs(change) >= 5;

          changes.push({
            marketId: currentMarket.marketId,
            outcomeId: currentOutcome.outcomeId,
            oldOdds,
            newOdds,
            change,
            significant,
          });
        }
      }
    }

    return changes;
  }

  /**
   * 🔍 Determinar tipo de atualização
   */
  private getUpdateType(
    previous: OddsResponse | undefined,
    current: OddsResponse,
    changes: OddsChange[]
  ): 'full' | 'partial' | 'status_change' {
    if (!previous) return 'full';

    // Mudança de status
    if (previous.status !== current.status) return 'status_change';

    // Mudança de mercados (pausado/reaberto)
    const marketStatusChanged = current.markets.some((m) => {
      const prev = previous.markets.find((pm) => pm.marketId === m.marketId);
      return prev && prev.status !== m.status;
    });
    if (marketStatusChanged) return 'status_change';

    // Mudanças significativas
    if (changes.some((c) => c.significant)) return 'partial';

    // Atualização normal
    return 'partial';
  }

  /**
   * ⏱️ Calcular delay baseado em mudanças
   */
  private calculateDelay(changes: OddsChange[]): number {
    if (changes.length === 0) return this.LIVE_DELAY;

    // Mudanças significativas = delay maior
    const hasSignificant = changes.some((c) => c.significant);
    if (hasSignificant) {
      return Math.min(this.LIVE_DELAY + 2000, this.MAX_DELAY);
    }

    return this.LIVE_DELAY;
  }

  /**
   * 🔔 Notificar subscritores
   */
  private notifySubscribers(matchId: string, update: OddsUpdate): void {
    let notified = 0;

    for (const subscription of this.subscriptions.values()) {
      // Verifica se subscrição inclui este jogo
      if (!subscription.matchIds.includes(matchId)) continue;

      // Aplica filtros
      if (!this.shouldNotify(subscription, update)) continue;

      // Notifica
      try {
        subscription.callback(update);
        notified++;
      } catch (error) {
        console.error(`❌ Erro ao notificar subscritor ${subscription.id}:`, error);
      }
    }

    if (notified > 0) {
      console.log(`🔔 ${notified} subscritores notificados: ${matchId}`);
    }
  }

  /**
   * ✅ Verificar se deve notificar subscritor
   */
  private shouldNotify(subscription: Subscription, update: OddsUpdate): boolean {
    const filters = subscription.filters;
    if (!filters) return true;

    // Filtro: só mudanças significativas
    if (filters.significantOnly && update.changes) {
      const hasSignificant = update.changes.some((c) => c.significant);
      if (!hasSignificant) return false;
    }

    // Filtro: mudança mínima
    if (filters.minChange && update.changes) {
      const maxChange = Math.max(...update.changes.map((c) => Math.abs(c.change)));
      if (maxChange < filters.minChange) return false;
    }

    // Filtro: mercados específicos
    if (filters.markets && update.changes) {
      const hasRelevantMarket = update.changes.some((c) =>
        filters.markets!.includes(c.marketId)
      );
      if (!hasRelevantMarket) return false;
    }

    return true;
  }

  // ============================================
  // SUBSCRIÇÕES
  // ============================================

  /**
   * ➕ Adicionar subscrição
   */
  subscribe(
    matchIds: string[],
    callback: (update: OddsUpdate) => void,
    filters?: Subscription['filters']
  ): string {
    const id = `sub_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const subscription: Subscription = {
      id,
      matchIds,
      callback,
      filters,
      createdAt: new Date().toISOString(),
    };

    this.subscriptions.set(id, subscription);

    console.log(`➕ Nova subscrição: ${id} - ${matchIds.length} jogos`);

    // Inicia publicação para jogos subscritos (se ainda não iniciado)
    for (const matchId of matchIds) {
      if (!this.publishIntervals.has(matchId)) {
        // Verifica se é live
        sportsbookApi.getOdds(matchId).then((odds) => {
          if (odds) {
            this.startPublishing(matchId, odds.isLive);
          }
        }).catch(err => {
          console.error(`❌ Erro ao obter odds para iniciar publicação (${matchId}):`, err);
        });
      }
    }

    return id;
  }

  /**
   * ➖ Remover subscrição
   */
  unsubscribe(subscriptionId: string): boolean {
    const removed = this.subscriptions.delete(subscriptionId);
    if (removed) {
      console.log(`➖ Subscrição removida: ${subscriptionId}`);
    }
    return removed;
  }

  /**
   * 🔄 Atualizar subscrição
   */
  updateSubscription(
    subscriptionId: string,
    matchIds?: string[],
    filters?: Subscription['filters']
  ): boolean {
    const subscription = this.subscriptions.get(subscriptionId);
    if (!subscription) return false;

    if (matchIds) {
      subscription.matchIds = matchIds;

      // Inicia publicação para novos jogos
      for (const matchId of matchIds) {
        if (!this.publishIntervals.has(matchId)) {
          sportsbookApi.getOdds(matchId).then((odds) => {
            if (odds) {
              this.startPublishing(matchId, odds.isLive);
            }
          }).catch(err => {
            console.error(`❌ Erro ao obter odds ao atualizar subscrição (${matchId}):`, err);
          });
        }
      }
    }

    if (filters) {
      subscription.filters = filters;
    }

    subscription.lastUpdate = new Date().toISOString();

    console.log(`🔄 Subscrição atualizada: ${subscriptionId}`);
    return true;
  }

  /**
   * 📋 Obter subscrição
   */
  getSubscription(subscriptionId: string): Subscription | undefined {
    return this.subscriptions.get(subscriptionId);
  }

  /**
   * 📊 Obter todas as subscrições
   */
  getAllSubscriptions(): Subscription[] {
    return Array.from(this.subscriptions.values());
  }

  // ============================================
  // CONTROLO EM MASSA
  // ============================================

  /**
   * 🚀 Iniciar publicação para múltiplos jogos
   */
  startPublishingMultiple(matches: Array<{ matchId: string; isLive: boolean }>): void {
    console.log(`🚀 Iniciando publicação para ${matches.length} jogos`);
    for (const match of matches) {
      this.startPublishing(match.matchId, match.isLive);
    }
  }

  /**
   * 🛑 Parar publicação para múltiplos jogos
   */
  stopPublishingMultiple(matchIds: string[]): void {
    console.log(`🛑 Parando publicação para ${matchIds.length} jogos`);
    for (const matchId of matchIds) {
      this.stopPublishing(matchId);
    }
  }

  /**
   * 🔄 Atualizar status de jogo (pré-jogo → live)
   */
  updateMatchStatus(matchId: string, isLive: boolean): void {
    console.log(`🔄 Atualizando status: ${matchId} → ${isLive ? 'LIVE' : 'PRÉ-JOGO'}`);
    this.startPublishing(matchId, isLive);
  }

  /**
   * 🧹 Limpar jogos finalizados
   */
  cleanupFinishedMatches(): void {
    const toRemove: string[] = [];

    const checks = Array.from(this.publishIntervals.keys()).map((matchId) =>
      sportsbookApi.getOdds(matchId).then((odds) => {
        if (odds && (odds.status === 'finished' || odds.status === 'cancelled')) {
          toRemove.push(matchId);
        }
      }).catch(err => {
        console.error(`❌ Erro ao checar status de partida (${matchId}):`, err);
      })
    );

    Promise.allSettled(checks).then(() => {
      if (toRemove.length > 0) {
        console.log(`🧹 Limpando ${toRemove.length} jogos finalizados`);
        this.stopPublishingMultiple(toRemove);

        // Remove do cache
        for (const matchId of toRemove) {
          this.lastOdds.delete(matchId);
        }
      }
    });
  }

  // ============================================
  // ESTATÍSTICAS
  // ============================================

  /**
   * 📊 Obter estatísticas do publisher
   */
  getStats(): PublisherStats {
    const now = Date.now();
    const uptime = (now - this.stats.startTime) / 1000 / 60; // minutos
    const updateRate = this.stats.updatesPublished / uptime;

    return {
      totalSubscriptions: this.subscriptions.size,
      activeMatches: this.publishIntervals.size,
      updatesPublished: this.stats.updatesPublished,
      updateRate: Math.round(updateRate * 100) / 100,
      avgDelay: this.LIVE_DELAY,
      cacheHitRate: 0, // TODO: calcular do sportsbookApi
    };
  }

  /**
   * 🔄 Resetar estatísticas
   */
  resetStats(): void {
    this.stats = {
      updatesPublished: 0,
      startTime: Date.now(),
    };
  }

  /**
   * 🧹 Limpar tudo
   */
  cleanup(): void {
    console.log('🧹 Limpando Odds Publisher...');

    // Para todas as publicações
    for (const matchId of this.publishIntervals.keys()) {
      this.stopPublishing(matchId);
    }

    // Remove todas as subscrições
    this.subscriptions.clear();

    // Limpa cache
    this.lastOdds.clear();

    // Reseta stats
    this.resetStats();

    console.log('✅ Odds Publisher limpo');
  }
}

export const oddsPublisher = new OddsPublisher();
