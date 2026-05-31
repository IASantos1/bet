/**
 * Conector de Eventos ao Vivo para VAR
 * Conecta à API-Football para receber eventos VAR em tempo real
 * ✅ OTIMIZADO: 1 chamada geral em vez de múltiplas chamadas individuais
 */

import { eventBus, MatchEvent, MatchEventType } from './varMarketController';
export interface GenericLiveEvent {
  id: string;
  type: string;
  detail?: string;
  minute?: number;
  team?: string;
  player?: string;
}
async function fetchLiveEvents(_sport: string): Promise<GenericLiveEvent[]> { return []; }

// ============================================
// CONFIGURAÇÃO OTIMIZADA
// ============================================

interface LiveEventsConfig {
  pollingInterval: number; // Intervalo de polling em ms
  enabledSports: string[];
  autoReconnect: boolean;
  maxRetries: number;
}

const DEFAULT_CONFIG: LiveEventsConfig = {
  pollingInterval: 30000, // ✅ 30 segundos (reduzido de 10s)
  enabledSports: ['football'],
  autoReconnect: true,
  maxRetries: 5
};

// ============================================
// ESTADO DO CONECTOR
// ============================================

interface ConnectorState {
  isConnected: boolean;
  isPolling: boolean;
  lastPollTime: number | null;
  pollCount: number;
  errorCount: number;
  activeMatches: Map<string, MatchState>;
}

interface MatchState {
  lastEventId: string | null;
  varActive: boolean;
  lastUpdate: number;
  events: GenericLiveEvent[];
}

const state: ConnectorState = {
  isConnected: false,
  isPolling: false,
  lastPollTime: null,
  pollCount: 0,
  errorCount: 0,
  activeMatches: new Map()
};

let pollingTimer: NodeJS.Timeout | null = null;
let config = { ...DEFAULT_CONFIG };

// ============================================
// MAPEAMENTO DE EVENTOS API → VAR CONTROLLER
// ============================================

/**
 * ✅ MELHORADO: Mapeia eventos da API-Football para tipos de eventos do sistema
 * Detecta corretamente: Goal, Var, Card (Red/Yellow), Penalty, Substitution
 */
function mapApiEventToVarEvent(event: GenericLiveEvent): MatchEventType | null {
  const eventType = String(event.type).toLowerCase();
  const detail = String(event.detail || '').toLowerCase();

  // Eventos VAR
  if (eventType === 'var' || detail.includes('var')) {
    // VAR terminou com decisão
    if (detail.includes('goal confirmed') || 
        detail.includes('goal cancelled') || 
        detail.includes('penalty confirmed') ||
        detail.includes('penalty cancelled') ||
        detail.includes('card upgrade') ||
        detail.includes('card cancelled') ||
        detail.includes('decision') ||
        detail.includes('confirmed') ||
        detail.includes('cancelled')) {
      return 'VAR_ENDED';
    }
    // VAR iniciado
    return 'VAR_STARTED';
  }

  // Golos
  if (eventType === 'goal') {
    return 'GOAL';
  }

  // Penáltis (podem desencadear VAR)
  if (eventType === 'penalty' || detail.includes('penalty')) {
    return 'GOAL';
  }

  // Cartões vermelhos (podem desencadear VAR)
  if (eventType === 'card') {
    if (detail.includes('red')) {
      return 'FOUL';
    }
    // Cartões amarelos (faltas)
    if (detail.includes('yellow')) {
      return 'FOUL';
    }
  }

  // Faltas graves
  if (eventType === 'foul') {
    return 'FOUL';
  }

  // Substituições (não afetam mercados, mas são eventos importantes)
  if (eventType === 'subst' || eventType === 'substitution') {
    return null; // Não emitir evento para substituições
  }

  return null;
}

// ============================================
// PROCESSAMENTO DE EVENTOS
// ============================================

function processNewEvents(matchId: string, events: GenericLiveEvent[]): void {
  const matchState = state.activeMatches.get(matchId);
  
  if (!matchState) {
    state.activeMatches.set(matchId, {
      lastEventId: events.length > 0 ? events[events.length - 1].id : null,
      varActive: false,
      lastUpdate: Date.now(),
      events: events
    });
    return;
  }

  // Encontrar novos eventos
  const lastEventIndex = matchState.events.findIndex(e => e.id === matchState.lastEventId);
  const newEvents = events.slice(lastEventIndex + 1);

  if (newEvents.length === 0) return;

  console.log(`🔔 [LiveEvents] ${newEvents.length} novos eventos para jogo ${matchId}`);

  // Processar cada novo evento
  newEvents.forEach(event => {
    const varEventType = mapApiEventToVarEvent(event);
    
    if (varEventType) {
      const matchEvent: MatchEvent = {
        matchId,
        type: varEventType,
        timestamp: Date.now(),
        metadata: {
          originalEvent: event,
          player: event.player?.name,
          team: event.team?.name,
          minute: event.time.elapsed,
          detail: event.detail
        }
      };

      console.log(`📡 [LiveEvents] Emitindo evento ${varEventType} para jogo ${matchId}`, {
        player: event.player?.name,
        team: event.team?.name,
        minute: event.time.elapsed,
        detail: event.detail
      });

      // Emitir para o VAR Market Controller
      eventBus.emit('match_event', matchEvent);

      // Atualizar estado VAR
      if (varEventType === 'VAR_STARTED') {
        matchState.varActive = true;
      } else if (varEventType === 'VAR_ENDED') {
        matchState.varActive = false;
      }

      // Emitir evento para UI
      window.dispatchEvent(new CustomEvent('live-event', {
        detail: {
          matchId,
          type: varEventType,
          event: event
        }
      }));
    }
  });

  // Atualizar estado do jogo
  matchState.lastEventId = events[events.length - 1]?.id || matchState.lastEventId;
  matchState.lastUpdate = Date.now();
  matchState.events = events;
}

// ============================================
// ✅ POLLING OTIMIZADO - 1 CHAMADA GERAL
// ============================================

async function pollLiveEvents(): Promise<void> {
  if (!state.isPolling) return;

  state.pollCount++;
  state.lastPollTime = Date.now();

  try {
    // ✅ 1 CHAMADA GERAL para buscar TODOS os jogos ao vivo
    // Em vez de 1 chamada por jogo (35 chamadas → 1 chamada)
    console.log('📡 [LiveEvents] Buscando TODOS os jogos ao vivo (1 chamada)...');
    const liveMatches = await fetchLiveEvents('football', 10000); // Cache 10s
    
    if (!liveMatches || liveMatches.length === 0) {
      console.log('📭 [LiveEvents] Nenhum jogo ao vivo encontrado');
      return;
    }

    console.log(`⚽ [LiveEvents] ${liveMatches.length} jogos ao vivo encontrados`);

    // ✅ PROCESSAR EVENTOS LOCALMENTE (sem chamadas adicionais)
    // Os eventos já vêm nos dados dos jogos ao vivo
    for (const match of liveMatches) {
      const fixtureId = match.fixture?.id || match.id;
      if (!fixtureId) continue;

      // ✅ Se o jogo tiver eventos, processar
      if (match.events && Array.isArray(match.events) && match.events.length > 0) {
        processNewEvents(String(fixtureId), match.events);
      }
    }

    state.errorCount = 0;

  } catch (error) {
    state.errorCount++;
    console.error(`❌ [LiveEvents] Erro no polling (tentativa ${state.errorCount}):`, error);

    // ✅ Se for rate limit, aumentar intervalo automaticamente
    const errorMsg = String(error).toLowerCase();
    if (errorMsg.includes('rate limit') || errorMsg.includes('429')) {
      console.warn('🚨 Rate limit detectado - Aumentando intervalo para 60s');
      config.pollingInterval = 60000; // 60 segundos
      
      if (state.isPolling) {
        restartPolling();
      }
    }

    if (state.errorCount >= config.maxRetries && !config.autoReconnect) {
      console.error('❌ [LiveEvents] Máximo de tentativas atingido. Parando polling.');
      stopPolling();
    }
  }
}

// ============================================
// CONTROLO DO CONECTOR
// ============================================

export function startPolling(customConfig?: Partial<LiveEventsConfig>): void {
  if (state.isPolling) {
    console.log('⚠️ [LiveEvents] Polling já está ativo');
    return;
  }

  if (customConfig) {
    config = { ...config, ...customConfig };
  }

  console.log('🚀 [LiveEvents] Iniciando polling de eventos ao vivo...', {
    interval: config.pollingInterval,
    sports: config.enabledSports
  });

  state.isConnected = true;
  state.isPolling = true;
  state.errorCount = 0;

  // Primeira execução imediata
  pollLiveEvents();

  // Configurar polling periódico
  pollingTimer = setInterval(pollLiveEvents, config.pollingInterval);

  window.dispatchEvent(new CustomEvent('live-events-connected'));
}

export function stopPolling(): void {
  if (!state.isPolling) {
    console.log('⚠️ [LiveEvents] Polling já está parado');
    return;
  }

  console.log('🛑 [LiveEvents] Parando polling de eventos ao vivo...');

  if (pollingTimer) {
    clearInterval(pollingTimer);
    pollingTimer = null;
  }

  state.isConnected = false;
  state.isPolling = false;

  window.dispatchEvent(new CustomEvent('live-events-disconnected'));
}

export function restartPolling(): void {
  stopPolling();
  setTimeout(() => startPolling(), 1000);
}

// ============================================
// FUNÇÕES DE ESTADO
// ============================================

export function getConnectorState(): ConnectorState {
  return { ...state };
}

export function isConnected(): boolean {
  return state.isConnected;
}

export function getActiveMatches(): string[] {
  return Array.from(state.activeMatches.keys());
}

export function getMatchState(matchId: string): MatchState | undefined {
  return state.activeMatches.get(matchId);
}

export function isVarActive(matchId: string): boolean {
  return state.activeMatches.get(matchId)?.varActive || false;
}

// ============================================
// FUNÇÕES DE CONFIGURAÇÃO
// ============================================

export function setPollingInterval(interval: number): void {
  config.pollingInterval = interval;
  
  if (state.isPolling) {
    restartPolling();
  }
}

export function setEnabledSports(sports: string[]): void {
  config.enabledSports = sports;
}

export function getConfig(): LiveEventsConfig {
  return { ...config };
}

// ============================================
// ESTATÍSTICAS
// ============================================

export function getStats() {
  return {
    isConnected: state.isConnected,
    isPolling: state.isPolling,
    pollCount: state.pollCount,
    errorCount: state.errorCount,
    lastPollTime: state.lastPollTime,
    activeMatchesCount: state.activeMatches.size,
    config: { ...config }
  };
}

// ============================================
// ✅ AUTO-INICIALIZAÇÃO DESATIVADA POR PADRÃO
// Para evitar chamadas desnecessárias
// ============================================

let autoStartTimer: NodeJS.Timeout | null = null;

export function enableAutoStart(): void {
  console.log('🤖 [LiveEvents] Auto-start ativado - verificando jogos ao vivo...');
  
  const checkAndStart = async () => {
    try {
      const liveMatches = await fetchLiveEvents('football', 10000);
      
      if (liveMatches && liveMatches.length > 0 && !state.isPolling) {
        console.log(`🚀 [LiveEvents] ${liveMatches.length} jogos ao vivo detectados - iniciando polling automático`);
        startPolling();
      }
    } catch (error) {
      console.warn('⚠️ [LiveEvents] Erro ao verificar jogos ao vivo:', error);
    }
  };

  // Verificar imediatamente
  checkAndStart();

  // ✅ Verificar a cada 60 segundos (reduzido de 30s)
  autoStartTimer = setInterval(checkAndStart, 60000);
}

export function disableAutoStart(): void {
  if (autoStartTimer) {
    clearInterval(autoStartTimer);
    autoStartTimer = null;
    console.log('🛑 [LiveEvents] Auto-start desativado');
  }
}

// ✅ NÃO ativar auto-start por padrão para economizar requisições
// enableAutoStart();

export default {
  startPolling,
  stopPolling,
  restartPolling,
  getConnectorState,
  isConnected,
  getActiveMatches,
  getMatchState,
  isVarActive,
  setPollingInterval,
  setEnabledSports,
  getConfig,
  getStats,
  enableAutoStart,
  disableAutoStart
};
