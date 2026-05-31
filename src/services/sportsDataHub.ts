import type { Match } from '../types/sports';

function isLeagueBlocked(name: string): boolean {
  const n = name.toLowerCase();

  const femaleKeywords = ['women', 'feminino', 'feminina', 'feminine', 'womens'];
  if (femaleKeywords.some((k) => n.includes(k))) return true;

  const youthKeywords = [
    'u17',
    'u18',
    'u19',
    'u20',
    'u21',
    'u23',
    'youth',
    'junior',
    'júnior',
    'juniors',
    'sub-17',
    'sub-18',
    'sub-19',
    'sub-20',
    'sub-21',
    'sub-23',
  ];
  if (youthKeywords.some((k) => n.includes(k))) return true;

  const reserveKeywords = ['reserve', 'reserves', 'b team', 'b-team', 'ii', 'iii'];
  if (reserveKeywords.some((k) => n.includes(k))) return true;

  const friendlyKeywords = ['friendly', 'amistoso', 'club friendlies', 'friendlies'];
  if (friendlyKeywords.some((k) => n.includes(k))) return true;

  return false;
}

const LIVE_CACHE_TTL = 5 * 1000;
const UPCOMING_CACHE_TTL = 30 * 1000;
const MATCH_DETAILS_CACHE_TTL = 10 * 60 * 1000;
const cache = new Map<string, { data: any; timestamp: number }>();

function getCached(key: string, ttl: number) {
  const cached = cache.get(key);
  if (cached && Date.now() - cached.timestamp < ttl) {
    return cached.data;
  }
  return null;
}

function setCache(key: string, data: any) {
  cache.set(key, { data, timestamp: Date.now() });
}

function sportToDisplay(sport: string): string {
  const s = String(sport || '').toLowerCase();
  if (s === 'soccer') return 'Futebol';
  if (s === 'basketball' || s === 'nba') return 'Basquetebol';
  if (s === 'baseball') return 'Basebol';
  if (s === 'ice-hockey') return 'Hóquei';
  if (s === 'american-football') return 'NFL';
  if (s === 'handball') return 'Handebol';
  if (s === 'volleyball') return 'Voleibol';
  if (s === 'rugby') return 'Rúgbi';
  return sport || 'Futebol';
}

function normalizeSportKey(key: string): string {
  const s = String(key || '').toLowerCase().trim();
  if (s === 'all' || !s) return 'all';
  if (s === 'football' || s === 'futebol') return 'soccer';
  if (s === 'icehockey' || s === 'hockey') return 'ice-hockey';
  if (s === 'americanfootball' || s === 'nfl' || s === 'futebol-americano' || s === 'futebol americano') return 'american-football';
  return s;
}

function formatKickoffTime(dateStr: string): string {
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return '--:--';
  const h = String(d.getHours()).padStart(2, '0');
  const m = String(d.getMinutes()).padStart(2, '0');
  return `${h}:${m}`;
}

function toMatch(ev: any): Match | null {
  const id = String(ev?.external_event_id || ev?.id || '');
  if (!id) return null;
  const homeTeam = String(ev?.home_team || '');
  const awayTeam = String(ev?.away_team || '');
  if (!homeTeam || !awayTeam) return null;

  const isLive = Boolean(Number(ev?.is_live || 0) === 1);
  const statusShort = String(ev?.fixture?.status?.short || ev?.status || '');
  const elapsed = typeof ev?.elapsed === 'number' ? ev.elapsed : Number(ev?.fixture?.status?.elapsed || 0) || 0;
  const timer = String(ev?.timer || ev?.fixture?.status?.timer || '').trim();

  const goalsHome = ev?.goals?.home ?? ev?.score?.home ?? null;
  const goalsAway = ev?.goals?.away ?? ev?.score?.away ?? null;
  const homeScore = typeof goalsHome === 'number' ? goalsHome : (goalsHome != null ? Number(goalsHome) : undefined);
  const awayScore = typeof goalsAway === 'number' ? goalsAway : (goalsAway != null ? Number(goalsAway) : undefined);

  const homeOdd = Number(ev?.home_odd || 0);
  const awayOdd = Number(ev?.away_odd || 0);
  const drawOdd = Number(ev?.draw_odd || 0);
  const hasOdds = homeOdd > 1.01 && awayOdd > 1.01;
  if (!hasOdds) return null;

  const startTime = String(ev?.event_date || ev?.fixture?.date || '');
  const time = isLive
    ? (timer || (elapsed > 0 ? `${elapsed}'` : 'AO VIVO'))
    : formatKickoffTime(startTime);

  return {
    id,
    fixtureId: (() => {
      const raw = id.includes('_') ? id.split('_').slice(1).join('_') : id;
      const n = parseInt(raw, 10);
      return Number.isFinite(n) ? n : undefined;
    })(),
    sport: sportToDisplay(String(ev?.sport || 'soccer')),
    league: String(ev?.league || ''),
    country: String(ev?.country || ''),
    homeTeam,
    awayTeam,
    homeScore: homeScore ?? undefined,
    awayScore: awayScore ?? undefined,
    status: String(ev?.status || statusShort || ''),
    statusShort,
    startTime,
    time,
    elapsed: elapsed || undefined,
    period: statusShort || undefined,
    isLive,
    homeTeamLogo: String(ev?.home_team_logo || ''),
    awayTeamLogo: String(ev?.away_team_logo || ''),
    odds: {
      home: homeOdd,
      draw: drawOdd > 1.01 ? drawOdd : 0,
      away: awayOdd,
    },
  };
}

// ✅ Buscar jogos ao vivo - APENAS DADOS REAIS
export async function getLiveMatches(sportKey?: string): Promise<Match[]> {
  const cacheKey = `live-${sportKey || 'all'}`;
  const cached = getCached(cacheKey, LIVE_CACHE_TTL);
  if (cached) return cached;

  try {
    const sportParam = normalizeSportKey(sportKey || 'all');
    const url = `/api/events/by-sport?sports=${encodeURIComponent(sportParam)}&include=odds&realtime=1&only=live&days=0&requireOdds=1`;
    const res = await fetch(url, { cache: 'no-store' });
    const data: any = await res.json().catch(() => null);
    const live = Array.isArray(data?.live) ? data.live : [];

    const normalized = live
      .filter((m: any) => !isLeagueBlocked(String(m?.league || '')))
      .map(toMatch)
      .filter(Boolean) as Match[];

    setCache(cacheKey, normalized);
    return normalized;
  } catch (error) {
    console.error('❌ sportsDataHub: Erro ao buscar jogos ao vivo da API:', error);
    return [];
  }
}

// ✅ Buscar pré-jogos - APENAS DADOS REAIS
export async function getUpcomingMatches(sportKey?: string): Promise<Match[]> {
  const cacheKey = `upcoming-${sportKey || 'all'}`;
  const cached = getCached(cacheKey, UPCOMING_CACHE_TTL);
  if (cached) return cached;

  try {
    const sportParam = normalizeSportKey(sportKey || 'all');
    const days = 7;
    const url = `/api/events/by-sport?sports=${encodeURIComponent(sportParam)}&include=odds&realtime=0&only=pregame&days=${days}&requireOdds=1`;
    const res = await fetch(url, { cache: 'no-store' });
    const data: any = await res.json().catch(() => null);
    const pre = Array.isArray(data?.pregame) ? data.pregame : [];

    const normalized = pre
      .filter((m: any) => !isLeagueBlocked(String(m?.league || '')))
      .map(toMatch)
      .filter(Boolean) as Match[];

    setCache(cacheKey, normalized);
    return normalized;
  } catch (error) {
    console.error('❌ sportsDataHub: Erro ao buscar pré-jogos da API:', error);
    return [];
  }
}

// ✅ Buscar detalhes de um jogo específico
export async function getMatchDetails(matchId: string): Promise<Match | null> {
  const cacheKey = `match-details-${matchId}`;
  const cached = getCached(cacheKey, MATCH_DETAILS_CACHE_TTL);
  if (cached) {
    console.log(`✅ Cache: Detalhes do jogo ${matchId}`);
    return cached;
  }

  try {
    console.log(`🔍 Buscando detalhes do jogo ${matchId}...`);
    
    // Buscar em jogos ao vivo
    const liveMatches = await getLiveMatches();
    const liveMatch = liveMatches.find(m => String(m.id) === matchId);
    
    if (liveMatch) {
      console.log(`✅ Jogo encontrado nos jogos ao vivo: ${liveMatch.homeTeam} vs ${liveMatch.awayTeam}`);
      setCache(cacheKey, liveMatch);
      return liveMatch;
    }
    
    // Buscar em pré-jogos
    const upcomingMatches = await getUpcomingMatches();
    const upcomingMatch = upcomingMatches.find(m => String(m.id) === matchId);
    
    if (upcomingMatch) {
      console.log(`✅ Jogo encontrado nos pré-jogos: ${upcomingMatch.homeTeam} vs ${upcomingMatch.awayTeam}`);
      setCache(cacheKey, upcomingMatch);
      return upcomingMatch;
    }
    
    console.warn(`⚠️ Jogo ${matchId} não encontrado`);
    return null;
  } catch (error) {
    console.error(`❌ Erro ao buscar detalhes do jogo ${matchId}:`, error);
    return null;
  }
}

// Buscar detalhes do jogo (sob demanda) - DEPRECATED
export async function fetchMatchDetails(matchId: string): Promise<any> {
  console.warn('⚠️ fetchMatchDetails está deprecated, use getMatchDetails');
  return getMatchDetails(matchId);
}

// Exportar como objeto para compatibilidade
export const sportsDataHub = {
  getLiveMatches,
  getUpcomingMatches,
  getMatchDetails,
  fetchMatchDetails
};
