/**
 * ⚡ Live Adjuster
 * 
 * Ajusta probabilidades em tempo real baseado em:
 * - Eventos ao vivo (gols, cartões vermelhos, penaltis)
 * - Tempo decorrido
 * - Momentum do jogo
 * - Estatísticas ao vivo
 */

import type { MatchProbabilities } from './probabilityEngine';

interface LiveEvent {
  type: 'goal' | 'red_card' | 'penalty' | 'var' | 'injury' | 'substitution';
  team: 'home' | 'away';
  minute: number;
  player?: string;
  detail?: string;
}

interface LiveStats {
  possession?: { home: number; away: number };
  shots?: { home: number; away: number };
  shotsOnTarget?: { home: number; away: number };
  corners?: { home: number; away: number };
  attacks?: { home: number; away: number };
  dangerousAttacks?: { home: number; away: number };
}

interface LiveMatchState {
  minute: number;
  period: 'first_half' | 'halftime' | 'second_half' | 'extra_time' | 'penalties';
  score: { home: number; away: number };
  events: LiveEvent[];
  stats?: LiveStats;
  redCards?: { home: number; away: number };
}

interface AdjustedProbabilities extends MatchProbabilities {
  adjustmentFactors: {
    scoreImpact: number;
    timeImpact: number;
    eventsImpact: number;
    statsImpact: number;
    totalAdjustment: number;
  };
  momentum: 'home' | 'away' | 'neutral';
}

/**
 * Calcula impacto do placar atual
 */
function calculateScoreImpact(
  score: { home: number; away: number },
  minute: number
): { home: number; draw: number; away: number } {
  const diff = score.home - score.away;
  const timeRemaining = 90 - minute;
  const timeRemainingRatio = timeRemaining / 90;

  // Quanto menos tempo, mais difícil reverter
  const difficultyMultiplier = 1 - timeRemainingRatio * 0.5;

  if (diff === 0) {
    // Empate - ligeiro aumento na probabilidade de empate
    return { home: 1.0, draw: 1.1, away: 1.0 };
  }

  if (diff > 0) {
    // Casa a ganhar
    const advantage = Math.min(diff * 0.3 * difficultyMultiplier, 0.8);
    return {
      home: 1 + advantage,
      draw: 1 - advantage * 0.3,
      away: 1 - advantage * 0.7,
    };
  } else {
    // Fora a ganhar
    const advantage = Math.min(Math.abs(diff) * 0.3 * difficultyMultiplier, 0.8);
    return {
      home: 1 - advantage * 0.7,
      draw: 1 - advantage * 0.3,
      away: 1 + advantage,
    };
  }
}

/**
 * Calcula impacto do tempo decorrido
 */
function calculateTimeImpact(
  minute: number,
  _period: string
): number {
  // Primeiros 15 min: odds mais voláteis (menos confiança)
  if (minute < 15) {
    return 0.9;
  }

  // 15-30 min: estabilização
  if (minute < 30) {
    return 0.95;
  }

  // 30-60 min: período mais estável
  if (minute < 60) {
    return 1.0;
  }

  // 60-75 min: aumento de urgência
  if (minute < 75) {
    return 1.05;
  }

  // 75-90 min: final do jogo, menos tempo para reverter
  if (minute < 90) {
    return 1.15;
  }

  // Tempo extra
  return 1.25;
}

/**
 * Calcula impacto de eventos críticos
 */
function calculateEventsImpact(
  events: LiveEvent[],
  _score: { home: number; away: number }
): { home: number; draw: number; away: number; momentum: 'home' | 'away' | 'neutral' } {
  let homeImpact = 1.0;
  let awayImpact = 1.0;
  let momentum: 'home' | 'away' | 'neutral' = 'neutral';

  // Analisa eventos recentes (últimos 15 minutos)
  const recentEvents = events.filter(e => e.minute >= Math.max(0, events[events.length - 1]?.minute - 15));

  for (const event of recentEvents) {
    switch (event.type) {
      case 'goal':
        // Gol recente aumenta momentum
        if (event.team === 'home') {
          homeImpact *= 1.15;
          momentum = 'home';
        } else {
          awayImpact *= 1.15;
          momentum = 'away';
        }
        break;

      case 'red_card':
        // Cartão vermelho é crítico
        if (event.team === 'home') {
          homeImpact *= 0.6; // -40% de chance
          awayImpact *= 1.4; // +40% de chance
          momentum = 'away';
        } else {
          awayImpact *= 0.6;
          homeImpact *= 1.4;
          momentum = 'home';
        }
        break;

      case 'penalty':
        // Penalti aumenta pressão
        if (event.team === 'home') {
          homeImpact *= 1.1;
        } else {
          awayImpact *= 1.1;
        }
        break;

      case 'var':
        // VAR cria incerteza (reduz confiança)
        homeImpact *= 0.98;
        awayImpact *= 0.98;
        break;
    }
  }

  // Normaliza
  const drawImpact = 2 - (homeImpact + awayImpact) / 2;

  return {
    home: homeImpact,
    draw: Math.max(0.5, drawImpact),
    away: awayImpact,
    momentum,
  };
}

/**
 * Calcula impacto das estatísticas ao vivo
 */
function calculateStatsImpact(stats?: LiveStats): { home: number; away: number } {
  if (!stats) {
    return { home: 1.0, away: 1.0 };
  }

  let homeImpact = 1.0;
  let awayImpact = 1.0;

  // Posse de bola (peso menor)
  if (stats.possession) {
    const possessionDiff = stats.possession.home - stats.possession.away;
    homeImpact += possessionDiff * 0.001; // 1% posse = 0.1% impacto
    awayImpact -= possessionDiff * 0.001;
  }

  // Remates à baliza (peso maior)
  if (stats.shotsOnTarget) {
    const shotsDiff = stats.shotsOnTarget.home - stats.shotsOnTarget.away;
    homeImpact += shotsDiff * 0.02; // Cada remate = 2% impacto
    awayImpact -= shotsDiff * 0.02;
  }

  // Ataques perigosos (peso médio)
  if (stats.dangerousAttacks) {
    const attacksDiff = stats.dangerousAttacks.home - stats.dangerousAttacks.away;
    homeImpact += attacksDiff * 0.01;
    awayImpact -= attacksDiff * 0.01;
  }

  // Cantos (peso menor)
  if (stats.corners) {
    const cornersDiff = stats.corners.home - stats.corners.away;
    homeImpact += cornersDiff * 0.005;
    awayImpact -= cornersDiff * 0.005;
  }

  // Limita impacto máximo
  homeImpact = Math.max(0.7, Math.min(1.3, homeImpact));
  awayImpact = Math.max(0.7, Math.min(1.3, awayImpact));

  return { home: homeImpact, away: awayImpact };
}

/**
 * Ajusta gols esperados baseado no estado atual
 */
function adjustExpectedGoals(
  originalExpectedGoals: { home: number; away: number },
  liveState: LiveMatchState
): { home: number; away: number } {
  const { minute, score, redCards } = liveState;
  const timeRemaining = Math.max(0, 90 - minute) / 90;

  // Gols já marcados
  let adjustedHome = score.home;
  let adjustedAway = score.away;

  // Adiciona gols esperados no tempo restante
  adjustedHome += originalExpectedGoals.home * timeRemaining;
  adjustedAway += originalExpectedGoals.away * timeRemaining;

  // Ajuste por cartões vermelhos
  if (redCards) {
    if (redCards.home > 0) {
      adjustedHome *= Math.pow(0.8, redCards.home); // -20% por cartão
      adjustedAway *= Math.pow(1.15, redCards.home); // +15% para adversário
    }
    if (redCards.away > 0) {
      adjustedAway *= Math.pow(0.8, redCards.away);
      adjustedHome *= Math.pow(1.15, redCards.away);
    }
  }

  return {
    home: Math.max(0, adjustedHome),
    away: Math.max(0, adjustedAway),
  };
}

/**
 * Recalcula Over/Under baseado em gols esperados ajustados
 */
function recalculateOverUnder(
  expectedGoalsHome: number,
  expectedGoalsAway: number,
  currentScore: { home: number; away: number }
): {
  over05: number;
  over15: number;
  over25: number;
  over35: number;
} {
  const currentTotal = currentScore.home + currentScore.away;
  const expectedTotal = expectedGoalsHome + expectedGoalsAway;

  // Probabilidade simplificada baseada em Poisson
  const lambda = Math.max(0.1, expectedTotal - currentTotal);

  const probNoMoreGoals = Math.exp(-lambda);
  const prob1MoreGoal = lambda * Math.exp(-lambda);
  const prob2MoreGoals = (Math.pow(lambda, 2) / 2) * Math.exp(-lambda);
  const prob3MoreGoals = (Math.pow(lambda, 3) / 6) * Math.exp(-lambda);

  return {
    over05: currentTotal >= 1 ? 1.0 : 1 - probNoMoreGoals,
    over15: currentTotal >= 2 ? 1.0 : currentTotal === 1 ? 1 - probNoMoreGoals : 1 - probNoMoreGoals - prob1MoreGoal,
    over25: currentTotal >= 3 ? 1.0 : currentTotal === 2 ? 1 - probNoMoreGoals : currentTotal === 1 ? 1 - probNoMoreGoals - prob1MoreGoal : 1 - probNoMoreGoals - prob1MoreGoal - prob2MoreGoals,
    over35: currentTotal >= 4 ? 1.0 : 1 - probNoMoreGoals - prob1MoreGoal - prob2MoreGoals - prob3MoreGoals,
  };
}

/**
 * 🎯 FUNÇÃO PRINCIPAL: Ajusta probabilidades em tempo real
 */
export function adjustProbabilitiesLive(
  baseProbabilities: MatchProbabilities,
  liveState: LiveMatchState
): AdjustedProbabilities {
  console.log('⚡ Ajustando probabilidades ao vivo:', {
    minute: liveState.minute,
    score: `${liveState.score.home}-${liveState.score.away}`,
    events: liveState.events.length,
  });

  // 1. Impacto do placar
  const scoreImpact = calculateScoreImpact(liveState.score, liveState.minute);

  // 2. Impacto do tempo
  const timeImpact = calculateTimeImpact(liveState.minute, liveState.period);

  // 3. Impacto de eventos
  const eventsImpact = calculateEventsImpact(liveState.events, liveState.score);

  // 4. Impacto das estatísticas
  const statsImpact = calculateStatsImpact(liveState.stats);

  // 5. Aplica todos os ajustes às probabilidades 1X2
  let adjustedHome = baseProbabilities.home * scoreImpact.home * eventsImpact.home * statsImpact.home;
  let adjustedDraw = baseProbabilities.draw * scoreImpact.draw * eventsImpact.draw;
  let adjustedAway = baseProbabilities.away * scoreImpact.away * eventsImpact.away * statsImpact.away;

  // Normaliza para somar 1
  const total1X2 = adjustedHome + adjustedDraw + adjustedAway;
  adjustedHome /= total1X2;
  adjustedDraw /= total1X2;
  adjustedAway /= total1X2;

  // 6. Ajusta gols esperados
  const adjustedExpectedGoals = adjustExpectedGoals(
    {
      home: baseProbabilities.expectedGoalsHome,
      away: baseProbabilities.expectedGoalsAway,
    },
    liveState
  );

  // 7. Recalcula Over/Under
  const adjustedOverUnder = recalculateOverUnder(
    adjustedExpectedGoals.home,
    adjustedExpectedGoals.away,
    liveState.score
  );

  // 8. Ajusta BTTS (se já marcaram ambos, é 100%)
  let adjustedBTTS = baseProbabilities.btts;
  if (liveState.score.home > 0 && liveState.score.away > 0) {
    adjustedBTTS = 1.0;
  } else if (liveState.score.home > 0) {
    // Casa já marcou, aumenta chance do fora marcar
    adjustedBTTS = Math.min(1.0, adjustedBTTS * 1.2);
  } else if (liveState.score.away > 0) {
    // Fora já marcou, aumenta chance da casa marcar
    adjustedBTTS = Math.min(1.0, adjustedBTTS * 1.2);
  }

  // 9. Ajusta confiança (aumenta com o tempo)
  const adjustedConfidence = Math.min(
    1.0,
    baseProbabilities.confidence * (1 + liveState.minute / 180)
  );

  // 10. Calcula fatores de ajuste totais
  const totalAdjustment =
    (scoreImpact.home + scoreImpact.away) / 2 *
    timeImpact *
    (eventsImpact.home + eventsImpact.away) / 2 *
    (statsImpact.home + statsImpact.away) / 2;

  const result: AdjustedProbabilities = {
    home: adjustedHome,
    draw: adjustedDraw,
    away: adjustedAway,
    over05: adjustedOverUnder.over05,
    over15: adjustedOverUnder.over15,
    over25: adjustedOverUnder.over25,
    over35: adjustedOverUnder.over35,
    btts: adjustedBTTS,
    expectedGoalsHome: adjustedExpectedGoals.home,
    expectedGoalsAway: adjustedExpectedGoals.away,
    confidence: adjustedConfidence,
    adjustmentFactors: {
      scoreImpact: (scoreImpact.home + scoreImpact.away) / 2,
      timeImpact,
      eventsImpact: (eventsImpact.home + eventsImpact.away) / 2,
      statsImpact: (statsImpact.home + statsImpact.away) / 2,
      totalAdjustment,
    },
    momentum: eventsImpact.momentum,
  };

  console.log('✅ Probabilidades ajustadas:', {
    '1X2': `${(adjustedHome * 100).toFixed(1)}% / ${(adjustedDraw * 100).toFixed(1)}% / ${(adjustedAway * 100).toFixed(1)}%`,
    'Over 2.5': `${(adjustedOverUnder.over25 * 100).toFixed(1)}%`,
    momentum: eventsImpact.momentum,
    adjustment: `${((totalAdjustment - 1) * 100).toFixed(1)}%`,
  });

  return result;
}

/**
 * Detecta se deve pausar mercado por evento crítico
 */
export function shouldPauseMarket(
  events: LiveEvent[],
  minute: number
): { shouldPause: boolean; reason?: string } {
  // Verifica eventos nos últimos 2 minutos
  const recentEvents = events.filter(e => e.minute >= minute - 2);

  for (const event of recentEvents) {
    switch (event.type) {
      case 'goal':
        return { shouldPause: true, reason: 'Gol marcado' };
      case 'red_card':
        return { shouldPause: true, reason: 'Cartão vermelho' };
      case 'penalty':
        return { shouldPause: true, reason: 'Penalti marcado' };
      case 'var':
        return { shouldPause: true, reason: 'Revisão VAR' };
    }
  }

  return { shouldPause: false };
}

/**
 * Calcula delay recomendado para apostas ao vivo
 */
export function calculateRecommendedDelay(
  minute: number,
  momentum: 'home' | 'away' | 'neutral',
  recentEvents: number
): number {
  let delay = 3; // Base: 3 segundos

  if (minute > 80) delay += 2; // Final do jogo
  if (momentum !== 'neutral') delay += 1;
  if (recentEvents > 2) delay += 2;

  return Math.min(10, delay);
}

export type { AdjustedProbabilities };
