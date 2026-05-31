// Store para mapeamento de nomes de times entre API-Football e Odds-API.io
// Estrutura: { [oddsApiName]: apiFootballName } ou vice-versa, ou IDs.
// Vamos mapear: Odds-API Name -> API-Football Name (que é nossa "verdade" para exibição)

export const TEAM_ALIASES: Record<string, string> = {
  // Inglaterra
  'Man United': 'Manchester United',
  'Man City': 'Manchester City',
  'Leicester': 'Leicester City',
  'Leeds': 'Leeds United',
  'Nottm Forest': 'Nottingham Forest',
  'Wolves': 'Wolverhampton Wanderers',
  'Brighton': 'Brighton & Hove Albion',
  'West Ham': 'West Ham United',
  'Spurs': 'Tottenham Hotspur',
  'Newcastle': 'Newcastle United',

  // Espanha
  'Ath Bilbao': 'Athletic Club',
  'Atl. Madrid': 'Atletico Madrid',
  'Celta Vigo': 'Celta de Vigo',
  'Espanyol': 'RCD Espanyol',
  'Betis': 'Real Betis',
  'Real Sociedad': 'Real Sociedad', // Igual
  'Vallecano': 'Rayo Vallecano',
  'Valladolid': 'Real Valladolid',

  // Itália
  'Inter': 'Inter Milan',
  'AC Milan': 'AC Milan', // Igual
  'Verona': 'Hellas Verona',
  
  // França
  'PSG': 'Paris Saint Germain',
  'St Etienne': 'Saint Etienne',
  
  // Alemanha
  'Dortmund': 'Borussia Dortmund',
  'Leverkusen': 'Bayer 04 Leverkusen',
  'M gladbach': 'Borussia Monchengladbach',
  'Mainz': 'Mainz 05',
  'Frankfurt': 'Eintracht Frankfurt',
  'Hertha': 'Hertha Berlin',
  
  // Brasil
  'Athletico-PR': 'Athletico Paranaense',
  'Atletico-MG': 'Atletico Mineiro',
  'Botafogo RJ': 'Botafogo',
  'Corinthians': 'Corinthians',
  'Flamengo': 'Flamengo',
  'Fluminense': 'Fluminense',
  'Palmeiras': 'Palmeiras',
  'Sao Paulo': 'Sao Paulo',
  'Vasco': 'Vasco da Gama',
  
  // Adicione mais conforme descobrir discrepâncias nos logs
};

export function resolveTeamName(oddsApiName: string): string {
  return TEAM_ALIASES[oddsApiName] || oddsApiName;
}
