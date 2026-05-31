
/**
 * ✅ SERVIÇO DE LOGOS OFICIAIS VIA ESPN API
 * - Logos oficiais de NCAA Basketball, Baseball, Football
 * - Logos de NBA, NFL, MLB, NHL
 * - Cache agressivo em memória e IndexedDB
 */

// ============================================
// CACHE DE LOGOS EM MEMÓRIA
// ============================================

interface LogoCache {
  url: string;
  timestamp: number;
}

const memoryLogoCache = new Map<string, LogoCache>();
const LOGO_CACHE_TTL = 24 * 60 * 60 * 1000; // 24 horas

// ============================================
// INDEXEDDB PARA PERSISTÊNCIA
// ============================================

const DB_NAME = 'ESPNLogosDB';
const STORE_NAME = 'logos';
const DB_VERSION = 1;

let dbInstance: IDBDatabase | null = null;

async function initLogoDB(): Promise<IDBDatabase> {
  if (dbInstance) return dbInstance;

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);

    request.onsuccess = () => {
      dbInstance = request.result;
      resolve(dbInstance);
    };

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'key' });
        store.createIndex('timestamp', 'timestamp', { unique: false });
      }
    };
  });
}

async function getLogoFromDB(key: string): Promise<string | null> {
  try {
    const db = await initLogoDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const req = tx.objectStore(STORE_NAME).get(key);
      req.onsuccess = () => {
        const result = req.result;
        if (result && Date.now() - result.timestamp < LOGO_CACHE_TTL) {
          resolve(result.url);
        } else {
          resolve(null);
        }
      };
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

async function saveLogoToDB(key: string, url: string): Promise<void> {
  try {
    const db = await initLogoDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put({
      key,
      url,
      timestamp: Date.now(),
    });
  } catch {
    // Ignorar erros
  }
}

// ============================================
// NORMALIZAÇÃO DE NOMES
// ============================================

function normalizeTeamName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[.,\-_()'"]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// ============================================
// CACHE DE EQUIPAS POR LIGA ESPN
// ============================================

interface ESPNTeam {
  id: string;
  name: string;
  displayName: string;
  abbreviation: string;
  logo: string;
  alternateNames?: string[];
}

const espnTeamsCache = new Map<string, ESPNTeam[]>();
const espnCacheTimestamp = new Map<string, number>();
const ESPN_CACHE_TTL = 12 * 60 * 60 * 1000; // 12 horas

// ✅ ENDPOINTS ESPN POR DESPORTO/LIGA
const ESPN_ENDPOINTS: Record<string, string> = {
  // NCAA Basketball
  'ncaa_basketball': 'https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/teams?limit=500',
  'ncaa_womens_basketball': 'https://site.api.espn.com/apis/site/v2/sports/basketball/womens-college-basketball/teams?limit=500',
  
  // NCAA Baseball
  'ncaa_baseball': 'https://site.api.espn.com/apis/site/v2/sports/baseball/college-baseball/teams?limit=500',
  
  // NCAA Football
  'ncaa_football': 'https://site.api.espn.com/apis/site/v2/sports/football/college-football/teams?limit=500',
  
  // NBA
  'nba': 'https://site.api.espn.com/apis/site/v2/sports/basketball/nba/teams?limit=50',
  'wnba': 'https://site.api.espn.com/apis/site/v2/sports/basketball/wnba/teams?limit=50',
  
  // NFL
  'nfl': 'https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams?limit=50',
  
  // MLB
  'mlb': 'https://site.api.espn.com/apis/site/v2/sports/baseball/mlb/teams?limit=50',
  
  // NHL
  'nhl': 'https://site.api.espn.com/apis/site/v2/sports/hockey/nhl/teams?limit=50',
  
  // MLS
  'mls': 'https://site.api.espn.com/apis/site/v2/sports/soccer/usa.1/teams?limit=50',
  
  // Premier League
  'premier_league': 'https://site.api.espn.com/apis/site/v2/sports/soccer/eng.1/teams?limit=50',
  
  // La Liga
  'la_liga': 'https://site.api.espn.com/apis/site/v2/sports/soccer/esp.1/teams?limit=50',
  
  // Bundesliga
  'bundesliga': 'https://site.api.espn.com/apis/site/v2/sports/soccer/ger.1/teams?limit=50',
  
  // Serie A
  'serie_a': 'https://site.api.espn.com/apis/site/v2/sports/soccer/ita.1/teams?limit=50',
  
  // Ligue 1
  'ligue_1': 'https://site.api.espn.com/apis/site/v2/sports/soccer/fra.1/teams?limit=50',
  
  // Liga Portugal
  'liga_portugal': 'https://site.api.espn.com/apis/site/v2/sports/soccer/por.1/teams?limit=50',
  
  // Eredivisie
  'eredivisie': 'https://site.api.espn.com/apis/site/v2/sports/soccer/ned.1/teams?limit=50',
  
  // Champions League
  'champions_league': 'https://site.api.espn.com/apis/site/v2/sports/soccer/uefa.champions/teams?limit=100',
  
  // Europa League
  'europa_league': 'https://site.api.espn.com/apis/site/v2/sports/soccer/uefa.europa/teams?limit=100',
  
  // Brasileirão
  'brasileirao': 'https://site.api.espn.com/apis/site/v2/sports/soccer/bra.1/teams?limit=50',
  
  // Liga MX
  'liga_mx': 'https://site.api.espn.com/apis/site/v2/sports/soccer/mex.1/teams?limit=50',
  
  // Argentina
  'argentina': 'https://site.api.espn.com/apis/site/v2/sports/soccer/arg.1/teams?limit=50',
};

// ✅ MAPEAMENTO DE LIGAS PARA ENDPOINTS ESPN
const LEAGUE_TO_ESPN: Record<string, string> = {
  // NCAA
  'ncaa basketball': 'ncaa_basketball',
  'ncaa mens basketball': 'ncaa_basketball',
  'ncaab': 'ncaa_basketball',
  'basketball_ncaab': 'ncaa_basketball',
  'ncaa baseball': 'ncaa_baseball',
  'baseball_ncaa': 'ncaa_baseball',
  'ncaa football': 'ncaa_football',
  'ncaaf': 'ncaa_football',
  'americanfootball_ncaaf': 'ncaa_football',
  
  // Pro US
  'nba': 'nba',
  'basketball_nba': 'nba',
  'wnba': 'wnba',
  'basketball_wnba': 'wnba',
  'nfl': 'nfl',
  'americanfootball_nfl': 'nfl',
  'mlb': 'mlb',
  'baseball_mlb': 'mlb',
  'nhl': 'nhl',
  'icehockey_nhl': 'nhl',
  'mls': 'mls',
  'soccer_usa_mls': 'mls',
  
  // Futebol Europeu
  'premier league': 'premier_league',
  'england premier league': 'premier_league',
  'epl': 'premier_league',
  'soccer_epl': 'premier_league',
  'la liga': 'la_liga',
  'spain la liga': 'la_liga',
  'soccer_spain_la_liga': 'la_liga',
  'bundesliga': 'bundesliga',
  'germany bundesliga': 'bundesliga',
  'soccer_germany_bundesliga': 'bundesliga',
  'serie a': 'serie_a',
  'italy serie a': 'serie_a',
  'soccer_italy_serie_a': 'serie_a',
  'ligue 1': 'ligue_1',
  'france ligue 1': 'ligue_1',
  'soccer_france_ligue_one': 'ligue_1',
  'primeira liga': 'liga_portugal',
  'liga portugal': 'liga_portugal',
  'portugal primeira liga': 'liga_portugal',
  'soccer_portugal_primeira_liga': 'liga_portugal',
  'eredivisie': 'eredivisie',
  'netherlands eredivisie': 'eredivisie',
  'soccer_netherlands_eredivisie': 'eredivisie',
  'champions league': 'champions_league',
  'uefa champions league': 'champions_league',
  'soccer_uefa_champs_league': 'champions_league',
  'europa league': 'europa_league',
  'uefa europa league': 'europa_league',
  'soccer_uefa_europa_league': 'europa_league',
  
  // Américas
  'brasileirão': 'brasileirao',
  'brazil serie a': 'brasileirao',
  'soccer_brazil_campeonato': 'brasileirao',
  'liga mx': 'liga_mx',
  'mexico liga mx': 'liga_mx',
  'soccer_mexico_ligamx': 'liga_mx',
  'liga argentina': 'argentina',
  'argentina primera division': 'argentina',
  'soccer_argentina_primera_division': 'argentina',
};

/**
 * ✅ Buscar equipas de uma liga via ESPN API
 */
async function fetchESPNTeams(leagueKey: string): Promise<ESPNTeam[]> {
  const cacheKey = `espn_${leagueKey}`;
  const cachedTimestamp = espnCacheTimestamp.get(cacheKey);

  if (cachedTimestamp && Date.now() - cachedTimestamp < ESPN_CACHE_TTL) {
    const cached = espnTeamsCache.get(cacheKey);
    if (cached) return cached;
  }

  const endpoint = ESPN_ENDPOINTS[leagueKey];
  if (!endpoint) {
    console.warn(`⚠️ ESPN endpoint não encontrado: ${leagueKey}`);
    return [];
  }

  try {
    console.log(`📡 ESPN API: Buscando equipas de ${leagueKey}...`);
    
    const response = await fetch(endpoint, {
      headers: {
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      console.warn(`⚠️ ESPN API erro: ${response.status}`);
      return [];
    }

    const data = await response.json();
    
    if (!data.sports?.[0]?.leagues?.[0]?.teams) {
      console.warn(`⚠️ ESPN API: Formato inesperado para ${leagueKey}`);
      return [];
    }

    const teams: ESPNTeam[] = data.sports[0].leagues[0].teams
      .map((item: any) => {
        const team = item.team;
        if (!team) return null;

        // Buscar logo (preferir logo principal, depois alternativo)
        let logo = '';
        if (team.logos && team.logos.length > 0) {
          // Preferir logo com fundo transparente
          const defaultLogo = team.logos.find((l: any) => l.rel?.includes('default')) || team.logos[0];
          logo = defaultLogo?.href || '';
        }

        return {
          id: team.id,
          name: team.name,
          displayName: team.displayName,
          abbreviation: team.abbreviation,
          logo,
          alternateNames: team.alternateNames || [],
        };
      })
      .filter((t: ESPNTeam | null): t is ESPNTeam => t !== null && !!t.logo);

    console.log(`✅ ESPN: ${teams.length} equipas carregadas de ${leagueKey}`);

    // Guardar no cache
    espnTeamsCache.set(cacheKey, teams);
    espnCacheTimestamp.set(cacheKey, Date.now());

    // Guardar logos individuais
    for (const team of teams) {
      const keys = [
        normalizeTeamName(team.name),
        normalizeTeamName(team.displayName),
        team.abbreviation.toLowerCase(),
      ];

      for (const key of keys) {
        if (key) {
          memoryLogoCache.set(key, { url: team.logo, timestamp: Date.now() });
          saveLogoToDB(key, team.logo);
        }
      }
    }

    return teams;
  } catch (error) {
    console.warn(`⚠️ ESPN API erro:`, error);
    return [];
  }
}

/**
 * ✅ Encontrar endpoint ESPN baseado no nome da liga
 */
function findESPNEndpoint(league: string): string | null {
  const normalizedLeague = league.toLowerCase().trim();

  // Busca direta
  if (LEAGUE_TO_ESPN[normalizedLeague]) {
    return LEAGUE_TO_ESPN[normalizedLeague];
  }

  // Busca parcial
  for (const [key, value] of Object.entries(LEAGUE_TO_ESPN)) {
    if (normalizedLeague.includes(key) || key.includes(normalizedLeague)) {
      return value;
    }
  }

  // Detecção por palavras-chave
  if (normalizedLeague.includes('ncaa') && normalizedLeague.includes('basket')) {
    return 'ncaa_basketball';
  }
  if (normalizedLeague.includes('ncaa') && normalizedLeague.includes('baseball')) {
    return 'ncaa_baseball';
  }
  if (normalizedLeague.includes('ncaa') && normalizedLeague.includes('football')) {
    return 'ncaa_football';
  }

  return null;
}

/**
 * ✅ Buscar logo de uma equipa via ESPN
 */
export async function getESPNTeamLogo(teamName: string, league?: string): Promise<string | undefined> {
  if (!teamName) return undefined;

  const normalizedName = normalizeTeamName(teamName);

  // 1. Verificar cache em memória
  const memoryCached = memoryLogoCache.get(normalizedName);
  if (memoryCached && Date.now() - memoryCached.timestamp < LOGO_CACHE_TTL) {
    return memoryCached.url;
  }

  // 2. Verificar IndexedDB
  const dbCached = await getLogoFromDB(normalizedName);
  if (dbCached) {
    memoryLogoCache.set(normalizedName, { url: dbCached, timestamp: Date.now() });
    return dbCached;
  }

  // 3. Se temos a liga, buscar equipas da liga
  if (league) {
    const espnKey = findESPNEndpoint(league);
    if (espnKey) {
      const teams = await fetchESPNTeams(espnKey);
      
      // Buscar correspondência
      const matchedTeam = teams.find((t) => {
        const tName = normalizeTeamName(t.name);
        const tDisplay = normalizeTeamName(t.displayName);
        const tAbbr = t.abbreviation.toLowerCase();

        return (
          tName === normalizedName ||
          tDisplay === normalizedName ||
          tAbbr === normalizedName ||
          tName.includes(normalizedName) ||
          normalizedName.includes(tName) ||
          tDisplay.includes(normalizedName) ||
          normalizedName.includes(tDisplay)
        );
      });

      if (matchedTeam?.logo) {
        memoryLogoCache.set(normalizedName, { url: matchedTeam.logo, timestamp: Date.now() });
        saveLogoToDB(normalizedName, matchedTeam.logo);
        return matchedTeam.logo;
      }
    }
  }

  // 4. Buscar em todas as ligas principais
  const priorityLeagues = [
    'ncaa_basketball',
    'ncaa_baseball',
    'ncaa_football',
    'nba',
    'nfl',
    'mlb',
    'nhl',
    'premier_league',
    'la_liga',
    'bundesliga',
    'serie_a',
    'ligue_1',
    'liga_portugal',
    'brasileirao',
  ];

  for (const leagueKey of priorityLeagues) {
    const teams = await fetchESPNTeams(leagueKey);
    
    const matchedTeam = teams.find((t) => {
      const tName = normalizeTeamName(t.name);
      const tDisplay = normalizeTeamName(t.displayName);

      return (
        tName === normalizedName ||
        tDisplay === normalizedName ||
        tName.includes(normalizedName) ||
        normalizedName.includes(tName)
      );
    });

    if (matchedTeam?.logo) {
      memoryLogoCache.set(normalizedName, { url: matchedTeam.logo, timestamp: Date.now() });
      saveLogoToDB(normalizedName, matchedTeam.logo);
      return matchedTeam.logo;
    }
  }

  return undefined;
}

/**
 * ✅ Pré-carregar logos de ligas populares
 */
export async function preloadESPNLogos(): Promise<void> {
  console.log('🔄 Pré-carregando logos ESPN...');

  const priorityLeagues = [
    'ncaa_basketball',
    'ncaa_baseball',
    'nba',
    'nfl',
    'mlb',
    'nhl',
    'premier_league',
    'la_liga',
    'bundesliga',
    'serie_a',
    'liga_portugal',
  ];

  let totalTeams = 0;

  for (const leagueKey of priorityLeagues) {
    try {
      const teams = await fetchESPNTeams(leagueKey);
      totalTeams += teams.length;
      // Pequeno delay para não sobrecarregar
      await new Promise((resolve) => setTimeout(resolve, 200));
    } catch {
      // Continuar
    }
  }

  console.log(`✅ ESPN logos pré-carregados: ${totalTeams} equipas`);
}

/**
 * ✅ Estatísticas do cache
 */
export function getESPNCacheStats() {
  return {
    memoryCacheSize: memoryLogoCache.size,
    espnTeamsCacheSize: espnTeamsCache.size,
    leaguesCached: Array.from(espnTeamsCache.keys()),
  };
}

/**
 * ✅ Limpar cache
 */
export function clearESPNCache(): void {
  memoryLogoCache.clear();
  espnTeamsCache.clear();
  espnCacheTimestamp.clear();
  console.log('🗑️ Cache ESPN limpo');
}

export default {
  getESPNTeamLogo,
  preloadESPNLogos,
  getESPNCacheStats,
  clearESPNCache,
};
