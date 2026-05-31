/**
 * ⚡ Complete Sportsbook Engine
 * 
 * Motor unificado que combina odds pré-jogo e ao vivo num único sistema.
 * 
 * ✅ Transição automática de PRE_MATCH → LIVE
 * ✅ Margem dinâmica baseada no tempo até ao jogo
 * ✅ Impacto de volume de apostas (pré-jogo)
 * ✅ Pressão ofensiva e eventos (ao vivo)
 * ✅ Atualização contínua com intervalos adaptativos
 * ✅ Modelo probabilístico unificado
 */

type Mode = "PRE_MATCH" | "LIVE";

export interface MatchState {
  matchId: string;
  startTime: number; // timestamp início
  homeRating: number; // Rating ELO ou similar (ex: 1800)
  awayRating: number;
  homeScore: number;
  awayScore: number;
  homePressure: number; // 0-1 (calculado em tempo real)
  awayPressure: number; // 0-1
  totalMatchedHome: number; // Volume apostado na casa (€)
  totalMatchedAway: number; // Volume apostado fora (€)
  currentMinute?: number; // Minuto atual do jogo (ao vivo)
}

export interface Odds {
  home: number;
  draw: number;
  away: number;
}

interface EngineConfig {
  margin: number;
  volumeImpact?: number;
  timeFactor?: number;
  updateInterval: number; // segundos
}

interface EngineSnapshot {
  matchId: string;
  mode: Mode;
  odds: Odds;
  margin: number;
  timestamp: number;
  minutesToStart?: number;
  currentMinute?: number;
  overround: number;
}

type OddsUpdateCallback = (snapshot: EngineSnapshot) => void;

export class CompleteSportsbookEngine {
  private markets = new Map<string, Odds>();
  private timers = new Map<string, NodeJS.Timeout>();
  private snapshots = new Map<string, EngineSnapshot[]>();
  private callbacks: Set<OddsUpdateCallback> = new Set();

  /**
   * Inicia o motor para um jogo
   */
  start(state: MatchState): void {
    // Parar timer anterior se existir
    if (this.timers.has(state.matchId)) {
      clearTimeout(this.timers.get(state.matchId)!);
    }

    console.log(`🚀 [CompleteSportsbookEngine] Iniciando para ${state.matchId}`);
    this.run(state);
  }

  /**
   * Para o motor de um jogo
   */
  stop(matchId: string): void {
    const timer = this.timers.get(matchId);
    if (timer) {
      clearTimeout(timer);
      this.timers.delete(matchId);
      console.log(`⏹️ [CompleteSportsbookEngine] Parado para ${matchId}`);
    }
  }

  /**
   * Para todos os motores
   */
  stopAll(): void {
    for (const [matchId] of this.timers) {
      this.stop(matchId);
    }
    console.log('⏹️ [CompleteSportsbookEngine] Todos os motores parados');
  }

  /**
   * Atualiza estado do jogo manualmente
   */
  updateState(state: MatchState): void {
    // Força um ciclo imediato com o novo estado
    this.run(state);
  }

  /**
   * Obtém odds atuais
   */
  getCurrentOdds(matchId: string): Odds | null {
    return this.markets.get(matchId) || null;
  }

  /**
   * Obtém histórico de snapshots
   */
  getHistory(matchId: string): EngineSnapshot[] {
    return this.snapshots.get(matchId) || [];
  }

  /**
   * Subscreve a atualizações
   */
  subscribe(callback: OddsUpdateCallback): () => void {
    this.callbacks.add(callback);
    return () => this.callbacks.delete(callback);
  }

  /**
   * Ciclo principal do motor
   */
  private run(state: MatchState): void {
    const now = Date.now();
    const diffMs = state.startTime - now;

    // Determinar modo
    const mode: Mode = diffMs > 0 ? "PRE_MATCH" : "LIVE";

    // Calcular informação de tempo
    const timeInfo = this.getTimeInfo(diffMs);

    // Obter configuração baseada no modo
    const config =
      mode === "PRE_MATCH"
        ? this.getPreMatchConfig(timeInfo.totalMinutes)
        : this.getLiveConfig(state);

    // Calcular odds
    const odds =
      mode === "PRE_MATCH"
        ? this.calculatePreMatchOdds(state, config)
        : this.calculateLiveOdds(state, config);

    // Guardar no mercado
    this.markets.set(state.matchId, odds);

    // Criar snapshot
    const snapshot: EngineSnapshot = {
      matchId: state.matchId,
      mode,
      odds,
      margin: config.margin,
      timestamp: now,
      minutesToStart: mode === "PRE_MATCH" ? timeInfo.totalMinutes : undefined,
      currentMinute: mode === "LIVE" ? state.currentMinute : undefined,
      overround: this.calculateOverround(odds),
    };

    // Guardar no histórico (máximo 500 snapshots)
    const history = this.snapshots.get(state.matchId) || [];
    history.push(snapshot);
    if (history.length > 500) {
      history.shift();
    }
    this.snapshots.set(state.matchId, history);

    // Notificar callbacks
    this.notifyCallbacks(snapshot);

    // Log
    console.log(
      `[${mode}] ${state.matchId} | ${
        mode === "PRE_MATCH"
          ? `${timeInfo.hours}h ${timeInfo.minutes}m`
          : `${state.currentMinute || 0}'`
      } | Margem: ${(config.margin * 100).toFixed(1)}% | Odds: ${odds.home.toFixed(
        2
      )} / ${odds.draw.toFixed(2)} / ${odds.away.toFixed(2)}`
    );

    // Simular mudança de pressão ao vivo (em produção vem da API)
    if (mode === "LIVE") {
      state.homePressure = Math.max(0, Math.min(1, state.homePressure + (Math.random() - 0.5) * 0.1));
      state.awayPressure = Math.max(0, Math.min(1, state.awayPressure + (Math.random() - 0.5) * 0.1));
    }

    // Agendar próximo ciclo
    const nextInterval = config.updateInterval * 1000;

    const timer = setTimeout(() => this.run(state), nextInterval);
    this.timers.set(state.matchId, timer);
  }

  /* =============================
     CONTROLE DE TEMPO
  ============================== */

  private getTimeInfo(diffMs: number): {
    totalMinutes: number;
    hours: number;
    minutes: number;
  } {
    const totalMinutes = Math.max(0, Math.floor(diffMs / 60000));
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;

    return { totalMinutes, hours, minutes };
  }

  /* =============================
     CONFIGURAÇÃO PRÉ-JOGO
  ============================== */

  /**
   * Configuração dinâmica baseada no tempo até ao jogo
   * 
   * Quanto mais próximo do jogo:
   * - Margem diminui (mais competitivo)
   * - Impacto de volume aumenta (mais reativo ao mercado)
   * - Intervalo de atualização diminui (mais frequente)
   */
  private getPreMatchConfig(minutesToStart: number): EngineConfig {
    // Mais de 6 horas
    if (minutesToStart > 360) {
      return {
        margin: 0.06,           // 6% margem
        volumeImpact: 0.000002, // Baixo impacto de volume
        updateInterval: 300,    // Atualiza a cada 5 minutos
      };
    }

    // 3-6 horas
    if (minutesToStart > 180) {
      return {
        margin: 0.05,           // 5% margem
        volumeImpact: 0.000005,
        updateInterval: 60,     // Atualiza a cada 1 minuto
      };
    }

    // 1-3 horas
    if (minutesToStart > 60) {
      return {
        margin: 0.04,           // 4% margem
        volumeImpact: 0.00001,
        updateInterval: 20,     // Atualiza a cada 20 segundos
      };
    }

    // Última hora
    return {
      margin: 0.03,             // 3% margem (muito competitivo)
      volumeImpact: 0.00002,    // Alto impacto de volume
      updateInterval: 10,       // Atualiza a cada 10 segundos
    };
  }

  /* =============================
     CONFIGURAÇÃO AO VIVO
  ============================== */

  /**
   * Configuração para jogo ao vivo
   * 
   * Margem base baixa (2.5%) com ajustes dinâmicos
   * Atualização muito frequente (3 segundos)
   */
  private getLiveConfig(state: MatchState): EngineConfig {
    const minute = state.currentMinute || 0;
    
    // Margem base ao vivo
    let margin = 0.025; // 2.5%

    // Aumentar margem nos últimos 10 minutos (mais volátil)
    if (minute > 80) {
      margin = 0.035; // 3.5%
    }

    // Aumentar margem após golo recente (mais incerteza)
    // (em produção, verificar eventos recentes)
    
    return {
      margin,
      timeFactor: Math.max(0.1, (90 - minute) / 90), // Peso do tempo restante
      updateInterval: 3, // Atualiza a cada 3 segundos
    };
  }

  /* =============================
     CÁLCULO PRÉ-JOGO
  ============================== */

  /**
   * Calcula odds pré-jogo baseado em:
   * - Rating das equipas (força relativa)
   * - Volume de apostas (movimento do mercado)
   */
  private calculatePreMatchOdds(
    state: MatchState,
    config: EngineConfig
  ): Odds {
    // Diferença de rating
    const ratingDiff = state.homeRating - state.awayRating;

    // Probabilidades base (ajustadas pelo rating)
    // Rating +100 = ~+10% probabilidade
    let homeProb = 0.45 + ratingDiff * 0.002;
    let awayProb = 0.30 - ratingDiff * 0.002;
    let drawProb = 1 - (homeProb + awayProb);

    const volumeImpact = config.volumeImpact ?? 0;

    homeProb -= state.totalMatchedHome * volumeImpact;
    awayProb -= state.totalMatchedAway * volumeImpact;

    // Renormalizar
    const total = homeProb + awayProb + drawProb;
    homeProb /= total;
    awayProb /= total;
    drawProb /= total;

    // Converter para odds com margem
    return this.normalize(homeProb, drawProb, awayProb, config.margin);
  }

  /* =============================
     CÁLCULO AO VIVO
  ============================== */

  /**
   * Calcula odds ao vivo baseado em:
   * - Placar atual
   * - Pressão ofensiva (posse, remates, etc.)
   * - Tempo restante
   */
  private calculateLiveOdds(
    state: MatchState,
    config: EngineConfig
  ): Odds {
    // Probabilidade base ajustada pela pressão ofensiva
    let homeProb =
      0.4 +
      state.homePressure * 0.25 + // Pressão vale até 25%
      (state.homeScore - state.awayScore) * 0.2; // Cada golo de diferença vale 20%

    let awayProb =
      0.3 +
      state.awayPressure * 0.25 +
      (state.awayScore - state.homeScore) * 0.2;

    let drawProb = 1 - (homeProb + awayProb);

    // Ajuste temporal: quanto menos tempo, mais peso no placar atual
    // No início: pressão importa mais
    // No fim: placar importa mais
    const timeFactor = config.timeFactor ?? 1;
    const timeWeight = 1 - timeFactor;
    
    if (state.homeScore > state.awayScore) {
      homeProb *= 1 + timeWeight * 0.3; // Vantagem aumenta com o tempo
    } else if (state.awayScore > state.homeScore) {
      awayProb *= 1 + timeWeight * 0.3;
    } else {
      drawProb *= 1 + timeWeight * 0.2; // Empate mais provável no fim
    }

    // Renormalizar
    const total = homeProb + awayProb + drawProb;
    homeProb /= total;
    awayProb /= total;
    drawProb /= total;

    // Converter para odds com margem
    return this.normalize(homeProb, drawProb, awayProb, config.margin);
  }

  /* =============================
     NORMALIZAÇÃO + MARGEM
  ============================== */

  /**
   * Normaliza probabilidades e aplica margem da casa
   * 
   * Margem = overround = quanto a casa ganha
   * Exemplo: 3% margem = soma das probabilidades implícitas = 103%
   */
  private normalize(
    homeProb: number,
    drawProb: number,
    awayProb: number,
    margin: number
  ): Odds {
    // Garantir que somam 1
    const total = homeProb + drawProb + awayProb;
    homeProb /= total;
    drawProb /= total;
    awayProb /= total;

    // Aplicar margem: odds = (1 / prob) * (1 - margin)
    // Margem reduz as odds (aumenta probabilidade implícita)
    const home = (1 / homeProb) * (1 - margin);
    const draw = (1 / drawProb) * (1 - margin);
    const away = (1 / awayProb) * (1 - margin);

    return {
      home: Math.max(1.01, parseFloat(home.toFixed(2))),
      draw: Math.max(1.01, parseFloat(draw.toFixed(2))),
      away: Math.max(1.01, parseFloat(away.toFixed(2))),
    };
  }

  /**
   * Calcula overround (margem real das odds)
   */
  private calculateOverround(odds: Odds): number {
    const impliedProb = 1 / odds.home + 1 / odds.draw + 1 / odds.away;
    return (impliedProb - 1) * 100; // Percentagem
  }

  /**
   * Notifica callbacks
   */
  private notifyCallbacks(snapshot: EngineSnapshot): void {
    this.callbacks.forEach(cb => {
      try {
        cb(snapshot);
      } catch (error) {
        console.error('❌ Erro no callback do engine:', error);
      }
    });
  }

  /**
   * Obtém estatísticas do engine
   */
  getEngineStats(): {
    activeMatches: number;
    totalSnapshots: number;
    matchIds: string[];
  } {
    let totalSnapshots = 0;
    const matchIds: string[] = [];

    this.snapshots.forEach((history, id) => {
      if (this.timers.has(id)) {
        totalSnapshots += history.length;
        matchIds.push(id);
      }
    });

    return {
      activeMatches: this.timers.size,
      totalSnapshots,
      matchIds,
    };
  }
}

// ═══════════════════════════════════════════════════════════
// INSTÂNCIA SINGLETON
// ═══════════════════════════════════════════════════════════

export const completeSportsbookEngine = new CompleteSportsbookEngine();

export default completeSportsbookEngine;
