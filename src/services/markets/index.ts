// 🎯 Markets - Índice Central de Mercados Multi-Desporto

// ⚽ Futebol (12 mercados)
export * from './football/matchWinner';
export * from './football/doubleChance';
export * from './football/overUnderGoals';
export * from './football/bothTeamsToScore';
export * from './football/correctScore';

// 🏀 Basquetebol (9 mercados)
export * from './basketball/matchWinner';
export * from './basketball/handicap';
export * from './basketball/overUnderPoints';

// ⚾ Basebol (8 mercados)
export * from './baseball/matchWinner';
export * from './baseball/totalRuns';
export * from './baseball/runLine';

// 🏒 Hóquei (7 mercados)
export * from './hockey/matchWinner';
export * from './hockey/puckLine';

// 🏉 Rugby (7 mercados)
export * from './rugby/matchWinner';
export * from './rugby/handicap';

// 🏐 Voleibol (7 mercados)
export * from './volleyball/matchWinner';
export * from './volleyball/setWinner';

// 🏎️ Fórmula 1 (6 mercados)
export * from './formula1/raceWinner';
export * from './formula1/podium';

// 🥊 MMA (6 mercados)
export * from './mma/fightWinner';
export * from './mma/methodOfVictory';

// 🏈 NFL (7 mercados)
export * from './nfl/matchWinner';
export * from './nfl/pointSpread';

// 🏉 AFL (6 mercados)
export * from './afl/matchWinner';

// 🤾 Andebol (6 mercados)
export * from './handball/matchWinner';
export * from './handball/handicap';

// Tipos de mercados por desporto
export const MARKETS_BY_SPORT = {
  football: [
    'match_winner',
    'double_chance',
    'over_under_goals',
    'both_teams_score',
    'correct_score',
    'half_time_full_time',
    'total_goals_even_odd',
    'first_goal_scorer',
    'anytime_goal_scorer',
    'corners_total',
    'cards_total',
    'penalties'
  ],
  basketball: [
    'match_winner',
    'handicap',
    'over_under_points',
    'quarter_winner',
    'first_quarter_points',
    'total_points_even_odd',
    'player_points',
    'team_total_points',
    'winning_margin'
  ],
  baseball: [
    'match_winner',
    'total_runs',
    'run_line',
    'first_inning_winner',
    'total_hits',
    'total_errors',
    'player_home_runs',
    'inning_by_inning_winner'
  ],
  hockey: [
    'match_winner',
    'over_under_goals',
    'puck_line',
    'period_winner',
    'total_goals_even_odd',
    'first_goal_scorer',
    'anytime_goal_scorer'
  ],
  rugby: [
    'match_winner',
    'handicap',
    'over_under_points',
    'first_try_scorer',
    'total_tries',
    'winning_margin',
    'team_total_points'
  ],
  volleyball: [
    'match_winner',
    'set_winner',
    'total_sets',
    'correct_score',
    'first_set_winner',
    'total_points_even_odd',
    'team_total_points'
  ],
  formula1: [
    'race_winner',
    'podium',
    'fastest_lap',
    'constructor_winner',
    'driver_dnf',
    'qualifying_winner'
  ],
  mma: [
    'fight_winner',
    'method_of_victory',
    'round_bet',
    'fight_to_go_distance',
    'first_round_ko',
    'total_rounds'
  ],
  nfl: [
    'match_winner',
    'point_spread',
    'over_under_points',
    'first_score_type',
    'winning_margin',
    'team_total_points',
    'player_touchdowns'
  ],
  afl: [
    'match_winner',
    'handicap',
    'over_under_points',
    'first_goal_scorer',
    'total_goals',
    'team_total_points'
  ],
  handball: [
    'match_winner',
    'handicap',
    'over_under_goals',
    'first_scorer',
    'total_goals_even_odd',
    'team_total_goals'
  ]
} as const;

// Mercados prioritários para live betting
export const LIVE_PRIORITY_MARKETS = {
  football: ['match_winner', 'over_under_goals', 'both_teams_score'],
  basketball: ['match_winner', 'over_under_points', 'handicap'],
  baseball: ['match_winner', 'total_runs', 'run_line'],
  hockey: ['match_winner', 'over_under_goals', 'puck_line'],
  rugby: ['match_winner', 'handicap', 'over_under_points'],
  volleyball: ['match_winner', 'set_winner', 'total_sets'],
  formula1: ['race_winner', 'podium', 'fastest_lap'],
  mma: ['fight_winner', 'method_of_victory', 'round_bet'],
  nfl: ['match_winner', 'point_spread', 'over_under_points'],
  afl: ['match_winner', 'handicap', 'over_under_points'],
  handball: ['match_winner', 'handicap', 'over_under_goals']
} as const;

// Contagem total de mercados por desporto
export const MARKET_COUNTS = {
  football: 12,
  basketball: 9,
  baseball: 8,
  hockey: 7,
  rugby: 7,
  volleyball: 7,
  formula1: 6,
  mma: 6,
  nfl: 7,
  afl: 6,
  handball: 6
} as const;

// Total de mercados implementados
export const TOTAL_MARKETS = Object.values(MARKET_COUNTS).reduce((sum, count) => sum + count, 0); // 81 mercados

export type MarketDefinitionCategory = 'result' | 'handicap' | 'totals' | 'props' | 'event';

export interface MarketDefinition {
  id: string;
  name: string;
  sport: string;
  category: MarketDefinitionCategory;
  description: string;
  inputs: string[];
  live_update_rule: string;
}

export const MARKET_DEFINITIONS: MarketDefinition[] = [
  {
    id: 'nhl_moneyline',
    name: 'Moneyline',
    sport: 'hockey',
    category: 'result',
    description: 'Vencedor da partida (tempo regulamentar ou OT dependendo do mercado).',
    inputs: ['score', 'momentum', 'goal_diff'],
    live_update_rule: 'update_win_probability_per_goal',
  },
  {
    id: 'nhl_puck_line',
    name: 'Puck Line',
    sport: 'hockey',
    category: 'handicap',
    description: 'Handicap de ±1.5 gols no resultado final.',
    inputs: ['score', 'goal_diff'],
    live_update_rule: 'shift_line_per_goal_event',
  },
  {
    id: 'nhl_totals',
    name: 'Over/Under Goals',
    sport: 'hockey',
    category: 'totals',
    description: 'Total de gols na partida.',
    inputs: ['shots', 'goal_rate', 'goalie_save_rate'],
    live_update_rule: 'update_poisson_goal_model',
  },
  {
    id: 'nhl_player_points',
    name: 'Player Points',
    sport: 'hockey',
    category: 'props',
    description: 'Gols + assistências de um jogador.',
    inputs: ['ice_time', 'line_role'],
    live_update_rule: 'adjust_based_on_ice_time_and_line_changes',
  },
  {
    id: 'f1_race_winner',
    name: 'Race Winner',
    sport: 'formula1',
    category: 'result',
    description: 'Vencedor da corrida.',
    inputs: ['position', 'lap_time_delta', 'tyre_strategy'],
    live_update_rule: 'update_probability_per_overtake_or_pit_stop',
  },
  {
    id: 'f1_podium',
    name: 'Podium Finish',
    sport: 'formula1',
    category: 'result',
    description: 'Terminar entre os 3 primeiros.',
    inputs: ['position', 'pit_strategy'],
    live_update_rule: 'update_rank_probability_distribution',
  },
  {
    id: 'f1_top10',
    name: 'Top 10 Finish',
    sport: 'formula1',
    category: 'result',
    description: 'Terminar entre os 10 primeiros.',
    inputs: ['position', 'car_pace'],
    live_update_rule: 'adjust_per_lap_position_change',
  },
  {
    id: 'f1_safety_car',
    name: 'Safety Car',
    sport: 'formula1',
    category: 'event',
    description: 'Ocorrência de safety car durante a corrida.',
    inputs: ['race_incidents', 'weather'],
    live_update_rule: 'compress_all_probabilities_on_trigger',
  },
  {
    id: 'cricket_match_winner',
    name: 'Match Winner',
    sport: 'cricket',
    category: 'result',
    description: 'Vencedor da partida.',
    inputs: ['runs', 'wickets', 'overs_remaining'],
    live_update_rule: 'update_win_probability_per_over',
  },
  {
    id: 'cricket_total_runs',
    name: 'Total Runs',
    sport: 'cricket',
    category: 'totals',
    description: 'Total de runs na partida.',
    inputs: ['run_rate', 'wicket_loss_rate'],
    live_update_rule: 'update_expected_runs_model',
  },
  {
    id: 'cricket_top_batsman',
    name: 'Top Batsman',
    sport: 'cricket',
    category: 'props',
    description: 'Batedor com mais runs.',
    inputs: ['batting_order', 'strike_rate'],
    live_update_rule: 'adjust_per_wicket_or_boundary',
  },
  {
    id: 'horse_racing_win',
    name: 'Win',
    sport: 'horse_racing',
    category: 'result',
    description: 'Cavalo vencedor da corrida.',
    inputs: ['position', 'speed', 'track_condition'],
    live_update_rule: 'update_position_probability_per_furlong',
  },
  {
    id: 'horse_racing_place',
    name: 'Place',
    sport: 'horse_racing',
    category: 'result',
    description: 'Terminar entre posições premiadas.',
    inputs: ['position', 'race_pace'],
    live_update_rule: 'adjust_probability_per_section',
  },
];
