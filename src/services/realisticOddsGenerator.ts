/**
 * 🎯 Gerador de Odds Realistas
 * 
 * Gera odds baseadas em:
 * - Força relativa das equipas
 * - Histórico de confrontos
 * - Forma recente
 * - Fator casa
 * - Margem da casa de apostas (overround)
 * 
 * ✅ COM CACHE PARA EVITAR VARIAÇÕES EXCESSIVAS
 */

interface TeamStrength {
  attack: number;  // 0-100
  defense: number; // 0-100
  form: number;    // 0-100 (forma recente)
}

interface MatchContext {
  homeTeam: string;
  awayTeam: string;
  league: string;
  sport: string;
  isLive?: boolean;
  homeScore?: number;
  awayScore?: number;
  elapsed?: number;
}

// 🔒 CACHE DE ODDS GERADAS - Evita variações constantes
const oddsCache = new Map<string, {
  odds: { home: number; draw: number | null; away: number };
  timestamp: number;
  baseOdds: { home: number; draw: number | null; away: number };
}>();

// 🔒 CACHE DE MERCADOS SECUNDÁRIOS
const secondaryMarketsCache = new Map<string, {
  markets: Array<{ name: string; odds: number }>;
  timestamp: number;
}>();

// ✅ CACHE ULTRA-LONGO PARA MÁXIMA ESTABILIDADE
const CACHE_TTL_PREMATCH = 30 * 60 * 1000; // ✅ 30 minutos (era 10 min)
const CACHE_TTL_LIVE = 2 * 60 * 1000; // 2 minutos (mantido)

// ✅ THRESHOLD PARA MUDANÇAS REAIS - Só atualiza se mudança ≥ 5%
const ODDS_CHANGE_THRESHOLD = 0.05; // 5%

/**
 * Base de dados de força das equipas (simplificada)
 * Em produção, isto viria de uma API ou base de dados
 */
const TEAM_STRENGTH_DB: Record<string, TeamStrength> = {
  // Premier League
  'Manchester City': { attack: 95, defense: 90, form: 92 },
  'Arsenal': { attack: 88, defense: 85, form: 87 },
  'Liverpool': { attack: 90, defense: 82, form: 85 },
  'Manchester United': { attack: 78, defense: 75, form: 72 },
  'Chelsea': { attack: 80, defense: 78, form: 75 },
  'Tottenham': { attack: 82, defense: 72, form: 78 },
  'Newcastle': { attack: 75, defense: 80, form: 80 },
  'Aston Villa': { attack: 76, defense: 74, form: 77 },
  'Brighton': { attack: 74, defense: 70, form: 73 },
  'West Ham': { attack: 70, defense: 68, form: 65 },
  
  // La Liga
  'Real Madrid': { attack: 92, defense: 88, form: 90 },
  'Barcelona': { attack: 90, defense: 82, form: 88 },
  'Atletico Madrid': { attack: 82, defense: 88, form: 80 },
  'Sevilla': { attack: 75, defense: 78, form: 72 },
  'Real Sociedad': { attack: 78, defense: 75, form: 76 },
  'Athletic Bilbao': { attack: 74, defense: 76, form: 74 },
  
  // Serie A
  'Juventus': { attack: 82, defense: 85, form: 80 },
  'AC Milan': { attack: 80, defense: 80, form: 78 },
  'Inter Milan': { attack: 88, defense: 86, form: 87 },
  'Napoli': { attack: 85, defense: 80, form: 82 },
  'Roma': { attack: 78, defense: 76, form: 75 },
  'Lazio': { attack: 80, defense: 74, form: 77 },
  
  // Bundesliga
  'Bayern Munich': { attack: 94, defense: 85, form: 92 },
  'Borussia Dortmund': { attack: 86, defense: 75, form: 83 },
  'RB Leipzig': { attack: 82, defense: 80, form: 81 },
  'Bayer Leverkusen': { attack: 88, defense: 78, form: 90 },
  
  // Liga Portugal
  'Benfica': { attack: 85, defense: 78, form: 83 },
  'Porto': { attack: 83, defense: 80, form: 82 },
  'Sporting CP': { attack: 82, defense: 76, form: 80 },
  'Braga': { attack: 74, defense: 72, form: 73 },
  
  // Ligue 1
  'PSG': { attack: 93, defense: 82, form: 90 },
  'Marseille': { attack: 78, defense: 76, form: 77 },
  'Lyon': { attack: 76, defense: 74, form: 75 },
  'Monaco': { attack: 80, defense: 72, form: 78 },
  
  // Brasileirão
  'Flamengo': { attack: 88, defense: 80, form: 85 },
  'Palmeiras': { attack: 85, defense: 82, form: 86 },
  'São Paulo': { attack: 78, defense: 76, form: 75 },
  'Corinthians': { attack: 76, defense: 78, form: 74 },
  'Fluminense': { attack: 80, defense: 75, form: 78 },
  'Botafogo': { attack: 82, defense: 74, form: 80 },
  
  // Saudi Pro League
  'Al-Nassr': { attack: 90, defense: 75, form: 85 },
  'Al-Hilal': { attack: 92, defense: 78, form: 88 },
  'Al-Ittihad': { attack: 85, defense: 76, form: 82 },
  'Al-Ahli': { attack: 83, defense: 74, form: 80 },
};

/**
 * Obtém força da equipa (ou gera uma força média se não existir na DB)
 */
function getTeamStrength(teamName: string, league: string): TeamStrength {
  if (TEAM_STRENGTH_DB[teamName]) {
    return TEAM_STRENGTH_DB[teamName];
  }
  
  // Força padrão baseada na liga
  const leagueQuality: Record<string, number> = {
    'Premier League': 80,
    'La Liga': 78,
    'Serie A': 76,
    'Bundesliga': 77,
    'Ligue 1': 74,
    'Liga Portugal': 72,
    'Champions League': 85,
    'Brasileirão': 70,
    'Saudi Pro League': 68,
    'MLS': 65,
    'Eredivisie': 70,
  };
  
  const baseQuality = leagueQuality[league] || 65;
  
  // Usar hash do nome da equipa para gerar força consistente
  let hash = 0;
  for (let i = 0; i < teamName.length; i++) {
    hash = ((hash << 5) - hash) + teamName.charCodeAt(i);
    hash = hash & hash;
  }
  const variance = (Math.abs(hash) % 20) - 10; // -10 a +10
  
  const strength = Math.max(50, Math.min(90, baseQuality + variance));
  
  return {
    attack: strength + ((Math.abs(hash * 2) % 10) - 5),
    defense: strength + ((Math.abs(hash * 3) % 10) - 5),
    form: strength + ((Math.abs(hash * 5) % 15) - 7.5),
  };
}

/**
 * Calcula probabilidade de vitória baseada na força das equipas
 */
function calculateWinProbability(
  homeStrength: TeamStrength,
  awayStrength: TeamStrength,
  homeFactor: number = 1.15 // Vantagem de jogar em casa (15%)
): { home: number; draw: number; away: number } {
  // Força total considerando ataque, defesa e forma
  const homeTotal = (homeStrength.attack * 0.4 + homeStrength.defense * 0.3 + homeStrength.form * 0.3) * homeFactor;
  const awayTotal = awayStrength.attack * 0.4 + awayStrength.defense * 0.3 + awayStrength.form * 0.3;
  
  // Diferença de força
  const strengthDiff = homeTotal - awayTotal;
  
  // Converter diferença em probabilidades usando função logística
  // Quanto maior a diferença, maior a probabilidade de vitória
  const homeWinBase = 1 / (1 + Math.exp(-strengthDiff / 15));
  
  // Ajustar para incluir empate (mais provável quando equipas são equilibradas)
  const balanceFactor = Math.exp(-Math.abs(strengthDiff) / 20);
  const drawProb = 0.20 + (balanceFactor * 0.15); // 20-35% de empate
  
  // Distribuir o resto entre vitória casa e fora
  const homeWinProb = homeWinBase * (1 - drawProb);
  const awayWinProb = (1 - homeWinBase) * (1 - drawProb);
  
  return {
    home: homeWinProb,
    draw: drawProb,
    away: awayWinProb,
  };
}

/**
 * Ajusta probabilidades ao vivo baseado no resultado atual
 */
function adjustLiveProbabilities(
  baseProbabilities: { home: number; draw: number; away: number },
  homeScore: number,
  awayScore: number,
  elapsed: number
): { home: number; draw: number; away: number } {
  const scoreDiff = homeScore - awayScore;
  const timeRemaining = 90 - elapsed;
  const timeRemainingFactor = timeRemaining / 90;
  
  // Quanto menos tempo resta, mais o resultado atual influencia
  const adjustmentStrength = 1 - timeRemainingFactor;
  
  let { home, draw, away } = baseProbabilities;
  
  if (scoreDiff > 0) {
    // Casa está a ganhar - aumentar probabilidade de vitória casa
    const boost = scoreDiff * 0.15 * adjustmentStrength;
    home = Math.min(0.85, home + boost);
    draw = Math.max(0.10, draw - boost * 0.5);
    away = Math.max(0.05, away - boost * 0.5);
  } else if (scoreDiff < 0) {
    // Fora está a ganhar - aumentar probabilidade de vitória fora
    const boost = Math.abs(scoreDiff) * 0.15 * adjustmentStrength;
    away = Math.min(0.85, away + boost);
    draw = Math.max(0.10, draw - boost * 0.5);
    home = Math.max(0.05, home - boost * 0.5);
  } else {
    // Empate - aumentar probabilidade de empate
    const boost = 0.10 * adjustmentStrength;
    draw = Math.min(0.50, draw + boost);
    home = Math.max(0.20, home - boost * 0.5);
    away = Math.max(0.20, away - boost * 0.5);
  }
  
  // Normalizar para somar 1
  const total = home + draw + away;
  return {
    home: home / total,
    draw: draw / total,
    away: away / total,
  };
}

/**
 * Converte probabilidades em odds aplicando margem da casa
 */
function probabilitiesToOdds(
  probabilities: { home: number; draw: number; away: number },
  margin: number = 0.07 // 7% de margem (overround típico)
): { home: number; draw: number; away: number } {
  // Aplicar margem aumentando as probabilidades implícitas
  const totalProb = probabilities.home + probabilities.draw + probabilities.away;
  const targetTotal = 1 + margin;
  const multiplier = targetTotal / totalProb;
  
  const adjustedHome = probabilities.home * multiplier;
  const adjustedDraw = probabilities.draw * multiplier;
  const adjustedAway = probabilities.away * multiplier;
  
  // Converter para odds (1 / probabilidade)
  return {
    home: parseFloat((1 / adjustedHome).toFixed(2)),
    draw: parseFloat((1 / adjustedDraw).toFixed(2)),
    away: parseFloat((1 / adjustedAway).toFixed(2)),
  };
}

/**
 * Verifica se as odds mudaram significativamente
 */
function hasSignificantChange(
  oldOdds: { home: number; draw: number | null; away: number },
  newOdds: { home: number; draw: number | null; away: number }
): boolean {
  const homeChange = Math.abs(newOdds.home - oldOdds.home) / oldOdds.home;
  const awayChange = Math.abs(newOdds.away - oldOdds.away) / oldOdds.away;
  const drawChange = oldOdds.draw && newOdds.draw 
    ? Math.abs(newOdds.draw - oldOdds.draw) / oldOdds.draw 
    : 0;
  
  return homeChange >= ODDS_CHANGE_THRESHOLD || 
         awayChange >= ODDS_CHANGE_THRESHOLD || 
         drawChange >= ODDS_CHANGE_THRESHOLD;
}

/**
 * 🎯 FUNÇÃO PRINCIPAL: Gera odds realistas para um jogo (COM CACHE)
 */
export function generateRealisticOdds(context: MatchContext): {
  home: number;
  draw: number | null;
  away: number;
} {
  const { homeTeam, awayTeam, league, sport, isLive, homeScore, awayScore, elapsed } = context;
  
  // Criar chave de cache
  const cacheKey = `${homeTeam}_${awayTeam}_${league}_${isLive ? 'live' : 'prematch'}`;
  const now = Date.now();
  const cacheTTL = isLive ? CACHE_TTL_LIVE : CACHE_TTL_PREMATCH;
  
  // Verificar cache
  const cached = oddsCache.get(cacheKey);
  if (cached && (now - cached.timestamp) < cacheTTL) {
    // Se estiver ao vivo, aplicar ajuste baseado no resultado
    if (isLive && homeScore !== undefined && awayScore !== undefined && elapsed !== undefined) {
      // Usar odds base do cache e aplicar ajuste ao vivo
      const homeStrength = getTeamStrength(homeTeam, league);
      const awayStrength = getTeamStrength(awayTeam, league);
      let probabilities = calculateWinProbability(homeStrength, awayStrength);
      probabilities = adjustLiveProbabilities(probabilities, homeScore, awayScore, elapsed);
      
      const noDrawSports = ['Basquetebol', 'NBA', 'Basebol', 'MLB', 'NFL', 'Futebol Americano', 
                            'Hóquei', 'NHL', 'MMA', 'UFC', 'Ténis', 'Voleibol', 'AFL'];
      const hasDraw = !noDrawSports.some(s => sport.includes(s) || league.includes(s));
      
      if (!hasDraw) {
        const drawProb = probabilities.draw;
        probabilities.home += drawProb * 0.5;
        probabilities.away += drawProb * 0.5;
        probabilities.draw = 0;
      }
      
      const liveOdds = probabilitiesToOdds(probabilities);
      
      // ✅ Verificar se mudança é significativa (≥5%)
      if (!hasSignificantChange(cached.baseOdds, liveOdds)) {
        // Mudança insignificante - retornar odds do cache
        return {
          home: cached.baseOdds.home,
          draw: cached.baseOdds.draw,
          away: cached.baseOdds.away,
        };
      }
      
      // Mudança significativa - atualizar cache e retornar novas odds
      cached.baseOdds = liveOdds;
      cached.timestamp = now;
      
      return {
        home: liveOdds.home,
        draw: hasDraw ? liveOdds.draw : null,
        away: liveOdds.away,
      };
    }
    
    // ✅ Pré-jogo: Retornar odds do cache SEM QUALQUER VARIAÇÃO
    return {
      home: cached.baseOdds.home,
      draw: cached.baseOdds.draw,
      away: cached.baseOdds.away,
    };
  }
  
  // Desportos sem empate
  const noDrawSports = ['Basquetebol', 'NBA', 'Basebol', 'MLB', 'NFL', 'Futebol Americano', 
                        'Hóquei', 'NHL', 'MMA', 'UFC', 'Ténis', 'Voleibol', 'AFL'];
  const hasDraw = !noDrawSports.some(s => sport.includes(s) || league.includes(s));
  
  // Obter força das equipas
  const homeStrength = getTeamStrength(homeTeam, league);
  const awayStrength = getTeamStrength(awayTeam, league);
  
  // Calcular probabilidades base
  let probabilities = calculateWinProbability(homeStrength, awayStrength);
  
  // Ajustar se estiver ao vivo
  if (isLive && homeScore !== undefined && awayScore !== undefined && elapsed !== undefined) {
    probabilities = adjustLiveProbabilities(probabilities, homeScore, awayScore, elapsed);
  }
  
  // Se não tem empate, redistribuir probabilidade do empate
  if (!hasDraw) {
    const drawProb = probabilities.draw;
    probabilities.home += drawProb * 0.5;
    probabilities.away += drawProb * 0.5;
    probabilities.draw = 0;
  }
  
  // Converter para odds com margem
  const baseOdds = probabilitiesToOdds(probabilities);
  
  // Guardar no cache
  oddsCache.set(cacheKey, {
    odds: baseOdds,
    baseOdds: baseOdds,
    timestamp: now
  });
  
  return {
    home: baseOdds.home,
    draw: hasDraw ? baseOdds.draw : null,
    away: baseOdds.away,
  };
}

/**
 * Valida se as odds geradas são realistas
 */
export function validateRealisticOdds(odds: { home: number; draw: number | null; away: number }): boolean {
  // Verificar limites básicos
  if (odds.home < 1.01 || odds.home > 50) return false;
  if (odds.away < 1.01 || odds.away > 50) return false;
  if (odds.draw !== null && (odds.draw < 1.01 || odds.draw > 20)) return false;
  
  // Verificar probabilidade implícita total (deve estar entre 100% e 115%)
  const impliedHome = 1 / odds.home;
  const impliedAway = 1 / odds.away;
  const impliedDraw = odds.draw ? 1 / odds.draw : 0;
  const total = impliedHome + impliedAway + impliedDraw;
  
  if (total < 1.0 || total > 1.15) {
    console.warn('⚠️ Odds com overround anormal:', {
      odds,
      overround: ((total - 1) * 100).toFixed(2) + '%'
    });
    return false;
  }
  
  return true;
}

/**
 * Gera odds para mercados secundários (COM CACHE)
 */
export function generateSecondaryMarketOdds(
  context: MatchContext,
  marketType: 'over_under' | 'btts' | 'handicap'
): Array<{ name: string; odds: number }> {
  // Criar chave de cache
  const cacheKey = `${context.homeTeam}_${context.awayTeam}_${marketType}_${context.isLive ? 'live' : 'prematch'}`;
  const now = Date.now();
  const cacheTTL = context.isLive ? CACHE_TTL_LIVE : CACHE_TTL_PREMATCH;
  
  // Verificar cache
  const cached = secondaryMarketsCache.get(cacheKey);
  if (cached && (now - cached.timestamp) < cacheTTL) {
    // ✅ Retornar SEM QUALQUER VARIAÇÃO
    return cached.markets;
  }
  
  const homeStrength = getTeamStrength(context.homeTeam, context.league);
  const awayStrength = getTeamStrength(context.awayTeam, context.league);
  
  const avgAttack = (homeStrength.attack + awayStrength.attack) / 2;
  const avgDefense = (homeStrength.defense + awayStrength.defense) / 2;
  
  let markets: Array<{ name: string; odds: number }> = [];
  
  switch (marketType) {
    case 'over_under': {
      // Probabilidade de Over 2.5 baseada no ataque/defesa
      const overProb = (avgAttack / 100) * 0.6 + (1 - avgDefense / 100) * 0.4;
      const underProb = 1 - overProb;
      
      markets = [
        { name: 'Over 2.5', odds: parseFloat((1 / (overProb * 1.05)).toFixed(2)) },
        { name: 'Under 2.5', odds: parseFloat((1 / (underProb * 1.05)).toFixed(2)) },
      ];
      break;
    }
    
    case 'btts': {
      // Ambas marcam - baseado no ataque de ambas
      const bttsProb = (homeStrength.attack / 100) * (awayStrength.attack / 100) * 0.8;
      const noBttsProb = 1 - bttsProb;
      
      markets = [
        { name: 'Sim', odds: parseFloat((1 / (bttsProb * 1.06)).toFixed(2)) },
        { name: 'Não', odds: parseFloat((1 / (noBttsProb * 1.06)).toFixed(2)) },
      ];
      break;
    }
    
    case 'handicap': {
      const strengthDiff = homeStrength.attack - awayStrength.attack;
      const handicap = Math.round(strengthDiff / 10);
      
      markets = [
        { name: `Casa ${handicap > 0 ? '-' : '+'}${Math.abs(handicap)}`, odds: 1.90 },
        { name: `Fora ${handicap > 0 ? '+' : '-'}${Math.abs(handicap)}`, odds: 1.90 },
      ];
      break;
    }
  }
  
  // Guardar no cache
  secondaryMarketsCache.set(cacheKey, {
    markets,
    timestamp: now
  });
  
  return markets;
}

/**
 * Limpa cache antigo (chamar periodicamente)
 */
export function clearOldCache() {
  const now = Date.now();
  const maxAge = 30 * 60 * 1000; // 30 minutos
  
  for (const [key, value] of oddsCache.entries()) {
    if (now - value.timestamp > maxAge) {
      oddsCache.delete(key);
    }
  }
  
  for (const [key, value] of secondaryMarketsCache.entries()) {
    if (now - value.timestamp > maxAge) {
      secondaryMarketsCache.delete(key);
    }
  }
}

// Limpar cache a cada 10 minutos
setInterval(clearOldCache, 10 * 60 * 1000);
