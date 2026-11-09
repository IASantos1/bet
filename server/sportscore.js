// SportScore (sportscore.com): sports data (football, basketball, cricket, tennis) read as data, with
// our API key (not their iframe widgets). The key goes in a header (keyHeader, "Authorization" sends
// "Bearer <key>") or in the query (keyParam); it is never logged nor shown. Answers are cached here for
// `cacheSeconds` so the same read is never made twice in a row.
// First use: the admin's SportScore tab, to see what the live lists, a match and its tracker
// (position / animation data, for the 3D mini fields of tennis, basketball and cricket) really carry.

export const SPORTSCORE_SPORTS = ['football', 'basketball', 'cricket', 'tennis'];
const MAX_BODY = 400_000; // a raw answer shown in the admin is cut there

export function createSportScore({ baseUrl = 'https://sportscore.com/api/widget', apiKey = '', keyHeader = 'X-API-Key', keyParam = '', src = 'bet62', cacheSeconds = 30, timeoutMs = 10_000, log = () => {} } = {}) {
  const cache = new Map(); // url → { at, value }
  const calls = []; // the last reads, for the admin
  let used = 0; // reads made today (UTC), against the ~10 000 a day
  let day = new Date().toISOString().slice(0, 10);

  /** GET one widget route: { ok, status, ms, data | error, cached }. Never throws. */
  async function get(route, params) {
    const q = new URLSearchParams({ ...params, src });
    const url = `${baseUrl.replace(/\/+$/, '')}/${route}/?${q}`; // the cache key: never with the key in it
    const hit = cache.get(url);
    if (hit && Date.now() - hit.at < cacheSeconds * 1000) return { ...hit.value, cached: true };
    const today = new Date().toISOString().slice(0, 10);
    if (today !== day) { day = today; used = 0; }
    used += 1;
    const t0 = Date.now();
    let value;
    try {
      const headers = { accept: 'application/json', 'user-agent': 'Bet62/1.0' };
      let target = url;
      if (apiKey && keyParam) target = `${url}&${encodeURIComponent(keyParam)}=${encodeURIComponent(apiKey)}`;
      else if (apiKey) headers[keyHeader.toLowerCase()] = /^authorization$/i.test(keyHeader) ? `Bearer ${apiKey}` : apiKey;
      const res = await fetch(target, { headers, signal: AbortSignal.timeout(timeoutMs) });
      const text = await res.text();
      let data = null;
      try { data = JSON.parse(text); } catch { /* not JSON */ }
      // Not JSON (the tracker can answer with an HTML page holding an iframe): the page and the
      // addresses it loads come back as they are, to see where the data really lives.
      const type = res.headers.get('content-type') || '';
      value = res.ok && data !== null
        ? { ok: true, status: res.status, ms: Date.now() - t0, data }
        : res.ok && text
          ? { ok: false, status: res.status, ms: Date.now() - t0, nonJson: true, type, text: text.slice(0, 60_000),
            links: [...new Set([...text.matchAll(/(?:src|href|data-src)\s*=\s*["']([^"']+)["']|(https?:\/\/[^\s"'<>)]+)/g)].map((m) => m[1] || m[2]))].slice(0, 40),
            error: `A resposta não é JSON (${type || 'sem tipo'}): veja abaixo a página e os endereços que ela carrega.` }
          : { ok: false, status: res.status, ms: Date.now() - t0, error: data?.error || data?.detail || text.slice(0, 300) || `HTTP ${res.status}` };
    } catch (err) {
      value = { ok: false, status: 0, ms: Date.now() - t0, error: err.name === 'TimeoutError' ? 'Sem resposta (tempo esgotado).' : err.message };
    }
    // The key never leaves this module, not even inside an error the provider echoes back.
    if (!value.ok) {
      const hide = (x) => (apiKey ? String(x).split(apiKey).join('***') : String(x));
      value.error = hide(value.error);
      if (value.text) value.text = hide(value.text);
      if (value.links) value.links = value.links.map(hide);
      log(`${route}: ${value.error}`);
    }
    calls.unshift({ at: new Date().toISOString(), route, params, ok: value.ok, status: value.status, ms: value.ms });
    calls.length = Math.min(calls.length, 20);
    if (value.ok) cache.set(url, { at: Date.now(), value });
    if (cache.size > 500) cache.delete(cache.keys().next().value);
    return { ...value, cached: false };
  }

  const sportOk = (s) => SPORTSCORE_SPORTS.includes(s);
  return {
    enabled: true,
    keySet: !!apiKey,
    status: () => ({ baseUrl, keySet: !!apiKey, keyVia: !apiKey ? null : keyParam ? `parâmetro ${keyParam}` : `cabeçalho ${keyHeader}`, src, usedToday: used, cacheSeconds, calls }),
    matches: (sport, limit = 20) => (sportOk(sport) ? get('matches', { sport, limit: String(Math.min(50, Math.max(1, limit))) }) : Promise.resolve({ ok: false, error: 'Desporto inválido.' })),
    match: (sport, slug) => (sportOk(sport) && slug ? get('match', { sport, slug }) : Promise.resolve({ ok: false, error: 'Indique o desporto e o slug do jogo.' })),
    tracker: (sport, id) => (sportOk(sport) && id ? get('tracker', { sport, id: String(id) }) : Promise.resolve({ ok: false, error: 'Indique o desporto e o id do jogo.' })),
  };
}

/** A raw answer for the admin: as it came, cut to MAX_BODY characters of JSON. */
export function rawForAdmin(r) {
  if (!r?.ok) return r;
  const json = JSON.stringify(r.data, null, 2);
  return { ...r, data: undefined, raw: json.length > MAX_BODY ? `${json.slice(0, MAX_BODY)}\n… (cortado)` : json, size: json.length };
}
