import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

// ✅ Buscar a chave com múltiplos nomes possíveis
const API_KEY = 
  Deno.env.get('API_FOOTBALL_KEY') || 
  Deno.env.get('VITE_API_FOOTBALL_KEY') || 
  Deno.env.get('Chave de API (API Key)') || 
  'cbef02a7c902f0dfb7260b0b638fffa0';

// ✅ CORRIGIDO: Endpoints corretos para todos os desportos
const API_ENDPOINTS: Record<string, string> = {
  football: "https://v3.football.api-sports.io",
  basketball: "https://v1.basketball.api-sports.io",
  baseball: "https://v1.baseball.api-sports.io",
  hockey: "https://v1.hockey.api-sports.io",
  rugby: "https://v1.rugby.api-sports.io",
  volleyball: "https://v1.volleyball.api-sports.io",
  formula1: "https://v1.formula-1.api-sports.io",
  mma: "https://v1.mma.api-sports.io",
  handball: "https://v1.handball.api-sports.io",
  nfl: "https://v1.american-football.api-sports.io",
  afl: "https://v1.afl.api-sports.io",
};

// ✅ NOVO: Rate limiting POR DESPORTO (1200 requisições/minuto cada)
const rateLimiters: Record<string, { count: number; resetTime: number }> = {};

function checkRateLimit(sport: string): { allowed: boolean; remaining: number; resetIn: number } {
  const now = Date.now();
  const LIMIT_PER_MINUTE = 1200; // 1200 requisições por minuto POR DESPORTO
  const WINDOW_MS = 60 * 1000; // 1 minuto

  // Inicializar rate limiter para este desporto se não existir
  if (!rateLimiters[sport]) {
    rateLimiters[sport] = {
      count: 0,
      resetTime: now + WINDOW_MS,
    };
  }

  const limiter = rateLimiters[sport];

  // Reset se a janela expirou
  if (now >= limiter.resetTime) {
    limiter.count = 0;
    limiter.resetTime = now + WINDOW_MS;
  }

  // Verificar se excedeu o limite
  if (limiter.count >= LIMIT_PER_MINUTE) {
    const resetIn = Math.ceil((limiter.resetTime - now) / 1000);
    return {
      allowed: false,
      remaining: 0,
      resetIn,
    };
  }

  // Incrementar contador
  limiter.count++;

  return {
    allowed: true,
    remaining: LIMIT_PER_MINUTE - limiter.count,
    resetIn: Math.ceil((limiter.resetTime - now) / 1000),
  };
}

serve(async (req) => {
  // ✅ CORS headers completos
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-requested-with',
    'Access-Control-Max-Age': '86400',
  };

  // ✅ Responder a preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { 
      status: 204,
      headers: corsHeaders 
    });
  }

  try {
    const url = new URL(req.url);
    const sport = url.searchParams.get('sport');
    const endpoint = url.searchParams.get('endpoint');

    if (!sport || !endpoint) {
      return new Response(
        JSON.stringify({ error: 'Parâmetros sport e endpoint são obrigatórios' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!API_ENDPOINTS[sport]) {
      return new Response(
        JSON.stringify({ error: `Desporto não suportado: ${sport}` }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ✅ NOVO: Verificar rate limit POR DESPORTO
    const rateLimit = checkRateLimit(sport);
    
    if (!rateLimit.allowed) {
      console.warn(`⚠️ Rate limit excedido para ${sport}: ${rateLimiters[sport].count}/1200`);
      return new Response(
        JSON.stringify({ 
          error: 'Rate limit excedido',
          sport,
          message: `Limite de 1200 requisições/minuto para ${sport} excedido`,
          resetIn: rateLimit.resetIn,
          hint: 'Cada desporto tem seu próprio limite de 1200 req/min'
        }),
        { 
          status: 429,
          headers: { 
            ...corsHeaders, 
            'Content-Type': 'application/json',
            'X-RateLimit-Limit': '1200',
            'X-RateLimit-Remaining': '0',
            'X-RateLimit-Reset': rateLimit.resetIn.toString(),
            'Retry-After': rateLimit.resetIn.toString(),
          } 
        }
      );
    }

    if (!API_KEY) {
      return new Response(
        JSON.stringify({ 
          error: 'API_FOOTBALL_KEY não configurada',
          hint: 'Configure a chave nos secrets do Supabase com o nome "API_FOOTBALL_KEY"'
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Constrói a URL da API-Football
    const baseUrl = API_ENDPOINTS[sport];
    const apiUrl = new URL(`${baseUrl}/${endpoint}`);
    
    // Copia todos os parâmetros exceto sport e endpoint
    url.searchParams.forEach((value, key) => {
      if (key !== 'sport' && key !== 'endpoint') {
        apiUrl.searchParams.append(key, value);
      }
    });

    console.log(`📡 API-Football [${sport}]: ${endpoint} (${rateLimiters[sport].count}/1200)`, Object.fromEntries(apiUrl.searchParams));

    // Faz a requisição à API-Football
    const response = await fetch(apiUrl.toString(), {
      headers: {
        'x-apisports-key': API_KEY,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`❌ API-Football error [${sport}]: ${response.status} ${response.statusText}`, errorText);
      return new Response(
        JSON.stringify({ 
          error: `API-Football retornou erro: ${response.status}`,
          details: errorText 
        }),
        { status: response.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const data = await response.json();

    // Verifica se há erros na resposta
    if (data.errors && Object.keys(data.errors).length > 0) {
      console.error(`❌ API-Football retornou erro [${sport}]:`, data.errors);
      return new Response(
        JSON.stringify({ 
          error: 'API-Football retornou erro',
          details: data.errors 
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`✅ API-Football [${sport}]: ${data.response?.length || 0} resultados (${rateLimit.remaining}/1200 restantes)`);

    return new Response(
      JSON.stringify(data),
      { 
        headers: { 
          ...corsHeaders, 
          'Content-Type': 'application/json',
          'X-RateLimit-Limit': '1200',
          'X-RateLimit-Remaining': rateLimit.remaining.toString(),
          'X-RateLimit-Reset': rateLimit.resetIn.toString(),
        } 
      }
    );

  } catch (error) {
    console.error('❌ Erro no proxy:', error);
    return new Response(
      JSON.stringify({ 
        error: 'Erro ao chamar API-Football',
        details: error instanceof Error ? error.message : 'Erro desconhecido'
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});