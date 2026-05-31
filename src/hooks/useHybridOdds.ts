/**
 * Hook para Sistema Híbrido de Odds
 * Combina The Odds API (mercados básicos) + API-Football (mercados especiais)
 */

import { useState, useEffect, useCallback } from 'react';
type SpecialMarket = { outcomes: Array<{ name: string; odds: number; description?: string }> } | null;
type FormattedSpecialMarkets = Record<string, SpecialMarket>;
async function fetchFormattedSpecialMarkets(_sport: string, _fixtureId: string): Promise<FormattedSpecialMarkets> { return {}; }

// ═══════════════════════════════════════════════════════════
// TIPOS
// ═══════════════════════════════════════════════════════════

export interface HybridMarket {
  type: string;
  name: string;
  source: 'the-odds-api' | 'api-football';
  category: 'basic' | 'special';
  outcomes: Array<{
    name: string;
    odds: number;
    point?: number;
    description?: string;
  }>;
}

export interface HybridOddsData {
  // Mercados básicos (The Odds API)
  basicMarkets: HybridMarket[];

  // Mercados especiais (API-Football)
  specialMarkets: HybridMarket[];

  // Todos os mercados combinados
  allMarkets: HybridMarket[];

  // Mercados organizados por categoria
  marketsByCategory: {
    resultado: HybridMarket[];
    golos: HybridMarket[];
    handicap: HybridMarket[];
    especiais: HybridMarket[];
    cantos: HybridMarket[];
    cartoes: HybridMarket[];
    intervalos: HybridMarket[];
    cleanSheet: HybridMarket[];
    combinados: HybridMarket[];
  };

  // Estado
  loading: boolean;
  error: string | null;

  // Fontes de dados
  sources: {
    theOddsApi: boolean;
    apiFootball: boolean;
  };
}

// ═══════════════════════════════════════════════════════════
// CONVERSÃO DE MERCADOS
// ═══════════════════════════════════════════════════════════

/**
 * Converte mercados da The Odds API para formato híbrido
 */
function convertTheOddsApiMarkets(
  markets?: Array<{
    type: string;
    outcomes: Array<{ name: string; odds: number; point?: number }>;
  }>
): HybridMarket[] {
  if (!markets) return [];

  const marketNames: Record<string, string> = {
    h2h: 'Resultado Final',
    spreads: 'Handicap',
    totals: 'Over/Under Gols',
    btts: 'Ambas Marcam',
    draw_no_bet: 'Draw No Bet',
    alternate_totals: 'Over/Under Alternativo',
    alternate_spreads: 'Handicap Alternativo',
    team_totals: 'Gols por Equipa',
  };

  return markets
    .filter((m) => {
      // ✅ PROTEÇÃO: Filtrar mercados inválidos ANTES de processar
      if (!m || !m.type || typeof m.type !== 'string' || m.type.trim() === '') {
        console.warn('⚠️ Mercado da The Odds API ignorado (type inválido):', m);
        return false;
      }
      if (!m.outcomes || !Array.isArray(m.outcomes) || m.outcomes.length === 0) {
        console.warn('⚠️ Mercado da The Odds API ignorado (sem outcomes):', m);
        return false;
      }
      return true;
    })
    .map((m) => ({
      type: m.type,
      name: marketNames[m.type] || m.type,
      source: 'the-odds-api' as const,
      category: 'basic' as const,
      outcomes: m.outcomes.map((o) => ({
        name: o.name,
        odds: o.odds,
        point: o.point,
      })),
    }));
}

/**
 * Converte mercados especiais da API-Football para formato híbrido (EXPANDIDO)
 */
function convertApiFootballMarkets(
  specialMarkets: FormattedSpecialMarkets
): HybridMarket[] {
  const result: HybridMarket[] = [];

  const addMarket = (
    market: SpecialMarket | null,
    name: string,
    type: string
  ) => {
    if (market && market.outcomes.length > 0) {
      result.push({
        type,
        name,
        source: 'api-football',
        category: 'special',
        outcomes: market.outcomes.map((o) => ({
          name: o.name,
          odds: o.odds,
          description: o.description,
        })),
      });
    }
  };

  // ═══════════════════════════════════════════════════════════
  // RESULTADO
  // ═══════════════════════════════════════════════════════════
  addMarket(specialMarkets.exactScore, 'Resultado Exato', 'exact_score');
  addMarket(specialMarkets.exactScoreFirstHalf, 'Resultado Exato 1ª Parte', 'exact_score_first_half');
  addMarket(specialMarkets.halftimeFulltime, 'Intervalo/Final', 'halftime_fulltime');
  addMarket(specialMarkets.firstHalfWinner, 'Vencedor 1ª Parte', 'first_half_winner');
  addMarket(specialMarkets.secondHalfWinner, 'Vencedor 2ª Parte', 'second_half_winner');
  addMarket(specialMarkets.doubleChance, 'Dupla Hipótese', 'double_chance');

  // ═══════════════════════════════════════════════════════════
  // GOLOS
  // ═══════════════════════════════════════════════════════════
  addMarket(specialMarkets.oddEven, 'Par/Ímpar Gols', 'odd_even');
  addMarket(specialMarkets.firstGoal, 'Primeira Equipa a Marcar', 'first_goal');
  addMarket(specialMarkets.lastGoal, 'Última Equipa a Marcar', 'last_goal');
  addMarket(specialMarkets.firstHalfOverUnder, 'Over/Under 1ª Parte', 'first_half_over_under');
  addMarket(specialMarkets.secondHalfOverUnder, 'Over/Under 2ª Parte', 'second_half_over_under');
  addMarket(specialMarkets.bttsFirstHalf, 'Ambas Marcam 1ª Parte', 'btts_first_half');
  addMarket(specialMarkets.bttsSecondHalf, 'Ambas Marcam 2ª Parte', 'btts_second_half');
  addMarket(specialMarkets.winningMargin, 'Margem de Vitória', 'winning_margin');
  addMarket(specialMarkets.multiGoals, 'Multi-Gols', 'multi_goals');
  addMarket(specialMarkets.homeTeamGoals, 'Golos Casa Over/Under', 'home_team_goals');
  addMarket(specialMarkets.awayTeamGoals, 'Golos Fora Over/Under', 'away_team_goals');
  addMarket(specialMarkets.homeTeamExactGoals, 'Golos Exatos Casa', 'home_team_exact_goals');
  addMarket(specialMarkets.awayTeamExactGoals, 'Golos Exatos Fora', 'away_team_exact_goals');
  addMarket(specialMarkets.goalInBothHalves, 'Golo em Ambas as Partes', 'goal_in_both_halves');
  addMarket(specialMarkets.highestScoringHalf, 'Parte com Mais Golos', 'highest_scoring_half');

  // ═══════════════════════════════════════════════════════════
  // CLEAN SHEET / WIN TO NIL
  // ═══════════════════════════════════════════════════════════
  addMarket(specialMarkets.cleanSheetHome, 'Clean Sheet Casa', 'clean_sheet_home');
  addMarket(specialMarkets.cleanSheetAway, 'Clean Sheet Fora', 'clean_sheet_away');
  addMarket(specialMarkets.winToNilHome, 'Vitória sem Sofrer Casa', 'win_to_nil_home');
  addMarket(specialMarkets.winToNilAway, 'Vitória sem Sofrer Fora', 'win_to_nil_away');

  // ═══════════════════════════════════════════════════════════
  // 🆕 CANTOS - EXPANDIDO
  // ═══════════════════════════════════════════════════════════
  addMarket(specialMarkets.cornersOverUnder, 'Over/Under Cantos', 'corners_over_under');
  addMarket(specialMarkets.cornersHomeOverUnder, 'Cantos Casa Over/Under', 'corners_home_over_under');
  addMarket(specialMarkets.cornersAwayOverUnder, 'Cantos Fora Over/Under', 'corners_away_over_under');
  addMarket(specialMarkets.cornersHandicap, 'Handicap Cantos', 'corners_handicap');
  addMarket(specialMarkets.corners1X2, 'Mais Cantos (1X2)', 'corners_1x2');
  addMarket(specialMarkets.cornersOddEven, 'Cantos Par/Ímpar', 'corners_odd_even');
  addMarket(specialMarkets.cornersFirstHalf, 'Cantos 1ª Parte', 'corners_first_half');

  // ═══════════════════════════════════════════════════════════
  // 🆕 CARTÕES - EXPANDIDO
  // ═══════════════════════════════════════════════════════════
  addMarket(specialMarkets.cardsOverUnder, 'Over/Under Cartões', 'cards_over_under');
  addMarket(specialMarkets.cardsHomeOverUnder, 'Cartões Casa Over/Under', 'cards_home_over_under');
  addMarket(specialMarkets.cardsAwayOverUnder, 'Cartões Fora Over/Under', 'cards_away_over_under');
  addMarket(specialMarkets.cards1X2, 'Mais Cartões (1X2)', 'cards_1x2');
  addMarket(specialMarkets.redCard, 'Cartão Vermelho no Jogo', 'red_card');
  addMarket(specialMarkets.cardsFirstHalf, 'Cartões 1ª Parte', 'cards_first_half');

  // ═══════════════════════════════════════════════════════════
  // 🆕 COMBINADOS
  // ═══════════════════════════════════════════════════════════
  addMarket(specialMarkets.resultAndBtts, 'Resultado + Ambas Marcam', 'result_and_btts');
  addMarket(specialMarkets.resultAndOverUnder, 'Resultado + Over/Under', 'result_and_over_under');
  addMarket(specialMarkets.doubleChanceAndBtts, 'Dupla Hipótese + Ambas Marcam', 'double_chance_and_btts');

  return result;
}

/**
 * Organiza mercados por categoria (EXPANDIDO)
 */
function categorizeMarkets(
  markets: HybridMarket[]
): HybridOddsData['marketsByCategory'] {
  const categories: HybridOddsData['marketsByCategory'] = {
    resultado: [],
    golos: [],
    handicap: [],
    especiais: [],
    cantos: [],
    cartoes: [],
    intervalos: [],
    cleanSheet: [],
    combinados: [],
  };

  for (const market of markets) {
    // ✅ PROTEÇÃO: Verificar se type e name existem
    if (!market || !market.type || !market.name) {
      console.warn('⚠️ Mercado inválido ignorado:', market);
      continue;
    }

    const type = market.type.toLowerCase();
    const name = market.name.toLowerCase();

    // Combinados (verificar primeiro)
    if (
      type.includes('result_and') ||
      type.includes('double_chance_and') ||
      name.includes('resultado +') ||
      name.includes('dupla hipótese +')
    ) {
      categories.combinados.push(market);
    }
    // Clean Sheet / Win to Nil
    else if (
      type.includes('clean_sheet') ||
      type.includes('win_to_nil') ||
      name.includes('clean sheet') ||
      name.includes('sem sofrer')
    ) {
      categories.cleanSheet.push(market);
    }
    // Cantos
    else if (
      type.includes('corner') ||
      name.includes('canto') ||
      name.includes('corner')
    ) {
      categories.cantos.push(market);
    }
    // Cartões
    else if (
      type.includes('card') ||
      name.includes('cartõ') ||
      name.includes('cartao') ||
      name.includes('cartões') ||
      name.includes('vermelho')
    ) {
      categories.cartoes.push(market);
    }
    // Intervalos (1ª/2ª parte)
    else if (
      type.includes('half') ||
      type.includes('halftime') ||
      name.includes('parte') ||
      name.includes('intervalo')
    ) {
      categories.intervalos.push(market);
    }
    // Resultado
    else if (
      type === 'h2h' ||
      type === 'exact_score' ||
      type === 'double_chance' ||
      type === 'draw_no_bet' ||
      name.includes('resultado') ||
      name.includes('vencedor') ||
      name.includes('dupla hipótese')
    ) {
      categories.resultado.push(market);
    }
    // Handicap
    else if (
      type.includes('spread') ||
      type.includes('handicap')
    ) {
      categories.handicap.push(market);
    }
    // Gols
    else if (
      type.includes('total') ||
      type.includes('btts') ||
      type.includes('goal') ||
      type.includes('odd_even') ||
      type.includes('multi_goals') ||
      type.includes('margin') ||
      name.includes('gol') ||
      name.includes('over') ||
      name.includes('under') ||
      name.includes('ambas marcam') ||
      name.includes('par/ímpar') ||
      name.includes('margem')
    ) {
      categories.golos.push(market);
    }
    // Especiais (fallback)
    else {
      categories.especiais.push(market);
    }
  }

  return categories;
}

// ═══════════════════════════════════════════════════════════
// HOOK PRINCIPAL
// ═══════════════════════════════════════════════════════════

export function useHybridOdds(
  matchId: string | number | null,
  theOddsApiMarkets?: Array<{
    type: string;
    outcomes: Array<{ name: string; odds: number; point?: number }>;
  }>,
  autoFetchSpecial: boolean = true
): HybridOddsData & { refresh: () => Promise<void> } {
  const [specialMarkets, setSpecialMarkets] = useState<HybridMarket[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [apiFootballLoaded, setApiFootballLoaded] = useState<boolean>(false);

  // Extrair fixture ID para API-Football
  const getFixtureId = useCallback((): number | null => {
    if (!matchId) return null;

    const idStr = String(matchId);

    if (idStr.startsWith('api1-')) {
      const num = parseInt(idStr.replace('api1-', ''), 10);
      return isNaN(num) ? null : num;
    }

    if (idStr.includes('-')) {
      const parts = idStr.split('-');
      for (let i = parts.length - 1; i >= 0; i--) {
        const num = parseInt(parts[i], 10);
        if (!isNaN(num) && num > 0) return num;
      }
    }

    const num = parseInt(idStr, 10);
    return isNaN(num) || num <= 0 ? null : num;
  }, [matchId]);

  // Buscar mercados especiais da API-Football
  const fetchSpecialMarketsData = useCallback(async () => {
    const fixtureId = getFixtureId();

    if (!fixtureId) {
      console.log('⚠️ Sem fixture ID para buscar mercados especiais');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      console.log(
        `🎰 Buscando mercados especiais (API-Football) para fixture ${fixtureId}...`
      );

      const formattedMarkets = await fetchFormattedSpecialMarkets(fixtureId);
      const converted = convertApiFootballMarkets(formattedMarkets);

      setSpecialMarkets(converted);
      setApiFootballLoaded(true);

      console.log(`✅ ${converted.length} mercados especiais carregados`);
      
      // Log detalhado
      const byType = converted.reduce((acc, m) => {
        acc[m.type] = m.name;
        return acc;
      }, {} as Record<string, string>);
      console.log('📊 Mercados disponíveis:', byType);
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : 'Erro ao carregar mercados especiais';
      setError(errorMessage);
      console.error('❌ Erro ao buscar mercados especiais:', err);
    } finally {
      setLoading(false);
    }
  }, [getFixtureId]);

  const refresh = useCallback(async () => {
    setApiFootballLoaded(false);
    await fetchSpecialMarketsData();
  }, [fetchSpecialMarketsData]);

  // Buscar automaticamente ao montar
  useEffect(() => {
    if (autoFetchSpecial && matchId && !apiFootballLoaded) {
      fetchSpecialMarketsData();
    }
  }, [matchId, autoFetchSpecial, apiFootballLoaded, fetchSpecialMarketsData]);

  // Converter mercados da The Odds API
  const basicMarkets = convertTheOddsApiMarkets(theOddsApiMarkets);

  // Combinar todos os mercados
  const allMarkets = [...basicMarkets, ...specialMarkets];

  // Organizar por categoria
  const marketsByCategory = categorizeMarkets(allMarkets);

  return {
    basicMarkets,
    specialMarkets,
    allMarkets,
    marketsByCategory,
    loading,
    error,
    sources: {
      theOddsApi: basicMarkets.length > 0,
      apiFootball: specialMarkets.length > 0,
    },
    refresh,
  };
}

export default useHybridOdds;
