/**
 * ═══════════════════════════════════════════════════════════════════════════
 * 🔌 WebSocket para Placares em Tempo Real
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Sistema de WebSocket que elimina polling para atualizações de placares.
 * Recebe dados em tempo real via conexão persistente.
 * 
 * Funcionalidades:
 * - Conexão WebSocket persistente
 * - Reconexão automática com backoff exponencial
 * - Heartbeat para manter conexão viva
 * - Fallback para polling se WebSocket falhar
 * - Event emitter para componentes React
 */

import { Match } from '../../types/sports';

// ═══════════════════════════════════════════════════════════════════════════
// TIPOS E INTERFACES
// ═══════════════════════════════════════════════════════════════════════════

export interface LiveScoreUpdate {
  matchId: string;
  homeScore: number;
  awayScore: number;
  minute: number;
  period: string;
  statusShort: string;
  timestamp: number;
}

export interface LiveOddsUpdate {
  matchId: string;
  odds: {
    home: number;
    draw: number;
    away: number;
  };
  timestamp: number;
}

export interface LiveIncident {
  matchId: string;
  type: 'goal' | 'red_card' | 'yellow_card' | 'var' | 'penalty' | 'substitution';
  team: 'home' | 'away';
  player?: string;
  minute: number;
  detail?: string;
  timestamp: number;
}

export interface WebSocketMessage {
  type: 'score_update' | 'odds_update' | 'incident' | 'match_start' | 'match_end' | 'heartbeat' | 'initial_data';
  data: LiveScoreUpdate | LiveOddsUpdate | LiveIncident | Match | Match[] | null;
}

type EventCallback<T> = (data: T) => void;

interface EventListeners {
  score_update: Set<EventCallback<LiveScoreUpdate>>;
  odds_update: Set<EventCallback<LiveOddsUpdate>>;
  incident: Set<EventCallback<LiveIncident>>;
  match_start: Set<EventCallback<Match>>;
  match_end: Set<EventCallback<{ matchId: string }>>;
  connection_change: Set<EventCallback<{ connected: boolean }>>;
  initial_data: Set<EventCallback<Match[]>>;
}

// ═══════════════════════════════════════════════════════════════════════════
// CONFIGURAÇÃO
// ═══════════════════════════════════════════════════════════════════════════

const CONFIG = {
  // URL do WebSocket (usa o servidor próprio /api/live/ws que depois liga ao SportsAPI Pro V2)
  get WS_URL(): string {
    if (typeof window === 'undefined') return '';
    const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
    return `${proto}://${window.location.host}/api/live/ws?sport=all`;
  },
  
  // Reconexão
  RECONNECT_INITIAL_DELAY: 1000,
  RECONNECT_MAX_DELAY: 30000,
  RECONNECT_MULTIPLIER: 1.5,
  MAX_RECONNECT_ATTEMPTS: 10,
  
  // Heartbeat
  HEARTBEAT_INTERVAL: 25000,
  HEARTBEAT_TIMEOUT: 35000,
  
  // Simulação desactivada — usa dados reais do servidor
  USE_LOCAL_SIMULATION: false,
  SIMULATION_INTERVAL: 15000,
};

// ═══════════════════════════════════════════════════════════════════════════
// CLASSE PRINCIPAL
// ═══════════════════════════════════════════════════════════════════════════

class LiveScoresWebSocket {
  private ws: WebSocket | null = null;
  private isConnected = false;
  private reconnectAttempts = 0;
  private reconnectDelay = CONFIG.RECONNECT_INITIAL_DELAY;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private heartbeatTimeoutTimer: ReturnType<typeof setTimeout> | null = null;
  private simulationTimer: ReturnType<typeof setInterval> | null = null;
  private isDestroyed = false; // ✅ Flag para controlar destruição
  
  // Cache de dados ao vivo
  private liveMatches: Map<string, Match> = new Map();
  private lastScores: Map<string, { home: number; away: number }> = new Map();
  
  // Event listeners
  private listeners: EventListeners = {
    score_update: new Set(),
    odds_update: new Set(),
    incident: new Set(),
    match_start: new Set(),
    match_end: new Set(),
    connection_change: new Set(),
    initial_data: new Set(),
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // CONEXÃO
  // ═══════════════════════════════════════════════════════════════════════════

  connect(): void {
    if (this.isConnected) {
      console.log('🔌 [WebSocket] Já conectado');
      return;
    }

    if (CONFIG.USE_LOCAL_SIMULATION) {
      this.startLocalSimulation();
      return;
    }

    this.connectToServer();
  }

  private connectToServer(): void {
    const url = CONFIG.WS_URL;
    if (!url) { this.scheduleReconnect(); return; }
    try {
      console.log('🔌 [LiveScoresWS] Conectando ao servidor em tempo real...');
      
      this.ws = new WebSocket(url);
      
      this.ws.onopen = () => {
        console.log('✅ [LiveScoresWS] Conectado!');
        this.isConnected = true;
        this.reconnectAttempts = 0;
        this.reconnectDelay = CONFIG.RECONNECT_INITIAL_DELAY;
        this.startHeartbeat();
        this.emit('connection_change', { connected: true });
      };

      this.ws.onmessage = (event) => {
        this.handleMessage(event.data);
      };

      this.ws.onerror = () => {
        // Handled in onclose
      };

      this.ws.onclose = () => {
        console.log('🔌 [LiveScoresWS] Desconectado, a reconectar...');
        this.isConnected = false;
        this.stopHeartbeat();
        this.emit('connection_change', { connected: false });
        this.scheduleReconnect();
      };

    } catch (error) {
      console.error('❌ [LiveScoresWS] Erro ao conectar:', error);
      this.scheduleReconnect();
    }
  }

  disconnect(): void {
    console.log('🔌 [WebSocket] Desconectando...');
    
    this.isDestroyed = true; // ✅ Marcar como destruído
    this.stopLocalSimulation();
    this.stopHeartbeat();
    
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    this.isConnected = false;
    this.emit('connection_change', { connected: false });
  }

  // ✅ Método para reconectar após desconexão
  reconnect(): void {
    this.isDestroyed = false;
    this.connect();
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SIMULAÇÃO LOCAL (quando não há servidor WebSocket)
  // ═══════════════════════════════════════════════════════════════════════════

  private startLocalSimulation(): void {
    // ✅ Verificar se já está destruído ou já tem timer ativo
    if (this.isDestroyed) {
      console.log('⚠️ [WebSocket] Instância destruída, não iniciando simulação');
      return;
    }
    
    // ✅ Limpar timer existente antes de criar novo
    this.stopLocalSimulation();
    
    console.log('🎮 [WebSocket] Iniciando simulação local - Atualização a cada 15 segundos');
    
    this.isConnected = true;
    this.emit('connection_change', { connected: true });

    // ✅ Simular atualizações a cada 15 segundos
    this.simulationTimer = setInterval(() => {
      if (!this.isDestroyed && this.isConnected) {
        this.simulateUpdates();
      }
    }, CONFIG.SIMULATION_INTERVAL);

    // Disparar evento de conexão
    window.dispatchEvent(new CustomEvent('websocket-connected'));
  }

  private stopLocalSimulation(): void {
    if (this.simulationTimer) {
      console.log('⏹️ [WebSocket] Parando simulação local');
      clearInterval(this.simulationTimer);
      this.simulationTimer = null;
    }
  }

  /**
   * ✅ Simula atualizações de placares em tempo real
   * Usa os dados dos jogos ao vivo do cache
   */
  private simulateUpdates(): void {
    const matches = Array.from(this.liveMatches.values());
    
    if (matches.length === 0) return;

    // Selecionar 1-3 jogos aleatórios para atualizar
    const numUpdates = Math.min(matches.length, Math.floor(Math.random() * 3) + 1);
    const shuffled = [...matches].sort(() => Math.random() - 0.5);
    const toUpdate = shuffled.slice(0, numUpdates);

    toUpdate.forEach(match => {
      const matchId = String(match.id);
      const lastScore = this.lastScores.get(matchId) || { 
        home: match.homeScore || 0, 
        away: match.awayScore || 0 
      };

      // 5% de chance de golo
      const goalChance = Math.random();
      let newHomeScore = lastScore.home;
      let newAwayScore = lastScore.away;
      let incident: LiveIncident | null = null;

      if (goalChance < 0.05) {
        // Golo!
        const isHomeGoal = Math.random() > 0.5;
        if (isHomeGoal) {
          newHomeScore++;
          incident = {
            matchId,
            type: 'goal',
            team: 'home',
            player: 'Jogador',
            minute: match.elapsed || Math.floor(Math.random() * 90),
            timestamp: Date.now(),
          };
        } else {
          newAwayScore++;
          incident = {
            matchId,
            type: 'goal',
            team: 'away',
            player: 'Jogador',
            minute: match.elapsed || Math.floor(Math.random() * 90),
            timestamp: Date.now(),
          };
        }
      }

      // Atualizar minuto: parar em 45 (intervalo) e em 90 (fim)
      const currentMinute = match.elapsed || 0;
      // Pausar durante o intervalo: entre 45 e 46 fica em HT
      const newMinute = currentMinute < 45
        ? currentMinute + 1
        : currentMinute === 45
          ? 45  // manter em 45 = HT
          : Math.min(currentMinute + 1, 90);

      // Emitir atualização de placar
      const scoreUpdate: LiveScoreUpdate = {
        matchId,
        homeScore: newHomeScore,
        awayScore: newAwayScore,
        minute: newMinute,
        period: this.getPeriodFromMinute(newMinute),
        statusShort: this.getStatusFromMinute(newMinute),
        timestamp: Date.now(),
      };

      this.lastScores.set(matchId, { home: newHomeScore, away: newAwayScore });
      this.emit('score_update', scoreUpdate);

      // Emitir incidente se houver golo
      if (incident) {
        this.emit('incident', incident);
      }

      // 20% de chance de atualizar odds
      if (Math.random() < 0.2) {
        if (!match.odds) return;
        const oddsUpdate: LiveOddsUpdate = {
          matchId,
          odds: {
            home: this.randomOddsChange(match.odds.home),
            draw: this.randomOddsChange(match.odds.draw),
            away: this.randomOddsChange(match.odds.away),
          },
          timestamp: Date.now(),
        };
        this.emit('odds_update', oddsUpdate);
      }
    });
  }

  private getPeriodFromMinute(minute: number): string {
    if (minute < 45) return 'P1';
    if (minute === 45) return 'INT';
    if (minute <= 90) return 'P2';
    return 'PRO';
  }

  private getStatusFromMinute(minute: number): string {
    if (minute < 45) return '1H';
    if (minute === 45) return 'HT';
    if (minute <= 90) return '2H';
    return 'ET';
  }

  private randomOddsChange(currentOdd: number): number {
    const change = (Math.random() - 0.5) * 0.1; // -0.05 a +0.05
    const newOdd = currentOdd + change;
    return Math.max(1.01, Math.round(newOdd * 100) / 100);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // HEARTBEAT
  // ═══════════════════════════════════════════════════════════════════════════

  private startHeartbeat(): void {
    this.stopHeartbeat();
    
    this.heartbeatTimer = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ type: 'heartbeat' }));
        
        // Timeout se não receber resposta
        this.heartbeatTimeoutTimer = setTimeout(() => {
          console.warn('⚠️ [WebSocket] Heartbeat timeout - reconectando...');
          this.ws?.close();
        }, CONFIG.HEARTBEAT_TIMEOUT);
      }
    }, CONFIG.HEARTBEAT_INTERVAL);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    if (this.heartbeatTimeoutTimer) {
      clearTimeout(this.heartbeatTimeoutTimer);
      this.heartbeatTimeoutTimer = null;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // RECONEXÃO
  // ═══════════════════════════════════════════════════════════════════════════

  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= CONFIG.MAX_RECONNECT_ATTEMPTS) {
      console.error('❌ [WebSocket] Máximo de tentativas de reconexão atingido');
      return;
    }

    this.reconnectAttempts++;
    
    console.log(`🔄 [WebSocket] Reconectando em ${this.reconnectDelay}ms (tentativa ${this.reconnectAttempts}/${CONFIG.MAX_RECONNECT_ATTEMPTS})`);

    this.reconnectTimer = setTimeout(() => {
      this.connectToServer();
    }, this.reconnectDelay);

    // Backoff exponencial
    this.reconnectDelay = Math.min(
      this.reconnectDelay * CONFIG.RECONNECT_MULTIPLIER,
      CONFIG.RECONNECT_MAX_DELAY
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // MENSAGENS
  // ═══════════════════════════════════════════════════════════════════════════

  private handleMessage(data: string): void {
    try {
      const message = JSON.parse(data);

      // Reset heartbeat timeout
      if (this.heartbeatTimeoutTimer) {
        clearTimeout(this.heartbeatTimeoutTimer);
        this.heartbeatTimeoutTimer = null;
      }

      // Handle server snapshot messages (type: 'snapshot', live: [...])
      if (message?.type === 'snapshot' && Array.isArray(message?.live)) {
        this.processSnapshot(message.live);
        return;
      }

      // Handle pong from server
      if (message?.type === 'pong') return;

      // Handle legacy granular message types
      switch (message.type) {
        case 'score_update':
          this.emit('score_update', message.data as LiveScoreUpdate);
          break;
        case 'odds_update':
          this.emit('odds_update', message.data as LiveOddsUpdate);
          break;
        case 'incident':
          this.emit('incident', message.data as LiveIncident);
          break;
        case 'match_start':
          this.emit('match_start', message.data as Match);
          break;
        case 'match_end':
          this.emit('match_end', message.data as { matchId: string });
          break;
        case 'initial_data':
          this.emit('initial_data', message.data as Match[]);
          break;
        case 'heartbeat':
          break;
      }
    } catch (error) {
      console.error('❌ [LiveScoresWS] Erro ao processar mensagem:', error);
    }
  }

  /**
   * Processa um snapshot da API e gera eventos granulares por diff
   */
  private processSnapshot(live: any[]): void {
    const now = Date.now();

    for (const item of live) {
      const matchId = String(item?.id || item?.external_event_id || '');
      if (!matchId) continue;

      const prev = this.liveMatches.get(matchId) as any;

      // Parse scores
      const goals = item?.goals ?? item?.score;
      const newH = Number((goals && typeof goals === 'object' ? goals.home : null) ?? item?.home_score ?? 0);
      const newA = Number((goals && typeof goals === 'object' ? goals.away : null) ?? item?.away_score ?? 0);
      const minute = Number(item?.elapsed ?? item?.fixture?.status?.elapsed ?? item?.timer ?? 0);

      // Score update if changed
      const prevScore = this.lastScores.get(matchId);
      if (!prevScore || prevScore.home !== newH || prevScore.away !== newA) {
        if (prevScore && (prevScore.home !== newH || prevScore.away !== newA)) {
          // Goal detected
          const scoringTeam: 'home' | 'away' = newH > prevScore.home ? 'home' : 'away';
          const incident: LiveIncident = {
            matchId, type: 'goal', team: scoringTeam,
            minute, timestamp: now,
          };
          this.emit('incident', incident);
        }
        this.lastScores.set(matchId, { home: newH, away: newA });
        const scoreUpdate: LiveScoreUpdate = {
          matchId, homeScore: newH, awayScore: newA, minute,
          period: minute <= 45 ? 'P1' : 'P2',
          statusShort: String(item?.status ?? item?.fixture?.status?.short ?? 'LIVE'),
          timestamp: now,
        };
        this.emit('score_update', scoreUpdate);
      }

      // Odds update if changed
      const markets = item?.markets ?? item?.odds;
      const oddsKey = markets && typeof markets === 'object'
        ? (markets['h2h'] || markets['1x2'] || markets['match_winner'] || markets['main'])
        : null;
      if (oddsKey) {
        const outcomes = Array.isArray(oddsKey) ? oddsKey : (oddsKey?.outcomes ?? oddsKey?.selections ?? []);
        const getO = (keys: string[]) => {
          const o = outcomes.find((x: any) => keys.includes(String(x?.label ?? x?.name ?? x?.outcome ?? x?.id ?? '').toLowerCase()));
          return o ? Number(o?.odd ?? o?.price ?? o?.value ?? 0) : 0;
        };
        const newHome = getO(['home','1','casa']);
        const newDraw = getO(['draw','x','empate']);
        const newAway = getO(['away','2','fora']);
        if (newHome > 0 || newDraw > 0 || newAway > 0) {
          const prevMatch = prev as any;
          const prevOdds = prevMatch?.odds;
          if (!prevOdds || prevOdds.home !== newHome || prevOdds.draw !== newDraw || prevOdds.away !== newAway) {
            const oddsUpdate: LiveOddsUpdate = {
              matchId, odds: { home: newHome, draw: newDraw, away: newAway }, timestamp: now,
            };
            this.emit('odds_update', oddsUpdate);
          }
        }
      }

      // Update local cache
      this.liveMatches.set(matchId, { ...((prev as any) || {}), ...item, id: matchId } as Match);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // EVENT EMITTER
  // ═══════════════════════════════════════════════════════════════════════════

  on<K extends keyof EventListeners>(
    event: K,
    callback: EventListeners[K] extends Set<infer T> ? T : never
  ): () => void {
    (this.listeners[event] as Set<typeof callback>).add(callback);
    
    // Retornar função de unsubscribe
    return () => {
      (this.listeners[event] as Set<typeof callback>).delete(callback);
    };
  }

  off<K extends keyof EventListeners>(
    event: K,
    callback: EventListeners[K] extends Set<infer T> ? T : never
  ): void {
    (this.listeners[event] as Set<typeof callback>).delete(callback);
  }

  private emit<K extends keyof EventListeners>(
    event: K,
    data: EventListeners[K] extends Set<EventCallback<infer T>> ? T : never
  ): void {
    (this.listeners[event] as Set<EventCallback<typeof data>>).forEach(callback => {
      try {
        callback(data);
      } catch (error) {
        console.error(`❌ [WebSocket] Erro no listener ${event}:`, error);
      }
    });

    // Também emitir como CustomEvent para componentes que preferem
    window.dispatchEvent(new CustomEvent(`ws-${event}`, { detail: data }));
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // API PÚBLICA
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * ✅ Atualizar odds reais vindas do backend
   */
  updateMatchOdds(matchId: string, odds: { home: number; draw: number; away: number }): void {
    const match = this.liveMatches.get(matchId);
    if (!match) return;

    (match as any).odds = odds;
    this.liveMatches.set(matchId, match);

    const oddsUpdate: LiveOddsUpdate = {
      matchId,
      odds,
      timestamp: Date.now(),
    };

    this.emit('odds_update', oddsUpdate);
  }

  /**
   * Registar jogos ao vivo para receber atualizações
   */
  registerMatches(matches: Match[]): void {
    matches.forEach(match => {
      const matchId = String(match.id);
      this.liveMatches.set(matchId, match);
      
      if (match.homeScore !== undefined && match.awayScore !== undefined) {
        this.lastScores.set(matchId, {
          home: match.homeScore,
          away: match.awayScore,
        });
      }

      if ((match as any).odds) {
        const o = (match as any).odds as { home: number; draw: number; away: number };
        this.updateMatchOdds(matchId, o);
      }
    });

    console.log(`📝 [WebSocket] ${matches.length} jogos registados para atualizações`);
  }

  /**
   * Recebe batch de odds do backend
   */
  updateOddsBatch(list: { matchId: string; odds: { home: number; draw: number; away: number } }[]): void {
    list.forEach((item) => {
      this.updateMatchOdds(item.matchId, item.odds);
    });
  }

  /**
   * Remover jogo do registo
   */
  unregisterMatch(matchId: string): void {
    this.liveMatches.delete(matchId);
    this.lastScores.delete(matchId);
  }

  /**
   * Obter estado da conexão
   */
  getConnectionState(): { connected: boolean; reconnectAttempts: number } {
    return {
      connected: this.isConnected,
      reconnectAttempts: this.reconnectAttempts,
    };
  }

  /**
   * Obter jogos registados
   */
  getRegisteredMatches(): Match[] {
    return Array.from(this.liveMatches.values());
  }

  /**
   * Forçar atualização (útil para debug)
   */
  forceUpdate(): void {
    if (CONFIG.USE_LOCAL_SIMULATION) {
      this.simulateUpdates();
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// SINGLETON
// ═══════════════════════════════════════════════════════════════════════════

export const liveScoresWS = new LiveScoresWebSocket();

// Auto-conectar quando o módulo é importado
if (typeof window !== 'undefined') {
  // Conectar após um pequeno delay para garantir que a app está pronta
  setTimeout(() => {
    liveScoresWS.connect();
  }, 1000);
}

export default liveScoresWS;
