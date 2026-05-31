import EventEmitter from "events";

/**
 * Tipos de eventos recebidos da API
 */
export type MatchEventType =
  | "GOAL"
  | "FOUL"
  | "VAR_STARTED"
  | "VAR_ENDED"
  | "MATCH_STATUS"
  | "UNKNOWN";

export interface MatchEvent {
  matchId: string;
  type: MatchEventType;
  timestamp: number;
  metadata?: Record<string, any>;
}

/**
 * Interface de controle de mercado
 */
interface MarketController {
  lockMarket(matchId: string, reason: string): Promise<void>;
  unlockMarket(matchId: string): Promise<void>;
}

/**
 * Implementação do motor de trading
 */
class TradingEngine implements MarketController {
  private lockedMarkets: Map<string, { reason: string; timestamp: number }> = new Map();

  async lockMarket(matchId: string, reason: string): Promise<void> {
    console.log(`[LOCK] Match ${matchId} locked. Reason: ${reason}`);
    this.lockedMarkets.set(matchId, { reason, timestamp: Date.now() });
    
    // Emitir evento para UI
    window.dispatchEvent(new CustomEvent('market-locked', { 
      detail: { matchId, reason } 
    }));
  }

  async unlockMarket(matchId: string): Promise<void> {
    console.log(`[UNLOCK] Match ${matchId} unlocked.`);
    this.lockedMarkets.delete(matchId);
    
    // Emitir evento para UI
    window.dispatchEvent(new CustomEvent('market-unlocked', { 
      detail: { matchId } 
    }));
  }

  isMarketLocked(matchId: string): boolean {
    return this.lockedMarkets.has(matchId);
  }

  getLockReason(matchId: string): string | null {
    return this.lockedMarkets.get(matchId)?.reason || null;
  }
}

/**
 * Controlador principal de VAR
 */
export class VarMarketManager {
  private tradingEngine: MarketController;
  private activeVarMatches: Map<string, NodeJS.Timeout>;
  private readonly MAX_VAR_DURATION = 3 * 60 * 1000; // 3 minutos segurança

  constructor(tradingEngine: MarketController) {
    this.tradingEngine = tradingEngine;
    this.activeVarMatches = new Map();
  }

  /**
   * Processa eventos vindos da API
   */
  async handleEvent(event: MatchEvent): Promise<void> {
    const { matchId, type } = event;

    switch (type) {
      case "VAR_STARTED":
        await this.startVar(matchId);
        break;

      case "VAR_ENDED":
        await this.endVar(matchId);
        break;

      case "GOAL":
        // Gatilho adicional de segurança
        await this.tradingEngine.lockMarket(matchId, "Golo detetado - suspensão temporária");
        // Auto-unlock após 30 segundos se não houver VAR
        setTimeout(async () => {
          if (!this.activeVarMatches.has(matchId)) {
            await this.tradingEngine.unlockMarket(matchId);
          }
        }, 30000);
        break;

      case "FOUL":
        // Bloqueio curto para faltas graves
        await this.tradingEngine.lockMarket(matchId, "Falta - verificação em curso");
        setTimeout(async () => {
          if (!this.activeVarMatches.has(matchId)) {
            await this.tradingEngine.unlockMarket(matchId);
          }
        }, 10000);
        break;

      default:
        break;
    }
  }

  /**
   * Inicia bloqueio por VAR
   */
  private async startVar(matchId: string): Promise<void> {
    if (this.activeVarMatches.has(matchId)) {
      console.log(`[INFO] VAR already active for ${matchId}`);
      return;
    }

    await this.tradingEngine.lockMarket(matchId, "Revisão VAR em curso");

    const safetyTimeout = setTimeout(async () => {
      console.warn(`[WARNING] VAR exceeded max duration for ${matchId}. Auto unlocking.`);
      await this.forceUnlock(matchId);
    }, this.MAX_VAR_DURATION);

    this.activeVarMatches.set(matchId, safetyTimeout);
  }

  /**
   * Finaliza bloqueio por VAR
   */
  private async endVar(matchId: string): Promise<void> {
    if (!this.activeVarMatches.has(matchId)) {
      console.log(`[INFO] No active VAR found for ${matchId}`);
      return;
    }

    clearTimeout(this.activeVarMatches.get(matchId)!);
    this.activeVarMatches.delete(matchId);

    // Pequeno delay pós-VAR para segurança
    await this.delay(5000);

    await this.tradingEngine.unlockMarket(matchId);
  }

  /**
   * Força desbloqueio (fail-safe)
   */
  private async forceUnlock(matchId: string): Promise<void> {
    if (!this.activeVarMatches.has(matchId)) return;

    clearTimeout(this.activeVarMatches.get(matchId)!);
    this.activeVarMatches.delete(matchId);

    await this.tradingEngine.unlockMarket(matchId);
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * Simulação de API recebendo eventos em tempo real
 */
class MatchEventListener extends EventEmitter {}

// Instância singleton
const tradingEngine = new TradingEngine();
const varManager = new VarMarketManager(tradingEngine);
const eventBus = new MatchEventListener();

eventBus.on("match_event", async (event: MatchEvent) => {
  await varManager.handleEvent(event);
});

// Exportar para uso global
export { tradingEngine, varManager, eventBus };

// Função helper para verificar se mercado está bloqueado
export const isMarketLocked = (matchId: string): boolean => {
  return (tradingEngine as any).isMarketLocked(matchId);
};

export const getLockReason = (matchId: string): string | null => {
  return (tradingEngine as any).getLockReason(matchId);
};
