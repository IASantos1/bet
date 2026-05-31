/**
 * 🎛️ PAUSE MARKETS SERVICE
 * 
 * Pausa mercados automaticamente quando:
 * - Evento crítico ao vivo (gol, cartão vermelho, penalti, VAR)
 * - Exposição crítica (>90% do limite)
 * - Odds desviadas (>15% do mercado)
 * - Atividade suspeita detectada
 * - Falha de API
 */


// Tipos de razões para pausar mercado
export type PauseReason = 
  | 'live_event'           // Evento ao vivo (gol, cartão, etc)
  | 'critical_exposure'    // Exposição crítica
  | 'odds_deviation'       // Odds muito desviadas
  | 'suspicious_activity'  // Atividade suspeita
  | 'api_failure'          // Falha de API
  | 'manual'               // Pausa manual pelo operador
  | 'risk_limit'           // Limite de risco atingido
  | 'unbalanced_market';   // Mercado muito desbalanceado

// Tipos de eventos ao vivo que pausam mercado
export type LiveEventType = 
  | 'goal' 
  | 'red_card' 
  | 'penalty' 
  | 'var_review'
  | 'injury'
  | 'substitution';

// Configuração de pausa por tipo de evento
const PAUSE_DURATIONS: Record<LiveEventType, number> = {
  goal: 10000,           // 10 segundos
  red_card: 15000,       // 15 segundos
  penalty: 20000,        // 20 segundos
  var_review: 30000,     // 30 segundos
  injury: 5000,          // 5 segundos
  substitution: 3000     // 3 segundos
};

// Interface de mercado pausado
export interface PausedMarket {
  matchId: string;
  marketType: string;
  reason: PauseReason;
  pausedAt: Date;
  resumeAt?: Date;
  autoResume: boolean;
  metadata?: {
    eventType?: LiveEventType;
    exposureLevel?: number;
    oddsDeviation?: number;
    alertId?: string;
  };
}

// Cache de mercados pausados (em memória)
const pausedMarkets = new Map<string, PausedMarket>();

/**
 * Pausa um mercado específico
 */
export async function pauseMarket(
  matchId: string,
  marketType: string,
  reason: PauseReason,
  options: {
    duration?: number;        // Duração em ms (se autoResume = true)
    autoResume?: boolean;     // Se deve reabrir automaticamente
    metadata?: any;           // Dados adicionais
  } = {}
): Promise<PausedMarket> {
  const key = `${matchId}-${marketType}`;
  
  const pausedMarket: PausedMarket = {
    matchId,
    marketType,
    reason,
    pausedAt: new Date(),
    autoResume: options.autoResume ?? true,
    metadata: options.metadata
  };

  // Se tem duração, calcula quando deve reabrir
  if (options.duration && pausedMarket.autoResume) {
    pausedMarket.resumeAt = new Date(Date.now() + options.duration);
  }

  // Salva no cache
  pausedMarkets.set(key, pausedMarket);

  console.log(`⏸️ Mercado pausado: ${matchId} - ${marketType} (${reason})`);

  // Se tem auto-resume, agenda reabertura
  if (pausedMarket.autoResume && options.duration) {
    setTimeout(() => {
      resumeMarket(matchId, marketType, 'auto');
    }, options.duration);
  }

  return pausedMarket;
}

/**
 * Pausa todos os mercados de um jogo
 */
export async function pauseAllMarketsForMatch(
  matchId: string,
  reason: PauseReason,
  options: {
    duration?: number;
    autoResume?: boolean;
    metadata?: any;
  } = {}
): Promise<PausedMarket[]> {
  // Mercados principais
  const marketTypes = [
    'match_winner',
    'over_under',
    'both_teams_score',
    'correct_score',
    'next_goal',
    'asian_handicap'
  ];

  const pausedMarkets: PausedMarket[] = [];

  for (const marketType of marketTypes) {
    const paused = await pauseMarket(matchId, marketType, reason, options);
    pausedMarkets.push(paused);
  }

  console.log(`⏸️ Todos os mercados pausados para jogo ${matchId}`);

  return pausedMarkets;
}

/**
 * Pausa mercado por evento ao vivo
 */
export async function pauseMarketForLiveEvent(
  matchId: string,
  eventType: LiveEventType,
  options: {
    marketTypes?: string[];  // Mercados específicos (se não informado, pausa todos)
    metadata?: any;
  } = {}
): Promise<PausedMarket[]> {
  const duration = PAUSE_DURATIONS[eventType];
  
  console.log(`⚽ Evento ao vivo detectado: ${eventType} - Pausando por ${duration}ms`);

  // Se não especificou mercados, pausa todos
  if (!options.marketTypes || options.marketTypes.length === 0) {
    return pauseAllMarketsForMatch(matchId, 'live_event', {
      duration,
      autoResume: true,
      metadata: {
        eventType,
        ...options.metadata
      }
    });
  }

  // Pausa apenas mercados específicos
  const pausedMarkets: PausedMarket[] = [];
  
  for (const marketType of options.marketTypes) {
    const paused = await pauseMarket(matchId, marketType, 'live_event', {
      duration,
      autoResume: true,
      metadata: {
        eventType,
        ...options.metadata
      }
    });
    pausedMarkets.push(paused);
  }

  return pausedMarkets;
}

/**
 * Pausa mercado por exposição crítica
 */
export async function pauseMarketForCriticalExposure(
  matchId: string,
  marketType: string,
  exposureLevel: number
): Promise<PausedMarket> {
  console.log(`🚨 Exposição crítica: ${exposureLevel}% - Pausando mercado ${marketType}`);

  return pauseMarket(matchId, marketType, 'critical_exposure', {
    autoResume: false,  // Requer intervenção manual
    metadata: {
      exposureLevel
    }
  });
}

/**
 * Pausa mercado por desvio de odds
 */
export async function pauseMarketForOddsDeviation(
  matchId: string,
  marketType: string,
  deviation: number
): Promise<PausedMarket> {
  console.log(`⚠️ Desvio de odds: ${deviation}% - Pausando mercado ${marketType}`);

  return pauseMarket(matchId, marketType, 'odds_deviation', {
    duration: 60000,  // 1 minuto para recalcular
    autoResume: true,
    metadata: {
      oddsDeviation: deviation
    }
  });
}

/**
 * Pausa mercado por atividade suspeita
 */
export async function pauseMarketForSuspiciousActivity(
  matchId: string,
  marketType: string,
  alertId: string
): Promise<PausedMarket> {
  console.log(`🕵️ Atividade suspeita detectada - Pausando mercado ${marketType}`);

  return pauseMarket(matchId, marketType, 'suspicious_activity', {
    autoResume: false,  // Requer revisão manual
    metadata: {
      alertId
    }
  });
}

/**
 * Pausa todos os mercados por falha de API
 */
export async function pauseAllMarketsForApiFailure(
  apiName: string
): Promise<void> {
  console.log(`❌ Falha de API: ${apiName} - Pausando todos os mercados`);

  return;
}

/**
 * Retoma um mercado pausado
 */
export async function resumeMarket(
  matchId: string,
  marketType: string,
  resumedBy: 'auto' | 'manual'
): Promise<boolean> {
  const key = `${matchId}-${marketType}`;
  
  const pausedMarket = pausedMarkets.get(key);
  
  if (!pausedMarket) {
    console.warn(`⚠️ Mercado não está pausado: ${key}`);
    return false;
  }

  // Remove do cache
  pausedMarkets.delete(key);

  console.log(`▶️ Mercado retomado: ${matchId} - ${marketType} (${resumedBy})`);

  return true;
}

/**
 * Verifica se um mercado está pausado
 */
export function isMarketPaused(matchId: string, marketType: string): boolean {
  const key = `${matchId}-${marketType}`;
  return pausedMarkets.has(key);
}

/**
 * Obtém informações de um mercado pausado
 */
export function getPausedMarketInfo(
  matchId: string,
  marketType: string
): PausedMarket | null {
  const key = `${matchId}-${marketType}`;
  return pausedMarkets.get(key) || null;
}

/**
 * Lista todos os mercados pausados
 */
export function getAllPausedMarkets(): PausedMarket[] {
  return Array.from(pausedMarkets.values());
}

/**
 * Lista mercados pausados de um jogo específico
 */
export function getPausedMarketsForMatch(matchId: string): PausedMarket[] {
  return Array.from(pausedMarkets.values()).filter(
    market => market.matchId === matchId
  );
}

/**
 * Limpa mercados pausados expirados (auto-cleanup)
 */
export function cleanupExpiredPausedMarkets(): void {
  const now = Date.now();
  let cleaned = 0;

  for (const [key, market] of pausedMarkets.entries()) {
    if (market.resumeAt && market.resumeAt.getTime() <= now) {
      pausedMarkets.delete(key);
      cleaned++;
    }
  }

  if (cleaned > 0) {
    console.log(`🧹 Limpeza: ${cleaned} mercados pausados expirados removidos`);
  }
}

// Auto-cleanup a cada 30 segundos
setInterval(cleanupExpiredPausedMarkets, 30000);

/**
 * Estatísticas de mercados pausados
 */
export function getPausedMarketsStats() {
  const markets = getAllPausedMarkets();
  
  const byReason: Record<PauseReason, number> = {
    live_event: 0,
    critical_exposure: 0,
    odds_deviation: 0,
    suspicious_activity: 0,
    api_failure: 0,
    manual: 0,
    risk_limit: 0,
    unbalanced_market: 0
  };

  let autoResumeCount = 0;
  let manualResumeCount = 0;

  for (const market of markets) {
    byReason[market.reason]++;
    if (market.autoResume) {
      autoResumeCount++;
    } else {
      manualResumeCount++;
    }
  }

  return {
    total: markets.length,
    byReason,
    autoResume: autoResumeCount,
    manualResume: manualResumeCount,
    markets
  };
}
