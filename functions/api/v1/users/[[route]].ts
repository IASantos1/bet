export const onRequest = async ({ request, env }: { request: Request; env: Record<string, string | undefined> }) => {
  const originHeader = request.headers.get('origin') || '';
  const allowedOrigin = env.FRONTEND_ORIGIN || 'https://www.bet62.plus';
  const isPreflight = request.method === 'OPTIONS';
  const corsHeaders: Record<string, string> = {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
  };

  if (isPreflight) {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const url = new URL(request.url);
    const targetOrigin = env.PAGES_PROXY_ORIGIN || env.ORIGIN_URL;
    if (!targetOrigin) {
      return new Response(
        JSON.stringify({ error: 'PAGES_PROXY_ORIGIN não definido' }),
        {
          status: 500,
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders,
          },
        },
      );
    }

    const targetUrl = `${String(targetOrigin)}${url.pathname}`;
    const init: RequestInit = {
      method: request.method,
      headers: new Headers(request.headers),
    };

    if (request.method !== 'GET' && request.method !== 'HEAD') {
      const body = await request.arrayBuffer();
      init.body = body;
    }

    const resp = await fetch(targetUrl, init);
    const respHeaders = new Headers(resp.headers);
    respHeaders.set('Access-Control-Allow-Origin', allowedOrigin);
    respHeaders.set('Access-Control-Allow-Credentials', 'true');
    respHeaders.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    respHeaders.set('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');

    return new Response(resp.body, {
      status: resp.status,
      statusText: resp.statusText,
      headers: respHeaders,
    });
  } catch (err: any) {
    const msg = err?.message || 'Erro ao proxyficar requisição';
    return new Response(JSON.stringify({ error: msg }), {
      status: 502,
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders,
      },
    });
  }
};
