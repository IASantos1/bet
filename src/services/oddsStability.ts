/**
 * Sistema de Rastreamento de Estabilidade de Odds
 * - Monitoriza variações de odds ao longo do tempo
 * - Classifica jogos como estáveis ou instáveis
 * - Permite filtrar jogos por estabilidade
 */

export interface OddsStabilityRecord {
  matchId: string;
  lastVariation: Date | null;
  variationCount: number;
  totalVariationPercent: number;
  isStable: boolean;
  stabilityScore: number; // 0-100, quanto maior mais estável
  lastOdds: {
    home?: number;
    draw?: number;
    away?: number;
  };
}

// Configuração de estabilidade - MAIS TOLERANTE
export const STABILITY_CONFIG = {
  // Tempo sem variação para considerar estável (em ms)
  stableTimeThreshold: 10 * 60 * 1000, // ✅ 10 minutos (era 5 min)
  
  // Variação máxima (%) para ainda considerar estável
  maxVariationPercent: 5, // ✅ 5% (era 3%)
  
  // Número máximo de variações nos últimos 15 minutos
  maxRecentVariations: 3, // ✅ 3 variações (era 2)
  
  // Janela de tempo para contar variações recentes (em ms)
  recentVariationWindow: 15 * 60 * 1000, // ✅ 15 minutos (era 10 min)
};

// Armazenamento de estabilidade por jogo
const stabilityMap = new Map<string, OddsStabilityRecord>();

// Histórico de variações por jogo (timestamp de cada variação)
const variationHistory = new Map<string, Date[]>();

// Listeners para mudanças de estabilidade
type StabilityListener = (matchId: string, record: OddsStabilityRecord) => void;
const stabilityListeners: StabilityListener[] = [];

/**
 * Regista listener para mudanças de estabilidade
 */
export function onStabilityChange(listener: StabilityListener): () => void {
  stabilityListeners.push(listener);
  return () => {
    const idx = stabilityListeners.indexOf(listener);
    if (idx > -1) stabilityListeners.splice(idx, 1);
  };
}

/**
 * Notifica listeners sobre mudança de estabilidade
 */
function notifyStabilityChange(matchId: string, record: OddsStabilityRecord): void {
  stabilityListeners.forEach(listener => {
    try {
      listener(matchId, record);
    } catch (e) {
      console.error('Erro no listener de estabilidade:', e);
    }
  });
}

/**
 * Calcula score de estabilidade (0-100)
 */
function calculateStabilityScore(
  timeSinceLastVariation: number,
  recentVariationCount: number,
  avgVariationPercent: number
): number {
  let score = 100;
  
  // Penalizar por variações recentes
  score -= recentVariationCount * 15;
  
  // Penalizar por variação percentual alta
  score -= Math.min(avgVariationPercent * 5, 30);
  
  // Bonificar por tempo sem variação
  const minutesSinceVariation = timeSinceLastVariation / (60 * 1000);
  if (minutesSinceVariation >= 10) {
    score += 10;
  } else if (minutesSinceVariation >= 5) {
    score += 5;
  }
  
  return Math.max(0, Math.min(100, score));
}

/**
 * Processa atualização de odds e atualiza estabilidade
 */
export function processOddsForStability(
  matchId: string,
  odds: { home?: number; draw?: number; away?: number }
): OddsStabilityRecord {
  const now = new Date();
  const existing = stabilityMap.get(matchId);
  const history = variationHistory.get(matchId) || [];
  
  // Limpar variações antigas (fora da janela)
  const recentHistory = history.filter(
    date => now.getTime() - date.getTime() < STABILITY_CONFIG.recentVariationWindow
  );
  
  let hadVariation = false;
  let variationPercent = 0;
  
  if (existing && existing.lastOdds) {
    // Verificar se houve variação
    const markets: Array<'home' | 'draw' | 'away'> = ['home', 'draw', 'away'];
    
    for (const market of markets) {
      const prevOdd = existing.lastOdds[market];
      const newOdd = odds[market];
      
      if (prevOdd && newOdd && prevOdd !== newOdd) {
        const change = Math.abs((newOdd - prevOdd) / prevOdd) * 100;
        variationPercent = Math.max(variationPercent, change);
        hadVariation = true;
      }
    }
  }
  
  // Atualizar histórico de variações
  if (hadVariation) {
    recentHistory.push(now);
  }
  variationHistory.set(matchId, recentHistory);
  
  // Calcular tempo desde última variação
  const lastVariation = hadVariation ? now : (existing?.lastVariation || null);
  const timeSinceLastVariation = lastVariation 
    ? now.getTime() - lastVariation.getTime() 
    : STABILITY_CONFIG.stableTimeThreshold + 1;
  
  // Calcular variação média
  const totalVariation = (existing?.totalVariationPercent || 0) + variationPercent;
  const variationCount = (existing?.variationCount || 0) + (hadVariation ? 1 : 0);
  const avgVariation = variationCount > 0 ? totalVariation / variationCount : 0;
  
  // Calcular score de estabilidade
  const stabilityScore = calculateStabilityScore(
    timeSinceLastVariation,
    recentHistory.length,
    avgVariation
  );
  
  // Determinar se é estável
  const isStable = 
    timeSinceLastVariation >= STABILITY_CONFIG.stableTimeThreshold &&
    recentHistory.length <= STABILITY_CONFIG.maxRecentVariations &&
    avgVariation <= STABILITY_CONFIG.maxVariationPercent;
  
  const record: OddsStabilityRecord = {
    matchId,
    lastVariation,
    variationCount,
    totalVariationPercent: totalVariation,
    isStable,
    stabilityScore,
    lastOdds: { ...odds },
  };
  
  stabilityMap.set(matchId, record);
  
  // Notificar se houve mudança de estado
  if (!existing || existing.isStable !== isStable) {
    notifyStabilityChange(matchId, record);
  }
  
  return record;
}

/**
 * Obtém registo de estabilidade de um jogo
 */
export function getStabilityRecord(matchId: string): OddsStabilityRecord | null {
  return stabilityMap.get(matchId) || null;
}

/**
 * Verifica se um jogo tem odds estáveis
 */
export function isMatchStable(matchId: string): boolean {
  const record = stabilityMap.get(matchId);
  if (!record) return true; // Se não há registo, assumir estável
  return record.isStable;
}

/**
 * Obtém score de estabilidade de um jogo
 */
export function getStabilityScore(matchId: string): number {
  const record = stabilityMap.get(matchId);
  if (!record) return 100; // Se não há registo, assumir máxima estabilidade
  return record.stabilityScore;
}

/**
 * Filtra lista de jogos por estabilidade
 */
export function filterStableMatches<T extends { id: string | number }>(
  matches: T[],
  onlyStable: boolean = true
): T[] {
  if (!onlyStable) return matches;
  
  return matches.filter(match => {
    const matchId = String(match.id);
    return isMatchStable(matchId);
  });
}

/**
 * Obtém estatísticas de estabilidade
 */
export function getStabilityStats() {
  const records = Array.from(stabilityMap.values());
  const stableCount = records.filter(r => r.isStable).length;
  const unstableCount = records.filter(r => !r.isStable).length;
  const avgScore = records.length > 0
    ? records.reduce((sum, r) => sum + r.stabilityScore, 0) / records.length
    : 100;
  
  return {
    totalTracked: records.length,
    stableMatches: stableCount,
    unstableMatches: unstableCount,
    averageScore: Math.round(avgScore),
    stablePercentage: records.length > 0 
      ? Math.round((stableCount / records.length) * 100) 
      : 100,
  };
}

/**
 * Obtém todos os jogos ordenados por estabilidade
 */
export function getMatchesByStability(): OddsStabilityRecord[] {
  return Array.from(stabilityMap.values())
    .sort((a, b) => b.stabilityScore - a.stabilityScore);
}

/**
 * Limpa dados de estabilidade
 */
export function clearStabilityData(): void {
  stabilityMap.clear();
  variationHistory.clear();
}

/**
 * Remove registo de um jogo específico
 */
export function removeStabilityRecord(matchId: string): void {
  stabilityMap.delete(matchId);
  variationHistory.delete(matchId);
}

/**
 * Atualiza configuração de estabilidade
 */
export function updateStabilityConfig(config: Partial<typeof STABILITY_CONFIG>): void {
  Object.assign(STABILITY_CONFIG, config);
}

/**
 * Obtém tempo desde última variação formatado
 */
export function getTimeSinceLastVariation(matchId: string): string {
  const record = stabilityMap.get(matchId);
  if (!record || !record.lastVariation) return 'Sem variações';
  
  const now = new Date();
  const diff = now.getTime() - record.lastVariation.getTime();
  
  const minutes = Math.floor(diff / (60 * 1000));
  const seconds = Math.floor((diff % (60 * 1000)) / 1000);
  
  if (minutes >= 60) {
    const hours = Math.floor(minutes / 60);
    return `${hours}h ${minutes % 60}min`;
  }
  
  if (minutes > 0) {
    return `${minutes}min ${seconds}s`;
  }
  
  return `${seconds}s`;
}
