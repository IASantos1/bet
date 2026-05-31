// Mapeamento de IDs da API-Football para Keys da The Odds API
// Referência: https://the-odds-api.com/sports-odds-index/soccer-odds/

export const LEAGUE_MAPPING: Record<number, string> = {
  // --- INGLATERRA ---
  39: 'soccer_epl',                 // Premier League
  40: 'soccer_efl_champ',           // Championship
  41: 'soccer_england_league1',     // League One
  42: 'soccer_england_league2',     // League Two

  // --- ESPANHA ---
  140: 'soccer_spain_la_liga',      // La Liga
  141: 'soccer_spain_segunda_division', // La Liga 2

  // --- ALEMANHA ---
  78: 'soccer_germany_bundesliga',  // Bundesliga
  79: 'soccer_germany_bundesliga2', // 2. Bundesliga

  // --- ITÁLIA ---
  135: 'soccer_italy_serie_a',      // Serie A
  136: 'soccer_italy_serie_b',      // Serie B

  // --- FRANÇA ---
  61: 'soccer_france_ligue_one',    // Ligue 1
  62: 'soccer_france_ligue_two',    // Ligue 2

  // --- BRASIL ---
  71: 'soccer_brazil_campeonato',   // Brasileirão Série A
  72: 'soccer_brazil_serie_b',      // Brasileirão Série B

  // --- PORTUGAL ---
  94: 'soccer_portugal_primeira_liga', // Primeira Liga

  // --- HOLANDA ---
  88: 'soccer_netherlands_eredivisie', // Eredivisie

  // --- EUA ---
  253: 'soccer_usa_mls',            // MLS

  // --- INTERNACIONAL ---
  2: 'soccer_uefa_champs_league',   // UEFA Champions League
  3: 'soccer_uefa_europa_league',   // UEFA Europa League
  848: 'soccer_uefa_europa_conference_league', // UEFA Conference League
  
  // --- OUTRAS LIGAS ---
  144: 'soccer_belgium_first_div',  // Jupiler Pro League (Bélgica)
  179: 'soccer_scotland_premiership', // Premiership (Escócia)
  203: 'soccer_turkey_super_lig',   // Süper Lig (Turquia)
  197: 'soccer_greece_super_league', // Super League (Grécia)
  13: 'soccer_argentina_primera_division', // Primera División (Argentina)
  128: 'soccer_australia_aleague',  // A-League (Austrália)
  218: 'soccer_austria_bundesliga', // Bundesliga (Áustria)
  119: 'soccer_denmark_superleague', // Superliga (Dinamarca)
  345: 'soccer_czech_superliga',    // First League (Rep. Checa)
  // Adicione mais mapeamentos conforme necessário
};

export function getOddsApiSportKey(apiFootballLeagueId: number): string | null {
  return LEAGUE_MAPPING[apiFootballLeagueId] || null;
}
