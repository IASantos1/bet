// Configuração completa de mercados por esporte
export const MARKET_CONFIG: Record<string, { title: string, grid?: string }> = {
  // ── Soccer / Generic ────────────────────────────────────────────
  h2h: { title: 'Resultado Final' },
  totals: { title: 'Total de Golos/Pontos' },
  spreads: { title: 'Handicap Asiático' },
  handicap: { title: 'Handicap' },
  btts: { title: 'Ambas Marcam' },
  correct_score: { title: 'Resultado Exacto', grid: 'grid-cols-3 md:grid-cols-4' },
  double_chance: { title: 'Dupla Chance' },
  dnb: { title: 'Empate Anula Aposta' },
  draw_no_bet: { title: 'Empate Anula Aposta' },

  // ── Derived Soccer: Totals por linha ───────────────────────────
  totals_0_5: { title: 'Total Golos: +/- 0.5' },
  totals_1_5: { title: 'Total Golos: +/- 1.5' },
  totals_2_5: { title: 'Total Golos: +/- 2.5' },
  totals_3_5: { title: 'Total Golos: +/- 3.5' },
  totals_4_5: { title: 'Total Golos: +/- 4.5' },
  totals_5_5: { title: 'Total Golos: +/- 5.5' },
  totals_6_5: { title: 'Total Golos: +/- 6.5' },

  // ── Derived Soccer: Cantos por linha ───────────────────────────
  corners_6_5: { title: 'Cantos: +/- 6.5' },
  corners_7_5: { title: 'Cantos: +/- 7.5' },
  corners_8_5: { title: 'Cantos: +/- 8.5' },
  corners_9_5: { title: 'Cantos: +/- 9.5' },
  corners_11_5: { title: 'Cantos: +/- 11.5' },
  corners_12_5: { title: 'Cantos: +/- 12.5' },
  corners_13_5: { title: 'Cantos: +/- 13.5' },
  corners_14_5: { title: 'Cantos: +/- 14.5' },

  // ── Derived Soccer: Cartões por linha ─────────────────────────
  cards_2_5: { title: 'Cartões: +/- 2.5' },
  cards_3_5: { title: 'Cartões: +/- 3.5' },
  cards_4_5: { title: 'Cartões: +/- 4.5' },
  cards_7_5: { title: 'Cartões: +/- 7.5' },
  cards_8_5: { title: 'Cartões: +/- 8.5' },

  // ── Derived Soccer: Mercados por equipa ───────────────────────
  home_team_totals: { title: 'Golos da Casa' },
  away_team_totals: { title: 'Golos de Fora' },
  exact_home_goals: { title: 'Golos Exactos - Casa' },
  exact_away_goals: { title: 'Golos Exactos - Fora' },
  home_corners_total: { title: 'Cantos - Casa' },
  away_corners_total: { title: 'Cantos - Fora' },
  home_cards_total: { title: 'Cartões - Casa' },
  away_cards_total: { title: 'Cartões - Fora' },

  // ── Derived Soccer: Resultado ──────────────────────────────────
  winning_margin: { title: 'Margem de Vitória' },
  goals_range: { title: 'Intervalo de Golos' },
  total_goal_odd_even: { title: 'Golos Par/Ímpar' },
  win_to_nil: { title: 'Vitória sem Sofrer' },
  comeback_win: { title: 'Remontada' },
  btts_and_result: { title: 'Ambas Marcam + Resultado' },

  // ── Derived Soccer: Tempos ─────────────────────────────────────
  half_time_full_time: { title: 'Intervalo/Final' },
  '2nd_half': { title: '2º Tempo - Resultado' },
  '1st_half_totals': { title: '1º Tempo - Total' },
  '2nd_half_totals': { title: '2º Tempo - Total' },
  '1st_half_goal_odd_even': { title: '1º Tempo - Golos Par/Ímpar' },
  '1st_half_correct_score': { title: '1º Tempo - Resultado Exacto', grid: 'grid-cols-3 md:grid-cols-4' },
  '2nd_half_correct_score': { title: '2º Tempo - Resultado Exacto', grid: 'grid-cols-3 md:grid-cols-4' },
  btts_first_half: { title: 'Ambas Marcam no 1º Tempo' },
  btts_second_half: { title: 'Ambas Marcam no 2º Tempo' },
  double_chance_1st_half: { title: '1º Tempo - Dupla Chance' },
  draw_no_bet_1st_half: { title: '1º Tempo - Empate Anula' },
  highest_scoring_half: { title: 'Tempo com Mais Golos' },

  // ── Derived Soccer: Cantos/Cartões extras ─────────────────────
  corners_odd_even: { title: 'Cantos Par/Ímpar' },
  cards_odd_even: { title: 'Cartões Par/Ímpar' },
  '1st_half_corners': { title: '1º Tempo - Cantos' },
  '2nd_half_corners': { title: '2º Tempo - Cantos' },
  '1st_half_cards': { title: '1º Tempo - Cartões' },
  '2nd_half_cards': { title: '2º Tempo - Cartões' },

  // ── Derived Soccer: Especiais ─────────────────────────────────
  first_team_to_score: { title: 'Primeira Equipa a Marcar' },
  team_to_score_last: { title: 'Última Equipa a Marcar' },
  team_clean_sheet: { title: 'Baliza a Zero' },
  penalty_scored: { title: 'Penálti Marcado' },
  score_both_halves: { title: 'Marca nos Dois Tempos' },

  // ── Derived Soccer: Handicap Europeu ─────────────────────────
  handicap_european_neg2: { title: 'Handicap Europeu -2' },
  handicap_european_neg1: { title: 'Handicap Europeu -1' },
  handicap_european_0: { title: 'Handicap Europeu 0' },
  handicap_european_pos0: { title: 'Handicap Europeu 0' },
  handicap_european_pos1: { title: 'Handicap Europeu +1' },
  handicap_european_pos2: { title: 'Handicap Europeu +2' },

  // ── Derived Basketball: Tempos ────────────────────────────────
  first_half_h2h: { title: '1º Tempo - Vencedor' },
  second_half_h2h: { title: '2º Tempo - Vencedor' },
  first_half_totals: { title: '1º Tempo - Total' },
  second_half_totals: { title: '2º Tempo - Total' },
  team_totals_home: { title: 'Total da Equipa da Casa' },
  team_totals_away: { title: 'Total da Equipa de Fora' },

  // ── Derived Soccer: Novos mercados adicionais ─────────────────
  win_both_halves: { title: 'Vence os Dois Tempos' },
  goal_in_each_half: { title: 'Golo em Cada Tempo' },
  home_goals_odd_even: { title: 'Golos Casa - Par/Ímpar' },
  away_goals_odd_even: { title: 'Golos Fora - Par/Ímpar' },
  asian_handicap_neg25: { title: 'Handicap Asiático -2.5' },
  asian_handicap_neg15: { title: 'Handicap Asiático -1.5' },
  asian_handicap_pos15: { title: 'Handicap Asiático +1.5' },
  asian_handicap_pos25: { title: 'Handicap Asiático +2.5' },
  '1st_half_goal_range': { title: '1º Tempo - Intervalo Golos' },
  '2nd_half_goal_range': { title: '2º Tempo - Intervalo Golos' },
  home_corners_1st_half: { title: 'Cantos Casa - 1º Tempo' },
  home_corners_2nd_half: { title: 'Cantos Casa - 2º Tempo' },
  away_corners_1st_half: { title: 'Cantos Fora - 1º Tempo' },
  away_corners_2nd_half: { title: 'Cantos Fora - 2º Tempo' },
  home_cards_1st_half: { title: 'Cartões Casa - 1º Tempo' },
  home_cards_2nd_half: { title: 'Cartões Casa - 2º Tempo' },
  away_cards_1st_half: { title: 'Cartões Fora - 1º Tempo' },
  away_cards_2nd_half: { title: 'Cartões Fora - 2º Tempo' },

  // ── Derived Basketball/Hockey/Baseball: Extra totals ──────────
  totals_185_0: { title: 'Total: +/- 185' },
  totals_190_0: { title: 'Total: +/- 190' },
  totals_195_0: { title: 'Total: +/- 195' },
  totals_200_0: { title: 'Total: +/- 200' },
  totals_205_0: { title: 'Total: +/- 205' },
  totals_210_0: { title: 'Total: +/- 210' },
  totals_215_0: { title: 'Total: +/- 215' },
  totals_220_0: { title: 'Total: +/- 220' },
  totals_225_0: { title: 'Total: +/- 225' },
  totals_230_0: { title: 'Total: +/- 230' },
  totals_235_0: { title: 'Total: +/- 235' },

  // ── Generic market keys (API/legacy) ──────────────────────────
  result_including_extra_time: { title: 'Resultado c/ Prolongamento' },
  next_goal: { title: 'Próximo Golo' },
  first_goal: { title: 'Primeiro Golo' },
  last_goal: { title: 'Último Golo' },
  match_goals: { title: 'Total de Golos' },
  minute_goals: { title: 'Golo no Minuto' },
  score_exact: { title: 'Resultado Exacto' },
  team_to_score_first: { title: 'Equipa a Marcar Primeiro' },
  '1st_half': { title: '1º Tempo - Resultado' },
  anytime_goal_scorer: { title: 'Marcador a Qualquer Momento' },
  first_goal_scorer: { title: 'Primeiro Marcador' },
  player_goal_scorer_anytime: { title: 'Jogador a Marcar a Qualquer Momento' },
  own_goal: { title: 'Auto-golo' },
  corners_total: { title: 'Total de Cantos' },
  corners_totals: { title: 'Total de Cantos' },
  corners_team: { title: 'Cantos por Equipa' },
  corners_2_way: { title: 'Cantos (2 hipóteses)' },
  corner_handicap: { title: 'Handicap de Cantos' },
  corners_btts: { title: 'Cantos e Ambas Marcam' },
  cards_total: { title: 'Total de Cartões' },
  cards_totals: { title: 'Total de Cartões' },
  cards_in_match: { title: 'Total de Cartões' },
  yellow_cards_player: { title: 'Cartão Amarelo - Jogador' },
  red_cards_player: { title: 'Cartão Vermelho - Jogador' },

  // ── Basketball ────────────────────────────────────────────────
  player_points: { title: 'Pontos do Jogador' },
  player_rebounds: { title: 'Rebotes do Jogador' },
  player_assists: { title: 'Assistências do Jogador' },
  player_pra: { title: 'PRA do Jogador' },
  player_double_double: { title: 'Duplo-Duplo' },
  player_triple_double: { title: 'Triple-Duplo' },
  player_steals: { title: 'Intercepções do Jogador' },
  player_blocks: { title: 'Bloqueios do Jogador' },
  player_minutes: { title: 'Minutos do Jogador' },
  player_threes: { title: '3 Pontos do Jogador' },
  player_three_pointers: { title: '3 Pontos do Jogador' },
  team_totals: { title: 'Total da Equipa' },
  first_to_score: { title: 'Primeiro a Marcar' },
  race_to: { title: 'Corrida até X Pontos' },
  race_to_points: { title: 'Corrida até X Pontos' },
  next_basket: { title: 'Próxima Cesta' },
  next_scorer: { title: 'Próximo Marcador' },
  three_pointer: { title: 'Cesta de 3 Pontos' },
  alternate_spreads: { title: 'Spread Alternativo' },
  halves_h2h: { title: 'Vencedor do Tempo' },
  halves_totals: { title: 'Total do Tempo' },
  q1_h2h: { title: '1º Quarto - Vencedor' },
  q2_h2h: { title: '2º Quarto - Vencedor' },
  q3_h2h: { title: '3º Quarto - Vencedor' },
  q4_h2h: { title: '4º Quarto - Vencedor' },
  q1_totals: { title: '1º Quarto - Total' },
  q2_totals: { title: '2º Quarto - Total' },
  q3_totals: { title: '3º Quarto - Total' },
  q4_totals: { title: '4º Quarto - Total' },
  quarters_h2h: { title: 'Vencedor do Quarto' },
  quarters_totals: { title: 'Total do Quarto' },
  quarter_point_diff: { title: 'Diferença de Pontos no Quarto' },
  team_parlay: { title: 'Parlay da Equipa' },
  margin: { title: 'Margem de Vitória' },

  // ── Tennis ─────────────────────────────────────────────────────
  set_winner: { title: 'Vencedor do Set' },
  sets_h2h: { title: 'Vencedor do Set' },
  sets_winner: { title: 'Vencedor do Set' },
  current_set_winner: { title: 'Vencedor do Set Atual' },
  current_set_totals: { title: 'Total do Set Atual' },
  set_1_h2h: { title: '1º Set - Vencedor' },
  set_2_h2h: { title: '2º Set - Vencedor' },
  set_3_h2h: { title: '3º Set - Vencedor' },
  set_4_h2h: { title: '4º Set - Vencedor' },
  set_5_h2h: { title: '5º Set - Vencedor' },
  set_1_totals: { title: '1º Set - Total de Jogos' },
  set_2_totals: { title: '2º Set - Total de Jogos' },
  set_3_totals: { title: '3º Set - Total de Jogos' },
  set_4_totals: { title: '4º Set - Total de Jogos' },
  set_5_totals: { title: '5º Set - Total de Jogos' },
  first_set_winner: { title: 'Vencedor do 1º Set' },
  second_set_winner: { title: 'Vencedor do 2º Set' },
  third_set_winner: { title: 'Vencedor do 3º Set' },
  total_sets: { title: 'Total de Sets' },
  over_under_sets: { title: 'Mais/Menos Sets' },
  sets_handicap: { title: 'Handicap de Sets' },
  match_total_games: { title: 'Total de Jogos na Partida' },
  set_total_games: { title: 'Total de Jogos no Set' },
  player_games: { title: 'Jogos do Jogador' },
  games_handicap: { title: 'Handicap de Jogos' },
  game_winner: { title: 'Vencedor do Game' },
  next_game_winner: { title: 'Próximo Game - Vencedor' },
  race_to_games: { title: 'Corrida até X Jogos' },
  games_odd_even: { title: 'Jogos Par/Ímpar' },
  tie_break: { title: 'Tie-break' },
  tie_breaks: { title: 'Tie-breaks' },
  tie_break_in_match: { title: 'Tie-break na Partida' },
  match_has_tiebreak: { title: 'Partida com Tie-break' },
  aces_total: { title: 'Total de Ases' },
  total_aces: { title: 'Total de Ases' },
  player_aces: { title: 'Ases do Jogador' },
  player_ace: { title: 'Ases do Jogador' },
  double_faults_total: { title: 'Total de Duplas Faltas' },
  player_double_faults: { title: 'Duplas Faltas do Jogador' },
  break_points: { title: 'Pontos de Break' },
  break_points_converted: { title: 'Pontos de Break Convertidos' },
  first_serve_winner: { title: 'Vencedor do 1º Saque' },
  first_serve_percentage: { title: '1º Saque %' },
  player_to_win_a_set: { title: 'Jogador Vence um Set' },
  to_win_a_set: { title: 'Jogador Vence um Set' },

  // ── Ice Hockey ─────────────────────────────────────────────────
  puck_line: { title: 'Linha de Puck (-1.5/+1.5)' },
  period_h2h: { title: 'Vencedor do Período' },
  period_totals: { title: 'Total do Período' },
  period_1_h2h: { title: '1º Período - Vencedor' },
  period_2_h2h: { title: '2º Período - Vencedor' },
  period_3_h2h: { title: '3º Período - Vencedor' },
  period_1_totals: { title: '1º Período - Total' },
  period_2_totals: { title: '2º Período - Total' },
  period_3_totals: { title: '3º Período - Total' },
  shots_on_goal: { title: 'Remates à Baliza' },
  shots_on_goal_period: { title: 'Remates à Baliza no Período' },
  power_play_goals: { title: 'Golos em Power Play' },
  power_play: { title: 'Power Play' },
  empty_net_goal: { title: 'Golo com Baliza Vazia' },
  penalty_minutes: { title: 'Minutos de Penalização' },
  puck_possession: { title: 'Posse do Puck' },
  goal_scorer: { title: 'Marcador do Golo' },
  next_goal_scorer: { title: 'Próximo Marcador' },
  hat_trick: { title: 'Hat Trick' },
  highest_scoring_period: { title: 'Período com Mais Golos' },

  // ── Baseball ──────────────────────────────────────────────────
  run_line: { title: 'Linha de Corrida (-1.5/+1.5)' },
  extra_innings: { title: 'Extra Innings' },
  nrfi: { title: 'NRFI - Sem Corrida no 1º Inning' },
  yrfi: { title: 'YRFI - Com Corrida no 1º Inning' },
  first_inning_run: { title: 'Corrida no 1º Inning' },
  first_inning_h2h: { title: '1º Inning - Vencedor' },
  first_inning_totals: { title: '1º Inning - Total' },
  inning_h2h: { title: 'Vencedor do Inning' },
  inning_totals: { title: 'Total do Inning' },
  inning_winner: { title: 'Vencedor do Inning' },
  innings_h2h: { title: 'Vencedor do Inning' },
  innings_totals: { title: 'Total do Inning' },
  result_1st_inning: { title: 'Resultado do 1º Inning' },
  run_range: { title: 'Intervalo de Corridas' },
  run_total_range: { title: 'Intervalo de Corridas' },
  race_to_runs: { title: 'Corrida até X Corridas' },
  player_runs: { title: 'Corridas do Jogador' },
  player_hits: { title: 'Hits do Jogador' },
  player_home_runs: { title: 'Home Runs do Jogador' },
  player_rbi: { title: 'RBI do Jogador' },
  player_strikeouts: { title: 'Strikeouts do Jogador' },
  player_total_bases: { title: 'Bases Totais do Jogador' },
  player_stolen_bases: { title: 'Bases Roubadas do Jogador' },
  player_singles: { title: 'Singles do Jogador' },
  player_doubles: { title: 'Duplas do Jogador' },
  player_triples: { title: 'Triplas do Jogador' },
  player_pitcher_strikeouts: { title: 'Strikeouts do Pitcher' },
  player_hits_allowed: { title: 'Hits Cedidos pelo Pitcher' },
  player_earned_runs: { title: 'Earned Runs do Pitcher' },
  player_outs: { title: 'Outs do Pitcher' },
  player_walks: { title: 'Walks do Pitcher' },
  player_pitch_count: { title: 'Contagem de Lançamentos' },

  // ── AFL / Australian Football ──────────────────────────────────
  player_goals: { title: 'Golos do Jogador' },
  player_props: { title: 'Props de Jogador' },
  scoring_runs: { title: 'Sequência de Pontuação' },
  match_parlay: { title: 'Parlay da Partida' },
  "winning_margin_10+": { title: 'Margem de Vitória 10+' },

  // ── American Football ──────────────────────────────────────────
  player_touchdowns: { title: 'Touchdowns do Jogador' },
  player_yards: { title: 'Jardas do Jogador' },
  first_score_type: { title: 'Tipo de Primeira Pontuação' },
  player_receptions: { title: 'Recepções do Jogador' },
  team_to_score_first_td: { title: 'Equipa com 1º Touchdown' },

  // ── Handball ──────────────────────────────────────────────────
  quarter_h2h: { title: 'Vencedor do Quarto' },
  quarter_totals: { title: 'Total do Quarto' },
  fastest_goal: { title: 'Golo Mais Rápido' },
  most_goals_half: { title: 'Tempo com Mais Golos' },

  // ── MMA / UFC ─────────────────────────────────────────────────
  method: { title: 'Método de Vitória' },
  method_of_victory: { title: 'Método de Vitória' },
  rounds: { title: 'Rondas' },
  total_rounds: { title: 'Total de Rondas' },
  over_under_rounds: { title: 'Mais/Menos Rondas' },
  finish_method_round: { title: 'Método e Ronda' },
  knockout_draw: { title: 'KO ou Empate' },
  first_round_finish: { title: 'Finalização na 1ª Ronda' },
  submission_only: { title: 'Apenas Finalização' },
  decision_type: { title: 'Tipo de Decisão' },
  total_strikes: { title: 'Total de Golpes' },

  // ── Rugby ──────────────────────────────────────────────────────
  player_tries: { title: 'Tries do Jogador' },
  conversion_success: { title: 'Conversão Bem-sucedida' },
  penalty_goals: { title: 'Golos de Penálti' },
  "winning_margin_15+": { title: 'Margem de Vitória 15+' },

  // ── F1 ────────────────────────────────────────────────────────
  podium: { title: 'Pódio' },
  race_winner: { title: 'Vencedor da Corrida' },
  podium_finish: { title: 'Pódio' },
  top_10_finish: { title: 'Top 10' },
  safety_car: { title: 'Carro de Segurança' },
  pole_position: { title: 'Pole Position' },
  fastest_lap: { title: 'Volta Mais Rápida' },
  constructor_winner: { title: 'Construtor Vencedor' },
  top_3_finish: { title: 'Top 3' },
  head_to_head_drivers: { title: 'H2H Pilotos' },
  top_5_finish: { title: 'Top 5' },
  driver_fastest_sector: { title: 'Setor Mais Rápido' },
  first_lap_leader: { title: 'Líder da 1ª Volta' },
  retirement: { title: 'Abandono' },

  // ── Volleyball ────────────────────────────────────────────────
  set_total_points: { title: 'Total de Pontos no Set' },
  total_blocks: { title: 'Total de Bloqueios' },
  set_point_diff: { title: 'Diferença de Pontos no Set' },
};

// ─── Soccer MARKET_GROUPS (fallback para quando categoria é ambígua) ───
export const MARKET_GROUPS = [
  {
    title: "Mercado Base",
    keys: ["h2h", "totals", "btts", "handicap", "spreads"]
  },
  {
    title: "Mercados de Resultado",
    keys: ["double_chance", "dnb", "draw_no_bet", "correct_score", "half_time_full_time", "winning_margin", "result_including_extra_time", "halves_h2h", "winning_margin_10+", "margin"]
  },
  {
    title: "Mercados de Golos",
    keys: ["btts", "btts_first_half", "team_totals", "first_goal_scorer", "anytime_goal_scorer", "score_exact", "first_to_score", "team_to_score_first", "team_to_score_last", "goal_range", "exact_goals", "minute_goals", "first_goal", "last_goal", "next_goal", "total_goal_odd_even"]
  },
  {
    title: "Mercados Temporais",
    keys: ["first_half_h2h", "second_half_h2h", "first_half_totals", "second_half_totals", "halves_totals", "quarters_h2h", "quarters_totals", "period_h2h", "period_totals", "inning_h2h", "inning_totals"]
  },
  {
    title: "Mercados Estatísticos",
    keys: ["corners_total", "cards_total", "corners_team", "corners_totals", "corner_handicap", "corners_btts", "cards_totals", "total_aces", "shots_on_goal", "run_line", "puck_line"]
  },
  {
    title: "Mercados de Jogadores",
    keys: ["first_goal_scorer", "anytime_goal_scorer", "player_goal_scorer_anytime", "player_goals", "player_points", "player_rebounds", "player_assists", "player_props", "yellow_cards_player", "red_cards_player", "player_touchdowns", "player_yards", "player_receptions", "player_tries", "player_games", "player_runs", "player_hits", "player_home_runs", "player_strikeouts", "player_rbi"]
  },
  {
    title: "Mercados Especiais",
    keys: ["penalty_scored", "own_goal", "team_clean_sheet", "match_parlay", "method", "rounds", "total_rounds", "over_under_rounds"]
  }
];

// ─── Basketball ────────────────────────────────────────────────────────
export const BASKETBALL_GROUPS = [
  {
    title: "Todos",
    keys: ["h2h","totals","team_totals","spreads","handicap","alternate_spreads","q1_h2h","q2_h2h","q3_h2h","q4_h2h","q1_totals","q2_totals","q3_totals","q4_totals","quarters_h2h","quarters_totals","quarter_point_diff","halves_h2h","halves_totals","race_to","race_to_points","first_to_score","next_basket","next_scorer","three_pointer","double_chance","winning_margin","margin","player_points","player_rebounds","player_assists","player_pra","player_threes","player_three_pointers","player_double_double","player_triple_double","player_steals","player_blocks","player_minutes","player_props","match_parlay","team_parlay"]
  },
  { title: "Vencedor",   keys: ["h2h","double_chance","winning_margin","margin"] },
  { title: "Totais",     keys: ["totals","team_totals","alternate_totals"] },
  { title: "Spread",     keys: ["spreads","handicap","alternate_spreads"] },
  { title: "1ºQ",        keys: ["q1_h2h","q1_totals"] },
  { title: "2ºQ",        keys: ["q2_h2h","q2_totals"] },
  { title: "3ºQ",        keys: ["q3_h2h","q3_totals"] },
  { title: "4ºQ",        keys: ["q4_h2h","q4_totals"] },
  { title: "Live",       keys: ["next_basket","next_scorer","three_pointer","race_to","race_to_points","first_to_score"] },
  { title: "Jogadores",  keys: ["player_points","player_rebounds","player_assists","player_pra","player_threes","player_three_pointers","player_double_double","player_triple_double","player_steals","player_blocks","player_minutes","player_props"] },
];

// ─── Tennis ────────────────────────────────────────────────────────────
export const TENNIS_GROUPS = [
  {
    title: "Todos",
    keys: ["h2h","current_set_winner","current_set_totals","set_1_h2h","set_2_h2h","set_3_h2h","set_4_h2h","set_5_h2h","set_1_totals","set_2_totals","set_3_totals","set_4_totals","set_5_totals","set_winner","first_set_winner","second_set_winner","third_set_winner","sets_winner","sets_h2h","total_sets","over_under_sets","spreads","handicap","sets_handicap","games_handicap","totals","match_total_games","set_total_games","player_games","race_to_games","games_odd_even","game_winner","next_game_winner","correct_score","score_exact","tie_break","tie_breaks","tie_break_in_match","match_has_tiebreak","aces_total","total_aces","player_aces","player_ace","double_faults_total","player_double_faults","break_points","break_points_converted","first_serve_winner","first_serve_percentage","player_to_win_a_set","to_win_a_set"]
  },
  { title: "Vencedor",   keys: ["h2h","correct_score","score_exact"] },
  { title: "Set Atual",  keys: ["current_set_winner","current_set_totals","game_winner","next_game_winner"] },
  { title: "Sets",       keys: ["total_sets","over_under_sets","set_1_h2h","set_2_h2h","set_3_h2h","set_4_h2h","set_5_h2h","set_1_totals","set_2_totals","set_3_totals","set_4_totals","set_5_totals","set_winner","first_set_winner","second_set_winner","third_set_winner","sets_winner","sets_h2h","player_to_win_a_set","to_win_a_set"] },
  { title: "Handicap",   keys: ["sets_handicap","games_handicap","spreads","handicap"] },
  { title: "Jogos",      keys: ["totals","match_total_games","set_total_games","player_games","race_to_games","games_odd_even"] },
  { title: "Especiais",  keys: ["tie_break","tie_breaks","tie_break_in_match","match_has_tiebreak","aces_total","total_aces","player_aces","player_ace","double_faults_total","player_double_faults","break_points","break_points_converted","first_serve_percentage"] },
];

// ─── Ice Hockey ────────────────────────────────────────────────────────
export const ICE_HOCKEY_GROUPS = [
  {
    title: "Todos",
    keys: ["h2h","totals","puck_line","spreads","handicap","team_totals","double_chance","winning_margin","first_to_score","period_1_h2h","period_2_h2h","period_3_h2h","period_1_totals","period_2_totals","period_3_totals","next_goal_scorer","goal_scorer","first_goal_scorer","hat_trick","empty_net_goal","power_play","power_play_goals","shots_on_goal","shots_on_goal_period","penalty_minutes","puck_possession","highest_scoring_period"]
  },
  { title: "Vencedor",   keys: ["h2h","double_chance","winning_margin"] },
  { title: "Totais",     keys: ["totals","team_totals","period_totals","period_1_totals","period_2_totals","period_3_totals"] },
  { title: "Puck Line",  keys: ["puck_line","spreads","handicap"] },
  { title: "1ºPer.",     keys: ["period_1_h2h","period_1_totals"] },
  { title: "2ºPer.",     keys: ["period_2_h2h","period_2_totals"] },
  { title: "3ºPer.",     keys: ["period_3_h2h","period_3_totals"] },
  { title: "Marcador",   keys: ["next_goal_scorer","goal_scorer","first_goal_scorer","hat_trick","empty_net_goal"] },
  { title: "Especiais",  keys: ["power_play","power_play_goals","shots_on_goal","shots_on_goal_period","penalty_minutes","puck_possession","highest_scoring_period","first_to_score"] },
];

// ─── Baseball ──────────────────────────────────────────────────────────
export const BASEBALL_GROUPS = [
  {
    title: "Todos",
    keys: ["h2h","totals","run_line","spreads","handicap","team_totals","extra_innings","winning_margin","nrfi","yrfi","first_inning_run","first_inning_h2h","first_inning_totals","result_1st_inning","inning_winner","inning_h2h","innings_h2h","inning_totals","innings_totals","race_to","race_to_runs","run_range","run_total_range","player_runs","player_hits","player_home_runs","player_rbi","player_total_bases","player_stolen_bases","player_singles","player_doubles","player_triples","player_strikeouts","player_pitcher_strikeouts","player_hits_allowed","player_earned_runs","player_outs","player_walks","player_pitch_count"]
  },
  { title: "Resultado",  keys: ["h2h","run_line","spreads","handicap","extra_innings","winning_margin"] },
  { title: "Corridas",   keys: ["totals","team_totals","run_range","run_total_range","race_to","race_to_runs"] },
  { title: "1º Inning",  keys: ["nrfi","yrfi","first_inning_run","first_inning_h2h","first_inning_totals","result_1st_inning"] },
  { title: "Innings",    keys: ["inning_winner","inning_h2h","innings_h2h","inning_totals","innings_totals"] },
  { title: "Rebatedor",  keys: ["player_hits","player_home_runs","player_rbi","player_total_bases","player_stolen_bases","player_singles","player_doubles","player_triples","player_runs"] },
  { title: "Pitcher",    keys: ["player_strikeouts","player_pitcher_strikeouts","player_hits_allowed","player_earned_runs","player_outs","player_walks","player_pitch_count"] },
];

// ─── Volleyball ────────────────────────────────────────────────────────
export const VOLLEYBALL_GROUPS = [
  { title: "Mercado Base",       keys: ["h2h","spreads","handicap","totals"] },
  { title: "Sets",               keys: ["total_sets","over_under_sets","sets_h2h","sets_winner","sets_handicap","correct_score"] },
  { title: "Pontos",             keys: ["total_points","set_total_points","first_set_total","second_set_total","third_set_total","fourth_set_total","fifth_set_total","point_handicap"] },
  { title: "Temporais",          keys: ["first_set_winner","second_set_winner","third_set_winner","fourth_set_winner","fifth_set_winner","to_win_a_set"] },
  { title: "Handicaps",          keys: ["sets_handicap","point_handicap","winning_margin"] },
];

// ─── AFL ───────────────────────────────────────────────────────────────
export const AFL_GROUPS = [
  { title: "Mercado Base",       keys: ["h2h","spreads","handicap","totals"] },
  { title: "Resultado",          keys: ["double_chance","winning_margin","winning_margin_5+","half_time_full_time"] },
  { title: "Pontos",             keys: ["team_totals","race_to","highest_scoring_quarter","first_to_score"] },
  { title: "Temporais",          keys: ["quarters_h2h","quarters_totals","halves_h2h","halves_totals"] },
  { title: "Handicaps",          keys: ["handicap","winning_margin","quarter_handicap"] },
];

// ─── Formula 1 ─────────────────────────────────────────────────────────
export const FORMULA1_GROUPS = [
  { title: "Corrida",    keys: ["race_winner","podium_finish","h2h","top_3_finish","top_5_finish","top_10_finish"] },
  { title: "Qualif.",    keys: ["pole_position","head_to_head_drivers","fastest_lap"] },
  { title: "Especiais",  keys: ["safety_car","first_lap_leader","retirement","constructor_winner"] },
];

// ─── American Football ─────────────────────────────────────────────────
export const AMERICAN_FOOTBALL_GROUPS = [
  { title: "Mercado Base",   keys: ["h2h","spreads","handicap","totals"] },
  { title: "Resultado",      keys: ["double_chance","winning_margin","quarter_winner","half_time_full_time"] },
  { title: "Pontos",         keys: ["team_totals","first_to_score","quarters_totals","halves_totals"] },
  { title: "Jogadores",      keys: ["player_yards","player_touchdowns","player_receptions","player_field_goals","player_props"] },
  { title: "Handicaps",      keys: ["spreads","handicap","quarter_handicap","winning_margin"] },
];

// ─── Handball ──────────────────────────────────────────────────────────
export const HANDBALL_GROUPS = [
  { title: "Mercado Base",   keys: ["h2h","spreads","handicap","totals"] },
  { title: "Resultado",      keys: ["h2h","halves_h2h","half_time_full_time","winning_margin"] },
  { title: "Golos",          keys: ["totals","team_totals","goals_range","race_to","halves_totals"] },
  { title: "Temporais",      keys: ["halves_h2h","halves_totals","race_to","highest_scoring_half"] },
  { title: "Handicaps",      keys: ["handicap","spreads","half_handicap","winning_margin"] },
];

// ─── MMA ───────────────────────────────────────────────────────────────
export const MMA_GROUPS = [
  { title: "Mercado Base",   keys: ["h2h","totals","method_of_victory"] },
  { title: "Rondas",         keys: ["totals","exact_winning_round","will_fight_go_the_distance","fight_duration"] },
  { title: "Performance",    keys: ["method_of_victory","total_knockdowns","total_submissions","first_round_finish"] },
  { title: "Handicaps",      keys: ["round_handicap","point_spread","handicap"] },
];

// ─── Rugby ─────────────────────────────────────────────────────────────
export const RUGBY_GROUPS = [
  { title: "Mercado Base",   keys: ["h2h","totals","handicap"] },
  { title: "Resultado",      keys: ["h2h","winning_margin","double_chance","half_time_full_time"] },
  { title: "Pontos",         keys: ["team_totals","race_to","first_to_score"] },
  { title: "Tries",          keys: ["player_tries","total_tries","first_try_scorer"] },
  { title: "Handicaps",      keys: ["handicap","alternative_handicap","winning_margin"] },
];
