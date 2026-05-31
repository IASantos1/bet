/**
 * 🧮 Probability Engine
 * 
 * Motor de probabilidades intermediário usando:
 * - Sistema Elo para força das equipas
 * - Distribuição de Poisson para gols esperados
 * - Fatores de casa/fora
 * - Forma recente
 */

interface TeamStrength {
  teamId: number;
  teamName: string;
  eloRating: number;
  attackStrength: number;
  defenseStrength: number;
  homeAdvantage: number;
  form: number; // -1 a 1 (últimos 5 jogos)
}

export interface MatchProbabilities {
  home: number;
  draw: number;
  away: number;
  over05: number;
  over15: number;
  over25: number;
  over35: number;
  btts: number; // Both Teams To Score
  expectedGoalsHome: number;
  expectedGoalsAway: number;
  confidence: number; // 0-1
}

interface ProbabilityInput {
  homeTeamId: number;
  awayTeamId: number;
  homeTeamName: string;
  awayTeamName: string;
  leagueId: number;
  isNeutralVenue?: boolean;
  homeStats?: {
    goalsScored: number;
    goalsConceded: number;
    matchesPlayed: number;
    wins: number;
    draws: number;
    losses: number;
  };
  awayStats?: {
    goalsScored: number;
    goalsConceded: number;
    matchesPlayed: number;
    wins: number;
    draws: number;
    losses: number;
  };
}

// Base Elo ratings por liga (valores iniciais)
const BASE_ELO_BY_LEAGUE: Record<number, number> = {
  39: 1600,  // Premier League
  140: 1580, // La Liga
  135: 1570, // Serie A
  78: 1560,  // Bundesliga
  61: 1550,  // Ligue 1
  94: 1540,  // Primeira Liga
  2: 1650,   // Champions League
  3: 1600,   // Europa League
};

const DEFAULT_ELO = 1500;
const HOME_ADVANTAGE = 100; // Vantagem de jogar em casa (pontos Elo)

/**
 * Calcula rating Elo baseado em estatísticas
 */
function calculateEloFromStats(
  teamId: number,
  teamName: string,
  leagueId: number,
  stats?: {
    wins: number;
    draws: number;
    losses: number;
    goalsScored: number;
    goalsConceded: number;
    matchesPlayed: number;
  }
): number {
  const baseElo = BASE_ELO_BY_LEAGUE[leagueId] || DEFAULT_ELO;

  if (!stats || stats.matchesPlayed === 0) {
    return baseElo;
  }

  // Ajuste baseado em performance
  const winRate = stats.wins / stats.matchesPlayed;
  const goalDiff = (stats.goalsScored - stats.goalsConceded) / stats.matchesPlayed;

  const performanceAdjust = (winRate - 0.5) * 200 + goalDiff * 50;

  return Math.max(1000, Math.min(2200, baseElo + performanceAdjust));
}

/**
 * Calcula força de ataque (gols esperados por jogo)
 */
function calculateAttackStrength(
  goalsScored: number,
  matchesPlayed: number,
  leagueAverage: number = 1.5
): number {
  if (matchesPlayed === 0) return 1.0;

  const teamAverage = goalsScored / matchesPlayed;
  return teamAverage / leagueAverage;
}

/**
 * Calcula força de defesa (gols sofridos por jogo)
 */
function calculateDefenseStrength(
  goalsConceded: number,
  matchesPlayed: number,
  leagueAverage: number = 1.5
): number {
  if (matchesPlayed === 0) return 1.0;

  const teamAverage = goalsConceded / matchesPlayed;
  return teamAverage / leagueAverage;
}

/**
 * Calcula forma recente (-1 a 1)
 */
function calculateForm(stats?: {
  wins: number;
  draws: number;
  losses: number;
  matchesPlayed: number;
}): number {
  if (!stats || stats.matchesPlayed === 0) return 0;

  const points = stats.wins * 3 + stats.draws;
  const maxPoints = stats.matchesPlayed * 3;

  return (points / maxPoints - 0.5) * 2; // Normaliza para -1 a 1
}

/**
 * Probabilidade de Poisson
 */
function poissonProbability(lambda: number, k: number): number {
  return (Math.pow(lambda, k) * Math.exp(-lambda)) / factorial(k);
}

function factorial(n: number): number {
  if (n <= 1) return 1;
  return n * factorial(n - 1);
}

/**
 * Calcula probabilidade de vitória baseada em Elo
 */
function calculateWinProbabilityFromElo(
  eloHome: number,
  eloAway: number,
  homeAdvantage: number = HOME_ADVANTAGE
): number {
  const eloDiff = eloHome + homeAdvantage - eloAway;
  return 1 / (1 + Math.pow(10, -eloDiff / 400));
}

/**
 * Calcula gols esperados usando Poisson
 */
function calculateExpectedGoals(
  attackStrength: number,
  opponentDefenseStrength: number,
  leagueAverage: number = 1.5
): number {
  return attackStrength * opponentDefenseStrength * leagueAverage;
}

/**
 * Calcula probabilidades de resultado exato usando Poisson
 */
function calculateMatchOutcomeProbabilities(
  expectedGoalsHome: number,
  expectedGoalsAway: number
): { home: number; draw: number; away: number } {
  let homeWin = 0;
  let draw = 0;
  let awayWin = 0;

  // Calcula probabilidades para resultados até 6-6
  for (let i = 0; i <= 6; i++) {
    for (let j = 0; j <= 6; j++) {
      const prob =
        poissonProbability(expectedGoalsHome, i) *
        poissonProbability(expectedGoalsAway, j);

      if (i > j) homeWin += prob;
      else if (i === j) draw += prob;
      else awayWin += prob;
    }
  }

  // Normaliza para somar 1
  const total = homeWin + draw + awayWin;
  return {
    home: homeWin / total,
    draw: draw / total,
    away: awayWin / total,
  };
}

/**
 * Calcula probabilidade Over/Under
 */
function calculateOverUnderProbabilities(
  expectedGoalsHome: number,
  expectedGoalsAway: number
): {
  over05: number;
  over15: number;
  over25: number;
  over35: number;
} {
  // Probabilidade de 0 gols
  const prob0 =
    poissonProbability(expectedGoalsHome, 0) *
    poissonProbability(expectedGoalsAway, 0);

  // Probabilidade de 1 gol total
  const prob1 =
    poissonProbability(expectedGoalsHome, 1) *
      poissonProbability(expectedGoalsAway, 0) +
    poissonProbability(expectedGoalsHome, 0) *
      poissonProbability(expectedGoalsAway, 1);

  // Probabilidade de 2 gols total
  const prob2 =
    poissonProbability(expectedGoalsHome, 2) *
      poissonProbability(expectedGoalsAway, 0) +
    poissonProbability(expectedGoalsHome, 1) *
      poissonProbability(expectedGoalsAway, 1) +
    poissonProbability(expectedGoalsHome, 0) *
      poissonProbability(expectedGoalsAway, 2);

  // Probabilidade de 3 gols total
  const prob3 =
    poissonProbability(expectedGoalsHome, 3) *
      poissonProbability(expectedGoalsAway, 0) +
    poissonProbability(expectedGoalsHome, 2) *
      poissonProbability(expectedGoalsAway, 1) +
    poissonProbability(expectedGoalsHome, 1) *
      poissonProbability(expectedGoalsAway, 2) +
    poissonProbability(expectedGoalsHome, 0) *
      poissonProbability(expectedGoalsAway, 3);

  return {
    over05: 1 - prob0,
    over15: 1 - prob0 - prob1,
    over25: 1 - prob0 - prob1 - prob2,
    over35: 1 - prob0 - prob1 - prob2 - prob3,
  };
}

/**
 * Calcula probabilidade BTTS (Both Teams To Score)
 */
function calculateBTTSProbability(
  expectedGoalsHome: number,
  expectedGoalsAway: number
): number {
  const probHomeScores = 1 - poissonProbability(expectedGoalsHome, 0);
  const probAwayScores = 1 - poissonProbability(expectedGoalsAway, 0);

  return probHomeScores * probAwayScores;
}

/**
 * Calcula confiança da previsão (0-1)
 */
function calculateConfidence(
  homeStats?: { matchesPlayed: number },
  awayStats?: { matchesPlayed: number }
): number {
  const homeMatches = homeStats?.matchesPlayed || 0;
  const awayMatches = awayStats?.matchesPlayed || 0;

  // Mais jogos = mais confiança
  const avgMatches = (homeMatches + awayMatches) / 2;
  const confidence = Math.min(1, avgMatches / 20); // Máximo em 20 jogos

  return Math.max(0.3, confidence); // Mínimo 30%
}

/**
 * 🎯 FUNÇÃO PRINCIPAL: Calcula probabilidades do jogo
 */
export function calculateMatchProbabilities(
  input: ProbabilityInput
): MatchProbabilities {
  console.log('🧮 Calculando probabilidades:', input.homeTeamName, 'vs', input.awayTeamName);

  // 1. Calcula Elo ratings
  const homeElo = calculateEloFromStats(
    input.homeTeamId,
    input.homeTeamName,
    input.leagueId,
    input.homeStats
  );

  const awayElo = calculateEloFromStats(
    input.awayTeamId,
    input.awayTeamName,
    input.leagueId,
    input.awayStats
  );

  const homeForm = calculateForm(input.homeStats);
  const awayForm = calculateForm(input.awayStats);

  const homeAdvantage = input.isNeutralVenue ? 0 : HOME_ADVANTAGE;

  const eloWinProbability = calculateWinProbabilityFromElo(
    homeElo,
    awayElo,
    homeAdvantage
  );

  console.log('📊 Elo Ratings:', { home: homeElo, away: awayElo });

  // 2. Calcula forças de ataque e defesa
  const homeAttack = calculateAttackStrength(
    input.homeStats?.goalsScored || 0,
    input.homeStats?.matchesPlayed || 0
  );

  const homeDefense = calculateDefenseStrength(
    input.homeStats?.goalsConceded || 0,
    input.homeStats?.matchesPlayed || 0
  );

  const awayAttack = calculateAttackStrength(
    input.awayStats?.goalsScored || 0,
    input.awayStats?.matchesPlayed || 0
  );

  const awayDefense = calculateDefenseStrength(
    input.awayStats?.goalsConceded || 0,
    input.awayStats?.matchesPlayed || 0
  );

  const homeStrength: TeamStrength = {
    teamId: input.homeTeamId,
    teamName: input.homeTeamName,
    eloRating: homeElo,
    attackStrength: homeAttack,
    defenseStrength: homeDefense,
    homeAdvantage,
    form: homeForm,
  };

  const awayStrength: TeamStrength = {
    teamId: input.awayTeamId,
    teamName: input.awayTeamName,
    eloRating: awayElo,
    attackStrength: awayAttack,
    defenseStrength: awayDefense,
    homeAdvantage: 0,
    form: awayForm,
  };

  console.log('⚔️ Forças:', {
    homeAttack,
    homeDefense,
    awayAttack,
    awayDefense,
    homeForm,
    awayForm,
    homeAdvantage,
    eloWinProbability,
    homeStrength,
    awayStrength,
  });

  // 3. Calcula gols esperados
  const leagueAverage = 1.5; // Média de gols por equipa

  let expectedGoalsHome = calculateExpectedGoals(
    homeAttack,
    awayDefense,
    leagueAverage
  );

  let expectedGoalsAway = calculateExpectedGoals(
    awayAttack,
    homeDefense,
    leagueAverage
  );

  // Ajuste por vantagem de casa (10% mais gols)
  if (!input.isNeutralVenue) {
    expectedGoalsHome *= 1.1;
    expectedGoalsAway *= 0.95;
  }

  console.log('⚽ Gols esperados:', {
    home: expectedGoalsHome.toFixed(2),
    away: expectedGoalsAway.toFixed(2),
  });

  // 4. Calcula probabilidades de resultado
  const outcomes = calculateMatchOutcomeProbabilities(
    expectedGoalsHome,
    expectedGoalsAway
  );

  // 5. Calcula probabilidades Over/Under
  const overUnder = calculateOverUnderProbabilities(
    expectedGoalsHome,
    expectedGoalsAway
  );

  // 6. Calcula BTTS
  const btts = calculateBTTSProbability(expectedGoalsHome, expectedGoalsAway);

  // 7. Calcula confiança
  const confidence = calculateConfidence(input.homeStats, input.awayStats);

  const result: MatchProbabilities = {
    home: outcomes.home,
    draw: outcomes.draw,
    away: outcomes.away,
    over05: overUnder.over05,
    over15: overUnder.over15,
    over25: overUnder.over25,
    over35: overUnder.over35,
    btts,
    expectedGoalsHome,
    expectedGoalsAway,
    confidence,
  };

  console.log('✅ Probabilidades calculadas:', {
    '1X2': `${(outcomes.home * 100).toFixed(1)}% / ${(outcomes.draw * 100).toFixed(1)}% / ${(outcomes.away * 100).toFixed(1)}%`,
    'Over 2.5': `${(overUnder.over25 * 100).toFixed(1)}%`,
    'BTTS': `${(btts * 100).toFixed(1)}%`,
    confidence: `${(confidence * 100).toFixed(0)}%`,
  });

  return result;
}

/**
 * Converte probabilidades em odds decimais
 */
export function probabilityToOdds(probability: number, margin: number = 0): number {
  if (probability <= 0 || probability >= 1) {
    return 1.01; // Odds mínimas
  }

  const fairOdds = 1 / probability;
  const oddsWithMargin = fairOdds * (1 + margin);

  return Math.max(1.01, Math.round(oddsWithMargin * 100) / 100);
}

/**
 * Converte odds decimais em probabilidade implícita
 */
export function oddsToProbability(odds: number): number {
  if (odds <= 1) return 1;
  return 1 / odds;
}

/**
 * Calcula margem total das odds
 */
export function calculateMargin(probabilities: number[]): number {
  const total = probabilities.reduce((sum, p) => sum + p, 0);
  return total - 1;
}
