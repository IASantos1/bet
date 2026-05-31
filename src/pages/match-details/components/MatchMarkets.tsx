import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { useTheme } from '../../../contexts/ThemeContext';
import { useLiveOddsEngine } from '../../../hooks/useLiveOddsEngine';
import { useMatchIncidents } from '../../../hooks/useMatchIncidents';
import OddsBlockedOverlay from '../../../components/feature/OddsBlockedOverlay';
type SportType =
  | 'football'
  | 'basketball'
  | 'hockey'
  | 'baseball'
  | 'rugby'
  | 'handball'
  | 'afl';
import type { LiveOddsSnapshot } from '../../../services/engine/liveOddsMarketEngine';

interface MatchMarketsProps {
  match: any;
  onAddSelection: (selection: string, odd: number, market: string) => void;
  isSelected: (selection: string) => boolean;
  activeCategory?: 'resultado' | 'total_gols' | 'escanteios' | 'handicap' | 'ambas_marcam' | null;
}

interface MarketOption {
  label: string;
  selection: string;
  odd: number;
  liveOddKey?: keyof LiveOddsSnapshot;
  trend?: 'up' | 'down' | 'stable';
  isHidden?: boolean;
  isBlocked?: boolean;
}

interface Market {
  name: string;
  icon: string;
  options: MarketOption[];
  isLive?: boolean;
  isBlocked?: boolean;
  blockReason?: string;
  type?: string;
  id: string;
  columns?: number;
}

interface MarketBlockState {
  isBlocked: boolean;
  reason: string;
  duration: number;
  startTime: number;
}

const sportNames: Record<string, string> = {
  football: 'Futebol',
  basketball: 'Basquetebol',
  hockey: 'Hóquei',
  baseball: 'Basebol',
  rugby: 'Rúgbi',
  handball: 'Andebol',
  afl: 'Futebol Australiano',
};

// ✅ Calcular intervalo de atualização baseado no tempo até o jogo
const getOddsRefreshInterval = (startTime: string | undefined, isLive: boolean): number => {
  if (isLive) return 10000;
  if (!startTime) return 180000;
  
  const now = Date.now();
  const gameStart = new Date(startTime).getTime();
  const hoursUntilStart = (gameStart - now) / (1000 * 60 * 60);
  
  if (hoursUntilStart <= 0.5) return 60000;
  if (hoursUntilStart <= 2) return 180000;
  if (hoursUntilStart <= 5) return 420000;
  if (hoursUntilStart <= 8) return 600000;
  if (hoursUntilStart <= 10) return 1800000;
  if (hoursUntilStart <= 15) return 3600000;
  return 7200000;
};

export default function MatchMarkets({
  match,
  onAddSelection,
  isSelected,
  activeCategory = null,
}: MatchMarketsProps) {
  const { theme } = useTheme();
  const [expandedMarkets, setExpandedMarkets] = useState<string[]>([
    'Resultado Final',
    'Dupla Hipótese',
    'Mais/Menos',
  ]);
  const [apiOdds, setApiOdds] = useState<any>(null);
  const [_loadingOdds, setLoadingOdds] = useState(false);
  const [dataSource, setDataSource] = useState<'api' | 'local' | 'fallback'>('local');
  
  const [oddsFlashing, setOddsFlashing] = useState<Map<string, 'up' | 'down'>>(new Map());

  const [marketBlocks, _setMarketBlocks] = useState<Map<string, MarketBlockState>>(new Map());
  const [globalBlock, setGlobalBlock] = useState<MarketBlockState | null>(null);
  const prevScoreRef = useRef({ home: 0, away: 0 });
  const blockTimersRef = useRef<Map<string, NodeJS.Timeout>>(new Map());
  const previousApiOddsRef = useRef<{ home: number; draw?: number; away: number } | null>(null);

  const sportType: SportType = 'football';

  const isSoccer = true;

  const isLiveMatch = useMemo(() => {
    const liveStatuses = ['1H', '2H', 'HT', 'ET', 'P', 'BT', 'LIVE', 'Q1', 'Q2', 'Q3', 'Q4', 'OT'];
    return liveStatuses.includes(match.status?.short || '') || match.isLive;
  }, [match]);

  const { incidents } = useMatchIncidents(String(match.id || match.fixtureId || ''), {
    sport: match.sport || 'football',
    isLive: isLiveMatch,
    fixtureId: match.fixtureId || match.id,
  });
  const activeIncident = isSoccer && isLiveMatch && incidents.length > 0 ? incidents[incidents.length - 1] : null;
  const shouldBlockByIncident =
    !!activeIncident &&
    ['VAR', 'goal_chance', 'penalty', 'red_card'].includes(activeIncident.type);

  const refreshInterval = useMemo(() => {
    return getOddsRefreshInterval(match.startTime, isLiveMatch);
  }, [match.startTime, isLiveMatch]);

  const liveMatchInput = useMemo(() => {
    if (!isLiveMatch || !match.fixtureId) return null;
    return {
      fixtureId: match.fixtureId,
      homeTeam: {
        id: match.homeTeamId || 1,
        name: match.homeTeam,
        logo: match.homeLogo || match.homeTeamLogo,
      },
      awayTeam: {
        id: match.awayTeamId || 2,
        name: match.awayTeam,
        logo: match.awayLogo || match.awayTeamLogo,
      },
      leagueId: match.leagueId || 1,
      leagueName: match.league || '',
      status: {
        short: match.status?.short || '1H',
        elapsed: match.minute || match.status?.elapsed || 0,
        period: match.status?.period || 'first_half',
      },
      score: {
        home: match.homeScore ?? match.score?.home ?? 0,
        away: match.awayScore ?? match.score?.away ?? 0,
      },
    };
  }, [match, isLiveMatch]);

  const { odds: liveOdds, previousOdds, isRunning } = useLiveOddsEngine(
    liveMatchInput,
    { autoStart: true, intervalMs: refreshInterval }
  );

  const fetchOddsFromApi = useCallback(async () => {
    console.log('🔍 Dados do match recebidos para odds:', {
      id: match.id,
      fixtureId: match.fixtureId,
      tipoId: typeof match.id,
      rawIdUsado: match.id || match.fixtureId,
      isLiveMatch,
    });

    const rawId = match.id || match.fixtureId;
    const gameId = Number(rawId);
    if (!gameId || Number.isNaN(gameId)) {
      console.warn('⚠️ ID inválido para buscar odds da API', { rawId, gameId });
      return;
    }

    setLoadingOdds(true);
    try {
      console.log(`📡 Buscando odds da API: ${sportType} (ID: ${gameId}) - Intervalo: ${refreshInterval/1000}s`);
      let odds: null | { home: number; draw?: number; away: number } = null;

      if (isLiveMatch) {
        // Buscar lista de odds ao vivo do backend e filtrar pelo fixture
        const list = await fetchLiveOddsList();
        const item = list.find(i => String(i.matchId) === String(gameId));
        if (item) {
          odds = { home: item.odds.home, draw: item.odds.draw, away: item.odds.away };
        }
      }
      
      if (!odds) {
        // Fallback: odds pré‑jogo da API‑Football (bet id 1: Match Winner)
        const preData: any[] = await fetchEventOdds('football', String(gameId));
        if (Array.isArray(preData) && preData.length > 0) {
          const fixture = preData[0];
          const bookmakers = Array.isArray(fixture?.bookmakers) ? fixture.bookmakers : [];
          const mainBookmaker = bookmakers[0];
          const bets = Array.isArray(mainBookmaker?.bets) ? mainBookmaker.bets : [];
          const matchWinner = bets.find((b: any) => {
            const n = String(b?.name || '').toLowerCase();
            return n.includes('match winner') || n.includes('1x2') || b?.id === 1;
          });
          if (matchWinner && Array.isArray(matchWinner.values)) {
            let home: number | null = null;
            let draw: number | null = null;
            let away: number | null = null;
            for (const v of matchWinner.values) {
              const label = String(v?.value || '').toLowerCase();
              const odd = v?.odd != null ? Number(v.odd) : NaN;
              if (!Number.isFinite(odd)) continue;
              if ((label === 'home' || label === '1') && home == null) home = odd;
              if ((label === 'draw' || label === 'x') && draw == null) draw = odd;
              if ((label === 'away' || label === '2') && away == null) away = odd;
            }
            if (home != null && away != null) {
              odds = { home, draw: draw ?? undefined, away };
            }
          }
        }
      }
      
      if (odds && (odds.home > 0 || odds.away > 0)) {
        console.log(`✅ Odds da API carregadas:`, odds);
        const previousApiOdds = previousApiOddsRef.current;
        if (previousApiOdds) {
          const newFlashing = new Map<string, 'up' | 'down'>();
          
          if (odds.home !== previousApiOdds.home && previousApiOdds.home > 0) {
            newFlashing.set('home', odds.home > previousApiOdds.home ? 'up' : 'down');
          }
          if (odds.draw !== previousApiOdds.draw && previousApiOdds.draw > 0) {
            newFlashing.set('draw', odds.draw > previousApiOdds.draw ? 'up' : 'down');
          }
          if (odds.away !== previousApiOdds.away && previousApiOdds.away > 0) {
            newFlashing.set('away', odds.away > previousApiOdds.away ? 'up' : 'down');
          }
          
          if (newFlashing.size > 0) {
            setOddsFlashing(newFlashing);
            setTimeout(() => setOddsFlashing(new Map()), 4000);
          }
        }

        previousApiOddsRef.current = odds;
        setApiOdds(odds);
        setDataSource('api');
      } else {
        console.warn('⚠️ API não retornou odds válidas → mantendo mercados locais');
        setDataSource('local');
      }
    } catch (err) {
      console.error('❌ Erro ao buscar odds:', err);
      setDataSource('local');
    } finally {
      setLoadingOdds(false);
    }
  }, [match.id, match.fixtureId, sportType, refreshInterval, isLiveMatch]);

  useEffect(() => {
    fetchOddsFromApi();
  }, [fetchOddsFromApi]);

  useEffect(() => {
    console.log(`🔄 Configurando auto-refresh de odds: ${refreshInterval/1000}s - ${isLiveMatch ? 'AO VIVO' : 'PRÉ-JOGO'}`);
    
    const interval = setInterval(() => {
      console.log(`🔄 Atualizando odds...`);
      fetchOddsFromApi();
    }, refreshInterval);

    return () => {
      clearInterval(interval);
    };
  }, [refreshInterval, fetchOddsFromApi, isLiveMatch]);

  const currentScore = useMemo(() => ({
    home: match.homeScore ?? match.score?.home ?? 0,
    away: match.awayScore ?? match.score?.away ?? 0,
  }), [match]);

  const totalGoals = currentScore.home + currentScore.away;
  const scoreDiff = currentScore.home - currentScore.away;

  // ✅ NOVO: Verificar se resultado exato deve ser bloqueado
  const shouldBlockCorrectScore = useCallback((homeGoals: number, awayGoals: number): 'hidden' | 'won' | 'active' => {
    if (!isLiveMatch) return 'active';
    
    const currentHome = currentScore.home;
    const currentAway = currentScore.away;
    
    if (currentHome > homeGoals || currentAway > awayGoals) {
      return 'hidden';
    }
    
    if (currentHome === homeGoals && currentAway === awayGoals) {
      const minute = match.minute || match.status?.elapsed || 0;
      if (minute >= 90) {
        return 'won';
      }
    }
    
    return 'active';
  }, [isLiveMatch, currentScore, match]);

  // ✅ MELHORADO: Verificar se handicap deve ser bloqueado - LÓGICA COMPLETA PARA TODOS OS DESPORTOS
  const shouldBlockHandicap = useCallback((team: 'home' | 'away', line: number, sport: SportType = 'football'): 'hidden' | 'won' | 'active' => {
    if (!isLiveMatch) return 'active';
    
    const minute = match.minute || match.status?.elapsed || 0;
    const isGameEnding = sport === 'football' ? minute >= 85 : 
                         sport === 'basketball' ? minute >= 45 :
                         sport === 'hockey' ? minute >= 55 :
                         sport === 'baseball' ? minute >= 80 :
                         sport === 'handball' ? minute >= 55 :
                         minute >= 80;
    
    // ✅ LÓGICA PARA HANDICAP ASIÁTICO (linha negativa = favorito, positiva = underdog)
    if (team === 'home') {
      // Home -X.5: Casa precisa ganhar por mais de X.5 golos/pontos
      const adjustedDiff = scoreDiff + line; // line é negativo para favorito
      
      // Se já é impossível ganhar (diferença muito negativa)
      if (adjustedDiff < -5) {
        return 'hidden';
      }
      
      // Se já ganhou e jogo está a acabar
      if (isGameEnding && adjustedDiff > 0) {
        return 'won';
      }
      
      // Se é impossível recuperar no tempo restante
      if (isGameEnding && adjustedDiff < -2) {
        return 'hidden';
      }
    } else {
      // Away +X.5: Fora pode perder por menos de X.5 golos/pontos
      const adjustedDiff = -scoreDiff + line; // Inverter perspectiva
      
      // Se já é impossível ganhar
      if (adjustedDiff < -5) {
        return 'hidden';
      }
      
      // Se já ganhou e jogo está a acabar
      if (isGameEnding && adjustedDiff > 0) {
        return 'won';
      }
      
      // Se é impossível recuperar
      if (isGameEnding && adjustedDiff < -2) {
        return 'hidden';
      }
    }
    
    return 'active';
  }, [isLiveMatch, scoreDiff, match]);

  // ✅ NOVO: Verificar bloqueio de handicap para basquetebol (pontos)
  const shouldBlockBasketballHandicap = useCallback((team: 'home' | 'away', line: number): 'hidden' | 'won' | 'active' => {
    if (!isLiveMatch) return 'active';
    
    const homePoints = currentScore.home;
    const awayPoints = currentScore.away;
    const pointsDiff = homePoints - awayPoints;
    const minute = match.minute || match.status?.elapsed || 0;
    const isQ4 = minute >= 36; // 4º período
    
    if (team === 'home') {
      const adjustedDiff = pointsDiff + line;
      
      // Se diferença é muito grande para recuperar
      if (isQ4 && adjustedDiff < -20) return 'hidden';
      if (adjustedDiff < -40) return 'hidden';
      
      // Se já ganhou
      if (isQ4 && minute >= 45 && adjustedDiff > 0) return 'won';
    } else {
      const adjustedDiff = -pointsDiff + line;
      
      if (isQ4 && adjustedDiff < -20) return 'hidden';
      if (adjustedDiff < -40) return 'hidden';
      
      if (isQ4 && minute >= 45 && adjustedDiff > 0) return 'won';
    }
    
    return 'active';
  }, [isLiveMatch, currentScore, match]);

  // ✅ NOVO: Verificar bloqueio de handicap para hóquei (puck line)
  const shouldBlockHockeyHandicap = useCallback((team: 'home' | 'away', line: number): 'hidden' | 'won' | 'active' => {
    if (!isLiveMatch) return 'active';
    
    const goalsDiff = currentScore.home - currentScore.away;
    const minute = match.minute || match.status?.elapsed || 0;
    const isThirdPeriod = minute >= 40;
    
    if (team === 'home') {
      const adjustedDiff = goalsDiff + line;
      
      if (isThirdPeriod && adjustedDiff < -3) return 'hidden';
      if (adjustedDiff < -5) return 'hidden';
      
      if (isThirdPeriod && minute >= 55 && adjustedDiff > 0) return 'won';
    } else {
      const adjustedDiff = -goalsDiff + line;
      
      if (isThirdPeriod && adjustedDiff < -3) return 'hidden';
      if (adjustedDiff < -5) return 'hidden';
      
      if (isThirdPeriod && minute >= 55 && adjustedDiff > 0) return 'won';
    }
    
    return 'active';
  }, [isLiveMatch, currentScore, match]);

  // ✅ NOVO: Verificar bloqueio de handicap para basebol (run line)
  const shouldBlockBaseballHandicap = useCallback((team: 'home' | 'away', line: number): 'hidden' | 'won' | 'active' => {
    if (!isLiveMatch) return 'active';
    
    const runsDiff = currentScore.home - currentScore.away;
    const inning = Math.floor((match.minute || match.status?.elapsed || 0) / 10) + 1;
    const isLateGame = inning >= 7;
    
    if (team === 'home') {
      const adjustedDiff = runsDiff + line;
      
      if (isLateGame && adjustedDiff < -5) return 'hidden';
      if (adjustedDiff < -8) return 'hidden';
      
      if (inning >= 9 && adjustedDiff > 0) return 'won';
    } else {
      const adjustedDiff = -runsDiff + line;
      
      if (isLateGame && adjustedDiff < -5) return 'hidden';
      if (adjustedDiff < -8) return 'hidden';
      
      if (inning >= 9 && adjustedDiff > 0) return 'won';
    }
    
    return 'active';
  }, [isLiveMatch, currentScore, match]);

  const blockAllMarkets = useCallback((reason: string, durationSeconds: number) => {
    if (!isSoccer || !isLiveMatch) {
      console.log(`⏭️ Bloqueio ignorado - Não é futebol ao vivo`);
      return;
    }

    setGlobalBlock({
      isBlocked: true,
      reason,
      duration: durationSeconds,
      startTime: Date.now(),
    });

    setTimeout(() => {
      setGlobalBlock(null);
    }, durationSeconds * 1000);
  }, [isSoccer, isLiveMatch]);

  useEffect(() => {
    if (!isLiveMatch || !isSoccer) return;

    const prevHome = prevScoreRef.current.home;
    const prevAway = prevScoreRef.current.away;
    const currHome = currentScore.home;
    const currAway = currentScore.away;

    if (currHome > prevHome || currAway > prevAway) {
      const scoringTeam = currHome > prevHome ? match.homeTeam : match.awayTeam;
      console.log(`⚽ GOLO DETECTADO (FUTEBOL)! ${scoringTeam} marca!`);
      blockAllMarkets(`⚽ GOLO! ${scoringTeam} marca! Aguarde...`, 30);
      prevScoreRef.current = { home: currHome, away: currAway };
    }
  }, [currentScore, isLiveMatch, isSoccer, match.homeTeam, match.awayTeam, blockAllMarkets]);

  useEffect(() => {
    prevScoreRef.current = currentScore;
  }, [currentScore]);

  useEffect(() => {
    const timers = blockTimersRef.current;
    return () => {
      timers.forEach(timer => clearTimeout(timer));
      timers.clear();
    };
  }, []);

  const [flashingOdds, setFlashingOdds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!liveOdds || !previousOdds) return;

    const changedKeys: string[] = [];
    const keysToCheck: (keyof LiveOddsSnapshot)[] = [
      'home', 'draw', 'away', 'over25', 'under25', 'bttsYes', 'bttsNo',
      'homeOrDraw', 'homeOrAway', 'drawOrAway', 'over15', 'under15', 'over35', 'under35',
    ];

    keysToCheck.forEach((key) => {
      const current = liveOdds[key];
      const prev = previousOdds[key];
      if (typeof current === 'number' && typeof prev === 'number') {
        if (Math.abs(current - prev) > 0.01) {
          changedKeys.push(key);
        }
      }
    });

    if (changedKeys.length > 0) {
      setFlashingOdds(new Set(changedKeys));
      setTimeout(() => setFlashingOdds(new Set()), 1500);
    }
  }, [liveOdds, previousOdds]);

  const getOddTrend = useCallback((key: keyof LiveOddsSnapshot): 'up' | 'down' | 'stable' => {
    if (oddsFlashing.has(key as string)) {
      return oddsFlashing.get(key as string) || 'stable';
    }
    
    if (!liveOdds || !previousOdds) return 'stable';
    const current = liveOdds[key];
    const prev = previousOdds[key];
    if (typeof current !== 'number' || typeof prev !== 'number') return 'stable';
    const diff = current - prev;
    if (Math.abs(diff) < 0.02) return 'stable';
    return diff > 0 ? 'up' : 'down';
  }, [liveOdds, previousOdds, oddsFlashing]);

  const getOddValue = useCallback((staticOdd: number, liveKey?: keyof LiveOddsSnapshot): number => {
    if (apiOdds && liveKey) {
      if (liveKey === 'home' && apiOdds.home > 0) return apiOdds.home;
      if (liveKey === 'draw' && apiOdds.draw && apiOdds.draw > 0) return apiOdds.draw;
      if (liveKey === 'away' && apiOdds.away > 0) return apiOdds.away;
    }
    if (liveOdds && liveKey && typeof liveOdds[liveKey] === 'number') {
      return liveOdds[liveKey] as number;
    }
    return staticOdd;
  }, [apiOdds, liveOdds]);


  const shouldHideBTTS = useCallback((type: 'yes' | 'no'): 'hidden' | 'won' | 'active' => {
    if (!isLiveMatch) return 'active';
    
    const homeScored = currentScore.home > 0;
    const awayScored = currentScore.away > 0;
    const bothScored = homeScored && awayScored;
    
    if (bothScored) {
      if (type === 'no') {
        console.log(`🚫 Ocultando BTTS Não - Ambas marcaram: ${currentScore.home}-${currentScore.away}`);
        return 'hidden';
      }
      if (type === 'yes') {
        console.log(`✅ BTTS Sim GANHOU - Ambas marcaram: ${currentScore.home}-${currentScore.away}`);
        return 'won';
      }
    }
    
    return 'active';
  }, [isLiveMatch, currentScore]);

  const getOverUnderState = useCallback((line: number, type: 'over' | 'under'): 'hidden' | 'won' | 'active' => {
    if (!isLiveMatch) return 'active';
    
    if (type === 'over' && totalGoals > line) {
      return 'won';
    }
    
    if (type === 'under' && totalGoals > line) {
      return 'hidden';
    }
    
    return 'active';
  }, [isLiveMatch, totalGoals]);

  // ✅ CRIAR MERCADOS BASEADOS NO DESPORTO - EXPANDIDO PARA TODOS OS DESPORTOS
  const markets: Market[] = useMemo(() => {
    const baseOdds =
      apiOdds ||
      match.odds ||
      (liveOdds && typeof liveOdds.home === 'number' && typeof liveOdds.away === 'number'
        ? {
            home: liveOdds.home,
            draw: typeof liveOdds.draw === 'number' ? liveOdds.draw : undefined,
            away: liveOdds.away,
          }
        : null);

    const odds = baseOdds;

    if (!odds || (!odds.home && !odds.away)) {
      console.warn('⚠️ Sem odds disponíveis para este jogo');
      return [];
    }

    const allMarkets: Market[] = [];
    const usedMarketIds = new Set<string>();

    const addMarket = (market: Market) => {
      if (!usedMarketIds.has(market.id)) {
        const blockState = marketBlocks.get(market.id);
        if (blockState) {
          market.isBlocked = true;
          market.blockReason = blockState.reason;
        }
        // ✅ Bloqueio global APENAS para futebol ao vivo
        if (globalBlock && isSoccer && isLiveMatch) {
          market.isBlocked = true;
          market.blockReason = globalBlock.reason;
        }
        usedMarketIds.add(market.id);
        allMarkets.push(market);
      }
    };

    const hasDrawOption = ['football', 'handball', 'hockey'].includes(sportType) || 
                          (odds.draw !== undefined && odds.draw > 0);

    // ═══════════════════════════════════════════════════════════
    // MERCADO PRINCIPAL - RESULTADO FINAL (TODOS OS DESPORTOS)
    // ═══════════════════════════════════════════════════════════
    const mainOptions: MarketOption[] = [
      {
        label: match.homeTeam,
        selection: match.homeTeam,
        odd: getOddValue(odds.home || 2.0, 'home'),
        liveOddKey: 'home',
        trend: getOddTrend('home'),
      },
    ];

    if (hasDrawOption) {
      mainOptions.push({
        label: 'Empate',
        selection: 'Empate',
        odd: getOddValue(odds.draw || 3.2, 'draw'),
        liveOddKey: 'draw',
        trend: getOddTrend('draw'),
      });
    }

    mainOptions.push({
      label: match.awayTeam,
      selection: match.awayTeam,
      odd: getOddValue(odds.away || 3.5, 'away'),
      liveOddKey: 'away',
      trend: getOddTrend('away'),
    });

    addMarket({
      id: 'match-winner',
      name: 'Resultado Final',
      icon: 'ri-trophy-line',
      type: '1X2',
      isLive: isLiveMatch,
      options: mainOptions,
      columns: hasDrawOption ? 3 : 2,
    });

    // ═══════════════════════════════════════════════════════════
    // MERCADOS ESPECÍFICOS POR DESPORTO
    // ═══════════════════════════════════════════════════════════

    if (sportType === 'football') {
      // Dupla Hipótese
      addMarket({
        id: 'double-chance',
        name: 'Dupla Hipótese',
        icon: 'ri-scales-3-line',
        type: 'double-chance',
        isLive: isLiveMatch,
        options: [
          { label: '1X', selection: `${match.homeTeam} ou Empate`, odd: parseFloat((1 / (1 / odds.home + 1 / odds.draw) * 1.05).toFixed(2)), trend: getOddTrend('homeOrDraw'), liveOddKey: 'homeOrDraw' },
          { label: '12', selection: `${match.homeTeam} ou ${match.awayTeam}`, odd: parseFloat((1 / (1 / odds.home + 1 / odds.away) * 1.05).toFixed(2)), trend: getOddTrend('homeOrAway'), liveOddKey: 'homeOrAway' },
          { label: 'X2', selection: `Empate ou ${match.awayTeam}`, odd: parseFloat((1 / (1 / odds.draw + 1 / odds.away) * 1.05).toFixed(2)), trend: getOddTrend('drawOrAway'), liveOddKey: 'drawOrAway' },
        ],
        columns: 3,
      });

      // Mais/Menos Golos
      const overUnderOptions: MarketOption[] = [];
      const lines = [0.5, 1.5, 2.5, 3.5, 4.5, 5.5];
      
      lines.forEach(line => {
        const overState = getOverUnderState(line, 'over');
        const underState = getOverUnderState(line, 'under');
        
        if (overState !== 'hidden') {
          overUnderOptions.push({
            label: overState === 'won' ? `✓ Mais ${line}` : `Mais ${line}`,
            selection: `Mais de ${line} Golos`,
            odd: overState === 'won' ? 1.00 : (line === 0.5 ? 1.12 : line === 1.5 ? 1.45 : line === 2.5 ? getOddValue(1.85, 'over25') : line === 3.5 ? 2.8 : line === 4.5 ? 3.5 : 4.5),
            isHidden: false,
            isBlocked: overState === 'won',
            trend: line === 1.5 ? getOddTrend('over15') : line === 2.5 ? getOddTrend('over25') : line === 3.5 ? getOddTrend('over35') : 'stable',
            liveOddKey: line === 1.5 ? 'over15' : line === 2.5 ? 'over25' : line === 3.5 ? 'over35' : undefined,
          });
        }
        
        if (underState !== 'hidden') {
          overUnderOptions.push({
            label: `Menos ${line}`,
            selection: `Menos de ${line} Golos`,
            odd: line === 0.5 ? 6.5 : line === 1.5 ? 2.75 : line === 2.5 ? getOddValue(1.95, 'under25') : line === 3.5 ? 1.42 : line === 4.5 ? 1.25 : 1.12,
            isHidden: false,
            trend: line === 1.5 ? getOddTrend('under15') : line === 2.5 ? getOddTrend('under25') : line === 3.5 ? getOddTrend('under35') : 'stable',
            liveOddKey: line === 1.5 ? 'under15' : line === 2.5 ? 'under25' : line === 3.5 ? 'under35' : undefined,
          });
        }
      });

      overUnderOptions.sort((a, b) => {
        const lineA = parseFloat(a.label.replace(/[^\d.]/g, ''));
        const lineB = parseFloat(b.label.replace(/[^\d.]/g, ''));
        return lineA - lineB;
      });

      if (overUnderOptions.length > 0) {
        addMarket({
          id: 'over-under-goals',
          name: 'Mais/Menos Golos',
          icon: 'ri-bar-chart-line',
          type: 'over-under',
          isLive: isLiveMatch,
          options: overUnderOptions,
          columns: 2,
        });
      }

      // Ambas Marcam
      const bttsYesState = shouldHideBTTS('yes');
      const bttsNoState = shouldHideBTTS('no');
      
      const bttsOptions: MarketOption[] = [];
      
      if (bttsYesState !== 'hidden') {
        bttsOptions.push({
          label: bttsYesState === 'won' ? '✓ Sim' : 'Sim',
          selection: 'Ambas Marcam - Sim',
          odd: bttsYesState === 'won' ? 1.00 : getOddValue(1.75, 'bttsYes'),
          isHidden: false,
          isBlocked: bttsYesState === 'won',
          trend: getOddTrend('bttsYes'),
          liveOddKey: 'bttsYes',
        });
      }
      
      if (bttsNoState !== 'hidden') {
        bttsOptions.push({
          label: 'Não',
          selection: 'Ambas Marcam - Não',
          odd: getOddValue(2.05, 'bttsNo'),
          isHidden: false,
          trend: getOddTrend('bttsNo'),
          liveOddKey: 'bttsNo',
        });
      }

      if (bttsYesState === 'won' && bttsOptions.length === 1) {
        addMarket({
          id: 'btts',
          name: 'Ambas Marcam ✓',
          icon: 'ri-football-line',
          type: 'btts',
          isLive: isLiveMatch,
          options: bttsOptions,
          columns: 1,
        });
      } else if (bttsOptions.length > 0) {
        addMarket({
          id: 'btts',
          name: 'Ambas Marcam',
          icon: 'ri-football-line',
          type: 'btts',
          isLive: isLiveMatch,
          options: bttsOptions,
          columns: 2,
        });
      }

      // Handicap Asiático - COM BLOQUEIOS INTELIGENTES
      const handicapOptions: MarketOption[] = [];
      const handicapLines = [
        { team: 'home', line: -0.5, baseOdd: odds.home * 0.92 },
        { team: 'away', line: 0.5, baseOdd: odds.away * 0.65 },
        { team: 'home', line: -1.5, baseOdd: odds.home * 1.45 },
        { team: 'away', line: 1.5, baseOdd: odds.away * 0.48 },
        { team: 'home', line: -2.5, baseOdd: odds.home * 2.1 },
        { team: 'away', line: 2.5, baseOdd: odds.away * 0.38 },
      ];

      handicapLines.forEach(({ team, line, baseOdd }) => {
        const state = shouldBlockHandicap(team as 'home' | 'away', line, 'football');
        const teamName = team === 'home' ? match.homeTeam : match.awayTeam;
        
        if (state !== 'hidden') {
          handicapOptions.push({
            label: state === 'won' ? `✓ ${teamName} ${line > 0 ? '+' : ''}${line}` : `${teamName} ${line > 0 ? '+' : ''}${line}`,
            selection: `${teamName} ${line > 0 ? '+' : ''}${line}`,
            odd: state === 'won' ? 1.00 : parseFloat(Math.max(1.01, baseOdd).toFixed(2)),
            isBlocked: state === 'won',
          });
        }
      });

      if (handicapOptions.length > 0) {
        addMarket({
          id: 'asian-handicap',
          name: 'Handicap Asiático',
          icon: 'ri-scales-2-line',
          type: 'handicap',
          isLive: isLiveMatch,
          options: handicapOptions,
          columns: 2,
        });
      }

      // Resultado Correto - COM BLOQUEIOS INTELIGENTES
      const correctScoreOptions: MarketOption[] = [];
      const scores = [
        { home: 1, away: 0, odd: 6.5 },
        { home: 2, away: 0, odd: 8.0 },
        { home: 2, away: 1, odd: 9.0 },
        { home: 3, away: 0, odd: 12.0 },
        { home: 3, away: 1, odd: 14.0 },
        { home: 0, away: 0, odd: 9.5 },
        { home: 1, away: 1, odd: 6.0 },
        { home: 2, away: 2, odd: 14.0 },
        { home: 0, away: 1, odd: 8.5 },
        { home: 0, away: 2, odd: 12.0 },
        { home: 1, away: 2, odd: 11.0 },
        { home: 0, away: 3, odd: 18.0 },
        { home: 1, away: 3, odd: 20.0 },
      ];

      scores.forEach(({ home, away, odd }) => {
        const state = shouldBlockCorrectScore(home, away);
        
        if (state !== 'hidden') {
          correctScoreOptions.push({
            label: state === 'won' ? `✓ ${home}-${away}` : `${home}-${away}`,
            selection: `Resultado Correto ${home}-${away}`,
            odd: state === 'won' ? 1.00 : odd,
            isBlocked: state === 'won',
          });
        }
      });

      if (correctScoreOptions.length > 0) {
        addMarket({
          id: 'correct-score',
          name: 'Resultado Correto',
          icon: 'ri-hashtag',
          type: 'correct-score',
          isLive: isLiveMatch,
          options: correctScoreOptions,
          columns: 3,
        });
      }

    } else if (sportType === 'basketball') {
      // ═══════════════════════════════════════════════════════════
      // 🏀 BASQUETEBOL - MERCADOS EXPANDIDOS
      // ═══════════════════════════════════════════════════════════
      const homeOdd = odds.home || 1.85;
      const awayOdd = odds.away || 1.95;

      // Handicap com bloqueios
      const basketHandicapOptions: MarketOption[] = [];
      const basketHandicapLines = [
        { team: 'home', line: -3.5, baseOdd: 1.9 },
        { team: 'away', line: 3.5, baseOdd: 1.9 },
        { team: 'home', line: -5.5, baseOdd: 1.95 },
        { team: 'away', line: 5.5, baseOdd: 1.85 },
        { team: 'home', line: -7.5, baseOdd: 2.05 },
        { team: 'away', line: 7.5, baseOdd: 1.8 },
        { team: 'home', line: -10.5, baseOdd: 2.2 },
        { team: 'away', line: 10.5, baseOdd: 1.7 },
      ];

      basketHandicapLines.forEach(({ team, line, baseOdd }) => {
        const state = shouldBlockBasketballHandicap(team as 'home' | 'away', line);
        const teamName = team === 'home' ? match.homeTeam : match.awayTeam;
        
        if (state !== 'hidden') {
          basketHandicapOptions.push({
            label: state === 'won' ? `✓ ${teamName} ${line > 0 ? '+' : ''}${line}` : `${teamName} ${line > 0 ? '+' : ''}${line}`,
            selection: `${teamName} ${line > 0 ? '+' : ''}${line}`,
            odd: state === 'won' ? 1.00 : baseOdd,
            isBlocked: state === 'won',
          });
        }
      });

      if (basketHandicapOptions.length > 0) {
        addMarket({
          id: 'handicap',
          name: 'Handicap',
          icon: 'ri-scales-2-line',
          type: 'handicap',
          isLive: isLiveMatch,
          options: basketHandicapOptions,
          columns: 2,
        });
      }

      // Total de Pontos
      const totalPointsOptions: MarketOption[] = [];
      const pointLines = [180.5, 190.5, 200.5, 210.5, 220.5, 230.5];
      const currentTotalPoints = currentScore.home + currentScore.away;

      pointLines.forEach(line => {
        const overWon = isLiveMatch && currentTotalPoints > line;
        const underHidden = isLiveMatch && currentTotalPoints > line;

        if (!overWon || !isLiveMatch) {
          totalPointsOptions.push({
            label: overWon ? `✓ Mais ${line}` : `Mais ${line}`,
            selection: `Mais de ${line} Pontos`,
            odd: overWon ? 1.00 : 1.85 + (line - 200.5) * 0.02,
            isBlocked: overWon,
          });
        }

        if (!underHidden) {
          totalPointsOptions.push({
            label: `Menos ${line}`,
            selection: `Menos de ${line} Pontos`,
            odd: 1.95 - (line - 200.5) * 0.02,
          });
        }
      });

      if (totalPointsOptions.length > 0) {
        addMarket({
          id: 'total-points',
          name: 'Total de Pontos',
          icon: 'ri-bar-chart-line',
          type: 'over-under',
          isLive: isLiveMatch,
          options: totalPointsOptions,
          columns: 2,
        });
      }

      // Margem de Vitória
      addMarket({
        id: 'winning-margin',
        name: 'Margem de Vitória',
        icon: 'ri-ruler-line',
        type: 'margin',
        isLive: isLiveMatch,
        options: [
          { label: `${match.homeTeam} 1-5`, selection: `${match.homeTeam} ganha por 1-5 pontos`, odd: 4.5 },
          { label: `${match.homeTeam} 6-10`, selection: `${match.homeTeam} ganha por 6-10 pontos`, odd: 4.0 },
          { label: `${match.homeTeam} 11+`, selection: `${match.homeTeam} ganha por 11+ pontos`, odd: 2.8 },
          { label: `${match.awayTeam} 1-5`, selection: `${match.awayTeam} ganha por 1-5 pontos`, odd: 5.0 },
          { label: `${match.awayTeam} 6-10`, selection: `${match.awayTeam} ganha por 6-10 pontos`, odd: 4.5 },
          { label: `${match.awayTeam} 11+`, selection: `${match.awayTeam} ganha por 11+ pontos`, odd: 3.2 },
        ],
        columns: 3,
      });

      // Primeiro a X Pontos
      addMarket({
        id: 'race-to-points',
        name: 'Primeiro a 20 Pontos',
        icon: 'ri-speed-line',
        type: 'race',
        isLive: isLiveMatch,
        options: [
          { label: match.homeTeam, selection: `${match.homeTeam} primeiro a 20`, odd: homeOdd * 0.95 },
          { label: match.awayTeam, selection: `${match.awayTeam} primeiro a 20`, odd: awayOdd * 0.95 },
        ],
        columns: 2,
      });

    } else if (sportType === 'hockey') {
      // ═══════════════════════════════════════════════════════════
      // 🏒 HÓQUEI - MERCADOS EXPANDIDOS
      // ═══════════════════════════════════════════════════════════
      const _homeOdd = odds.home || 2.0;
      const _awayOdd = odds.away || 2.2;

      // Puck Line com bloqueios
      const puckLineOptions: MarketOption[] = [];
      const puckLines = [
        { team: 'home', line: -1.5, baseOdd: 2.5 },
        { team: 'away', line: 1.5, baseOdd: 1.55 },
        { team: 'home', line: -2.5, baseOdd: 3.5 },
        { team: 'away', line: 2.5, baseOdd: 1.35 },
      ];

      puckLines.forEach(({ team, line, baseOdd }) => {
        const state = shouldBlockHockeyHandicap(team as 'home' | 'away', line);
        const teamName = team === 'home' ? match.homeTeam : match.awayTeam;
        
        if (state !== 'hidden') {
          puckLineOptions.push({
            label: state === 'won' ? `✓ ${teamName} ${line > 0 ? '+' : ''}${line}` : `${teamName} ${line > 0 ? '+' : ''}${line}`,
            selection: `${teamName} ${line > 0 ? '+' : ''}${line}`,
            odd: state === 'won' ? 1.00 : baseOdd,
            isBlocked: state === 'won',
          });
        }
      });

      if (puckLineOptions.length > 0) {
        addMarket({
          id: 'puck-line',
          name: 'Puck Line',
          icon: 'ri-scales-2-line',
          type: 'handicap',
          isLive: isLiveMatch,
          options: puckLineOptions,
          columns: 2,
        });
      }

      // Total de Golos
      const hockeyTotalOptions: MarketOption[] = [];
      const hockeyLines = [4.5, 5.5, 6.5, 7.5];
      const hockeyTotalGoals = currentScore.home + currentScore.away;

      hockeyLines.forEach(line => {
        const overWon = isLiveMatch && hockeyTotalGoals > line;
        const underHidden = isLiveMatch && hockeyTotalGoals > line;

        if (!overWon || !isLiveMatch) {
          hockeyTotalOptions.push({
            label: overWon ? `✓ Mais ${line}` : `Mais ${line}`,
            selection: `Mais de ${line} Golos`,
            odd: overWon ? 1.00 : 1.75 + (line - 5.5) * 0.15,
            isBlocked: overWon,
          });
        }

        if (!underHidden) {
          hockeyTotalOptions.push({
            label: `Menos ${line}`,
            selection: `Menos de ${line} Golos`,
            odd: 2.05 - (line - 5.5) * 0.15,
          });
        }
      });

      if (hockeyTotalOptions.length > 0) {
        addMarket({
          id: 'total-goals',
          name: 'Total de Golos',
          icon: 'ri-bar-chart-line',
          type: 'over-under',
          isLive: isLiveMatch,
          options: hockeyTotalOptions,
          columns: 2,
        });
      }

      // Ambas Marcam (Hóquei)
      addMarket({
        id: 'btts-hockey',
        name: 'Ambas Equipas Marcam',
        icon: 'ri-checkbox-circle-line',
        type: 'btts',
        isLive: isLiveMatch,
        options: [
          { label: 'Sim', selection: 'Ambas Marcam - Sim', odd: 1.35 },
          { label: 'Não', selection: 'Ambas Marcam - Não', odd: 3.0 },
        ],
        columns: 2,
      });

      // Período com Mais Golos
      addMarket({
        id: 'highest-scoring-period',
        name: 'Período com Mais Golos',
        icon: 'ri-time-line',
        type: 'period',
        isLive: isLiveMatch,
        options: [
          { label: '1º Período', selection: '1º Período mais golos', odd: 3.2 },
          { label: '2º Período', selection: '2º Período mais golos', odd: 2.8 },
          { label: '3º Período', selection: '3º Período mais golos', odd: 3.0 },
          { label: 'Empate', selection: 'Períodos empatados', odd: 4.5 },
        ],
        columns: 2,
      });

    } else if (sportType === 'baseball') {
      // ═══════════════════════════════════════════════════════════
      // ⚾ BASEBOL - MERCADOS EXPANDIDOS
      // ═══════════════════════════════════════════════════════════
      const homeOdd = odds.home || 1.95;
      const awayOdd = odds.away || 1.85;

      // Run Line com bloqueios
      const runLineOptions: MarketOption[] = [];
      const runLines = [
        { team: 'home', line: -1.5, baseOdd: 2.1 },
        { team: 'away', line: 1.5, baseOdd: 1.75 },
        { team: 'home', line: -2.5, baseOdd: 2.8 },
        { team: 'away', line: 2.5, baseOdd: 1.45 },
      ];

      runLines.forEach(({ team, line, baseOdd }) => {
        const state = shouldBlockBaseballHandicap(team as 'home' | 'away', line);
        const teamName = team === 'home' ? match.homeTeam : match.awayTeam;
        
        if (state !== 'hidden') {
          runLineOptions.push({
            label: state === 'won' ? `✓ ${teamName} ${line > 0 ? '+' : ''}${line}` : `${teamName} ${line > 0 ? '+' : ''}${line}`,
            selection: `${teamName} ${line > 0 ? '+' : ''}${line}`,
            odd: state === 'won' ? 1.00 : baseOdd,
            isBlocked: state === 'won',
          });
        }
      });

      if (runLineOptions.length > 0) {
        addMarket({
          id: 'run-line',
          name: 'Run Line',
          icon: 'ri-scales-2-line',
          type: 'handicap',
          isLive: isLiveMatch,
          options: runLineOptions,
          columns: 2,
        });
      }

      // Total de Corridas
      const baseballTotalOptions: MarketOption[] = [];
      const baseballLines = [6.5, 7.5, 8.5, 9.5, 10.5];
      const baseballTotalRuns = currentScore.home + currentScore.away;

      baseballLines.forEach(line => {
        const overWon = isLiveMatch && baseballTotalRuns > line;
        const underHidden = isLiveMatch && baseballTotalRuns > line;

        if (!overWon || !isLiveMatch) {
          baseballTotalOptions.push({
            label: overWon ? `✓ Mais ${line}` : `Mais ${line}`,
            selection: `Mais de ${line} Corridas`,
            odd: overWon ? 1.00 : 1.85 + (line - 8.5) * 0.1,
            isBlocked: overWon,
          });
        }

        if (!underHidden) {
          baseballTotalOptions.push({
            label: `Menos ${line}`,
            selection: `Menos de ${line} Corridas`,
            odd: 1.95 - (line - 8.5) * 0.1,
          });
        }
      });

      if (baseballTotalOptions.length > 0) {
        addMarket({
          id: 'total-runs',
          name: 'Total de Corridas',
          icon: 'ri-bar-chart-line',
          type: 'over-under',
          isLive: isLiveMatch,
          options: baseballTotalOptions,
          columns: 2,
        });
      }

      // Primeiro a Marcar
      addMarket({
        id: 'firstto-score',
        name: 'Primeiro a Marcar',
        icon: 'ri-medal-line',
        type: 'first',
        isLive: isLiveMatch,
        options: [
          { label: match.homeTeam, selection: `${match.homeTeam} marca primeiro`, odd: homeOdd * 0.98 },
          { label: match.awayTeam, selection: `${match.awayTeam} marca primeiro`, odd: awayOdd * 0.98 },
        ],
        columns: 2,
      });

      // Total de Home Runs
      addMarket({
        id: 'total-home-runs',
        name: 'Total de Home Runs',
        icon: 'ri-home-line',
        type: 'over-under',
        isLive: isLiveMatch,
        options: [
          { label: 'Mais 1.5', selection: 'Mais de 1.5 Home Runs', odd: 1.65 },
          { label: 'Menos 1.5', selection: 'Menos de 1.5 Home Runs', odd: 2.2 },
          { label: 'Mais 2.5', selection: 'Mais de 2.5 Home Runs', odd: 2.1 },
          { label: 'Menos 2.5', selection: 'Menos de 2.5 Home Runs', odd: 1.75 },
        ],
        columns: 2,
      });

    } else if (sportType === 'rugby') {
      // ═══════════════════════════════════════════════════════════
      // 🏉 RÚGBI - MERCADOS EXPANDIDOS
      // ═══════════════════════════════════════════════════════════
      const _homeOdd = odds.home || 1.7;
      const _awayOdd = odds.away || 2.15;

      // Handicap
      const rugbyHandicapOptions: MarketOption[] = [];
      const rugbyHandicapLines = [
        { team: 'home', line: -3.5, baseOdd: 1.9 },
        { team: 'away', line: 3.5, baseOdd: 1.9 },
        { team: 'home', line: -7.5, baseOdd: 2.1 },
        { team: 'away', line: 7.5, baseOdd: 1.75 },
        { team: 'home', line: -10.5, baseOdd: 2.3 },
        { team: 'away', line: 10.5, baseOdd: 1.6 },
        { team: 'home', line: -14.5, baseOdd: 2.6 },
        { team: 'away', line: 14.5, baseOdd: 1.5 },
      ];

      rugbyHandicapLines.forEach(({ team, line, baseOdd }) => {
        const state = shouldBlockHandicap(team as 'home' | 'away', line, 'rugby');
        const teamName = team === 'home' ? match.homeTeam : match.awayTeam;
        
        if (state !== 'hidden') {
          rugbyHandicapOptions.push({
            label: state === 'won' ? `✓ ${teamName} ${line > 0 ? '+' : ''}${line}` : `${teamName} ${line > 0 ? '+' : ''}${line}`,
            selection: `${teamName} ${line > 0 ? '+' : ''}${line}`,
            odd: state === 'won' ? 1.00 : baseOdd,
            isBlocked: state === 'won',
          });
        }
      });

      if (rugbyHandicapOptions.length > 0) {
        addMarket({
          id: 'handicap',
          name: 'Handicap',
          icon: 'ri-scales-2-line',
          type: 'handicap',
          isLive: isLiveMatch,
          options: rugbyHandicapOptions,
          columns: 2,
        });
      }

      // Total de Pontos
      const rugbyTotalOptions: MarketOption[] = [];
      const rugbyLines = [35.5, 40.5, 45.5, 50.5, 55.5];
      const rugbyTotalPoints = currentScore.home + currentScore.away;

      rugbyLines.forEach(line => {
        const overWon = isLiveMatch && rugbyTotalPoints > line;
        const underHidden = isLiveMatch && rugbyTotalPoints > line;

        if (!overWon || !isLiveMatch) {
          rugbyTotalOptions.push({
            label: overWon ? `✓ Mais ${line}` : `Mais ${line}`,
            selection: `Mais de ${line} Pontos`,
            odd: overWon ? 1.00 : 1.85 + (line - 45.5) * 0.05,
            isBlocked: overWon,
          });
        }

        if (!underHidden) {
          rugbyTotalOptions.push({
            label: `Menos ${line}`,
            selection: `Menos de ${line} Pontos`,
            odd: 1.95 - (line - 45.5) * 0.05,
          });
        }
      });

      if (rugbyTotalOptions.length > 0) {
        addMarket({
          id: 'total-points',
          name: 'Total de Pontos',
          icon: 'ri-bar-chart-line',
          type: 'over-under',
          isLive: isLiveMatch,
          options: rugbyTotalOptions,
          columns: 2,
        });
      }

      // Total de Tries
      addMarket({
        id: 'total-tries',
        name: 'Total de Tries',
        icon: 'ri-rugby-line',
        type: 'over-under',
        isLive: isLiveMatch,
        options: [
          { label: 'Mais 5.5', selection: 'Mais de 5.5 Tries', odd: 1.8 },
          { label: 'Menos 5.5', selection: 'Menos de 5.5 Tries', odd: 2.0 },
          { label: 'Mais 6.5', selection: 'Mais de 6.5 Tries', odd: 2.1 },
          { label: 'Menos 6.5', selection: 'Menos de 6.5 Tries', odd: 1.75 },
        ],
        columns: 2,
      });

      // Margem de Vitória
      addMarket({
        id: 'winning-margin',
        name: 'Margem de Vitória',
        icon: 'ri-ruler-line',
        type: 'margin',
        isLive: isLiveMatch,
        options: [
          { label: `${match.homeTeam} 1-12`, selection: `${match.homeTeam} ganha por 1-12`, odd: 4.0 },
          { label: `${match.homeTeam} 13+`, selection: `${match.homeTeam} ganha por 13+`, odd: 2.5 },
          { label: `${match.awayTeam} 1-12`, selection: `${match.awayTeam} ganha por 1-12`, odd: 4.5 },
          { label: `${match.awayTeam} 13+`, selection: `${match.awayTeam} ganha por 13+`, odd: 3.0 },
        ],
        columns: 2,
      });

    } else if (sportType === 'volleyball') {
      // ═══════════════════════════════════════════════════════════
      // 🏐 VÔLEI - MERCADOS EXPANDIDOS
      // ═══════════════════════════════════════════════════════════
      const _homeOdd = odds.home || 1.75;
      const _awayOdd = odds.away || 2.05;

      // Handicap Sets
      addMarket({
        id: 'handicap-sets',
        name: 'Handicap Sets',
        icon: 'ri-scales-2-line',
        type: 'handicap',
        isLive: isLiveMatch,
        options: [
          { label: `${match.homeTeam} -1.5`, selection: `${match.homeTeam} -1.5 Sets`, odd: 2.2 },
          { label: `${match.awayTeam} +1.5`, selection: `${match.awayTeam} +1.5 Sets`, odd: 1.7 },
          { label: `${match.homeTeam} -2.5`, selection: `${match.homeTeam} -2.5 Sets`, odd: 3.5 },
          { label: `${match.awayTeam} +2.5`, selection: `${match.awayTeam} +2.5 Sets`, odd: 1.3 },
        ],
        columns: 2,
      });

      // Total de Sets
      addMarket({
        id: 'total-sets',
        name: 'Total de Sets',
        icon: 'ri-bar-chart-line',
        type: 'over-under',
        isLive: isLiveMatch,
        options: [
          { label: 'Mais 3.5', selection: 'Mais de 3.5 Sets', odd: 1.65 },
          { label: 'Menos 3.5', selection: 'Menos de 3.5 Sets', odd: 2.2 },
          { label: 'Mais 4.5', selection: 'Mais de 4.5 Sets', odd: 2.8 },
          { label: 'Menos 4.5', selection: 'Menos de 4.5 Sets', odd: 1.4 },
        ],
        columns: 2,
      });

      // Resultado Exato Sets
      addMarket({
        id: 'exact-sets',
        name: 'Resultado Exato Sets',
        icon: 'ri-hashtag',
        type: 'exact',
        isLive: isLiveMatch,
        options: [
          { label: `${match.homeTeam} 3-0`, selection: `${match.homeTeam} ganha 3-0`, odd: 3.5 },
          { label: `${match.homeTeam} 3-1`, selection: `${match.homeTeam} ganha 3-1`, odd: 4.0 },
          { label: `${match.homeTeam} 3-2`, selection: `${match.homeTeam} ganha 3-2`, odd: 5.5 },
          { label: `${match.awayTeam} 3-0`, selection: `${match.awayTeam} ganha 3-0`, odd: 4.5 },
          { label: `${match.awayTeam} 3-1`, selection: `${match.awayTeam} ganha 3-1`, odd: 5.0 },
          { label: `${match.awayTeam} 3-2`, selection: `${match.awayTeam} ganha 3-2`, odd: 6.5 },
        ],
        columns: 3,
      });

      // Total de Pontos
      addMarket({
        id: 'total-points',
        name: 'Total de Pontos',
        icon: 'ri-calculator-line',
        type: 'over-under',
        isLive: isLiveMatch,
        options: [
          { label: 'Mais 160.5', selection: 'Mais de 160.5 Pontos', odd: 1.85 },
          { label: 'Menos 160.5', selection: 'Menos de 160.5 Pontos', odd: 1.95 },
          { label: 'Mais 180.5', selection: 'Mais de 180.5 Pontos', odd: 2.1 },
          { label: 'Menos 180.5', selection: 'Menos de 180.5 Pontos', odd: 1.75 },
        ],
        columns: 2,
      });

    } else if (sportType === 'mma') {
      // ═══════════════════════════════════════════════════════════
      // 🥊 MMA - MERCADOS EXPANDIDOS
      // ═══════════════════════════════════════════════════════════
      const _homeOdd = odds.home || 1.65;
      const _awayOdd = odds.away || 2.25;

      // Método de Vitória
      addMarket({
        id: 'method-victory',
        name: 'Método de Vitória',
        icon: 'ri-boxing-line',
        type: 'method',
        isLive: isLiveMatch,
        options: [
          { label: `${match.homeTeam} KO/TKO`, selection: `${match.homeTeam} por KO/TKO`, odd: 2.5 },
          { label: `${match.homeTeam} Submissão`, selection: `${match.homeTeam} por Submissão`, odd: 4.0 },
          { label: `${match.homeTeam} Decisão`, selection: `${match.homeTeam} por Decisão`, odd: 3.2 },
          { label: `${match.awayTeam} KO/TKO`, selection: `${match.awayTeam} por KO/TKO`, odd: 3.5 },
          { label: `${match.awayTeam} Submissão`, selection: `${match.awayTeam} por Submissão`, odd: 5.5 },
          { label: `${match.awayTeam} Decisão`, selection: `${match.awayTeam} por Decisão`, odd: 4.5 },
        ],
        columns: 3,
      });

      // Round de Finalização
      addMarket({
        id: 'round-finish',
        name: 'Round de Finalização',
        icon: 'ri-time-line',
        type: 'round',
        isLive: isLiveMatch,
        options: [
          { label: 'Round 1', selection: 'Luta termina no Round 1', odd: 3.5 },
          { label: 'Round 2', selection: 'Luta termina no Round 2', odd: 4.0 },
          { label: 'Round 3', selection: 'Luta termina no Round 3', odd: 4.5 },
          { label: 'Decisão', selection: 'Luta vai à decisão', odd: 2.2 },
        ],
        columns: 2,
      });

      // Total de Rounds
      addMarket({
        id: 'total-rounds',
        name: 'Total de Rounds',
        icon: 'ri-bar-chart-line',
        type: 'over-under',
        isLive: isLiveMatch,
        options: [
          { label: 'Mais 1.5', selection: 'Mais de 1.5 Rounds', odd: 1.55 },
          { label: 'Menos 1.5', selection: 'Menos de 1.5 Rounds', odd: 2.4 },
          { label: 'Mais 2.5', selection: 'Mais de 2.5 Rounds', odd: 1.75 },
          { label: 'Menos 2.5', selection: 'Menos de 2.5 Rounds', odd: 2.05 },
        ],
        columns: 2,
      });

      // Luta Termina em
      addMarket({
        id: 'fight-ends',
        name: 'Luta Termina em',
        icon: 'ri-flag-line',
        type: 'ending',
        isLive: isLiveMatch,
        options: [
          { label: 'KO/TKO', selection: 'Luta termina por KO/TKO', odd: 2.0 },
          { label: 'Submissão', selection: 'Luta termina por Submissão', odd: 3.5 },
          { label: 'Decisão', selection: 'Luta vai à Decisão', odd: 2.2 },
        ],
        columns: 3,
      });

    } else if (sportType === 'handball') {
      // ═══════════════════════════════════════════════════════════
      // 🤾 ANDEBOL - MERCADOS EXPANDIDOS
      // ═══════════════════════════════════════════════════════════
      const _homeOdd = odds.home || 1.8;
      const _drawOdd = odds.draw || 8.0;
      const _awayOdd = odds.away || 2.0;

      // Dupla Hipótese
      addMarket({
        id: 'double-chance',
        name: 'Dupla Hipótese',
        icon: 'ri-scales-3-line',
        type: 'double-chance',
        isLive: isLiveMatch,
        options: [
          { label: '1X', selection: `${match.homeTeam} ou Empate`, odd: parseFloat((1 / (1 / odds.home + 1 / odds.draw) * 1.05).toFixed(2)), trend: getOddTrend('homeOrDraw'), liveOddKey: 'homeOrDraw' },
          { label: '12', selection: `${match.homeTeam} ou ${match.awayTeam}`, odd: parseFloat((1 / (1 / odds.home + 1 / odds.away) * 1.05).toFixed(2)), trend: getOddTrend('homeOrAway'), liveOddKey: 'homeOrAway' },
          { label: 'X2', selection: `Empate ou ${match.awayTeam}`, odd: parseFloat((1 / (1 / odds.draw + 1 / odds.away) * 1.05).toFixed(2)), trend: getOddTrend('drawOrAway'), liveOddKey: 'drawOrAway' },
        ],
        columns: 3,
      });

      // Handicap
      const handballHandicapOptions: MarketOption[] = [];
      const handballHandicapLines = [
        { team: 'home', line: -2.5, baseOdd: 1.9 },
        { team: 'away', line: 2.5, baseOdd: 1.9 },
        { team: 'home', line: -4.5, baseOdd: 1.95 },
        { team: 'away', line: 4.5, baseOdd: 1.85 },
        { team: 'home', line: -6.5, baseOdd: 2.05 },
        { team: 'away', line: 6.5, baseOdd: 1.8 },
        { team: 'home', line: -8.5, baseOdd: 2.1 },
        { team: 'away', line: 8.5, baseOdd: 1.65 },
      ];

      handballHandicapLines.forEach(({ team, line, baseOdd }) => {
        const state = shouldBlockHandicap(team as 'home' | 'away', line, 'handball');
        const teamName = team === 'home' ? match.homeTeam : match.awayTeam;
        
        if (state !== 'hidden') {
          handballHandicapOptions.push({
            label: state === 'won' ? `✓ ${teamName} ${line > 0 ? '+' : ''}${line}` : `${teamName} ${line > 0 ? '+' : ''}${line}`,
            selection: `${teamName} ${line > 0 ? '+' : ''}${line}`,
            odd: state === 'won' ? 1.00 : baseOdd,
            isBlocked: state === 'won',
          });
        }
      });

      if (handballHandicapOptions.length > 0) {
        addMarket({
          id: 'handicap',
          name: 'Handicap',
          icon: 'ri-scales-2-line',
          type: 'handicap',
          isLive: isLiveMatch,
          options: handballHandicapOptions,
          columns: 2,
        });
      }

      // Total de Golos
      const handballTotalOptions: MarketOption[] = [];
      const handballLines = [48.5, 50.5, 52.5, 54.5, 56.5];
      const handballTotalGoals = currentScore.home + currentScore.away;

      handballLines.forEach(line => {
        const overWon = isLiveMatch && handballTotalGoals > line;
        const underHidden = isLiveMatch && handballTotalGoals > line;

        if (!overWon || !isLiveMatch) {
          handballTotalOptions.push({
            label: overWon ? `✓ Mais ${line}` : `Mais ${line}`,
            selection: `Mais de ${line} Golos`,
            odd: overWon ? 1.00 : 1.85 + (line - 52.5) * 0.05,
            isBlocked: overWon,
          });
        }

        if (!underHidden) {
          handballTotalOptions.push({
            label: `Menos ${line}`,
            selection: `Menos de ${line} Golos`,
            odd: 1.95 - (line - 52.5) * 0.05,
          });
        }
      });

      if (handballTotalOptions.length > 0) {
        addMarket({
          id: 'total-goals',
          name: 'Total de Golos',
          icon: 'ri-bar-chart-line',
          type: 'over-under',
          isLive: isLiveMatch,
          options: handballTotalOptions,
          columns: 2,
        });
      }

      // Intervalo/Final
      addMarket({
        id: 'half-time-full-time',
        name: 'Intervalo/Final',
        icon: 'ri-time-line',
        type: 'htft',
        isLive: isLiveMatch,
        options: [
          { label: `${match.homeTeam}/${match.homeTeam}`, selection: `Casa/Casa`, odd: 2.2 },
          { label: `${match.homeTeam}/Empate`, selection: `Casa/Empate`, odd: 15.0 },
          { label: `Empate/${match.homeTeam}`, selection: `Empate/Casa`, odd: 8.0 },
          { label: `${match.awayTeam}/${match.awayTeam}`, selection: `Fora/Fora`, odd: 2.8 },
          { label: `${match.awayTeam}/Empate`, selection: `Fora/Empate`, odd: 18.0 },
          { label: `Empate/${match.awayTeam}`, selection: `Empate/Fora`, odd: 9.0 },
        ],
        columns: 3,
      });

    } else if (sportType === 'afl') {
      // ═══════════════════════════════════════════════════════════
      // 🏈 AFL - MERCADOS EXPANDIDOS
      // ═══════════════════════════════════════════════════════════
      const homeOdd = odds.home || 1.9;
      const awayOdd = odds.away || 1.9;

      // Line (Handicap)
      const aflLineOptions: MarketOption[] = [];
      const aflLines = [
        { team: 'home', line: -6.5, baseOdd: 1.9 },
        { team: 'away', line: 6.5, baseOdd: 1.9 },
        { team: 'home', line: -12.5, baseOdd: 2.1 },
        { team: 'away', line: 12.5, baseOdd: 1.75 },
        { team: 'home', line: -18.5, baseOdd: 2.4 },
        { team: 'away', line: 18.5, baseOdd: 1.55 },
        { team: 'home', line: -24.5, baseOdd: 2.8 },
        { team: 'away', line: 24.5, baseOdd: 1.45 },
      ];

      aflLines.forEach(({ team, line, baseOdd }) => {
        const state = shouldBlockHandicap(team as 'home' | 'away', line, 'afl');
        const teamName = team === 'home' ? match.homeTeam : match.awayTeam;
        
        if (state !== 'hidden') {
          aflLineOptions.push({
            label: state === 'won' ? `✓ ${teamName} ${line > 0 ? '+' : ''}${line}` : `${teamName} ${line > 0 ? '+' : ''}${line}`,
            selection: `${teamName} ${line > 0 ? '+' : ''}${line}`,
            odd: state === 'won' ? 1.00 : baseOdd,
            isBlocked: state === 'won',
          });
        }
      });

      if (aflLineOptions.length > 0) {
        addMarket({
          id: 'line',
          name: 'Line',
          icon: 'ri-scales-2-line',
          type: 'handicap',
          isLive: isLiveMatch,
          options: aflLineOptions,
          columns: 2,
        });
      }

      // Total de Pontos
      const aflTotalOptions: MarketOption[] = [];
      const aflTotalLines = [150.5, 160.5, 170.5, 180.5, 190.5];
      const aflTotalPoints = currentScore.home + currentScore.away;

      aflTotalLines.forEach(line => {
        const overWon = isLiveMatch && aflTotalPoints > line;
        const underHidden = isLiveMatch && aflTotalPoints > line;

        if (!overWon || !isLiveMatch) {
          aflTotalOptions.push({
            label: overWon ? `✓ Mais ${line}` : `Mais ${line}`,
            selection: `Mais de ${line} Pontos`,
            odd: overWon ? 1.00 : 1.85 + (line - 170.5) * 0.03,
            isBlocked: overWon,
          });
        }

        if (!underHidden) {
          aflTotalOptions.push({
            label: `Menos ${line}`,
            selection: `Menos de ${line} Pontos`,
            odd: 1.95 - (line - 170.5) * 0.03,
          });
        }
      });

      if (aflTotalOptions.length > 0) {
        addMarket({
          id: 'total-points',
          name: 'Total de Pontos',
          icon: 'ri-bar-chart-line',
          type: 'over-under',
          isLive: isLiveMatch,
          options: aflTotalOptions,
          columns: 2,
        });
      }

      // Margem de Vitória
      addMarket({
        id: 'winning-margin',
        name: 'Margem de Vitória',
        icon: 'ri-ruler-line',
        type: 'margin',
        isLive: isLiveMatch,
        options: [
          { label: `${match.homeTeam} 1-39`, selection: `${match.homeTeam} ganha por 1-39`, odd: 3.5 },
          { label: `${match.homeTeam} 40+`, selection: `${match.homeTeam} ganha por 40+`, odd: 2.8 },
          { label: `${match.awayTeam} 1-39`, selection: `${match.awayTeam} ganha por 1-39`, odd: 4.0 },
          { label: `${match.awayTeam} 40+`, selection: `${match.awayTeam} ganha por 40+`, odd: 3.2 },
        ],
        columns: 2,
      });

      // Primeiro Golo
      addMarket({
        id: 'first-goal',
        name: 'Primeiro Golo',
        icon: 'ri-medal-line',
        type: 'first',
        isLive: isLiveMatch,
        options: [
          { label: match.homeTeam, selection: `${match.homeTeam} marca primeiro`, odd: homeOdd * 0.95 },
          { label: match.awayTeam, selection: `${match.awayTeam} marca primeiro`, odd: awayOdd * 0.95 },
        ],
        columns: 2,
      });
    }

    console.log(`✅ Mercados criados para ${sportNames[sportType]}: ${allMarkets.length}`);
    return allMarkets;
  }, [
    match,
    isLiveMatch,
    sportType,
    isSoccer,
    marketBlocks,
    globalBlock,
    shouldHideBTTS,
    shouldBlockCorrectScore,
    shouldBlockHandicap,
    shouldBlockBasketballHandicap,
    shouldBlockHockeyHandicap,
    shouldBlockBaseballHandicap,
    getOverUnderState,
    currentScore,
    getOddTrend,
    getOddValue,
    apiOdds,
    liveOdds,
  ]);

  const filteredMarkets = useMemo(() => {
    if (!activeCategory) return markets;
    const id = (m: Market) => String(m.id || '').toLowerCase();
    const name = (m: Market) => String(m.name || '').toLowerCase();

    if (activeCategory === 'resultado') {
      return markets.filter((m) => id(m).includes('match-winner') || id(m).includes('double-chance') || name(m).includes('resultado'));
    }
    if (activeCategory === 'total_gols') {
      return markets.filter((m) => id(m).includes('over-under') || id(m).includes('total') || name(m).includes('golos') || name(m).includes('gols'));
    }
    if (activeCategory === 'escanteios') {
      return markets.filter((m) => id(m).includes('corner') || name(m).includes('canto') || name(m).includes('escante'));
    }
    if (activeCategory === 'handicap') {
      return markets.filter((m) => id(m).includes('handicap') || name(m).includes('handicap'));
    }
    if (activeCategory === 'ambas_marcam') {
      return markets.filter((m) => id(m).includes('btts') || name(m).includes('ambas'));
    }
    return markets;
  }, [activeCategory, markets]);

  const toggleMarket = (marketName: string) => {
    setExpandedMarkets((prev) =>
      prev.includes(marketName)
        ? prev.filter((m) => m !== marketName)
        : [...prev, marketName]
    );
  };

  // ✅ Odd button component COM SETAS ANIMADAS
  const OddButton = ({
    option,
    marketName,
    marketBlocked,
  }: {
    option: MarketOption;
    marketName: string;
    marketBlocked?: boolean;
  }) => {
    const active = isSelected(option.selection);
    const isFlashing = option.liveOddKey && (flashingOdds.has(option.liveOddKey) || oddsFlashing.has(option.liveOddKey as string));
    const trend = option.trend || 'stable';
    const isDisabled = marketBlocked || option.isBlocked;

    const getTrendStyles = () => {
      if (!isLiveMatch || !option.liveOddKey) return '';
      if (isFlashing) {
        if (trend === 'up') return 'ring-2 ring-emerald-500 bg-emerald-500/10';
        if (trend === 'down') return 'ring-2 ring-red-500 bg-red-500/10';
      }
      return '';
    };

    return (
      <button
        onClick={() => !isDisabled && onAddSelection(option.selection, option.odd, marketName)}
        disabled={isDisabled}
        className={`
          relative flex flex-col items-center justify-center min-h-[52px] px-2 py-2 rounded-lg transition-all duration-300
          ${isDisabled ? 'opacity-50 cursor-not-allowed bg-gray-500/20' : 'cursor-pointer'}
          ${active && !isDisabled
            ? 'bg-red-600 text-white shadow-lg shadow-red-600/30 scale-[1.02]'
            : theme === 'dark'
            ? 'bg-gray-800/80 hover:bg-gray-700/80 text-white border border-gray-700/50 hover:border-red-500/50'
            : 'bg-gray-50 hover:bg-gray-100 text-gray-900 border border-gray-200 hover:border-red-300'}
          ${getTrendStyles()}
        `}
      >
        {isLiveMatch && option.liveOddKey && trend !== 'stable' && !isDisabled && (
          <div className={`absolute -top-1 -right-1 w-4 h-4 flex items-center justify-center rounded-full text-[8px]
            ${trend === 'up' ? 'bg-emerald-500 text-white' : 'bg-red-500 text-white'}
            ${isFlashing ? 'animate-pulse' : ''}`}>
            <i className={`ri-arrow-${trend === 'up' ? 'up' : 'down'}-s-line`}></i>
          </div>
        )}

        <span className={`text-[9px] font-medium text-center leading-tight mb-0.5
          ${active ? 'text-white/80' : theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>
          {option.label}
        </span>

        <div className="flex items-center gap-1">
          {isLiveMatch && isFlashing && trend === 'down' && (
            <i className="ri-arrow-down-s-fill text-base text-red-400 animate-bounce"></i>
          )}
          {dataSource === 'api' && apiOdds?.meta && (
            <span
              className="hidden md:inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-blue-500/15 text-blue-300 text-[8px] font-medium"
              title={`Bookmaker: ${apiOdds.meta.bookmaker} • Mercados: ${apiOdds.meta.markets.length}${
                apiOdds.meta.lastUpdate ? ` • Update: ${apiOdds.meta.lastUpdate}` : ''
              }`}
            >
              <i className="ri-database-2-line text-[9px]"></i>
              {apiOdds.meta.bookmaker || 'API-Football'}
              <span className="opacity-70">({apiOdds.meta.markets.length})</span>
            </span>
          )}
          
          <span className={`font-black text-sm
            ${isFlashing && trend === 'up' ? 'text-emerald-400' : ''}
            ${isFlashing && trend === 'down' ? 'text-red-400' : ''}`}>
            {option.odd.toFixed(2)}
          </span>

          {isLiveMatch && isFlashing && trend === 'up' && (
            <i className="ri-arrow-up-s-fill text-base text-emerald-400 animate-bounce"></i>
          )}
        </div>
      </button>
    );
  };

  const BlockCountdown = ({ blockState }: { blockState: MarketBlockState }) => {
    const [remaining, setRemaining] = useState(blockState.duration);

    useEffect(() => {
      const elapsed = Math.floor((Date.now() - blockState.startTime) / 1000);
      const initialRemaining = Math.max(0, blockState.duration - elapsed);
      setRemaining(initialRemaining);

      const interval = setInterval(() => {
        setRemaining(prev => Math.max(0, prev - 1));
      }, 1000);

      return () => clearInterval(interval);
    }, [blockState]);

    return (
      <span className="text-amber-300 font-mono text-sm ml-2">({remaining}s)</span>
    );
  };

  const formatRefreshInterval = (ms: number): string => {
    if (ms < 60000) return `${ms/1000}s`;
    if (ms < 3600000) return `${ms/60000}min`;
    return `${ms/3600000}h`;
  };

  return (
    <div className="space-y-4">
      {globalBlock && isSoccer && isLiveMatch && (
        <div className="bg-gradient-to-r from-amber-600 to-orange-600 rounded-xl p-4 shadow-lg animate-pulse">
          <div className="flex items-center justify-center gap-3">
            <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center">
              <i className="ri-football-line text-2xl text-white"></i>
            </div>
            <div className="text-center">
              <p className="text-white font-bold text-lg">{globalBlock.reason}</p>
              <p className="text-white/80 text-sm flex items-center justify-center">
                <i className="ri-lock-line mr-1"></i>
                Mercados suspensos temporariamente
                <BlockCountdown blockState={globalBlock} />
              </p>
            </div>
          </div>
        </div>
      )}

      {shouldBlockByIncident && activeIncident && (
        <OddsBlockedOverlay incident={activeIncident} compact={false} />
      )}

      <div className={`flex items-center justify-between px-3 py-2 rounded-lg ${theme === 'dark' ? 'bg-gray-800/40' : 'bg-gray-50'}`}>
        <div className="flex items-center gap-2">
          <span className={`text-xs font-medium ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
            <i className="ri-list-check-2 mr-1.5"></i>
            {filteredMarkets.length} mercados - {sportNames[sportType]}
          </span>
          {dataSource === 'api' && (
            <span className="flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-green-500/20 text-green-400 text-[8px] font-bold">
              <span className="w-1 h-1 rounded-full bg-green-400"></span>
              API
            </span>
          )}
          {isLiveMatch && (
            <span className="flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-red-500/20 text-red-400 text-[8px] font-bold">
              <span className="w-1 h-1 rounded-full bg-red-400 animate-pulse"></span>
              {currentScore.home} - {currentScore.away}
            </span>
          )}
          <span className="flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-amber-500/20 text-amber-400 text-[8px] font-bold">
            <i className="ri-refresh-line"></i>
            {formatRefreshInterval(refreshInterval)}
          </span>
        </div>
        <button
          onClick={() => setExpandedMarkets(filteredMarkets.map((m) => m.name))}
          className={`text-[10px] font-medium px-2 py-1 rounded cursor-pointer
            ${theme === 'dark' ? 'text-red-400 hover:bg-red-500/10' : 'text-red-600 hover:bg-red-50'}`}>
          Expandir todos
        </button>
      </div>

      {filteredMarkets.map((market) => (
        <div
          key={market.id}
          className={`rounded-lg border overflow-hidden transition-all duration-300
            ${market.isBlocked ? 'ring-2 ring-amber-500/50' : ''}
            ${theme === 'dark' ? 'bg-gray-800/60 border-gray-700/40' : 'bg-white border-gray-200'}`}>
          
          <button
            onClick={() => toggleMarket(market.name)}
            className={`w-full flex items-center justify-between px-4 py-3 cursor-pointer transition-colors
              ${theme === 'dark' ? 'hover:bg-gray-800/50' : 'hover:bg-gray-50'}`}>
            <div className="flex items-center gap-2">
              <i className={`${market.icon} text-sm ${theme === 'dark' ? 'text-amber-400' : 'text-amber-600'}`}></i>
              <span className={`text-xs font-bold ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
                {market.name}
              </span>
              <span className={`text-[9px] px-1.5 py-0.5 rounded-full
                ${theme === 'dark' ? 'bg-gray-800 text-gray-400' : 'bg-gray-100 text-gray-500'}`}>
                {market.options.length}
              </span>
              {market.isLive && !market.isBlocked && (
                <span className="flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 text-[8px] font-bold">
                  <span className="w-1 h-1 rounded-full bg-emerald-400 animate-pulse"></span>
                  LIVE
                </span>
              )}
              {market.isBlocked && (
                <span className="flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-amber-500/20 text-amber-400 text-[8px] font-bold animate-pulse">
                  <i className="ri-lock-line text-[8px]"></i>
                  SUSPENSO
                </span>
              )}
            </div>
            <i className={`ri-arrow-${expandedMarkets.includes(market.name) ? 'up' : 'down'}-s-line text-lg
              ${theme === 'dark' ? 'text-gray-500' : 'text-gray-400'}`}></i>
          </button>

          {expandedMarkets.includes(market.name) && (
            <div className="p-4 relative overflow-hidden">
              {market.isBlocked ? (
                <div className="flex flex-col items-center justify-center py-6 gap-3">
                  <div className="w-16 h-16 bg-gradient-to-br from-amber-500 to-orange-600 rounded-full flex items-center justify-center animate-pulse">
                    <i className="ri-lock-line text-3xl text-white"></i>
                  </div>
                  <div className="text-center">
                    <p className={`font-bold ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
                      Mercado Suspenso
                    </p>
                    <p className={`text-sm ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>
                      {market.blockReason || 'Aguarde atualização das odds'}
                    </p>
                  </div>
                </div>
              ) : (
                <div
                  className="grid gap-2"
                  style={{ gridTemplateColumns: `repeat(${market.columns || 3}, minmax(0, 1fr))` }}>
                  {market.options.map((option, idx) => (
                    <OddButton
                      key={`${market.id}-${option.selection}-${idx}`}
                      option={option}
                      marketName={market.name}
                      marketBlocked={market.isBlocked}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      ))}

      {isLiveMatch && (isRunning || dataSource === 'api') && !globalBlock && (
        <div className={`flex items-center justify-center gap-4 py-2 px-4 rounded-lg
          ${theme === 'dark' ? 'bg-gray-900/30' : 'bg-gray-50'}`}>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-full bg-emerald-500 flex items-center justify-center">
              <i className="ri-arrow-up-s-line text-white text-[8px]"></i>
            </div>
            <span className={`text-[9px] ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>Odd subiu</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-full bg-red-500 flex items-center justify-center">
              <i className="ri-arrow-down-s-line text-white text-[8px]"></i>
            </div>
            <span className={`text-[9px] ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>Odd desceu</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
            <span className={`text-[9px] ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>
              Atualização: {formatRefreshInterval(refreshInterval)}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
