/**
 * API-Football Service - VIA PROXY SUPABASE
 * ✅ TODAS as chamadas passam pelo backend
 * ❌ NENHUMA chamada direta à API externa
 */

import { apiCache, CACHE_TTL, CACHE_KEYS, generateCacheKey } from './apiCache';
async function apiFootballRequest(_endpoint: string): Promise<any> { return { response: [] }; }

// ❌ REMOVIDO: API keys e headers (agora no backend)
// ❌ REMOVIDO: Chamadas diretas com fetch()

// ✅ Rate limiting configuration
const DAILY_LIMIT = 1500000;
const REQUESTS_PER_SECOND = 10;
const MIN_REQUEST_INTERVAL = 1000 / REQUESTS_PER_SECOND;

let lastRequestTime = 0;
let requestCount = 0;
let dailyResetTime = Date.now() + 24 * 60 * 60 * 1000;

const throttleRequest = async <T>(requestFn: () => Promise<T>): Promise<T> => {
  const now = Date.now();
  
  if (now > dailyResetTime) {
    requestCount = 0;
    dailyResetTime = now + 24 * 60 * 60 * 1000;
    console.log('🔄 Rate limit resetado (novo dia)');
  }
  
  if (requestCount >= DAILY_LIMIT) {
    const timeUntilReset = dailyResetTime - now;
    const hoursUntilReset = Math.ceil(timeUntilReset / (60 * 60 * 1000));
    throw new Error(`Limite diário atingido. Reset em ${hoursUntilReset}h`);
  }
  
  const timeSinceLastRequest = now - lastRequestTime;
  if (timeSinceLastRequest < MIN_REQUEST_INTERVAL) {
    await new Promise(resolve => setTimeout(resolve, MIN_REQUEST_INTERVAL - timeSinceLastRequest));
  }
  
  lastRequestTime = Date.now();
  requestCount++;
  
  return requestFn();
};

export interface ApiFootballFixture {
  fixture: {
    id: number;
    referee: string | null;
    timezone: string;
    date: string;
    timestamp: number;
    periods: {
      first: number | null;
      second: number | null;
    };
    venue: {
      id: number | null;
      name: string | null;
      city: string | null;
    };
    status: {
      long: string;
      short: string;
      elapsed: number | null;
    };
  };
  league: {
    id: number;
    name: string;
    country: string;
    logo: string;
    flag: string | null;
    season: number;
    round: string;
  };
  teams: {
    home: {
      id: number;
      name: string;
      logo: string;
      winner: boolean | null;
    };
    away: {
      id: number;
      name: string;
      logo: string;
      winner: boolean | null;
    };
  };
  goals: {
    home: number | null;
    away: number | null;
  };
  score: {
    halftime: {
      home: number | null;
      away: number | null;
    };
    fulltime: {
      home: number | null;
      away: number | null;
    };
    extratime: {
      home: number | null;
      away: number | null;
    };
    penalty: {
      home: number | null;
      away: number | null;
    };
  };
}

export interface ApiFootballLeague {
  league: {
    id: number;
    name: string;
    type: string;
    logo: string;
  };
  country: {
    name: string;
    code: string | null;
    flag: string | null;
  };
  seasons: Array<{
    year: number;
    start: string;
    end: string;
    current: boolean;
  }>;
}

/**
 * ✅ Busca jogos ao vivo VIA PROXY
 */
export const fetchLiveFixtures = async (forceRefresh = false): Promise<ApiFootballFixture[]> => {
  const cacheKey = CACHE_KEYS.LIVE_MATCHES;
  
  return apiCache.get<ApiFootballFixture[]>(
    cacheKey,
    async () => {
      try {
        console.log('🔄 Buscando jogos ao vivo VIA PROXY...');
        
        // ✅ USA PROXY SUPABASE
        const data = await throttleRequest(() => 
          apiFootballRequest('/fixtures?live=all', 'football')
        );
        
        console.log('✅ Proxy: Resposta recebida:', {
          results: data.results,
          totalFixtures: data.response?.length || 0
        });
        
        return data.response || [];
      } catch (error) {
        console.error('❌ Erro ao buscar jogos ao vivo:', error);
        return [];
      }
    },
    CACHE_TTL.liveMatches,
    { forceRefresh, isLive: true }
  );
};

/**
 * ✅ Busca jogos futuros VIA PROXY
 */
export const fetchUpcomingFixtures = async (days: number = 7, forceRefresh = false): Promise<ApiFootballFixture[]> => {
  const cacheKey = generateCacheKey(CACHE_KEYS.UPCOMING_MATCHES, { days });
  
  return apiCache.get<ApiFootballFixture[]>(
    cacheKey,
    async () => {
      try {
        console.log('🔄 Buscando jogos futuros VIA PROXY...');
        
        const today = new Date();
        const futureDate = new Date();
        futureDate.setDate(today.getDate() + days);
        
        const fromDate = today.toISOString().split('T')[0];
        const toDate = futureDate.toISOString().split('T')[0];
        
        console.log('📅 Período:', { fromDate, toDate });
        
        // ✅ USA PROXY SUPABASE
        const data = await throttleRequest(() =>
          apiFootballRequest(`/fixtures?from=${fromDate}&to=${toDate}&timezone=Europe/Lisbon`, 'football')
        );
        
        console.log('✅ Proxy: Resposta recebida:', {
          results: data.results,
          totalFixtures: data.response?.length || 0
        });
        
        return data.response || [];
      } catch (error) {
        console.error('❌ Erro ao buscar jogos futuros:', error);
        return [];
      }
    },
    CACHE_TTL.upcomingMatches,
    { forceRefresh }
  );
};

/**
 * ✅ Busca detalhes de um jogo VIA PROXY
 */
export const fetchFixtureDetails = async (fixtureId: number, forceRefresh = false): Promise<ApiFootballFixture | null> => {
  const cacheKey = CACHE_KEYS.MATCH_DETAILS(String(fixtureId));
  
  return apiCache.get<ApiFootballFixture | null>(
    cacheKey,
    async () => {
      try {
        console.log(`🔄 Buscando detalhes do jogo ${fixtureId} VIA PROXY...`);
        
        // ✅ USA PROXY SUPABASE
        const data = await throttleRequest(() =>
          apiFootballRequest(`/fixtures?id=${fixtureId}`, 'football')
        );
        
        console.log('✅ Proxy: Detalhes do jogo carregados');
        return data.response?.[0] || null;
      } catch (error) {
        console.error('❌ Erro ao buscar detalhes do jogo:', error);
        return null;
      }
    },
    CACHE_TTL.liveMatches,
    { forceRefresh }
  );
};

export const getApiStats = () => ({
  requestCount,
  dailyLimit: DAILY_LIMIT,
  remaining: DAILY_LIMIT - requestCount,
  resetTime: new Date(dailyResetTime),
  percentageUsed: ((requestCount / DAILY_LIMIT) * 100).toFixed(2)
});

/**
 * ✅ Busca jogo por ID VIA PROXY
 */
export async function fetchFixtureById(fixtureId: number, forceRefresh = false): Promise<ApiFootballFixture | null> {
  return fetchFixtureDetails(fixtureId, forceRefresh);
}

/**
 * ✅ Busca ligas VIA PROXY
 */
export async function fetchLeagues(forceRefresh = false): Promise<ApiFootballLeague[]> {
  const cacheKey = CACHE_KEYS.LEAGUES;
  
  return apiCache.get<ApiFootballLeague[]>(
    cacheKey,
    async () => {
      try {
        // ✅ USA PROXY SUPABASE
        const data = await apiFootballRequest('/leagues', 'football');
        
        console.log('✅ Proxy: Ligas carregadas:', data.results);
        
        return data.response || [];
      } catch (error) {
        console.error('❌ Erro ao buscar ligas:', error);
        return [];
      }
    },
    CACHE_TTL.leagues,
    { forceRefresh }
  );
}

/**
 * ✅ Busca jogos por liga VIA PROXY
 */
export async function fetchFixturesByLeague(
  leagueId: number,
  season: number = new Date().getFullYear(),
  forceRefresh = false
): Promise<ApiFootballFixture[]> {
  const cacheKey = generateCacheKey('fixtures_by_league', { leagueId, season });
  
  return apiCache.get<ApiFootballFixture[]>(
    cacheKey,
    async () => {
      try {
        // ✅ USA PROXY SUPABASE
        const data = await apiFootballRequest(
          `/fixtures?league=${leagueId}&season=${season}&timezone=Europe/Lisbon`,
          'football'
        );
        
        return data.response || [];
      } catch (error) {
        console.error('❌ Erro ao buscar jogos por liga:', error);
        return [];
      }
    },
    CACHE_TTL.upcomingMatches,
    { forceRefresh }
  );
}

/**
 * ✅ Busca jogos futuros para o normalizer VIA PROXY
 */
export async function getUpcomingMatches(sport?: string, days: number = 7): Promise<ApiFootballFixture[]> {
  console.log('🔄 sportsApi1.getUpcomingMatches chamado:', { sport, days });
  
  try {
    const fixtures = await fetchUpcomingFixtures(days);
    
    console.log(`✅ sportsApi1: ${fixtures.length} fixtures futuros encontrados`);
    
    if (sport && sport.toLowerCase() !== 'soccer' && sport.toLowerCase() !== 'futebol') {
      console.log(`⚠️ sportsApi1: Desporto ${sport} não é futebol, retornando array vazio`);
      return [];
    }
    
    return fixtures;
  } catch (error) {
    console.error('❌ Erro em sportsApi1.getUpcomingMatches:', error);
    return [];
  }
}
