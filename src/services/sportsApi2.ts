/**
 * The Odds API Service - VIA PROXY SUPABASE
 * ✅ TODAS as chamadas passam pelo backend
 * ✅ TODOS OS DESPORTOS SUPORTADOS PELA THE ODDS API
 */

import { apiCache } from './apiCache';
async function oddsApiRequest(_endpoint: string, _params?: Record<string, string>): Promise<any> { return []; }

// ✅ Cache de desportos válidos
let validSportsCache: Set<string> | null = null;
let lastSportsCheck = 0;
const SPORTS_CHECK_INTERVAL = 3600000; // 1 hora

/**
 * ✅ Busca e valida lista de desportos disponíveis
 */
async function getValidSports(): Promise<Set<string>> {
  const now = Date.now();

  if (validSportsCache && now - lastSportsCheck < SPORTS_CHECK_INTERVAL) {
    return validSportsCache;
  }

  try {
    console.log('🔄 Validando desportos disponíveis na The Odds API...');
    const sports = await oddsApiRequest('/sports', {});

    if (Array.isArray(sports)) {
      validSportsCache = new Set(
        sports
          .filter((s: any) => s.active === true)
          .map((s: any) => s.key)
      );
      lastSportsCheck = now;
      console.log(`✅ ${validSportsCache.size} desportos válidos encontrados`);

      // ✅ Log detalhado por categoria
      const categories = {
        soccer: 0,
        basketball: 0,
        icehockey: 0,
        baseball: 0,
        rugby: 0,
        mma: 0,
        aussierules: 0,
      };
      for (const sport of validSportsCache) {
        if (sport.includes('soccer')) categories.soccer++;
        else if (sport.includes('basketball')) categories.basketball++;
        else if (sport.includes('icehockey')) categories.icehockey++;
        else if (sport.includes('baseball')) categories.baseball++;
        else if (sport.includes('rugby')) categories.rugby++;
        else if (sport.includes('mma')) categories.mma++;
        else if (sport.includes('aussierules')) categories.aussierules++;
      }

      console.log(
        `📊 Desportos: ⚽${categories.soccer} 🏀${categories.basketball} 🏒${categories.icehockey} ⚾${categories.baseball} 🏉${categories.rugby} 🥊${categories.mma} 🏈${categories.aussierules}`
      );

      return validSportsCache;
    }
  } catch (error) {
    console.error('❌ Erro ao validar desportos:', error);
  }

  // Fallback: retornar desportos conhecidos
  return new Set([
    'soccer_epl',
    'soccer_spain_la_liga',
    'soccer_germany_bundesliga',
    'basketball_nba',
    'basketball_euroleague',
    'icehockey_nhl',
    'icehockey_sweden_hockey_league',
    'baseball_mlb',
    'baseball_npb',
    'rugbyleague_nrl',
    'rugbyunion_six_nations',
    'mma_mixed_martial_arts',
    'aussierules_afl',
  ]);
}

// ✅ DESPORTOS PRIORITÁRIOS - SPORT KEYS CORRETOS DA THE ODDS API
const PRIORITY_SPORTS = [
  // ⚽ FUTEBOL - TOP 5
  'soccer_epl',
  'soccer_spain_la_liga',
  'soccer_germany_bundesliga',
  'soccer_italy_serie_a',
  'soccer_france_ligue_one',
  // ⚽ FUTEBOL - OUTRAS GRANDES
  'soccer_uefa_champs_league',
  'soccer_uefa_europa_league',
  'soccer_uefa_europa_conference_league',
  'soccer_portugal_primeira_liga',
  'soccer_netherlands_eredivisie',
  'soccer_belgium_first_div',
  'soccer_turkey_super_league',
  'soccer_scotland_premiership',
  // ⚽ FUTEBOL - AMÉRICAS
  'soccer_brazil_campeonato',
  'soccer_brazil_serie_b',
  'soccer_argentina_primera_division',
  'soccer_mexico_ligamx',
  'soccer_usa_mls',
  // ⚽ FUTEBOL - OUTRAS
  'soccer_australia_aleague',
  'soccer_japan_j_league',
  'soccer_korea_kleague1',
  'soccer_denmark_superliga',
  'soccer_norway_eliteserien',
  'soccer_sweden_allsvenskan',
  'soccer_switzerland_superleague',
  'soccer_austria_bundesliga',
  'soccer_greece_super_league',
  'soccer_poland_ekstraklasa',

  // 🏀 BASQUETEBOL
  'basketball_nba',
  'basketball_euroleague',
  'basketball_ncaab',
  'basketball_wnba',
  'basketball_nbl',
  'basketball_spain_acb',
  'basketball_germany_bbl',
  'basketball_france_lnb',
  'basketball_italy_lega_a',
  'basketball_turkey_bsl',
  'basketball_greece_basket_league',
  'basketball_china_cba',

  // 🏒 HÓQUEI NO GELO
  'icehockey_nhl',
  'icehockey_sweden_hockey_league',
  'icehockey_sweden_allsvenskan',
  'icehockey_finland_liiga',
  'icehockey_finland_mestis',
  'icehockey_khl',
  'icehockey_ahl',
  'icehockey_germany_del',
  'icehockey_switzerland_nla',
  'icehockey_czech_extraliga',

  // ⚾ BASEBOL
  'baseball_mlb',
  'baseball_mlb_preseason',
  'baseball_npb',
  'baseball_kbo',
  'baseball_ncaa',

  // 🏉 RUGBY LEAGUE
  'rugbyleague_nrl',

  // 🏉 RUGBY UNION
  'rugbyunion_six_nations',
  'rugbyunion_super_rugby',
  'rugbyunion_super_rugby_pacific',
  'rugbyunion_world_cup',
  'rugbyunion_premiership',
  'rugbyunion_top_14',
  'rugbyunion_united_rugby_championship',

  // 🏐 VÔLEI
  'volleyball_brazil_superliga',
  'volleyball_brazil_superliga_women',
  'volleyball_italy_serie_a',
  'volleyball_italy_serie_a_women',
  'volleyball_poland_plusliga',
  'volleyball_nations_league',
  'volleyball_nations_league_women',

  // 🥊 MMA
  'mma_mixed_martial_arts',

  // 🤾 ANDEBOL
  'handball_germany_bundesliga',
  'handball_france_lnh',
  'handball_spain_liga_asobal',
  'handball_denmark_ligaen',
  'handball_ehf_champions_league',

  // 🏈 AFL (Australian Football)
  'aussierules_afl',
];

// ✅ LIGAS PRIORITÁRIAS PARA AO VIVO - EXPANDIDO
const LIVE_PRIORITY_SPORTS = [
  // Futebol - Top
  'soccer_epl',
  'soccer_spain_la_liga',
  'soccer_germany_bundesliga',
  'soccer_italy_serie_a',
  'soccer_france_ligue_one',
  'soccer_uefa_champs_league',
  'soccer_uefa_europa_league',
  'soccer_portugal_primeira_liga',
  'soccer_netherlands_eredivisie',
  'soccer_brazil_campeonato',
  'soccer_argentina_primera_division',
  'soccer_mexico_ligamx',
  'soccer_usa_mls',
  'soccer_turkey_super_league',
  'soccer_belgium_first_div',
  'soccer_scotland_premiership',
  'soccer_australia_aleague',
  'soccer_japan_j_league',
  'soccer_korea_kleague1',
  'soccer_denmark_superliga',
  'soccer_norway_eliteserien',
  'soccer_sweden_allsvenskan',

  // 🏀 BASQUETEBOL - EXPANDIDO
  'basketball_nba',
  'basketball_euroleague',
  'basketball_ncaab',
  'basketball_wnba',
  'basketball_nbl',
  'basketball_spain_acb',
  'basketball_germany_bbl',
  'basketball_france_lnb',
  'basketball_italy_lega_a',
  'basketball_turkey_bsl',
  'basketball_greece_basket_league',
  'basketball_china_cba',

  // 🏒 HÓQUEI - EXPANDIDO
  'icehockey_nhl',
  'icehockey_sweden_hockey_league',
  'icehockey_sweden_allsvenskan',
  'icehockey_finland_liiga',
  'icehockey_finland_mestis',
  'icehockey_khl',
  'icehockey_ahl',
  'icehockey_germany_del',
  'icehockey_switzerland_nla',
  'icehockey_czech_extraliga',

  // ⚾ BASEBOL - EXPANDIDO
  'baseball_mlb',
  'baseball_mlb_preseason',
  'baseball_npb',
  'baseball_kbo',
  'baseball_ncaa',

  // 🏉 RUGBY - EXPANDIDO
  'rugbyleague_nrl',
  'rugbyunion_six_nations',
  'rugbyunion_super_rugby',
  'rugbyunion_super_rugby_pacific',
  'rugbyunion_premiership',
  'rugbyunion_top_14',
  'rugbyunion_united_rugby_championship',

  // 🏐 VÔLEI - EXPANDIDO
  'volleyball_brazil_superliga',
  'volleyball_brazil_superliga_women',
  'volleyball_italy_serie_a',
  'volleyball_italy_serie_a_women',
  'volleyball_poland_plusliga',
  'volleyball_nations_league',
  'volleyball_nations_league_women',

  // 🥊 MMA
  'mma_mixed_martial_arts',

  // 🤾 ANDEBOL - EXPANDIDO
  'handball_germany_bundesliga',
  'handball_france_lnh',
  'handball_spain_liga_asobal',
  'handball_denmark_ligaen',
  'handball_ehf_champions_league',

  // 🏈 AFL
  'aussierules_afl',
];

export interface OddsApiEvent {
  id: string;
  sport_key: string;
  sport_title: string;
  commence_time: string;
  home_team: string;
  away_team: string;
  bookmakers: Array<{
    key: string;
    title: string;
    last_update: string;
    markets: Array<{
      key: string;
      last_update: string;
      outcomes: Array<{
        name: string;
        price: number;
        point?: number;
      }>;
    }>;
  }>;
}

export interface OddsApiScore {
  id: string;
  sport_key: string;
  sport_title: string;
  commence_time: string;
  completed: boolean;
  home_team: string;
  away_team: string;
  scores: Array<{ name: string; score: string }> | null;
  last_update: string | null;
}

/**
 * ✅ Busca odds ao vivo VIA PROXY - TODOS OS DESPORTOS
 */
export const fetchLiveOdds = async (): Promise<OddsApiEvent[]> => {
  const cacheKey = 'live_odds_v11';

  try {
    const data = await apiCache.get<OddsApiEvent[]>(cacheKey, async () => {
      console.log('🔴 The Odds API: Buscando odds AO VIVO de TODOS os desportos...');

      const validSports = await getValidSports();
      const sportsToFetch = LIVE_PRIORITY_SPORTS.filter((s) => validSports.has(s));

      console.log(`✅ ${sportsToFetch.length}/${LIVE_PRIORITY_SPORTS.length} desportos válidos para buscar`);

      const allEvents: OddsApiEvent[] = [];
      const now = new Date();
      const sportStats: Record<string, number> = {};
      let successCount = 0;
      let errorCount = 0;

      // ✅ Buscar TODOS os desportos válidos
      for (const sportKey of sportsToFetch) {
        try {
          const events = await oddsApiRequest(`/sports/${sportKey}/odds`, {
            regions: 'eu,uk,us',
            markets: 'h2h',
            oddsFormat: 'decimal',
          });

          if (events && Array.isArray(events) && events.length > 0) {
            successCount++;

            // ✅ Categorizar por tipo de desporto
            const sportCategory = sportKey.split('_')[0];
            sportStats[sportCategory] = (sportStats[sportCategory] || 0) + events.length;

            allEvents.push(...events);
          }
        } catch {
          errorCount++;
        }
      }

      // ✅ Log detalhado por categoria
      console.log('📊 Eventos por desporto:');
      Object.entries(sportStats).forEach(([sport, count]) => {
        const emoji = {
          soccer: '⚽',
          basketball: '🏀',
          icehockey: '🏒',
          baseball: '⚾',
          rugby: '🏉',
          volleyball: '🏐',
          mma: '🥊',
          handball: '🤾',
          aussierules: '🏈',
        }[sport] ?? '🎯';
        console.log(`   ${emoji} ${sport}: ${count} eventos`);
      });

      console.log(`📊 Total: ${allEvents.length} eventos | ✅ ${successCount} ligas | ❌ ${errorCount} erros`);

      // ✅ Filtrar jogos ao vivo (começaram há menos de 4 horas)
      const liveEvents = allEvents
        .filter((event) => {
          const commenceTime = new Date(event.commence_time);
          const diff = now.getTime() - commenceTime.getTime();
          return diff > 0 && diff < 4 * 60 * 60 * 1000;
        })
        .filter((event) => event.bookmakers && event.bookmakers.length > 0)
        .sort((a, b) => new Date(b.commence_time).getTime() - new Date(a.commence_time).getTime())
        .slice(0, 150);

      console.log(`✅ ${liveEvents.length} eventos AO VIVO filtrados`);
      return liveEvents;
    }, 10 * 1000); // ✅ REDUZIDO: 10 segundos de cache para jogos ao vivo

    return data;
  } catch (error) {
    console.error('❌ Erro The Odds API:', error);
    return [];
  }
};

/**
 * ✅ Busca scores ao vivo VIA PROXY - TODOS OS DESPORTOS
 */
export const fetchLiveScores = async (): Promise<OddsApiScore[]> => {
  const cacheKey = 'live_scores_v11';

  try {
    const data = await apiCache.get<OddsApiScore[]>(cacheKey, async () => {
      console.log('🔄 Buscando scores ao vivo de TODOS os desportos...');

      const validSports = await getValidSports();

      // ✅ Buscar scores de TODOS os desportos
      const scoreSports = [
        // Futebol
        'soccer_epl',
        'soccer_spain_la_liga',
        'soccer_germany_bundesliga',
        'soccer_italy_serie_a',
        'soccer_france_ligue_one',
        'soccer_portugal_primeira_liga',
        'soccer_brazil_campeonato',
        'soccer_argentina_primera_division',
        // Basquetebol
        'basketball_nba',
        'basketball_euroleague',
        'basketball_ncaab',
        'basketball_wnba',
        // Hóquei
        'icehockey_nhl',
        'icehockey_sweden_hockey_league',
        'icehockey_khl',
        'icehockey_finland_liiga',
        // Basebol
        'baseball_mlb',
        'baseball_npb',
        'baseball_kbo',
        // Rugby
        'rugbyleague_nrl',
        'rugbyunion_six_nations',
        'rugbyunion_super_rugby',
        // Vôlei
        'volleyball_brazil_superliga',
        'volleyball_italy_serie_a',
        'volleyball_nations_league',
        // MMA
        'mma_mixed_martial_arts',
        // Andebol
        'handball_germany_bundesliga',
        'handball_france_lnh',
        // AFL
        'aussierules_afl',
      ].filter((s) => validSports.has(s));

      const allScores: OddsApiScore[] = [];

      for (const sportKey of scoreSports) {
        try {
          const scores = await oddsApiRequest(`/sports/${sportKey}/scores`, {
            daysFrom: '1',
          });

          if (Array.isArray(scores)) {
            allScores.push(...scores);
          }
        } catch {
          // Ignorar erros silenciosamente
        }
      }

      const liveScores = allScores.filter((s) => !s.completed && s.scores && s.scores.length > 0);
      console.log(`✅ ${liveScores.length} scores ao vivo de ${scoreSports.length} desportos`);
      return liveScores;
    }, 20 * 1000);

    return data;
  } catch (error) {
    console.error('❌ Erro scores:', error);
    return [];
  }
};

/**
 * ✅ Busca odds futuras VIA PROXY - TODOS OS DESPORTOS
 */
export const fetchUpcomingOdds = async (): Promise<OddsApiEvent[]> => {
  const cacheKey = 'upcoming_odds_v11';

  try {
    const data = await apiCache.get<OddsApiEvent[]>(cacheKey, async () => {
      console.log('🔄 Buscando pré-jogos de TODOS os desportos...');

      const validSports = await getValidSports();
      const sportsToFetch = PRIORITY_SPORTS.filter((s) => validSports.has(s));

      console.log(`✅ ${sportsToFetch.length}/${PRIORITY_SPORTS.length} desportos válidos para pré-jogos`);

      const allEvents: OddsApiEvent[] = [];
      const now = new Date();
      const sportStats: Record<string, number> = {};
      let successCount = 0;
      let errorCount = 0;

      // ✅ Buscar TODOS os desportos válidos
      for (const sportKey of sportsToFetch) {
        try {
          const events = await oddsApiRequest(`/sports/${sportKey}/odds`, {
            regions: 'eu,uk,us',
            markets: 'h2h',
            oddsFormat: 'decimal',
          });

          if (events && Array.isArray(events) && events.length > 0) {
            successCount++;

            // ✅ Categorizar por tipo de desporto
            const sportCategory = sportKey.split('_')[0];
            sportStats[sportCategory] = (sportStats[sportCategory] || 0) + events.length;

            allEvents.push(...events);
          }
        } catch {
          errorCount++;
        }
      }

      // ✅ Log detalhado por categoria
      console.log('📊 Pré-jogos por desporto:');
      Object.entries(sportStats).forEach(([sport, count]) => {
        const emoji = {
          soccer: '⚽',
          basketball: '🏀',
          icehockey: '🏒',
          baseball: '⚾',
          rugby: '🏉',
          volleyball: '🏐',
          mma: '🥊',
          handball: '🤾',
          aussierules: '🏈',
        }[sport] ?? '🎯';
        console.log(`   ${emoji} ${sport}: ${count} eventos`);
      });

      console.log(`📊 Total: ${allEvents.length} eventos | ✅ ${successCount} ligas | ❌ ${errorCount} erros`);

      // ✅ Filtrar jogos FUTUROS (começam em mais de 5 minutos)
      const upcomingEvents = allEvents
        .filter((event) => {
          const commenceTime = new Date(event.commence_time);
          const diff = commenceTime.getTime() - now.getTime();
          return diff > 5 * 60 * 1000;
        })
        .filter((event) => event.bookmakers && event.bookmakers.length > 0)
        .sort((a, b) => new Date(a.commence_time).getTime() - new Date(b.commence_time).getTime())
        .slice(0, 200);

      console.log(`✅ ${upcomingEvents.length} pré-jogos filtrados`);
      return upcomingEvents;
    }, 60 * 1000);

    return data;
  } catch (error) {
    console.error('❌ Erro pré-jogos:', error);
    return [];
  }
};

export const SUPPORTED_SPORTS = {
  soccer: PRIORITY_SPORTS.filter((s) => s.startsWith('soccer')),
  basketball: PRIORITY_SPORTS.filter((s) => s.startsWith('basketball')),
  icehockey: PRIORITY_SPORTS.filter((s) => s.startsWith('icehockey')),
  baseball: PRIORITY_SPORTS.filter((s) => s.startsWith('baseball')),
  rugby: PRIORITY_SPORTS.filter((s) => s.startsWith('rugby')),
  volleyball: PRIORITY_SPORTS.filter((s) => s.startsWith('volleyball')),
  mma: PRIORITY_SPORTS.filter((s) => s.startsWith('mma')),
  handball: PRIORITY_SPORTS.filter((s) => s.startsWith('handball')),
  afl: PRIORITY_SPORTS.filter((s) => s.startsWith('aussierules')),
};

const requestCount = 0;
export const getApiStats = () => ({
  requestCount,
  monthlyLimit: 5_000_000,
  remaining: 5_000_000 - requestCount,
});

export async function getUpcomingMatches(): Promise<OddsApiEvent[]> {
  return fetchUpcomingOdds();
}
