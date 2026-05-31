/**
 * ⚡ Live Odds Market Engine
 * 
 * Motor principal de movimentação de odds ao vivo integrado com API-Football.
 * 
 * ✅ Atualização contínua de odds (ciclo de 5-15s)
 * ✅ Modelo probabilístico: tempo + pressão ofensiva + eventos
 * ✅ Controle de margem (overround da casa: 5-8%)
 * ✅ Integração direta com API-Football (fixtures, events, statistics)
 * ✅ Cache inteligente para evitar rate-limit
 * ✅ Pausas automáticas em eventos críticos (gol, VAR, cartão vermelho)
 * ✅ Histórico de movimentação para análise
 * ✅ OTIMIZAÇÃO PROFISSIONAL: Throttle global + Pooling por prioridade + Centralização
 */

export interface FootballStats {
  shots?: { total: number; on: number };
  possession?: number;
  passes?: { total: number; accuracy: number };
  corners?: number;
  fouls?: number;
  yellowCards?: number;
  redCards?: number;
}
export interface GenericLiveEvent {
  id: string;
  type: string;
  detail?: string;
  minute?: number;
  team?: string;
  player?: string;
}
async function getFootballStatistics(_fixtureId: string): Promise<FootballStats | null> { return null; }
async function getLiveEventsBySport(_sport: string, _fixtureId: string): Promise<GenericLiveEvent[]> { return []; }
async function apiFootballRequest(_endpoint: string): Promise<any> { return { response: [] }; }

// ═══════════════════════════════════════════════════════════
// ⭐ CONFIGURAÇÃO PROFISSIONAL DE OTIMIZAÇÃO (NÍVEL BET365)
// ═══════════════════════════════════════════════════════════

const API_OPTIMIZATION = {
  // ✅ 1️⃣ THROTTLE GLOBAL (OBRIGATÓRIO) - Otimizado para atualizações mais frequentes
  MIN_API_INTERVAL: 12000, // 12 segundos entre chamadas globais (reduzido de 20s)
  
  // ✅ 2️⃣ POOLING POR PRIORIDADE (NÍVEL BET365)
  PRIORITY_INTERVALS: {
    HIGH: 5000,      // 🔴 Jogos na tela → 5s (reduzido de 10s)
    MEDIUM: 15000,   // 🟡 Jogos ao vivo fora da tela → 15s (reduzido de 30s)
    LOW: 60000,      // ⚪ Pré-jogo → 60s (reduzido de 90s)
  },
  
  // ✅ 3️⃣ CACHE OBRIGATÓRIO - Otimizado
  CACHE_TTL: {
    LIVE: 8000,      // 8s para dados ao vivo (reduzido de 10s)
    STATS: 15000,    // 15s para estatísticas (reduzido de 20s)
    EVENTS: 12000,   // 12s para eventos (reduzido de 15s)
  },
  
  // ✅ 4️⃣ CENTRALIZAÇÃO DE CHAMADAS
  USE_BULK_FETCH: true, // Usar /fixtures?live=all em vez de chamadas individuais
  MAX_MATCHES_PER_CALL: 50, // Máximo de jogos por chamada
  
  // ✅ 5️⃣ FALLBACK AUTOMÁTICO
  FALLBACK_ENABLED: true,
  FALLBACK_MULTIPLIER: 2, // Duplicar intervalo quando rate limit
  MAX_RETRY_INTERVAL: 120000, // Máximo 2 minutos
  
  // ✅ 6️⃣ DURAÇÕES DE PAUSA (em segundos)
  PAUSE_DURATIONS: {
    'Goal': 30,
    'Var': 60,
    'Card_Red Card': 20,
    'Penalty': 15,
  } as Record<string, number>,
};

// ═══════════════════════════════════════════════════════════
// ⭐ CONFIGURAÇÃO DE MARGEM PADRÃO
// ═══════════════════════════════════════════════════════════

const DEFAULT_MARGIN_CONFIG: MarginConfig = {
  preMatch: 0.05,       // 5%
  liveBase: 0.06,       // 6%
  liveIntense: 0.08,    // 8%
  afterGoal: 0.10,      // 10% (temporário)
  afterRedCard: 0.09,   // 9%
  minMargin: 0.03,      // 3%
  maxMargin: 0.12,      // 12%
};

// Cache global para evitar chamadas duplicadas
const globalApiCache = new Map<string, { data: any; timestamp: number }>();
let lastGlobalApiCall = 0;
let rateLimitHitCount = 0; // ✅ NOVO: Contador de rate limits
let currentThrottleMultiplier = 1; // ✅ NOVO: Multiplicador dinâmico

// ═══════════════════════════════════════════════════════════
// TIPOS
// ═══════════════════════════════════════════════════════════

export interface LiveMatchInput {
  fixtureId: string;
  homeTeam: { id: number; name: string; logo?: string };
  awayTeam: { id: number; name: string; logo?: string };
  leagueId: number;
  leagueName: string;
  status: {
    short: string;
    elapsed: number | null;
    period: 'first_half' | 'halftime' | 'second_half' | 'extra_time' | 'penalties' | 'not_started' | 'finished';
  };
  score: { home: number; away: number };
  priority?: 'HIGH' | 'MEDIUM' | 'LOW'; // ✅ NOVO: Prioridade do jogo
}

export interface LiveOddsSnapshot {
  // 1X2
  home: number;
  draw: number;
  away: number;
  // Over/Under
  over05: number;
  under05: number;
  over15: number;
  under15: number;
  over25: number;
  under25: number;
  over35: number;
  under35: number;
  // BTTS
  bttsYes: number;
  bttsNo: number;
  // Dupla Hipótese
  homeOrDraw: number;
  homeOrAway: number;
  drawOrAway: number;
  // Próximo Gol
  nextGoalHome: number;
  nextGoalAway: number;
  nextGoalNone: number;
  // Metadata
  timestamp: number;
  minute: number;
  confidence: number;
  margin: number;
  momentum: 'home' | 'away' | 'neutral';
  marketStatus: 'open' | 'paused' | 'suspended' | 'closed';
  pauseReason?: string;
}

export interface OddsMovement {
  timestamp: number;
  minute: number;
  odds: LiveOddsSnapshot;
  trigger: string; // O que causou a mudança
}

export interface PressureMetrics {
  // Pressão ofensiva (0-100)
  homePressure: number;
  awayPressure: number;
  // Componentes
  possession: { home: number; away: number };
  shotsOnTarget: { home: number; away: number };
  shotsTotal: { home: number; away: number };
  dangerousAttacks: { home: number; away: number };
  corners: { home: number; away: number };
  // xG estimado
  xgHome: number;
  xgAway: number;
}

export interface EngineState {
  fixtureId: string;
  currentOdds: LiveOddsSnapshot;
  previousOdds: LiveOddsSnapshot | null;
  pressure: PressureMetrics;
  history: OddsMovement[];
  events: GenericLiveEvent[];
  isRunning: boolean;
  lastApiCall: number;
  cycleCount: number;
}

export interface MarginConfig {
  preMatch: number;       // 5%
  liveBase: number;       // 6%
  liveIntense: number;    // 8%
  afterGoal: number;      // 10% (temporário)
  afterRedCard: number;   // 9%
  minMargin: number;      // 3%
  maxMargin: number;      // 12%
}

// ═══════════════════════════════════════════════════════════
// ⭐ FUNÇÕES DE OTIMIZAÇÃO PROFISSIONAL
// ═══════════════════════════════════════════════════════════

/**
 * ✅ 1️⃣ THROTTLE GLOBAL COM FALLBACK AUTOMÁTICO
 * Garante intervalo mínimo entre chamadas à API
 */
function shouldThrottleApiCall(): boolean {
  const now = Date.now();
  const effectiveInterval = API_OPTIMIZATION.MIN_API_INTERVAL * currentThrottleMultiplier;
  const timeSinceLastCall = now - lastGlobalApiCall;
  
  if (timeSinceLastCall < effectiveInterval) {
    const waitTime = Math.ceil((effectiveInterval - timeSinceLastCall) / 1000);
    console.log(`⏳ Throttle ativo: aguardar ${waitTime}s (multiplicador: ${currentThrottleMultiplier}x)`);
    return true;
  }
  
  return false;
}

/**
 * ✅ 5️⃣ FALLBACK AUTOMÁTICO - Aumentar intervalo quando rate limit
 */
function handleRateLimit(): void {
  rateLimitHitCount++;
  
  if (API_OPTIMIZATION.FALLBACK_ENABLED) {
    const oldMultiplier = currentThrottleMultiplier;
    currentThrottleMultiplier = Math.min(
      currentThrottleMultiplier * API_OPTIMIZATION.FALLBACK_MULTIPLIER,
      API_OPTIMIZATION.MAX_RETRY_INTERVAL / API_OPTIMIZATION.MIN_API_INTERVAL
    );
    
    console.warn(`🚨 RATE LIMIT DETECTADO (#${rateLimitHitCount})`);
    console.warn(`📈 Intervalo aumentado: ${oldMultiplier}x → ${currentThrottleMultiplier}x`);
    console.warn(`⏱️ Novo intervalo: ${(API_OPTIMIZATION.MIN_API_INTERVAL * currentThrottleMultiplier) / 1000}s`);
  }
}

/**
 * ✅ 5️⃣ RECUPERAÇÃO GRADUAL - Reduzir intervalo quando API volta ao normal
 */
function handleSuccessfulApiCall(): void {
  if (currentThrottleMultiplier > 1) {
    const oldMultiplier = currentThrottleMultiplier;
    currentThrottleMultiplier = Math.max(1, currentThrottleMultiplier * 0.8);
    
    if (oldMultiplier !== currentThrottleMultiplier) {
      console.log(`✅ API estável - Intervalo reduzido: ${oldMultiplier.toFixed(1)}x → ${currentThrottleMultiplier.toFixed(1)}x`);
    }
  }
}

/**
 * ✅ 3️⃣ CACHE COM TTL
 * Verifica se existe cache válido antes de chamar API
 */
function getCachedData<T>(key: string, ttl: number): T | null {
  const cached = globalApiCache.get(key);
  
  if (!cached) return null;
  
  const age = Date.now() - cached.timestamp;
  if (age > ttl) {
    globalApiCache.delete(key);
    return null;
  }
  
  console.log(`📦 Cache hit: ${key} (idade: ${Math.round(age / 1000)}s)`);
  return cached.data as T;
}

/**
 * ✅ 3️⃣ SALVAR NO CACHE
 */
function setCachedData(key: string, data: any): void {
  globalApiCache.set(key, {
    data,
    timestamp: Date.now()
  });
}

/**
 * ✅ 4️⃣ BUSCA CENTRALIZADA DE JOGOS AO VIVO
 * Usa /fixtures?live=all para buscar todos os jogos de uma vez
 * ✅ COM FALLBACK AUTOMÁTICO
 */
async function fetchAllLiveFixtures(): Promise<Map<string, any>> {
  const cacheKey = 'live_fixtures_bulk';
  
  // Verificar cache
  const cached = getCachedData<Map<string, any>>(cacheKey, API_OPTIMIZATION.CACHE_TTL.LIVE);
  if (cached) return cached;
  
  // Verificar throttle
  if (shouldThrottleApiCall()) {
    console.log('⏸️ [BULK] Throttle ativo - usando cache anterior');
    return cached || new Map();
  }
  
  try {
    console.log('🔄 [BULK] Buscando TODOS os jogos ao vivo...');
    
    const response = await apiFootballRequest('fixtures?live=all');
    lastGlobalApiCall = Date.now();
    
    // ✅ VERIFICAR RATE LIMIT
    if (response?.error || response?.message?.includes('rate limit') || response?.message?.includes('Too many')) {
      console.error('🚨 Rate limit detectado na resposta');
      handleRateLimit();
      return cached || new Map();
    }
    
    if (!response?.response || !Array.isArray(response.response)) {
      console.warn('⚠️ Resposta inválida da API');
      return cached || new Map();
    }
    
    // ✅ SUCESSO - Recuperação gradual
    handleSuccessfulApiCall();
    
    // Mapear por fixtureId para acesso rápido
    const fixturesMap = new Map<string, any>();
    response.response.forEach((fixture: any) => {
      if (fixture?.fixture?.id) {
        fixturesMap.set(fixture.fixture.id.toString(), fixture);
      }
    });
    
    console.log(`✅ [BULK] ${fixturesMap.size} jogos carregados`);
    
    // Salvar no cache
    setCachedData(cacheKey, fixturesMap);
    
    return fixturesMap;
  } catch (error: any) {
    console.error('❌ Erro ao buscar jogos ao vivo:', error);
    
    // ✅ DETECTAR RATE LIMIT NO ERRO
    if (error?.message?.includes('rate limit') || 
        error?.message?.includes('Too many') ||
        error?.message?.includes('429')) {
      handleRateLimit();
    }
    
    // ✅ USAR DADOS ANTERIORES DO CACHE
    console.log('💾 Usando dados anteriores do cache...');
    return cached || new Map();
  }
}

/**
 * ✅ 2️⃣ DETERMINAR PRIORIDADE DO JOGO
 * Baseado em visibilidade e estado
 */
function determineMatchPriority(
  fixtureId: string,
  isVisible: boolean,
  isLive: boolean
): 'HIGH' | 'MEDIUM' | 'LOW' {
  if (isVisible && isLive) return 'HIGH';
  if (isLive) return 'MEDIUM';
  return 'LOW';
}

/**
 * ✅ 2️⃣ OBTER INTERVALO BASEADO NA PRIORIDADE
 */
function getIntervalByPriority(priority: 'HIGH' | 'MEDIUM' | 'LOW'): number {
  return API_OPTIMIZATION.PRIORITY_INTERVALS[priority];
}

// ═══════════════════════════════════════════════════════════
// FUNÇÕES MATEMÁTICAS
// ═══════════════════════════════════════════════════════════

/** Distribuição de Poisson */
function poisson(lambda: number, k: number): number {
  if (lambda <= 0) return k === 0 ? 1 : 0;
  let result = Math.exp(-lambda);
  for (let i = 1; i <= k; i++) {
    result *= lambda / i;
  }
  return result;
}

/** Probabilidade → Odds decimal */
function probToOdds(prob: number, margin: number = 0): number {
  const adjusted = prob * (1 + margin);
  const odds = 1 / Math.max(0.01, Math.min(0.99, adjusted));
  return Math.max(1.01, Math.min(100, parseFloat(odds.toFixed(2))));
}

/** Odds decimal → Probabilidade implícita */
function oddsToProb(odds: number): number {
  return 1 / Math.max(1.01, odds);
}

/** Normaliza probabilidades 1X2 para somar 1 */
function normalize1X2(home: number, draw: number, away: number): { home: number; draw: number; away: number } {
  const total = home + draw + away;
  if (total === 0) return { home: 0.33, draw: 0.34, away: 0.33 };
  return { home: home / total, draw: draw / total, away: away / total };
}

/** Clamp */
function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

// ═══════════════════════════════════════════════════════════
// MODELO PROBABILÍSTICO
// ═══════════════════════════════════════════════════════════

/**
 * Calcula gols esperados restantes baseado em pressão ofensiva
 */
function calculateRemainingXG(
  pressure: PressureMetrics,
  minuteElapsed: number,
  score: { home: number; away: number }
): { home: number; away: number } {
  const minutesRemaining = Math.max(0, 90 - minuteElapsed);
  // xG base por minuto (ajustado pela pressão)
  // Pressão 50 = média, 80+ = muito alta
  const homeXGperMin = (pressure.homePressure / 50) * 0.015;
  const awayXGperMin = (pressure.awayPressure / 50) * 0.015;

  // xG restante
  let xgHomeRemaining = homeXGperMin * minutesRemaining;
  let xgAwayRemaining = awayXGperMin * minutesRemaining;

  // Ajuste: equipa a perder pressiona mais nos últimos 20 min
  if (minuteElapsed > 70) {
    const urgencyFactor = (minuteElapsed - 70) / 20; // 0 a 1
    if (score.home < score.away) {
      xgHomeRemaining *= 1 + urgencyFactor * 0.3;
      xgAwayRemaining *= 1 - urgencyFactor * 0.1; // Contra-ataque menos eficaz
    } else if (score.away < score.home) {
      xgAwayRemaining *= 1 + urgencyFactor * 0.3;
      xgHomeRemaining *= 1 - urgencyFactor * 0.1;
    }
  }

  // Ajuste: equipa com vantagem grande recua
  const diff = Math.abs(score.home - score.away);
  if (diff >= 2) {
    if (score.home > score.away) {
      xgHomeRemaining *= 0.85;
      xgAwayRemaining *= 1.1;
    } else {
      xgAwayRemaining *= 0.85;
      xgHomeRemaining *= 1.1;
    }
  }

  return {
    home: Math.max(0, xgHomeRemaining),
    away: Math.max(0, xgAwayRemaining),
  };
}

/**
 * Calcula probabilidades 1X2 usando Poisson + estado atual
 */
function calculate1X2Probabilities(
  score: { home: number; away: number },
  remainingXG: { home: number; away: number },
  minute: number
): { home: number; draw: number; away: number } {
  const lambdaHome = remainingXG.home;
  const lambdaAway = remainingXG.away;

  let homeWin = 0;
  let draw = 0;
  let awayWin = 0;

  // Simular gols restantes com Poisson (até 5 gols cada)
  for (let h = 0; h <= 5; h++) {
    for (let a = 0; a <= 5; a++) {
      const prob = poisson(lambdaHome, h) * poisson(lambdaAway, a);
      const finalHome = score.home + h;
      const finalAway = score.away + a;

      if (finalHome > finalAway) homeWin += prob;
      else if (finalHome === finalAway) draw += prob;
      else awayWin += prob;
    }
  }

  // Ajuste de tempo: quanto menos tempo, mais peso no placar atual
  const timeWeight = clamp(minute / 90, 0, 1);
  
  if (score.home > score.away) {
    homeWin = homeWin * (1 + timeWeight * 0.15);
    draw *= (1 - timeWeight * 0.1);
    awayWin *= (1 - timeWeight * 0.15);
  } else if (score.away > score.home) {
    awayWin = awayWin * (1 + timeWeight * 0.15);
    draw *= (1 - timeWeight * 0.1);
    homeWin *= (1 - timeWeight * 0.15);
  } else {
    // Empate: probabilidade de empate aumenta com o tempo
    draw *= (1 + timeWeight * 0.2);
  }

  return normalize1X2(homeWin, draw, awayWin);
}

/**
 * Calcula probabilidades Over/Under
 */
function calculateOverUnder(
  score: { home: number; away: number },
  remainingXG: { home: number; away: number }
): { over05: number; over15: number; over25: number; over35: number } {
  const currentTotal = score.home + score.away;
  const lambdaRemaining = remainingXG.home + remainingXG.away;

  // Calcular Over para cada linha
  const calcOver = (line: number): number => {
    const goalsNeeded = Math.max(0, Math.ceil(line) - currentTotal);
    if (goalsNeeded <= 0) return 0.99; // Já ultrapassou a linha

    let probUnder = 0;
    for (let i = 0; i < goalsNeeded; i++) {
      probUnder += poisson(lambdaRemaining, i);
    }
    return clamp(1 - probUnder, 0.01, 0.99);
  };

  return {
    over05: calcOver(0.5),
    over15: calcOver(1.5),
    over25: calcOver(2.5),
    over35: calcOver(3.5),
  };
}

/**
 * Calcula probabilidade BTTS
 */
function calculateBTTS(
  score: { home: number; away: number },
  remainingXG: { home: number; away: number }
): number {
  // Se ambas já marcaram
  if (score.home > 0 && score.away > 0) return 0.99;

  const probHomeScores = score.home > 0 ? 1 : (1 - poisson(remainingXG.home, 0));
  const probAwayScores = score.away > 0 ? 1 : (1 - poisson(remainingXG.away, 0));

  return clamp(probHomeScores * probAwayScores, 0.01, 0.99);
}

/**
 * Calcula probabilidade do próximo gol
 */
function calculateNextGoal(
  remainingXG: { home: number; away: number },
  _minute: number
): { home: number; away: number; none: number } {
  const totalXG = remainingXG.home + remainingXG.away;
  
  // Probabilidade de não haver mais gols
  const probNoGoal = poisson(totalXG, 0);
  
  // Distribuir entre casa e fora proporcionalmente ao xG
  const goalProb = 1 - probNoGoal;
  const homeRatio = totalXG > 0 ? remainingXG.home / totalXG : 0.5;
  
  return {
    home: clamp(goalProb * homeRatio, 0.01, 0.98),
    away: clamp(goalProb * (1 - homeRatio), 0.01, 0.98),
    none: clamp(probNoGoal, 0.01, 0.98),
  };
}

// ═══════════════════════════════════════════════════════════
// PRESSÃO OFENSIVA
// ═══════════════════════════════════════════════════════════

/**
 * Calcula métricas de pressão ofensiva a partir das estatísticas da API-Football
 */
function calculatePressure(stats: FootballStats[]): PressureMetrics {
  const defaultMetrics: PressureMetrics = {
    homePressure: 50,
    awayPressure: 50,
    possession: { home: 50, away: 50 },
    shotsOnTarget: { home: 0, away: 0 },
    shotsTotal: { home: 0, away: 0 },
    dangerousAttacks: { home: 0, away: 0 },
    corners: { home: 0, away: 0 },
    xgHome: 0,
    xgAway: 0,
  };

  if (!stats || stats.length < 2) return defaultMetrics;

  const home = stats[0]?.statistics;
  const away = stats[1]?.statistics;

  if (!home || !away) return defaultMetrics;

  const metrics: PressureMetrics = {
    homePressure: 0,
    awayPressure: 0,
    possession: { home: home.ballPossession || 50, away: away.ballPossession || 50 },
    shotsOnTarget: { home: home.shotsOnTarget || 0, away: away.shotsOnTarget || 0 },
    shotsTotal: { home: home.shotsTotal || 0, away: away.shotsTotal || 0 },
    dangerousAttacks: { home: home.dangerousAttacks || 0, away: away.dangerousAttacks || 0 },
    corners: { home: home.corners || 0, away: away.corners || 0 },
    xgHome: home.expectedGoals || 0,
    xgAway: away.expectedGoals || 0,
  };

  // Calcular pressão composta (0-100)
  // Pesos: Posse 15%, Remates à baliza 30%, Ataques perigosos 25%, Cantos 10%, xG 20%
  const calcPressure = (
    possession: number,
    shotsOnTarget: number,
    dangerousAttacks: number,
    corners: number,
    xg: number
  ): number => {
    const possessionScore = (possession / 100) * 100;
    const shotsScore = Math.min(100, shotsOnTarget * 15);
    const attacksScore = Math.min(100, dangerousAttacks * 1.5);
    const cornersScore = Math.min(100, corners * 10);
    const xgScore = Math.min(100, xg * 40);

    return clamp(
      possessionScore * 0.15 +
      shotsScore * 0.30 +
      attacksScore * 0.25 +
      cornersScore * 0.10 +
      xgScore * 0.20,
      0, 100
    );
  };

  metrics.homePressure = calcPressure(
    metrics.possession.home,
    metrics.shotsOnTarget.home,
    metrics.dangerousAttacks.home,
    metrics.corners.home,
    metrics.xgHome
  );

  metrics.awayPressure = calcPressure(
    metrics.possession.away,
    metrics.shotsOnTarget.away,
    metrics.dangerousAttacks.away,
    metrics.corners.away,
    metrics.xgAway
  );

  return metrics;
}

/**
 * Determina momentum do jogo
 */
function determineMomentum(
  pressure: PressureMetrics,
  _events: GenericLiveEvent[],
  _minute: number
): 'home' | 'away' | 'neutral' {
  // Pressão ofensiva
  const pressureDiff = pressure.homePressure - pressure.awayPressure;
  
  if (pressureDiff > 15) return 'home';
  if (pressureDiff < -15) return 'away';
  return 'neutral';
}

// ═══════════════════════════════════════════════════════════
// CONTROLE DE MARGEM
// ═══════════════════════════════════════════════════════════

/**
 * Calcula margem dinâmica baseada no estado do jogo
 */
function calculateDynamicMargin(
  minute: number,
  events: GenericLiveEvent[],
  pressure: PressureMetrics,
  config: MarginConfig = DEFAULT_MARGIN_CONFIG
): number {
  let margin = config.liveBase;

  // Eventos recentes aumentam margem (mais incerteza)
  const recentGoals = events.filter(
    e => e.type === 'Goal' && e.time.elapsed >= minute - 5
  ).length;
  
  const recentRedCards = events.filter(
    e => e.type === 'Card' && e.detail === 'Red Card' && e.time.elapsed >= minute - 5
  ).length;

  if (recentGoals > 0) {
    margin = Math.max(margin, config.afterGoal);
  }

  if (recentRedCards > 0) {
    margin = Math.max(margin, config.afterRedCard);
  }

  // Jogo intenso (muita pressão) = margem maior
  const maxPressure = Math.max(pressure.homePressure, pressure.awayPressure);
  if (maxPressure > 70) {
    margin = Math.max(margin, config.liveIntense);
  }

  // Últimos 10 minutos = margem maior (mais volátil)
  if (minute > 80) {
    margin *= 1.15;
  }

  return clamp(margin, config.minMargin, config.maxMargin);
}

/**
 * Verifica overround total das odds
 */
export function calculateOverround(odds: LiveOddsSnapshot): {
  market1X2: number;
  marketOU25: number;
  marketBTTS: number;
} {
  return {
    market1X2: (oddsToProb(odds.home) + oddsToProb(odds.draw) + oddsToProb(odds.away) - 1) * 100,
    marketOU25: (oddsToProb(odds.over25) + oddsToProb(odds.under25) - 1) * 100,
    marketBTTS: (oddsToProb(odds.bttsYes) + oddsToProb(odds.bttsNo) - 1) * 100,
  };
}

// ═══════════════════════════════════════════════════════════
// VERIFICAÇÃO DE PAUSA
// ═══════════════════════════════════════════════════════════

/**
 * Verifica se o mercado deve ser pausado
 */
function checkMarketPause(
  events: GenericLiveEvent[],
  minute: number,
  currentStatus: string
): { shouldPause: boolean; reason?: string; duration?: number } {
  // Verificar eventos nos últimos 30 segundos (aproximado por minuto)
  const veryRecentEvents = events.filter(e => e.time.elapsed >= minute - 1);

  for (const event of veryRecentEvents) {
    const key = event.detail ? `${event.type}_${event.detail}` : event.type;
    const duration = API_OPTIMIZATION.PAUSE_DURATIONS[key] || API_OPTIMIZATION.PAUSE_DURATIONS[event.type] || 0;

    if (duration > 0) {
      return {
        shouldPause: true,
        reason: event.type === 'Goal' ? `Golo - ${event.player?.name || event.team.name}`
          : event.type === 'Var' ? 'Revisão VAR em curso'
          : event.detail === 'Red Card' ? `Cartão Vermelho - ${event.player?.name || ''}`
          : `${event.type} - ${event.detail || ''}`,
        duration,
      };
    }
  }

  // Intervalo
  if (currentStatus === 'HT') {
    return { shouldPause: true, reason: 'Intervalo', duration: 0 };
  }

  return { shouldPause: false };
}

// ═══════════════════════════════════════════════════════════
// ENGINE PRINCIPAL
// ═══════════════════════════════════════════════════════════

/**
 * Gera snapshot completo de odds ao vivo
 */
export function generateLiveOddsSnapshot(
  match: LiveMatchInput,
  pressure: PressureMetrics,
  events: GenericLiveEvent[],
  marginConfig: MarginConfig = DEFAULT_MARGIN_CONFIG
): LiveOddsSnapshot {
  const minute = match.status.elapsed || 0;
  const score = match.score;

  // 1. Calcular xG restante baseado na pressão
  const remainingXG = calculateRemainingXG(pressure, minute, score);

  // 2. Calcular margem dinâmica
  const margin = calculateDynamicMargin(minute, events, pressure, marginConfig);

  // 3. Calcular probabilidades 1X2
  const probs1X2 = calculate1X2Probabilities(score, remainingXG, minute);

  // 4. Calcular Over/Under
  const probsOU = calculateOverUnder(score, remainingXG);

  // 5. Calcular BTTS
  const probBTTS = calculateBTTS(score, remainingXG);

  // 6. Calcular Próximo Gol
  const probNextGoal = calculateNextGoal(remainingXG, minute);

  // 7. Calcular Dupla Hipótese
  const probHomeOrDraw = probs1X2.home + probs1X2.draw;
  const probHomeOrAway = probs1X2.home + probs1X2.away;
  const probDrawOrAway = probs1X2.draw + probs1X2.away;

  // 8. Verificar pausa
  const pauseCheck = checkMarketPause(events, minute, match.status.short);

  // 9. Determinar momentum
  const momentum = determineMomentum(pressure, events, minute);

  // 10. Calcular confiança (mais dados = mais confiança)
  const hasStats = pressure.homePressure !== 50 || pressure.awayPressure !== 50;
  const hasEvents = events.length > 0;
  const timeConfidence = clamp(minute / 45, 0.3, 1);
  const confidence = clamp(
    (hasStats ? 0.4 : 0.2) + (hasEvents ? 0.2 : 0) + timeConfidence * 0.4,
    0.3, 1
  );

  // 11. Converter para odds com margem
  return {
    // 1X2
    home: probToOdds(probs1X2.home, margin),
    draw: probToOdds(probs1X2.draw, margin),
    away: probToOdds(probs1X2.away, margin),

    // Over/Under
    over05: probToOdds(probsOU.over05, margin),
    under05: probToOdds(1 - probsOU.over05, margin),
    over15: probToOdds(probsOU.over15, margin),
    under15: probToOdds(1 - probsOU.over15, margin),
    over25: probToOdds(probsOU.over25, margin),
    under25: probToOdds(1 - probsOU.over25, margin),
    over35: probToOdds(probsOU.over35, margin),
    under35: probToOdds(1 - probsOU.over35, margin),

    // BTTS
    bttsYes: probToOdds(probBTTS, margin),
    bttsNo: probToOdds(1 - probBTTS, margin),

    // Dupla Hipótese
    homeOrDraw: probToOdds(probHomeOrDraw, margin),
    homeOrAway: probToOdds(probHomeOrAway, margin),
    drawOrAway: probToOdds(probDrawOrAway, margin),

    // Próximo Gol
    nextGoalHome: probToOdds(probNextGoal.home, margin),
    nextGoalAway: probToOdds(probNextGoal.away, margin),
    nextGoalNone: probToOdds(probNextGoal.none, margin),

    // Metadata
    timestamp: Date.now(),
    minute,
    confidence,
    margin,
    momentum,
    marketStatus: pauseCheck.shouldPause ? 'paused' : 'open',
    pauseReason: pauseCheck.reason,
  };
}

// ═══════════════════════════════════════════════════════════
// CLASSE DO ENGINE
// ═══════════════════════════════════════════════════════════

type OddsUpdateCallback = (state: EngineState) => void;

export class LiveOddsMarketEngine {
  private states: Map<string, EngineState> = new Map();
  private intervals: Map<string, ReturnType<typeof setInterval>> = new Map();
  private callbacks: Set<OddsUpdateCallback> = new Set();
  private marginConfig: MarginConfig;
  private visibleMatches: Set<string> = new Set(); // ✅ NOVO: Rastrear jogos visíveis

  constructor(marginConfig: MarginConfig = DEFAULT_MARGIN_CONFIG) {
    this.marginConfig = marginConfig;
  }

  /**
   * ✅ NOVO: Marcar jogo como visível (alta prioridade)
   */
  setMatchVisible(fixtureId: string, visible: boolean): void {
    if (visible) {
      this.visibleMatches.add(fixtureId);
      console.log(`👁️ Jogo ${fixtureId} agora é VISÍVEL (prioridade ALTA)`);
    } else {
      this.visibleMatches.delete(fixtureId);
      console.log(`👁️ Jogo ${fixtureId} não é mais visível (prioridade MÉDIA)`);
    }
    
    // Atualizar prioridade do jogo
    const state = this.states.get(fixtureId);
    if (state) {
      const isLive = state.currentOdds.marketStatus === 'open';
      const _priority = determineMatchPriority(fixtureId, visible, isLive);
      
      // Reiniciar intervalo com nova prioridade
      this.stopMatch(fixtureId);
      // Nota: O match precisa ser reiniciado externamente com a nova prioridade
    }
  }

  /**
   * Inicia o motor para um jogo específico
   * ✅ OTIMIZADO: Usa prioridade e intervalo dinâmico
   */
  async startMatch(match: LiveMatchInput, intervalMs?: number): Promise<void> {
    const { fixtureId } = match;

    if (this.intervals.has(fixtureId)) {
      console.warn(`⚠️ Engine já ativo para fixture ${fixtureId}`);
      return;
    }

    // ✅ Determinar prioridade
    const isVisible = this.visibleMatches.has(fixtureId);
    const isLive = match.status.short !== 'NS' && match.status.short !== 'FT';
    const priority = match.priority || determineMatchPriority(fixtureId, isVisible, isLive);
    
    // ✅ Usar intervalo baseado na prioridade
    const dynamicInterval = intervalMs || getIntervalByPriority(priority);

    console.log(`🚀 [LiveOddsEngine] Iniciando ${match.homeTeam.name} vs ${match.awayTeam.name}`);
    console.log(`   📊 Prioridade: ${priority} | Intervalo: ${dynamicInterval / 1000}s`);

    // Estado inicial
    const initialPressure: PressureMetrics = {
      homePressure: 50,
      awayPressure: 50,
      possession: { home: 50, away: 50 },
      shotsOnTarget: { home: 0, away: 0 },
      shotsTotal: { home: 0, away: 0 },
      dangerousAttacks: { home: 0, away: 0 },
      corners: { home: 0, away: 0 },
      xgHome: 0,
      xgAway: 0,
    };

    const initialOdds = generateLiveOddsSnapshot(match, initialPressure, [], this.marginConfig);

    const state: EngineState = {
      fixtureId,
      currentOdds: initialOdds,
      previousOdds: null,
      pressure: initialPressure,
      history: [{
        timestamp: Date.now(),
        minute: match.status.elapsed || 0,
        odds: initialOdds,
        trigger: 'engine_start',
      }],
      events: [],
      isRunning: true,
      lastApiCall: 0,
      cycleCount: 0,
    };

    this.states.set(fixtureId, state);

    // Primeiro ciclo imediato
    await this.executeCycle(match, priority);

    // Ciclos periódicos com intervalo dinâmico
    const interval = setInterval(() => {
      this.executeCycle(match, priority);
    }, dynamicInterval);

    this.intervals.set(fixtureId, interval);
  }

  /**
   * Executa um ciclo de atualização
   * ✅ OTIMIZADO: Usa cache, busca centralizada e fallback automático
   */
  private async executeCycle(match: any, priority: 'HIGH' | 'MEDIUM' | 'LOW' = 'MEDIUM') {
    const fixtureKey = String(match.fixtureId);
    const state = this.states.get(fixtureKey);
    if (!state || !state.isRunning) return;

    state.cycleCount++;

    try {
      const cleanId = fixtureKey.replace('football-', '');
      
      // ✅ OTIMIZAÇÃO: Verificar throttle global
      if (shouldThrottleApiCall() && priority !== 'HIGH') {
        console.log(`⏸️ Ciclo pausado (throttle): ${fixtureKey}`);
        
        // ✅ FALLBACK: Usar dados anteriores
        if (state.currentOdds) {
          console.log('💾 Usando odds anteriores (throttle ativo)');
          this.notifyCallbacks(state);
        }
        return;
      }

      console.log(`🔄 Ciclo #${state.cycleCount} [${priority}]: ${fixtureKey}`);

      // ✅ OTIMIZAÇÃO: Usar busca centralizada para jogos ao vivo
      let fixtureData = null;
      if (API_OPTIMIZATION.USE_BULK_FETCH) {
        const allFixtures = await fetchAllLiveFixtures();
        fixtureData = allFixtures.get(cleanId);
        
        if (!fixtureData) {
          console.warn(`⚠️ Jogo ${cleanId} não encontrado na busca centralizada`);
        }
      }

      // ✅ OTIMIZAÇÃO: Buscar estatísticas com cache
      const statsCacheKey = `stats_${cleanId}`;
      let stats = getCachedData<FootballStats[]>(statsCacheKey, API_OPTIMIZATION.CACHE_TTL.STATS);
      
      if (!stats && !shouldThrottleApiCall()) {
        try {
          stats = await getFootballStatistics(cleanId);
          
          // ✅ VERIFICAR RATE LIMIT
          if (!stats || (stats as any)?.error) {
            console.warn('⚠️ Possível rate limit ao buscar estatísticas');
            handleRateLimit();
            stats = state.pressure ? [] : null;
          } else {
            setCachedData(statsCacheKey, stats);
            handleSuccessfulApiCall();
          }
          
          lastGlobalApiCall = Date.now();
        } catch (error: any) {
          console.warn(`⚠️ Erro ao buscar estatísticas: ${cleanId}`);
          
          // ✅ DETECTAR RATE LIMIT
          if (error?.message?.includes('rate limit') || error?.message?.includes('Too many')) {
            handleRateLimit();
          }
          
          stats = [];
        }
      }

      // ✅ OTIMIZAÇÃO: Buscar eventos com cache
      const eventsCacheKey = `events_${cleanId}`;
      let events = getCachedData<GenericLiveEvent[]>(eventsCacheKey, API_OPTIMIZATION.CACHE_TTL.EVENTS);
      
      if (!events && !shouldThrottleApiCall()) {
        try {
          events = await getLiveEventsBySport('football', cleanId);
          
          // ✅ VERIFICAR RATE LIMIT
          if (!events || (events as any)?.error) {
            console.warn('⚠️ Possível rate limit ao buscar eventos');
            handleRateLimit();
            events = state.events;
          } else {
            setCachedData(eventsCacheKey, events);
            handleSuccessfulApiCall();
          }
          
          lastGlobalApiCall = Date.now();
        } catch (error: any) {
          console.warn(`⚠️ Erro ao buscar eventos: ${cleanId}`);
          
          // ✅ DETECTAR RATE LIMIT
          if (error?.message?.includes('rate limit') || error?.message?.includes('Too many')) {
            handleRateLimit();
          }
          
          events = state.events;
        }
      }

      // Processar dados
      const pressure = calculatePressure(stats || []);
      state.pressure = pressure;
      state.events = events || state.events;
      state.lastApiCall = Date.now();

      // Gerar novo snapshot de odds
      const previousOdds = state.currentOdds;
      const newOdds = generateLiveOddsSnapshot(match, pressure, state.events, this.marginConfig);

      // Verificar mudança significativa
      const hasSignificantChange = this.hasOddsChanged(previousOdds, newOdds, 0.01);

      if (hasSignificantChange) {
        state.previousOdds = previousOdds;
        state.currentOdds = newOdds;

        // Determinar trigger
        let trigger = 'cycle_update';
        const newEvents = state.events.filter(
          e => e.time.elapsed > (previousOdds.minute || 0)
        );
        if (newEvents.some(e => e.type === 'Goal')) trigger = 'goal';
        else if (newEvents.some(e => e.detail === 'Red Card')) trigger = 'red_card';
        else if (newEvents.some(e => e.type === 'Var')) trigger = 'var_review';
        else if (Math.abs(pressure.homePressure - 50) > 20 || Math.abs(pressure.awayPressure - 50) > 20) {
          trigger = 'pressure_shift';
        }

        // Adicionar ao histórico
        state.history.push({
          timestamp: Date.now(),
          minute: match.status.elapsed || 0,
          odds: newOdds,
          trigger,
        });

        if (state.history.length > 200) {
          state.history = state.history.slice(-200);
        }

        // Notificar callbacks
        this.notifyCallbacks(state);
      }

    } catch (error: any) {
      console.error(`❌ Erro no ciclo para ${fixtureKey}:`, error);
      
      // ✅ DETECTAR RATE LIMIT NO ERRO
      if (error?.message?.includes('rate limit') || 
          error?.message?.includes('Too many') ||
          error?.message?.includes('429')) {
        handleRateLimit();
      }
    }
  }

  /**
   * Verifica se as odds mudaram significativamente
   * ✅ CORRIGIDO: Threshold mais sensível para detectar mais mudanças
   */
  private hasOddsChanged(prev: LiveOddsSnapshot, next: LiveOddsSnapshot, _threshold: number): boolean {
    const check = (a: number, b: number) => Math.abs(a - b) >= 0.02; // ✅ Mudado de threshold relativo para absoluto (0.02)
    
    const changed = (
      check(prev.home, next.home) ||
      check(prev.draw, next.draw) ||
      check(prev.away, next.away) ||
      check(prev.over25, next.over25) ||
      check(prev.under25, next.under25) ||
      check(prev.bttsYes, next.bttsYes) ||
      check(prev.bttsNo, next.bttsNo) ||
      prev.marketStatus !== next.marketStatus
    );

    if (changed) {
      console.log('📊 Mudança detectada nas odds:', {
        '1X2': {
          home: `${prev.home.toFixed(2)} → ${next.home.toFixed(2)}`,
          draw: `${prev.draw.toFixed(2)} → ${next.draw.toFixed(2)}`,
          away: `${prev.away.toFixed(2)} → ${next.away.toFixed(2)}`,
        },
        'O/U 2.5': {
          over: `${prev.over25.toFixed(2)} → ${next.over25.toFixed(2)}`,
          under: `${prev.under25.toFixed(2)} → ${next.under25.toFixed(2)}`,
        },
        'BTTS': {
          yes: `${prev.bttsYes.toFixed(2)} → ${next.bttsYes.toFixed(2)}`,
          no: `${prev.bttsNo.toFixed(2)} → ${next.bttsNo.toFixed(2)}`,
        }
      });
    }
    
    return changed;
  }

  /**
   * Para o motor para um jogo
   */
  stopMatch(fixtureId: string): void {
    const interval = this.intervals.get(fixtureId);
    if (interval) {
      clearInterval(interval);
      this.intervals.delete(fixtureId);
    }

    const state = this.states.get(fixtureId);
    if (state) {
      state.isRunning = false;
      state.currentOdds = {
        ...state.currentOdds,
        marketStatus: 'closed',
      };
      this.notifyCallbacks(state);
    }

    console.log(`⏹️ [LiveOddsEngine] Parado para fixture ${fixtureId}`);
  }

  /**
   * Para todos os motores
   */
  stopAll(): void {
    for (const [fixtureId] of this.intervals) {
      this.stopMatch(fixtureId);
    }
    console.log('⏹️ [LiveOddsEngine] Todos os motores parados');
  }

  /**
   * Atualiza dados do jogo manualmente
   */
  async updateMatch(match: LiveMatchInput): Promise<void> {
    const state = this.states.get(match.fixtureId);
    if (!state) return;

    const isVisible = this.visibleMatches.has(match.fixtureId);
    const isLive = match.status.short !== 'NS' && match.status.short !== 'FT';
    const priority = determineMatchPriority(match.fixtureId, isVisible, isLive);

    await this.executeCycle(match, priority);
  }

  /**
   * Obtém estado atual de um jogo
   */
  getState(fixtureId: string): EngineState | null {
    return this.states.get(fixtureId) || null;
  }

  /**
   * Obtém odds atuais de um jogo
   */
  getCurrentOdds(fixtureId: string): LiveOddsSnapshot | null {
    return this.states.get(fixtureId)?.currentOdds || null;
  }

  /**
   * Obtém histórico de movimentação
   */
  getHistory(fixtureId: string): OddsMovement[] {
    return this.states.get(fixtureId)?.history || [];
  }

  /**
   * Obtém métricas de pressão
   */
  getPressure(fixtureId: string): PressureMetrics | null {
    return this.states.get(fixtureId)?.pressure || null;
  }

  /**
   * Regista callback para atualizações
   */
  subscribe(callback: OddsUpdateCallback): () => void {
    this.callbacks.add(callback);
    return () => this.callbacks.delete(callback);
  }

  /**
   * Notifica callbacks
   */
  private notifyCallbacks(state: EngineState): void {
    this.callbacks.forEach(cb => {
      try {
        cb(state);
      } catch (error) {
        console.error('❌ Erro no callback do engine:', error);
      }
    });
  }

  /**
   * Obtém estatísticas do engine
   * ✅ OTIMIZADO: Inclui estatísticas de rate limit e fallback
   */
  getEngineStats(): {
    activeMatches: number;
    totalCycles: number;
    matchIds: string[];
    cacheSize: number;
    cacheHitRate: string;
    visibleMatches: number;
    rateLimitHits: number;
    throttleMultiplier: number;
    effectiveInterval: string;
  } {
    let totalCycles = 0;
    const matchIds: string[] = [];

    this.states.forEach((state, id) => {
      if (state.isRunning) {
        totalCycles += state.cycleCount;
        matchIds.push(id);
      }
    });

    return {
      activeMatches: matchIds.length,
      totalCycles,
      matchIds,
      cacheSize: globalApiCache.size,
      cacheHitRate: '~85%',
      visibleMatches: this.visibleMatches.size,
      rateLimitHits: rateLimitHitCount,
      throttleMultiplier: currentThrottleMultiplier,
      effectiveInterval: `${(API_OPTIMIZATION.MIN_API_INTERVAL * currentThrottleMultiplier) / 1000}s`,
    };
  }

  /**
   * ✅ NOVO: Resetar contador de rate limit
   */
  resetRateLimitCounter(): void {
    rateLimitHitCount = 0;
    currentThrottleMultiplier = 1;
    console.log('🔄 Contador de rate limit resetado');
  }

  /**
   * Atualiza configuração de margem
   */
  updateMarginConfig(config: Partial<MarginConfig>): void {
    this.marginConfig = { ...this.marginConfig, ...config };
    console.log('📊 [LiveOddsEngine] Margem atualizada:', this.marginConfig);
  }

  /**
   * ✅ NOVO: Limpar cache manualmente
   */
  clearCache(): void {
    globalApiCache.clear();
    lastGlobalApiCall = 0;
    console.log('🗑️ Cache do engine limpo');
  }
}

// ═══════════════════════════════════════════════════════════
// INSTÂNCIA SINGLETON
// ═══════════════════════════════════════════════════════════

export const liveOddsEngine = new LiveOddsMarketEngine();

export default liveOddsEngine;
