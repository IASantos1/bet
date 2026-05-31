import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

// ✅ Get API key from Supabase secrets
const ODDS_API_KEY = 
  Deno.env.get('THE_ODDS_API_KEY') || 
  Deno.env.get('VITE_THE_ODDS_API_KEY') || 
  '7fcabfb7c8a40f62fc0c54afcf6e1e38';

const BASE_URL = "https://api.the-odds-api.com/v4";

// ✅ MAPEAMENTO COMPLETO DE TODOS OS DESPORTOS
const SUPPORTED_SPORTS: Record<string, string> = {
  // ⚽ FUTEBOL
  'soccer': 'soccer',
  'football': 'soccer',
  'soccer_epl': 'soccer_epl',
  'soccer_spain_la_liga': 'soccer_spain_la_liga',
  'soccer_germany_bundesliga': 'soccer_germany_bundesliga',
  'soccer_italy_serie_a': 'soccer_italy_serie_a',
  'soccer_france_ligue_one': 'soccer_france_ligue_one',
  'soccer_uefa_champs_league': 'soccer_uefa_champs_league',
  'soccer_uefa_europa_league': 'soccer_uefa_europa_league',
  'soccer_uefa_europa_conference_league': 'soccer_uefa_europa_conference_league',
  'soccer_brazil_campeonato': 'soccer_brazil_campeonato',
  'soccer_brazil_serie_b': 'soccer_brazil_serie_b',
  'soccer_portugal_primeira_liga': 'soccer_portugal_primeira_liga',
  'soccer_netherlands_eredivisie': 'soccer_netherlands_eredivisie',
  'soccer_belgium_first_div': 'soccer_belgium_first_div',
  'soccer_turkey_super_league': 'soccer_turkey_super_league',
  'soccer_scotland_premiership': 'soccer_scotland_premiership',
  'soccer_argentina_primera_division': 'soccer_argentina_primera_division',
  'soccer_mexico_ligamx': 'soccer_mexico_ligamx',
  'soccer_usa_mls': 'soccer_usa_mls',
  'soccer_australia_aleague': 'soccer_australia_aleague',
  'soccer_japan_j_league': 'soccer_japan_j_league',
  'soccer_korea_kleague1': 'soccer_korea_kleague1',
  'soccer_denmark_superliga': 'soccer_denmark_superliga',
  'soccer_norway_eliteserien': 'soccer_norway_eliteserien',
  'soccer_sweden_allsvenskan': 'soccer_sweden_allsvenskan',
  'soccer_switzerland_superleague': 'soccer_switzerland_superleague',
  'soccer_austria_bundesliga': 'soccer_austria_bundesliga',
  'soccer_greece_super_league': 'soccer_greece_super_league',
  'soccer_poland_ekstraklasa': 'soccer_poland_ekstraklasa',
  
  // 🏀 BASQUETEBOL
  'basketball': 'basketball_nba',
  'basketball_nba': 'basketball_nba',
  'basketball_euroleague': 'basketball_euroleague',
  'basketball_ncaab': 'basketball_ncaab',
  'basketball_wnba': 'basketball_wnba',
  'basketball_nbl': 'basketball_nbl',
  'basketball_spain_acb': 'basketball_spain_acb',
  'basketball_germany_bbl': 'basketball_germany_bbl',
  'basketball_france_lnb': 'basketball_france_lnb',
  'basketball_italy_lega_a': 'basketball_italy_lega_a',
  'basketball_italy_lega': 'basketball_italy_lega_a',
  'basketball_turkey_bsl': 'basketball_turkey_bsl',
  'basketball_greece_basket_league': 'basketball_greece_basket_league',
  'basketball_china_cba': 'basketball_china_cba',
  
  // 🏒 HÓQUEI NO GELO - EXPANDIDO
  'ice-hockey': 'icehockey_nhl',
  'icehockey': 'icehockey_nhl',
  'ice_hockey': 'icehockey_nhl',
  'icehockeynhl': 'icehockey_nhl',
  'hockey': 'icehockey_nhl',
  'nhl': 'icehockey_nhl',
  'icehockey_nhl': 'icehockey_nhl',
  'icehockey_sweden_hockey_league': 'icehockey_sweden_hockey_league',
  'icehockey_sweden_allsvenskan': 'icehockey_sweden_allsvenskan',
  'icehockey_finland_liiga': 'icehockey_finland_liiga',
  'icehockey_finland_mestis': 'icehockey_finland_mestis',
  'icehockey_khl': 'icehockey_khl',
  'icehockey_russia_khl': 'icehockey_khl',
  'icehockey_ahl': 'icehockey_ahl',
  'icehockey_germany_del': 'icehockey_germany_del',
  'icehockey_switzerland_nla': 'icehockey_switzerland_nla',
  'icehockey_czech_extraliga': 'icehockey_czech_extraliga',
  
  // ⚾ BASEBOL - EXPANDIDO
  'baseball': 'baseball_mlb',
  'baseball_mlb': 'baseball_mlb',
  'mlb': 'baseball_mlb',
  'baseball_mlb_preseason': 'baseball_mlb_preseason',
  'baseball_npb': 'baseball_npb',
  'baseball_kbo': 'baseball_kbo',
  'baseball_ncaa': 'baseball_ncaa',
  
  // 🏉 RUGBY - EXPANDIDO
  'rugby': 'rugbyleague_nrl',
  'rugby-league': 'rugbyleague_nrl',
  'rugby_league': 'rugbyleague_nrl',
  'rugbyleague_nrl': 'rugbyleague_nrl',
  'rugby-union': 'rugbyunion_six_nations',
  'rugby_union': 'rugbyunion_six_nations',
  'rugbyunion_six_nations': 'rugbyunion_six_nations',
  'rugbyunion_super_rugby': 'rugbyunion_super_rugby',
  'rugbyunion_super_rugby_pacific': 'rugbyunion_super_rugby_pacific',
  'rugbyunion_world_cup': 'rugbyunion_world_cup',
  'rugbyunion_premiership': 'rugbyunion_premiership',
  'rugbyunion_top_14': 'rugbyunion_top_14',
  'rugbyunion_united_rugby_championship': 'rugbyunion_united_rugby_championship',
  
  // 🏐 VOLEIBOL - EXPANDIDO
  'volleyball': 'volleyball_brazil_superliga',
  'volleyball_brazil_superliga': 'volleyball_brazil_superliga',
  'volleyball_brazil_superliga_women': 'volleyball_brazil_superliga_women',
  'volleyball_italy_serie_a': 'volleyball_italy_serie_a',
  'volleyball_italy_serie_a_women': 'volleyball_italy_serie_a_women',
  'volleyball_poland_plusliga': 'volleyball_poland_plusliga',
  'volleyball_nations_league': 'volleyball_nations_league',
  'volleyball_nations_league_women': 'volleyball_nations_league_women',
  
  // 🥊 MMA
  'mma': 'mma_mixed_martial_arts',
  'ufc': 'mma_mixed_martial_arts',
  'mma_mixed_martial_arts': 'mma_mixed_martial_arts',
  
  // 🤾 ANDEBOL - EXPANDIDO
  'handball': 'handball_germany_bundesliga',
  'handball_germany_bundesliga': 'handball_germany_bundesliga',
  'handball_france_lnh': 'handball_france_lnh',
  'handball_spain_liga_asobal': 'handball_spain_liga_asobal',
  'handball_denmark_ligaen': 'handball_denmark_ligaen',
  'handball_ehf_champions_league': 'handball_ehf_champions_league',
  
  // 🏈 AFL (Australian Football)
  'aussierules': 'aussierules_afl',
  'afl': 'aussierules_afl',
  'aussierules_afl': 'aussierules_afl',
  
  // 🥊 Boxe
  'boxing': 'boxing_boxing',
  'boxing_boxing': 'boxing_boxing',
  
  // 🏌️ Golf
  'golf': 'golf_pga_championship',
  'golf_pga_championship': 'golf_pga_championship',
  
  // 🏏 Críquete
  'cricket': 'cricket_test_match',
  'cricket_test_match': 'cricket_test_match',
};

serve(async (req) => {
  // ✅ CORS headers
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-requested-with',
    'Access-Control-Max-Age': '86400',
  };

  // ✅ Handle preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { 
      status: 204,
      headers: corsHeaders 
    });
  }

  try {
    const url = new URL(req.url);
    const endpoint = url.searchParams.get('endpoint');
    const sport = url.searchParams.get('sport');

    if (!endpoint) {
      return new Response(
        JSON.stringify({ error: 'Endpoint parameter is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!ODDS_API_KEY) {
      return new Response(
        JSON.stringify({ 
          error: 'THE_ODDS_API_KEY not configured',
          hint: 'Configure the key in Supabase secrets with name "THE_ODDS_API_KEY"'
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ✅ MAPEAMENTO INTELIGENTE DE DESPORTOS
    let mappedSport = sport;
    if (sport) {
      const normalizedSport = sport.toLowerCase().trim();
      console.log(`🔍 Mapeando desporto: "${sport}"`);
      
      // ✅ Busca direta no mapa
      let mapped = SUPPORTED_SPORTS[normalizedSport];
      
      // ✅ Busca sem separadores
      if (!mapped) {
        const sportClean = normalizedSport.replace(/[-_\s]/g, '');
        for (const [key, value] of Object.entries(SUPPORTED_SPORTS)) {
          const keyClean = key.replace(/[-_\s]/g, '').toLowerCase();
          if (keyClean === sportClean) {
            mapped = value;
            break;
          }
        }
      }
      
      // ✅ Detecção inteligente por palavras-chave
      if (!mapped) {
        const sportClean = normalizedSport.replace(/[-_\s]/g, '');
        
        if (sportClean.includes('ice') || sportClean.includes('hockey') || sportClean === 'nhl') {
          mapped = 'icehockey_nhl';
          console.log(`✅ Detectado NHL: ${sport} → ${mapped}`);
        } else if (sportClean.includes('basket') || sportClean === 'nba') {
          mapped = 'basketball_nba';
          console.log(`✅ Detectado NBA: ${sport} → ${mapped}`);
        } else if (sportClean.includes('baseball') || sportClean === 'mlb') {
          mapped = 'baseball_mlb';
          console.log(`✅ Detectado MLB: ${sport} → ${mapped}`);
        } else if (sportClean.includes('soccer') || sportClean.includes('football')) {
          mapped = 'soccer';
          console.log(`✅ Detectado Soccer: ${sport} → ${mapped}`);
        } else if (sportClean.includes('mma') || sportClean.includes('ufc')) {
          mapped = 'mma_mixed_martial_arts';
          console.log(`✅ Detectado MMA: ${sport} → ${mapped}`);
        } else if (sportClean.includes('rugby')) {
          if (sportClean.includes('union')) {
            mapped = 'rugbyunion_six_nations';
          } else {
            mapped = 'rugbyleague_nrl';
          }
          console.log(`✅ Detectado Rugby: ${sport} → ${mapped}`);
        } else if (sportClean.includes('volley')) {
          mapped = 'volleyball_brazil_superliga';
          console.log(`✅ Detectado Volleyball: ${sport} → ${mapped}`);
        } else if (sportClean.includes('hand')) {
          mapped = 'handball_germany_bundesliga';
          console.log(`✅ Detectado Handball: ${sport} → ${mapped}`);
        } else if (sportClean.includes('afl') || sportClean.includes('aussie')) {
          mapped = 'aussierules_afl';
          console.log(`✅ Detectado AFL: ${sport} → ${mapped}`);
        }
      }
      
      // ✅ Busca parcial
      if (!mapped) {
        for (const [key, value] of Object.entries(SUPPORTED_SPORTS)) {
          const keyClean = key.replace(/[-_\s]/g, '').toLowerCase();
          const sportClean = normalizedSport.replace(/[-_\s]/g, '');
          if (keyClean.includes(sportClean) || sportClean.includes(keyClean)) {
            mapped = value;
            console.log(`✅ Mapeamento parcial: ${sport} → ${mapped} (via ${key})`);
            break;
          }
        }
      }
      
      if (mapped) {
        mappedSport = mapped;
        console.log(`✅ Desporto mapeado: ${sport} → ${mappedSport}`);
      } else {
        console.warn(`⚠️ Desporto não mapeado, usando original: ${sport}`);
        mappedSport = sport;
      }
    }

    // Build The Odds API URL
    const apiUrl = new URL(`${BASE_URL}${endpoint}`);
    
    // Add API key
    apiUrl.searchParams.append('apiKey', ODDS_API_KEY);
    
    // Copy all parameters except 'endpoint'
    url.searchParams.forEach((value, key) => {
      if (key !== 'endpoint') {
        if (key === 'sport' && mappedSport) {
          apiUrl.searchParams.append(key, mappedSport);
        } else {
          apiUrl.searchParams.append(key, value);
        }
      }
    });

    console.log(`📡 The Odds API: ${endpoint}`, Object.fromEntries(apiUrl.searchParams));

    // Make request to The Odds API
    const response = await fetch(apiUrl.toString(), {
      headers: {
        'Accept': 'application/json',
      },
    });

    // Check rate limit headers
    const remainingRequests = response.headers.get('x-requests-remaining');
    const usedRequests = response.headers.get('x-requests-used');
    
    if (remainingRequests) {
      console.log(`📊 The Odds API - Remaining: ${remainingRequests}, Used: ${usedRequests}`);
    }

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`❌ The Odds API error: ${response.status} ${response.statusText}`, errorText);
      
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ 
            error: 'Rate limit exceeded',
            rateLimit: true,
            details: errorText 
          }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      return new Response(
        JSON.stringify({ 
          error: `The Odds API returned error: ${response.status}`,
          details: errorText 
        }),
        { status: response.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const data = await response.json();

    console.log(`✅ The Odds API: ${Array.isArray(data) ? data.length : 'N/A'} results for ${mappedSport || 'all'}`);

    return new Response(
      JSON.stringify(data),
      { 
        headers: { 
          ...corsHeaders, 
          'Content-Type': 'application/json',
          'x-requests-remaining': remainingRequests || '0',
          'x-requests-used': usedRequests || '0'
        } 
      }
    );

  } catch (error) {
    console.error('❌ Error in proxy:', error);
    return new Response(
      JSON.stringify({ 
        error: 'Error calling The Odds API',
        details: error instanceof Error ? error.message : 'Unknown error'
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});