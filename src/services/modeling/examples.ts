/**
 * 🧪 Testes e Exemplos do Motor de Probabilidades
 * 
 * Demonstra o uso completo do sistema:
 * 1. Probability Engine (cálculo base)
 * 2. Live Adjuster (ajustes em tempo real)
 * 3. Hybrid Odds Engine (combinação com mercado)
 */

import { calculateMatchProbabilities, probabilityToOdds } from './probabilityEngine';
import { adjustProbabilitiesLive } from './liveAdjuster';
import { generateHybridOdds, type ExternalOdds } from './hybridOddsEngine';

/**
 * Exemplo 1: Cálculo de probabilidades pré-jogo
 */
export function examplePreMatch() {
  console.log('\n🎯 EXEMPLO 1: Probabilidades Pré-Jogo\n');

  // Dados do jogo: Manchester City vs Arsenal
  const matchInput = {
    homeTeamId: 50,
    awayTeamId: 42,
    homeTeamName: 'Manchester City',
    awayTeamName: 'Arsenal',
    leagueId: 39, // Premier League
    homeStats: {
      goalsScored: 45,
      goalsConceded: 18,
      matchesPlayed: 20,
      wins: 15,
      draws: 3,
      losses: 2,
    },
    awayStats: {
      goalsScored: 38,
      goalsConceded: 22,
      matchesPlayed: 20,
      wins: 12,
      draws: 5,
      losses: 3,
    },
  };

  // Calcula probabilidades
  const probabilities = calculateMatchProbabilities(matchInput);

  // Converte para odds
  const odds = {
    home: probabilityToOdds(probabilities.home, 0.05),
    draw: probabilityToOdds(probabilities.draw, 0.05),
    away: probabilityToOdds(probabilities.away, 0.05),
    over25: probabilityToOdds(probabilities.over25, 0.05),
    btts: probabilityToOdds(probabilities.btts, 0.05),
  };

  console.log('📊 Resultado:');
  console.log(`   1X2: ${odds.home.toFixed(2)} / ${odds.draw.toFixed(2)} / ${odds.away.toFixed(2)}`);
  console.log(`   Over 2.5: ${odds.over25.toFixed(2)}`);
  console.log(`   BTTS: ${odds.btts.toFixed(2)}`);
  console.log(`   Gols esperados: ${probabilities.expectedGoalsHome.toFixed(2)} - ${probabilities.expectedGoalsAway.toFixed(2)}`);
  console.log(`   Confiança: ${(probabilities.confidence * 100).toFixed(0)}%\n`);

  return { probabilities, odds };
}

/**
 * Exemplo 2: Ajuste de probabilidades ao vivo
 */
export function exampleLiveMatch() {
  console.log('\n⚡ EXEMPLO 2: Ajuste ao Vivo\n');

  // Probabilidades base (do exemplo 1)
  const baseProbabilities = calculateMatchProbabilities({
    homeTeamId: 50,
    awayTeamId: 42,
    homeTeamName: 'Manchester City',
    awayTeamName: 'Arsenal',
    leagueId: 39,
    homeStats: {
      goalsScored: 45,
      goalsConceded: 18,
      matchesPlayed: 20,
      wins: 15,
      draws: 3,
      losses: 2,
    },
    awayStats: {
      goalsScored: 38,
      goalsConceded: 22,
      matchesPlayed: 20,
      wins: 12,
      draws: 5,
      losses: 3,
    },
  });

  // Estado ao vivo: 65 minutos, City 1-0 Arsenal
  const liveState = {
    minute: 65,
    period: 'second_half' as const,
    score: { home: 1, away: 0 },
    events: [
      {
        type: 'goal' as const,
        team: 'home' as const,
        minute: 23,
        player: 'Haaland',
      },
    ],
    stats: {
      possession: { home: 58, away: 42 },
      shots: { home: 12, away: 8 },
      shotsOnTarget: { home: 5, away: 3 },
      corners: { home: 6, away: 4 },
      dangerousAttacks: { home: 45, away: 32 },
    },
    redCards: { home: 0, away: 0 },
  };

  // Ajusta probabilidades
  const adjustedProbs = adjustProbabilitiesLive(baseProbabilities, liveState);

  // Converte para odds
  const liveOdds = {
    home: probabilityToOdds(adjustedProbs.home, 0.05),
    draw: probabilityToOdds(adjustedProbs.draw, 0.05),
    away: probabilityToOdds(adjustedProbs.away, 0.05),
    over25: probabilityToOdds(adjustedProbs.over25, 0.05),
  };

  console.log('📊 Resultado (65\' - 1-0):');
  console.log(`   1X2: ${liveOdds.home.toFixed(2)} / ${liveOdds.draw.toFixed(2)} / ${liveOdds.away.toFixed(2)}`);
  console.log(`   Over 2.5: ${liveOdds.over25.toFixed(2)}`);
  console.log(`   Momentum: ${adjustedProbs.momentum}`);
  console.log(`   Ajuste total: ${((adjustedProbs.adjustmentFactors.totalAdjustment - 1) * 100).toFixed(1)}%\n`);

  return { adjustedProbs, liveOdds };
}

/**
 * Exemplo 3: Odds híbridas (modelo + mercado)
 */
export function exampleHybridOdds() {
  console.log('\n🎲 EXEMPLO 3: Odds Híbridas (70% Modelo + 30% Mercado)\n');

  // Probabilidades do modelo
  const modelProbs = calculateMatchProbabilities({
    homeTeamId: 50,
    awayTeamId: 42,
    homeTeamName: 'Manchester City',
    awayTeamName: 'Arsenal',
    leagueId: 39,
    homeStats: {
      goalsScored: 45,
      goalsConceded: 18,
      matchesPlayed: 20,
      wins: 15,
      draws: 3,
      losses: 2,
    },
    awayStats: {
      goalsScored: 38,
      goalsConceded: 22,
      matchesPlayed: 20,
      wins: 12,
      draws: 5,
      losses: 3,
    },
  });

  // Odds do mercado externo (The Odds API)
  const externalOdds: ExternalOdds[] = [
    {
      source: 'the-odds-api',
      bookmaker: 'bet365',
      home: 1.85,
      draw: 3.60,
      away: 4.20,
      over25: 1.75,
      btts_yes: 1.65,
      timestamp: Date.now(),
    },
    {
      source: 'the-odds-api',
      bookmaker: 'betfair',
      home: 1.90,
      draw: 3.50,
      away: 4.00,
      over25: 1.80,
      btts_yes: 1.70,
      timestamp: Date.now(),
    },
    {
      source: 'the-odds-api',
      bookmaker: 'pinnacle',
      home: 1.88,
      draw: 3.55,
      away: 4.10,
      over25: 1.78,
      btts_yes: 1.68,
      timestamp: Date.now(),
    },
  ];

  // Gera odds híbridas
  const hybridOdds = generateHybridOdds(modelProbs, externalOdds, {
    modelWeight: 0.7,
    marketWeight: 0.3,
    margin: 0.05,
    maxDeviation: 0.12,
  });

  console.log('📊 Resultado:');
  console.log(`   1X2: ${hybridOdds.home.toFixed(2)} / ${hybridOdds.draw.toFixed(2)} / ${hybridOdds.away.toFixed(2)}`);
  console.log(`   Over 2.5: ${hybridOdds.over25.toFixed(2)}`);
  console.log(`   BTTS: ${hybridOdds.btts_yes.toFixed(2)}`);
  console.log(`   Fonte: ${hybridOdds.source.model.toFixed(0)}% modelo / ${hybridOdds.source.market.toFixed(0)}% mercado`);
  console.log(`   Desvio do mercado: ${(hybridOdds.validation.deviationFromMarket * 100).toFixed(1)}%`);
  console.log(`   Dentro dos limites: ${hybridOdds.validation.withinLimits ? '✅' : '❌'}`);
  console.log(`   Margem aplicada: ${(hybridOdds.margin * 100).toFixed(1)}%\n`);

  return hybridOdds;
}

/**
 * Exemplo 4: Cenário completo (pré-jogo → ao vivo → híbrido)
 */
export function exampleFullWorkflow() {
  console.log('\n🔄 EXEMPLO 4: Fluxo Completo\n');
  console.log('═══════════════════════════════════════════════════════\n');

  // 1. Pré-jogo
  console.log('📅 FASE 1: PRÉ-JOGO');
  const preMatch = examplePreMatch();

  // 2. Ao vivo (45 min, 0-0)
  console.log('\n⚡ FASE 2: AO VIVO (45\' - 0-0)');
  const liveState1 = {
    minute: 45,
    period: 'first_half' as const,
    score: { home: 0, away: 0 },
    events: [],
    stats: {
      possession: { home: 55, away: 45 },
      shots: { home: 8, away: 5 },
      shotsOnTarget: { home: 3, away: 2 },
    },
    redCards: { home: 0, away: 0 },
  };

  const adjusted1 = adjustProbabilitiesLive(preMatch.probabilities, liveState1);
  const odds1 = {
    home: probabilityToOdds(adjusted1.home, 0.05),
    draw: probabilityToOdds(adjusted1.draw, 0.05),
    away: probabilityToOdds(adjusted1.away, 0.05),
  };
  console.log(`   1X2: ${odds1.home.toFixed(2)} / ${odds1.draw.toFixed(2)} / ${odds1.away.toFixed(2)}`);

  // 3. Ao vivo (70 min, 1-0, cartão vermelho)
  console.log('\n⚡ FASE 3: AO VIVO (70\' - 1-0, Cartão Vermelho Arsenal)');
  const liveState2 = {
    minute: 70,
    period: 'second_half' as const,
    score: { home: 1, away: 0 },
    events: [
      { type: 'goal' as const, team: 'home' as const, minute: 52, player: 'Haaland' },
      { type: 'red_card' as const, team: 'away' as const, minute: 68, player: 'Xhaka' },
    ],
    stats: {
      possession: { home: 62, away: 38 },
      shots: { home: 15, away: 7 },
      shotsOnTarget: { home: 7, away: 3 },
    },
    redCards: { home: 0, away: 1 },
  };

  const adjusted2 = adjustProbabilitiesLive(preMatch.probabilities, liveState2);
  const odds2 = {
    home: probabilityToOdds(adjusted2.home, 0.05),
    draw: probabilityToOdds(adjusted2.draw, 0.05),
    away: probabilityToOdds(adjusted2.away, 0.05),
  };
  console.log(`   1X2: ${odds2.home.toFixed(2)} / ${odds2.draw.toFixed(2)} / ${odds2.away.toFixed(2)}`);
  console.log(`   Momentum: ${adjusted2.momentum}`);
  console.log(`   🚨 Mercado deve ser PAUSADO (cartão vermelho)`);

  // 4. Odds híbridas finais
  console.log('\n🎲 FASE 4: ODDS HÍBRIDAS FINAIS');
  const externalOdds: ExternalOdds[] = [
    {
      source: 'the-odds-api',
      bookmaker: 'bet365',
      home: 1.15,
      draw: 8.50,
      away: 15.00,
      timestamp: Date.now(),
    },
  ];

  const hybrid = generateHybridOdds(adjusted2, externalOdds);
  console.log(`   1X2: ${hybrid.home.toFixed(2)} / ${hybrid.draw.toFixed(2)} / ${hybrid.away.toFixed(2)}`);
  console.log(`   Fonte: ${hybrid.source.model.toFixed(0)}% modelo / ${hybrid.source.market.toFixed(0)}% mercado`);

  console.log('\n═══════════════════════════════════════════════════════\n');
}

// Executa exemplos se for chamado diretamente
if (import.meta.env.DEV) {
  console.log('\n🧮 MOTOR DE PROBABILIDADES - EXEMPLOS\n');
  exampleFullWorkflow();
}
