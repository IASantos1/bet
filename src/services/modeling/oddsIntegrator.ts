/**
 * 🎯 Integrador do Motor de Probabilidades
 * 
 * Integra o motor de probabilidades com os data providers existentes
 * para gerar odds híbridas automaticamente
 */

import { calculateMatchProbabilities, type MatchProbabilities } from './probabilityEngine';
import { adjustProbabilitiesLive, shouldPauseMarket, calculateRecommendedDelay } from './liveAdjuster';
import { generateHybridOdds, type HybridOdds, type ExternalOdds } from './hybridOddsEngine';
async function fetchFixtureById(_id: number): Promise<any> { return null; }
async function fetchLiveEvents(_sport: string): Promise<any[]> { return []; }
async function fetchMatchStatistics(_fixtureId: number): Promise<any> { return null; }
async function fetchOddsForMatch(_fixtureId: number): Promise<any> { return null; }

interface MatchOddsInput {
  fixtureId: number;
  homeTeamId: number;
  awayTeamId: number;
  homeTeamName: string;
  awayTeamName: string;
  leagueId: number;
  isLive?: boolean;
}

interface GeneratedOdds {
  fixtureId: number;
  odds: HybridOdds;
  marketStatus: 'open' | 'paused' | 'suspended';
  pauseReason?: string;
  recommendedDelay: number;
  lastUpdate: number;
  dataQuality: {
    hasRealStats: boolean;
    hasExternalOdds: boolean;
    confidence: number;
  };
}

/**
 * Busca estatísticas da equipa para o modelo
 */
async function fetchTeamStats(
  _teamId: number,
  _leagueId: number
): Promise<{
  goalsScored: number;
  goalsConceded: number;
  matchesPlayed: number;
  wins: number;
  draws: number;
  losses: number;
} | undefined> {
  try {
    // Aqui você pode implementar uma chamada à API para buscar stats da equipa
    // Por enquanto, retorna undefined para usar valores padrão
    return undefined;
  } catch (error) {
    console.error('❌ Erro ao buscar stats da equipa:', error);
    return undefined;
  }
}

/**
 * Converte eventos da API para formato do Live Adjuster
 */
function convertApiEventsToLiveEvents(apiEvents: any[]): any[] {
  return apiEvents.map(event => {
    let type: 'goal' | 'red_card' | 'penalty' | 'var' | 'injury' | 'substitution' = 'substitution';
    
    if (event.type === 'Goal') type = 'goal';
    else if (event.type === 'Card' && event.detail === 'Red Card') type = 'red_card';
    else if (event.type === 'Var') type = 'var';
    else if (event.type === 'subst') type = 'substitution';

    return {
      type,
      team: event.team.id === event.fixture?.homeTeamId ? 'home' : 'away',
      minute: event.time.elapsed || 0,
      player: event.player?.name,
      detail: event.detail,
    };
  });
}

/**
 * Converte odds da The Odds API para formato do Hybrid Engine
 */
function convertExternalOdds(oddsData: any[]): ExternalOdds[] {
  const externalOdds: ExternalOdds[] = [];

  for (const bookmaker of oddsData) {
    const h2hMarket = bookmaker.markets?.find((m: any) => m.key === 'h2h');
    const totalsMarket = bookmaker.markets?.find((m: any) => m.key === 'totals');
    const bttsMarket = bookmaker.markets?.find((m: any) => m.key === 'btts');

    if (h2hMarket) {
      externalOdds.push({
        source: 'the-odds-api',
        bookmaker: bookmaker.name,
        home: h2hMarket.outcomes?.find((o: any) => o.name === 'home')?.price || 0,
        draw: h2hMarket.outcomes?.find((o: any) => o.name === 'draw')?.price,
        away: h2hMarket.outcomes?.find((o: any) => o.name === 'away')?.price || 0,
        over25: totalsMarket?.outcomes?.find((o: any) => o.name === 'Over' && o.point === 2.5)?.price,
        under25: totalsMarket?.outcomes?.find((o: any) => o.name === 'Under' && o.point === 2.5)?.price,
        btts_yes: bttsMarket?.outcomes?.find((o: any) => o.name === 'Yes')?.price,
        btts_no: bttsMarket?.outcomes?.find((o: any) => o.name === 'No')?.price,
        timestamp: Date.now(),
      });
    }
  }

  return externalOdds;
}

/**
 * 🎯 FUNÇÃO PRINCIPAL: Gera odds para um jogo
 */
export async function generateMatchOdds(
  input: MatchOddsInput
): Promise<GeneratedOdds> {
  console.log('🎯 Gerando odds para:', input.homeTeamName, 'vs', input.awayTeamName);

  try {
    // 1. Busca dados do jogo
    const fixture = await fetchFixtureById('football', String(input.fixtureId));
    const isLive = input.isLive || fixture?.status?.short === '1H' || fixture?.status?.short === '2H';

    // 2. Busca estatísticas das equipas (para o modelo)
    const homeStats = await fetchTeamStats(input.homeTeamId, input.leagueId);
    const awayStats = await fetchTeamStats(input.awayTeamId, input.leagueId);

    // 3. Calcula probabilidades base
    const baseProbabilities = calculateMatchProbabilities({
      homeTeamId: input.homeTeamId,
      awayTeamId: input.awayTeamId,
      homeTeamName: input.homeTeamName,
      awayTeamName: input.awayTeamName,
      leagueId: input.leagueId,
      homeStats,
      awayStats,
    });

    let finalProbabilities: MatchProbabilities | any = baseProbabilities;
    let marketStatus: 'open' | 'paused' | 'suspended' = 'open';
    let pauseReason: string | undefined;
    let recommendedDelay = 3;

    // 4. Se ao vivo, ajusta probabilidades
    if (isLive && fixture) {
      // Busca eventos e estatísticas ao vivo
      const [liveEvents, liveStats] = await Promise.all([
        fetchLiveEvents(input.fixtureId),
        fetchMatchStatistics(input.fixtureId),
      ]);

      // Converte eventos
      const convertedEvents = convertApiEventsToLiveEvents(liveEvents || []);

      // Monta estado ao vivo
      const liveState = {
        minute: fixture.status?.elapsed || 0,
        period: fixture.status?.short === '1H' ? 'first_half' as const : 'second_half' as const,
        score: {
          home: fixture.score?.home || 0,
          away: fixture.score?.away || 0,
        },
        events: convertedEvents,
        stats: liveStats ? {
          possession: {
            home: parseInt(liveStats.find((s: any) => s.type === 'Ball Possession')?.home || '50'),
            away: parseInt(liveStats.find((s: any) => s.type === 'Ball Possession')?.away || '50'),
          },
          shots: {
            home: parseInt(liveStats.find((s: any) => s.type === 'Total Shots')?.home || '0'),
            away: parseInt(liveStats.find((s: any) => s.type === 'Total Shots')?.away || '0'),
          },
          shotsOnTarget: {
            home: parseInt(liveStats.find((s: any) => s.type === 'Shots on Goal')?.home || '0'),
            away: parseInt(liveStats.find((s: any) => s.type === 'Shots on Goal')?.away || '0'),
          },
          corners: {
            home: parseInt(liveStats.find((s: any) => s.type === 'Corner Kicks')?.home || '0'),
            away: parseInt(liveStats.find((s: any) => s.type === 'Corner Kicks')?.away || '0'),
          },
        } : undefined,
        redCards: {
          home: parseInt(liveStats?.find((s: any) => s.type === 'Red Cards')?.home || '0'),
          away: parseInt(liveStats?.find((s: any) => s.type === 'Red Cards')?.away || '0'),
        },
      };

      // Ajusta probabilidades
      finalProbabilities = adjustProbabilitiesLive(baseProbabilities, liveState);

      // Verifica se deve pausar mercado
      const pauseCheck = shouldPauseMarket(convertedEvents, liveState.minute);
      if (pauseCheck.shouldPause) {
        marketStatus = 'paused';
        pauseReason = pauseCheck.reason;
      }

      // Calcula delay recomendado
      recommendedDelay = calculateRecommendedDelay(
        liveState.minute,
        finalProbabilities.momentum || 'neutral',
        convertedEvents.filter(e => e.minute >= liveState.minute - 5).length
      );
    }

    // 5. Busca odds externas (The Odds API)
    let externalOdds: ExternalOdds[] = [];
    try {
      const oddsData = await fetchOddsForMatch(
        input.homeTeamName,
        input.awayTeamName,
        'soccer_epl' // Você pode mapear o leagueId para o sport_key correto
      );
      externalOdds = convertExternalOdds(oddsData || []);
    } catch {
      console.warn('⚠️ Não foi possível buscar odds externas, usando apenas modelo');
    }

    // 6. Gera odds híbridas
    const hybridOdds = generateHybridOdds(finalProbabilities, externalOdds, {
      modelWeight: 0.7,
      marketWeight: 0.3,
      margin: 0.05,
      maxDeviation: 0.12,
    });

    // 7. Retorna resultado
    const result: GeneratedOdds = {
      fixtureId: input.fixtureId,
      odds: hybridOdds,
      marketStatus,
      pauseReason,
      recommendedDelay,
      lastUpdate: Date.now(),
      dataQuality: {
        hasRealStats: !!(homeStats && awayStats),
        hasExternalOdds: externalOdds.length > 0,
        confidence: hybridOdds.confidence,
      },
    };

    console.log('✅ Odds geradas com sucesso:', {
      '1X2': `${result.odds.home.toFixed(2)} / ${result.odds.draw.toFixed(2)} / ${result.odds.away.toFixed(2)}`,
      status: result.marketStatus,
      quality: `${(result.dataQuality.confidence * 100).toFixed(0)}%`,
    });

    return result;

  } catch (error) {
    console.error('❌ Erro ao gerar odds:', error);
    throw error;
  }
}

/**
 * Gera odds para múltiplos jogos em lote
 */
export async function generateBatchOdds(
  matches: MatchOddsInput[]
): Promise<GeneratedOdds[]> {
  console.log(`🎯 Gerando odds para ${matches.length} jogos...`);

  const results = await Promise.allSettled(
    matches.map(match => generateMatchOdds(match))
  );

  const successfulOdds = results
    .filter((r): r is PromiseFulfilledResult<GeneratedOdds> => r.status === 'fulfilled')
    .map(r => r.value);

  const failedCount = results.filter(r => r.status === 'rejected').length;

  console.log(`✅ ${successfulOdds.length} odds geradas com sucesso`);
  if (failedCount > 0) {
    console.warn(`⚠️ ${failedCount} odds falharam`);
  }

  return successfulOdds;
}

/**
 * Atualiza odds de um jogo ao vivo
 */
export async function updateLiveOdds(
  fixtureId: number
): Promise<GeneratedOdds> {
  // Busca fixture atualizada
  const fixture = await fetchFixtureById('football', String(fixtureId));
  
  if (!fixture) {
    throw new Error('Fixture não encontrada');
  }

  // Regenera odds
  return generateMatchOdds({
    fixtureId,
    homeTeamId: fixture.teams.home.id,
    awayTeamId: fixture.teams.away.id,
    homeTeamName: fixture.teams.home.name,
    awayTeamName: fixture.teams.away.name,
    leagueId: fixture.league.id,
    isLive: true,
  });
}

/**
 * Exporta tipos
 */
export type { MatchOddsInput, GeneratedOdds };
