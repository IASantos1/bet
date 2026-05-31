// 🏭 Market Factory - Criador de Mercados por Desporto
import type { Market } from '../../types/sports';
import { createMatchWinnerMarket } from './football/matchWinner';
import { createDoubleChanceMarket } from './football/doubleChance';
import { createOverUnderGoalsMarket, COMMON_GOAL_LINES } from './football/overUnderGoals';
import { createBothTeamsToScoreMarket } from './football/bothTeamsToScore';
import { createCorrectScoreMarket, COMMON_SCORES } from './football/correctScore';
import { createBasketballMatchWinnerMarket } from './basketball/matchWinner';
import { createBasketballHandicapMarket, COMMON_BASKETBALL_HANDICAPS } from './basketball/handicap';
import { createOverUnderPointsMarket, COMMON_NBA_TOTALS } from './basketball/overUnderPoints';
import { createBaseballMatchWinnerMarket } from './baseball/matchWinner';
import { createTotalRunsMarket, COMMON_MLB_TOTALS } from './baseball/totalRuns';
import { createRunLineMarket, STANDARD_RUN_LINE } from './baseball/runLine';
import { createFirstInningMarket, createFirstInningWinnerMarket } from './baseball/firstInning';
import { createTeamTotalsMarket, COMMON_NCAA_TEAM_TOTALS } from './baseball/teamTotals';
import { createFirst5InningsMarket, createFirst5RunLineMarket, createFirst5TotalMarket, createInningTotalMarket } from './baseball/innings';
import { createWinningMarginMarket, createOddEvenMarket, createFirstToScoreMarket, createRaceToRunsMarket, createBothTeamsScoreMarket as createBaseballBothTeamsScoreMarket, createExtraInningsMarket, COMMON_RACE_TARGETS } from './baseball/specials';
import { generateAlternateRunLines, generateAlternateTotals } from './baseball/alternateLines';
import { createHockeyMatchWinnerMarket } from './hockey/matchWinner';
import { createPuckLineMarket, STANDARD_PUCK_LINE } from './hockey/puckLine';
import { createRugbyMatchWinnerMarket } from './rugby/matchWinner';
import { createRugbyHandicapMarket, COMMON_RUGBY_HANDICAPS } from './rugby/handicap';
import { createVolleyballMatchWinnerMarket } from './volleyball/matchWinner';
import { createSetWinnerMarket } from './volleyball/setWinner';
import { createNFLMatchWinnerMarket } from './nfl/matchWinner';
import { COMMON_NFL_SPREADS, createPointSpreadMarket } from './nfl/pointSpread';
import { createHandballMatchWinnerMarket } from './handball/matchWinner';
import { COMMON_HANDBALL_HANDICAPS, createHandballHandicapMarket } from './handball/handicap';

export interface MatchData {
  homeTeam: string;
  awayTeam: string;
  homeOdds?: number;
  drawOdds?: number;
  awayOdds?: number;
  sport: string;
}

/**
 * Cria mercados padrão para futebol
 */
export function createFootballMarkets(match: MatchData): Market[] {
  const markets: Market[] = [];
  
  // 1. Match Winner (1X2)
  if (match.homeOdds && match.drawOdds && match.awayOdds) {
    markets.push(createMatchWinnerMarket(
      match.homeTeam,
      match.awayTeam,
      match.homeOdds,
      match.drawOdds,
      match.awayOdds
    ));
  }
  
  // 2. Double Chance
  if (match.homeOdds && match.drawOdds && match.awayOdds) {
    const homeOrDrawOdds = 1 / ((1 / match.homeOdds) + (1 / match.drawOdds));
    const drawOrAwayOdds = 1 / ((1 / match.drawOdds) + (1 / match.awayOdds));
    const homeOrAwayOdds = 1 / ((1 / match.homeOdds) + (1 / match.awayOdds));
    
    markets.push(createDoubleChanceMarket(
      match.homeTeam,
      match.awayTeam,
      homeOrDrawOdds,
      drawOrAwayOdds,
      homeOrAwayOdds
    ));
  }
  
  // 3. Over/Under Goals (2.5 é o mais comum)
  COMMON_GOAL_LINES.forEach(line => {
    markets.push(createOverUnderGoalsMarket(line, 1.85, 1.95));
  });
  
  // 4. Both Teams to Score
  markets.push(createBothTeamsToScoreMarket(1.80, 2.00));
  
  // 5. Correct Score
  markets.push(createCorrectScoreMarket(COMMON_SCORES));
  
  return markets;
}

/**
 * Cria mercados padrão para basquetebol
 */
export function createBasketballMarkets(match: MatchData): Market[] {
  const markets: Market[] = [];
  
  // 1. Match Winner
  if (match.homeOdds && match.awayOdds) {
    markets.push(createBasketballMatchWinnerMarket(
      match.homeTeam,
      match.awayTeam,
      match.homeOdds,
      match.awayOdds
    ));
  }
  
  // 2. Handicaps
  COMMON_BASKETBALL_HANDICAPS.forEach(line => {
    markets.push(createBasketballHandicapMarket(
      match.homeTeam,
      match.awayTeam,
      line,
      1.90,
      1.90
    ));
  });
  
  // 3. Over/Under Points
  COMMON_NBA_TOTALS.forEach(line => {
    markets.push(createOverUnderPointsMarket(line, 1.90, 1.90));
  });
  
  return markets;
}

/**
 * Cria mercados completos para NCAA Baseball
 */
export function createBaseballMarkets(match: MatchData): Market[] {
  const markets: Market[] = [];
  
  // 1. ⭐ Moneyline (Vencedor do Jogo) - PRIORITY 1
  if (match.homeOdds && match.awayOdds) {
    markets.push(createBaseballMatchWinnerMarket(
      match.homeTeam,
      match.awayTeam,
      match.homeOdds,
      match.awayOdds
    ));
  }
  
  // 2. ⭐ Run Line (Point Spread) - PRIORITY 2
  markets.push(createRunLineMarket(
    match.homeTeam,
    match.awayTeam,
    STANDARD_RUN_LINE,
    1.90,
    1.90
  ));
  
  // 3. ⭐ Over/Under (Total de Corridas) - PRIORITY 2
  COMMON_MLB_TOTALS.forEach(line => {
    markets.push(createTotalRunsMarket(line, 1.90, 1.90));
  });
  
  // 4. ⭐ First 5 Innings Winner - PRIORITY 3
  markets.push(createFirst5InningsMarket(
    match.homeTeam,
    match.awayTeam,
    1.95,
    1.95
  ));
  
  // 5. ⭐ First 5 Innings Total - PRIORITY 3
  markets.push(createFirst5TotalMarket(4.5, 1.90, 1.90));
  
  // 6. First 5 Innings Run Line - PRIORITY 4
  markets.push(createFirst5RunLineMarket(
    match.homeTeam,
    match.awayTeam,
    0.5,
    1.90,
    1.90
  ));
  
  // 7. First Inning Total - PRIORITY 4
  markets.push(createFirstInningMarket(0.5, 1.90, 1.90));
  
  // 8. First Inning Winner - PRIORITY 5
  markets.push(createFirstInningWinnerMarket(
    match.homeTeam,
    match.awayTeam,
    2.80,
    2.20,
    2.80
  ));
  
  // 9. Team Totals - PRIORITY 6
  COMMON_NCAA_TEAM_TOTALS.forEach(line => {
    markets.push(createTeamTotalsMarket(match.homeTeam, 'home', line, 1.90, 1.90));
    markets.push(createTeamTotalsMarket(match.awayTeam, 'away', line, 1.90, 1.90));
  });
  
  // 10. Both Teams to Score - PRIORITY 6
  markets.push(createBaseballBothTeamsScoreMarket(1.30, 3.50));
  
  // 11. First Team to Score - PRIORITY 7
  markets.push(createFirstToScoreMarket(
    match.homeTeam,
    match.awayTeam,
    1.90,
    1.90
  ));
  
  // 12. Specific Innings Totals - PRIORITY 7
  [1, 2, 3, 4, 5, 6, 7, 8, 9].forEach(inning => {
    markets.push(createInningTotalMarket(inning, 0.5, 1.90, 1.90));
  });
  
  // 13. Race to Runs - PRIORITY 8
  COMMON_RACE_TARGETS.forEach(target => {
    markets.push(createRaceToRunsMarket(
      match.homeTeam,
      match.awayTeam,
      target,
      2.00,
      2.00,
      8.00
    ));
  });
  
  // 14. Winning Margin - PRIORITY 8
  markets.push(createWinningMarginMarket(match.homeTeam, match.awayTeam));
  
  // 15. Odd/Even Total - PRIORITY 9
  markets.push(createOddEvenMarket(1.95, 1.95));
  
  // 16. Extra Innings - PRIORITY 9
  markets.push(createExtraInningsMarket(5.00, 1.15));
  
  // 17. ⭐ Alternate Run Lines - PRIORITY 10
  const alternateRunLines = generateAlternateRunLines(
    match.homeTeam,
    match.awayTeam,
    1.90
  );
  markets.push(...alternateRunLines);
  
  // 18. ⭐ Alternate Totals - PRIORITY 10
  const alternateTotals = generateAlternateTotals(1.90);
  markets.push(...alternateTotals);
  
  return markets;
}

/**
 * Cria mercados padrão para hóquei
 */
export function createHockeyMarkets(match: MatchData): Market[] {
  const markets: Market[] = [];
  
  // 1. Match Winner (com OT)
  if (match.homeOdds && match.awayOdds) {
    markets.push(createHockeyMatchWinnerMarket(
      match.homeTeam,
      match.awayTeam,
      match.homeOdds,
      match.awayOdds,
      true
    ));
  }
  
  // 2. Puck Line
  markets.push(createPuckLineMarket(
    match.homeTeam,
    match.awayTeam,
    STANDARD_PUCK_LINE,
    1.90,
    1.90
  ));
  
  return markets;
}

/**
 * Cria mercados padrão para rugby
 */
export function createRugbyMarkets(match: MatchData): Market[] {
  const markets: Market[] = [];
  
  // 1. Match Winner
  if (match.homeOdds && match.drawOdds && match.awayOdds) {
    markets.push(createRugbyMatchWinnerMarket(
      match.homeTeam,
      match.awayTeam,
      match.homeOdds,
      match.drawOdds,
      match.awayOdds
    ));
  }
  
  // 2. Handicaps
  COMMON_RUGBY_HANDICAPS.forEach(line => {
    markets.push(createRugbyHandicapMarket(
      match.homeTeam,
      match.awayTeam,
      line,
      1.90,
      1.90
    ));
  });
  
  return markets;
}

/**
 * Cria mercados padrão para voleibol
 */
export function createVolleyballMarkets(match: MatchData): Market[] {
  const markets: Market[] = [];
  
  // 1. Match Winner
  if (match.homeOdds && match.awayOdds) {
    markets.push(createVolleyballMatchWinnerMarket(
      match.homeTeam,
      match.awayTeam,
      match.homeOdds,
      match.awayOdds
    ));
  }
  
  // 2. Set Winners (5 sets possíveis)
  for (let i = 1; i <= 5; i++) {
    markets.push(createSetWinnerMarket(
      match.homeTeam,
      match.awayTeam,
      i,
      1.85,
      1.95
    ));
  }
  
  return markets;
}

/**
 * Cria mercados padrão para NFL
 */
export function createNFLMarkets(match: MatchData): Market[] {
  const markets: Market[] = [];
  
  // 1. Match Winner
  if (match.homeOdds && match.awayOdds) {
    markets.push(createNFLMatchWinnerMarket(
      match.homeTeam,
      match.awayTeam,
      match.homeOdds,
      match.awayOdds
    ));
  }
  
  // 2. Point Spreads
  COMMON_NFL_SPREADS.forEach(line => {
    markets.push(createPointSpreadMarket(
      match.homeTeam,
      match.awayTeam,
      line,
      1.90,
      1.90
    ));
  });
  
  return markets;
}

/**
 * Cria mercados padrão para andebol
 */
export function createHandballMarkets(match: MatchData): Market[] {
  const markets: Market[] = [];
  
  // 1. Match Winner
  if (match.homeOdds && match.drawOdds && match.awayOdds) {
    markets.push(createHandballMatchWinnerMarket(
      match.homeTeam,
      match.awayTeam,
      match.homeOdds,
      match.drawOdds,
      match.awayOdds
    ));
  }
  
  // 2. Handicaps
  COMMON_HANDBALL_HANDICAPS.forEach(line => {
    markets.push(createHandballHandicapMarket(
      match.homeTeam,
      match.awayTeam,
      line,
      1.90,
      1.90
    ));
  });
  
  return markets;
}

/**
 * Factory principal - cria mercados baseado no desporto
 */
export function createMarketsBySport(match: MatchData): Market[] {
  switch (match.sport.toLowerCase()) {
    case 'football':
    case 'soccer':
      return createFootballMarkets(match);
    
    case 'basketball':
      return createBasketballMarkets(match);
    
    case 'baseball':
      return createBaseballMarkets(match);
    
    case 'hockey':
    case 'ice_hockey':
      return createHockeyMarkets(match);
    
    case 'rugby':
    case 'rugby_union':
    case 'rugby_league':
      return createRugbyMarkets(match);
    
    case 'volleyball':
      return createVolleyballMarkets(match);
    
    case 'nfl':
    case 'american_football':
      return createNFLMarkets(match);
    
    case 'handball':
      return createHandballMarkets(match);
    
    default:
      console.warn(`Desporto não suportado: ${match.sport}`);
      return [];
  }
}

/**
 * Obtém mercados prioritários para live betting
 */
export function getLivePriorityMarkets(markets: Market[]): Market[] {
  return markets
    .filter(m => m.isLive && m.priority <= 3)
    .sort((a, b) => a.priority - b.priority);
}

/**
 * Filtra mercados por tipo
 */
export function getMarketsByType(markets: Market[], type: string): Market[] {
  return markets.filter(m => m.type === type);
}
