
/**
 * Sistema de Alertas Personalizados para Variações de Odds
 * - Monitoriza variações de odds em tempo real
 * - Permite configurar alertas personalizados por utilizador
 * - Notifica quando odds atingem valores específicos ou variam significativamente
 */

export interface OddsAlert {
  id: string;
  matchId: string;
  homeTeam: string;
  awayTeam: string;
  league: string;
  type: 'threshold' | 'variation' | 'value_bet' | 'steam_move';
  market: 'home' | 'draw' | 'away' | 'over' | 'under';
  condition: 'above' | 'below' | 'increase' | 'decrease';
  targetValue: number;
  currentValue: number;
  previousValue?: number;
  variationPercent?: number;
  createdAt: Date;
  triggeredAt?: Date;
  isActive: boolean;
  notified: boolean;
}

export interface OddsMovement {
  matchId: string;
  homeTeam: string;
  awayTeam: string;
  league: string;
  market: string;
  previousOdd: number;
  currentOdd: number;
  change: number;
  changePercent: number;
  direction: 'up' | 'down';
  timestamp: Date;
  isSteamMove: boolean;
  isValueBet: boolean;
}

export interface AlertConfig {
  enableThresholdAlerts: boolean;
  enableVariationAlerts: boolean;
  enableValueBetAlerts: boolean;
  enableSteamMoveAlerts: boolean;
  variationThreshold: number; // Percentagem mínima para alertar (ex: 5%)
  steamMoveThreshold: number; // Percentagem para considerar steam move (ex: 10%)
  valueBetMargin: number; // Margem para value bet (ex: 5%)
  soundEnabled: boolean;
  pushEnabled: boolean;
}

// Configuração padrão
const DEFAULT_CONFIG: AlertConfig = {
  enableThresholdAlerts: true,
  enableVariationAlerts: true,
  enableValueBetAlerts: true,
  enableSteamMoveAlerts: true,
  variationThreshold: 5,
  steamMoveThreshold: 10,
  valueBetMargin: 5,
  soundEnabled: false,
  pushEnabled: true,
};

// Estado interno
let userConfig: AlertConfig = { ...DEFAULT_CONFIG };
const activeAlerts: Map<string, OddsAlert> = new Map();
const oddsHistory: Map<string, { odd: number; timestamp: Date }[]> = new Map();
const recentMovements: OddsMovement[] = [];

// Listeners
type AlertListener = (alert: OddsAlert) => void;
type MovementListener = (movement: OddsMovement) => void;
const alertListeners: AlertListener[] = [];
const movementListeners: MovementListener[] = [];

/**
 * Regista listener para novos alertas
 */
export function onAlert(listener: AlertListener): () => void {
  alertListeners.push(listener);
  return () => {
    const idx = alertListeners.indexOf(listener);
    if (idx > -1) alertListeners.splice(idx, 1);
  };
}

/**
 * Regista listener para movimentos de odds
 */
export function onMovement(listener: MovementListener): () => void {
  movementListeners.push(listener);
  return () => {
    const idx = movementListeners.indexOf(listener);
    if (idx > -1) movementListeners.splice(idx, 1);
  };
}

/**
 * Notifica listeners sobre novo alerta
 */
function notifyAlert(alert: OddsAlert): void {
  alertListeners.forEach(listener => {
    try {
      listener(alert);
    } catch (e) {
      console.error('Erro no listener de alerta:', e);
    }
  });
}

/**
 * Notifica listeners sobre movimento de odds
 */
function notifyMovement(movement: OddsMovement): void {
  movementListeners.forEach(listener => {
    try {
      listener(movement);
    } catch (e) {
      console.error('Erro no listener de movimento:', e);
    }
  });
}

/**
 * Gera ID único para alerta
 */
function generateAlertId(): string {
  return `alert_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Gera chave única para histórico de odds
 */
function getOddsKey(matchId: string, market: string): string {
  return `${matchId}_${market}`;
}

/**
 * Atualiza configuração do utilizador
 */
export function updateConfig(config: Partial<AlertConfig>): void {
  userConfig = { ...userConfig, ...config };
  saveConfigToStorage();
}

/**
 * Obtém configuração atual
 */
export function getConfig(): AlertConfig {
  return { ...userConfig };
}

/**
 * Carrega configuração do localStorage
 */
export function loadConfigFromStorage(): void {
  try {
    const saved = localStorage.getItem('odds_alerts_config');
    if (saved) {
      userConfig = { ...DEFAULT_CONFIG, ...JSON.parse(saved) };
    }
  } catch (e) {
    console.warn('Erro ao carregar configuração de alertas:', e);
  }
}

/**
 * Guarda configuração no localStorage
 */
function saveConfigToStorage(): void {
  try {
    localStorage.setItem('odds_alerts_config', JSON.stringify(userConfig));
  } catch (e) {
    console.warn('Erro ao guardar configuração de alertas:', e);
  }
}

/**
 * Cria alerta de threshold (quando odd atinge valor específico)
 */
export function createThresholdAlert(
  matchId: string,
  homeTeam: string,
  awayTeam: string,
  league: string,
  market: 'home' | 'draw' | 'away' | 'over' | 'under',
  condition: 'above' | 'below',
  targetValue: number,
  currentValue: number
): OddsAlert {
  const alert: OddsAlert = {
    id: generateAlertId(),
    matchId,
    homeTeam,
    awayTeam,
    league,
    type: 'threshold',
    market,
    condition,
    targetValue,
    currentValue,
    createdAt: new Date(),
    isActive: true,
    notified: false,
  };
  
  activeAlerts.set(alert.id, alert);
  saveAlertsToStorage();
  
  return alert;
}

/**
 * Cria alerta de variação (quando odd varia X%)
 */
export function createVariationAlert(
  matchId: string,
  homeTeam: string,
  awayTeam: string,
  league: string,
  market: 'home' | 'draw' | 'away' | 'over' | 'under',
  condition: 'increase' | 'decrease',
  targetValue: number, // Percentagem de variação
  currentValue: number
): OddsAlert {
  const alert: OddsAlert = {
    id: generateAlertId(),
    matchId,
    homeTeam,
    awayTeam,
    league,
    type: 'variation',
    market,
    condition,
    targetValue,
    currentValue,
    createdAt: new Date(),
    isActive: true,
    notified: false,
  };
  
  activeAlerts.set(alert.id, alert);
  saveAlertsToStorage();
  
  return alert;
}

/**
 * Remove alerta
 */
export function removeAlert(alertId: string): boolean {
  const removed = activeAlerts.delete(alertId);
  if (removed) {
    saveAlertsToStorage();
  }
  return removed;
}

/**
 * Obtém todos os alertas ativos
 */
export function getActiveAlerts(): OddsAlert[] {
  return Array.from(activeAlerts.values()).filter(a => a.isActive);
}

/**
 * Obtém alertas disparados (não notificados)
 */
export function getTriggeredAlerts(): OddsAlert[] {
  return Array.from(activeAlerts.values()).filter(a => a.triggeredAt && !a.notified);
}

/**
 * Marca alerta como notificado
 */
export function markAlertAsNotified(alertId: string): void {
  const alert = activeAlerts.get(alertId);
  if (alert) {
    alert.notified = true;
    saveAlertsToStorage();
  }
}

/**
 * Processa atualização de odds e verifica alertas
 */
export function processOddsUpdate(
  matchId: string,
  homeTeam: string,
  awayTeam: string,
  league: string,
  odds: { home?: number; draw?: number; away?: number }
): OddsMovement[] {
  const movements: OddsMovement[] = [];
  
  const markets: Array<{ key: 'home' | 'draw' | 'away'; value?: number }> = [
    { key: 'home', value: odds.home },
    { key: 'draw', value: odds.draw },
    { key: 'away', value: odds.away },
  ];
  
  for (const { key, value } of markets) {
    if (value === undefined || value <= 1) continue;
    
    const oddsKey = getOddsKey(matchId, key);
    const history = oddsHistory.get(oddsKey) || [];
    
    // Verificar se houve mudança
    const lastEntry = history[history.length - 1];
    
    if (lastEntry && lastEntry.odd !== value) {
      const change = value - lastEntry.odd;
      const changePercent = (change / lastEntry.odd) * 100;
      const direction = change > 0 ? 'up' : 'down';
      
      // Detectar steam move (variação rápida e significativa)
      const isSteamMove = Math.abs(changePercent) >= userConfig.steamMoveThreshold;
      
      // Detectar value bet (odd muito acima do esperado)
      const isValueBet = value > 2.5 && changePercent > userConfig.valueBetMargin;
      
      const movement: OddsMovement = {
        matchId,
        homeTeam,
        awayTeam,
        league,
        market: key,
        previousOdd: lastEntry.odd,
        currentOdd: value,
        change,
        changePercent,
        direction,
        timestamp: new Date(),
        isSteamMove,
        isValueBet,
      };
      
      movements.push(movement);
      recentMovements.unshift(movement);
      
      // Manter apenas últimos 100 movimentos
      if (recentMovements.length > 100) {
        recentMovements.pop();
      }
      
      // Notificar listeners
      notifyMovement(movement);
      
      // Verificar alertas de variação
      if (userConfig.enableVariationAlerts && Math.abs(changePercent) >= userConfig.variationThreshold) {
        checkVariationAlerts(matchId, key, changePercent, value, lastEntry.odd, homeTeam, awayTeam, league);
      }
      
      // Criar alerta automático para steam move
      if (userConfig.enableSteamMoveAlerts && isSteamMove) {
        const steamAlert: OddsAlert = {
          id: generateAlertId(),
          matchId,
          homeTeam,
          awayTeam,
          league,
          type: 'steam_move',
          market: key,
          condition: direction === 'up' ? 'increase' : 'decrease',
          targetValue: userConfig.steamMoveThreshold,
          currentValue: value,
          previousValue: lastEntry.odd,
          variationPercent: changePercent,
          createdAt: new Date(),
          triggeredAt: new Date(),
          isActive: true,
          notified: false,
        };
        
        activeAlerts.set(steamAlert.id, steamAlert);
        notifyAlert(steamAlert);
      }
      
      // Criar alerta automático para value bet
      if (userConfig.enableValueBetAlerts && isValueBet) {
        const valueBetAlert: OddsAlert = {
          id: generateAlertId(),
          matchId,
          homeTeam,
          awayTeam,
          league,
          type: 'value_bet',
          market: key,
          condition: 'above',
          targetValue: 2.5,
          currentValue: value,
          previousValue: lastEntry.odd,
          variationPercent: changePercent,
          createdAt: new Date(),
          triggeredAt: new Date(),
          isActive: true,
          notified: false,
        };
        
        activeAlerts.set(valueBetAlert.id, valueBetAlert);
        notifyAlert(valueBetAlert);
      }
    }
    
    // Verificar alertas de threshold
    if (userConfig.enableThresholdAlerts) {
      checkThresholdAlerts(matchId, key, value);
    }
    
    // Atualizar histórico
    history.push({ odd: value, timestamp: new Date() });
    
    // Manter apenas últimas 50 entradas por mercado
    if (history.length > 50) {
      history.shift();
    }
    
    oddsHistory.set(oddsKey, history);
  }
  
  return movements;
}

/**
 * Verifica alertas de threshold
 */
function checkThresholdAlerts(matchId: string, market: string, currentValue: number): void {
  for (const alert of activeAlerts.values()) {
    if (!alert.isActive || alert.triggeredAt) continue;
    if (alert.matchId !== matchId || alert.market !== market) continue;
    if (alert.type !== 'threshold') continue;
    
    let triggered = false;
    
    if (alert.condition === 'above' && currentValue >= alert.targetValue) {
      triggered = true;
    } else if (alert.condition === 'below' && currentValue <= alert.targetValue) {
      triggered = true;
    }
    
    if (triggered) {
      alert.triggeredAt = new Date();
      alert.currentValue = currentValue;
      notifyAlert(alert);
      saveAlertsToStorage();
    }
  }
}

/**
 * Verifica alertas de variação
 */
function checkVariationAlerts(
  matchId: string,
  market: string,
  changePercent: number,
  currentValue: number,
  previousValue: number,
  _homeTeam: string,
  _awayTeam: string,
  _league: string
): void {
  for (const alert of activeAlerts.values()) {
    if (!alert.isActive || alert.triggeredAt) continue;
    if (alert.matchId !== matchId || alert.market !== market) continue;
    if (alert.type !== 'variation') continue;
    
    let triggered = false;
    
    if (alert.condition === 'increase' && changePercent >= alert.targetValue) {
      triggered = true;
    } else if (alert.condition === 'decrease' && changePercent <= -alert.targetValue) {
      triggered = true;
    }
    
    if (triggered) {
      alert.triggeredAt = new Date();
      alert.currentValue = currentValue;
      alert.previousValue = previousValue;
      alert.variationPercent = changePercent;
      notifyAlert(alert);
      saveAlertsToStorage();
    }
  }
}

/**
 * Obtém movimentos recentes de odds
 */
export function getRecentMovements(limit: number = 20): OddsMovement[] {
  return recentMovements.slice(0, limit);
}

/**
 * Obtém histórico de odds de um jogo/mercado
 */
export function getOddsHistory(matchId: string, market: string): { odd: number; timestamp: Date }[] {
  const key = getOddsKey(matchId, market);
  return oddsHistory.get(key) || [];
}

/**
 * Obtém estatísticas de movimentos
 */
export function getMovementStats() {
  const last24h = recentMovements.filter(m => 
    new Date().getTime() - m.timestamp.getTime() < 24 * 60 * 60 * 1000
  );
  
  const steamMoves = last24h.filter(m => m.isSteamMove);
  const valueBets = last24h.filter(m => m.isValueBet);
  const upMoves = last24h.filter(m => m.direction === 'up');
  const downMoves = last24h.filter(m => m.direction === 'down');
  
  const avgChange = last24h.length > 0
    ? last24h.reduce((sum, m) => sum + Math.abs(m.changePercent), 0) / last24h.length
    : 0;
  
  return {
    totalMovements: last24h.length,
    steamMoves: steamMoves.length,
    valueBets: valueBets.length,
    upMoves: upMoves.length,
    downMoves: downMoves.length,
    averageChange: avgChange.toFixed(2) + '%',
    activeAlerts: getActiveAlerts().length,
    triggeredAlerts: getTriggeredAlerts().length,
  };
}

/**
 * Guarda alertas no localStorage
 */
function saveAlertsToStorage(): void {
  try {
    const alertsArray = Array.from(activeAlerts.values());
    localStorage.setItem('odds_alerts', JSON.stringify(alertsArray));
  } catch (e) {
    console.warn('Erro ao guardar alertas:', e);
  }
}

/**
 * Carrega alertas do localStorage
 */
export function loadAlertsFromStorage(): void {
  try {
    const saved = localStorage.getItem('odds_alerts');
    if (saved) {
      const alertsArray: OddsAlert[] = JSON.parse(saved);
      alertsArray.forEach(alert => {
        // Converter strings de data para objetos Date
        alert.createdAt = new Date(alert.createdAt);
        if (alert.triggeredAt) alert.triggeredAt = new Date(alert.triggeredAt);
        activeAlerts.set(alert.id, alert);
      });
    }
  } catch (e) {
    console.warn('Erro ao carregar alertas:', e);
  }
}

/**
 * Limpa todos os alertas
 */
export function clearAllAlerts(): void {
  activeAlerts.clear();
  saveAlertsToStorage();
}

/**
 * Limpa histórico de movimentos
 */
export function clearMovementHistory(): void {
  recentMovements.length = 0;
  oddsHistory.clear();
}

// Inicializar ao carregar módulo
loadConfigFromStorage();
loadAlertsFromStorage();
