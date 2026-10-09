// Second source of live football video, on trial beside WinHouse's own TV: the "Football Live
// Streaming API" on RapidAPI (GET /matches?status=live → matches, each with its stream servers).
// Read only when a player opens a live match (never in the background), kept for `cacheSeconds`
// so the daily quota is not spent on every page view. A match is ours when both team names agree.
// Only streams a browser can play by itself are offered: HTTPS HLS (.m3u8) without a referer or
// DRM (those need headers a browser cannot send, i.e. a proxy).

const STOP = new Set(['fc', 'cf', 'sc', 'ac', 'afc', 'cd', 'fk', 'sk', 'if', 'bk', 'club', 'de', 'the', 'and', 'u19', 'u20', 'u21', 'u23', 'ii', 'b']);
/** "Sporting CP" → ['sporting', 'cp']: lower case, no accents, no club suffixes. */
export const nameTokens = (n) => String(n || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/).filter((w) => w.length > 1 && !STOP.has(w));

/** 0..1: how much two team names agree (shared words; a prefix counts, "man" ~ "manchester"). */
export function nameScore(a, b) {
  const x = nameTokens(a);
  const y = nameTokens(b);
  if (!x.length || !y.length) return 0;
  const hit = (w, list) => list.some((v) => v === w || (w.length >= 3 && v.length >= 3 && (v.startsWith(w) || w.startsWith(v))));
  const shared = x.filter((w) => hit(w, y)).length;
  return shared / Math.min(x.length, y.length);
}

/** The servers a browser can play as they are: HTTPS .m3u8, no DRM, no referer. */
export function playableServers(servers) {
  return (Array.isArray(servers) ? servers : [])
    .filter((s) => s && typeof s.url === 'string' && /^https:\/\/[^\s|"'<>]+\.m3u8(\?[^\s|"'<>]*)?$/i.test(s.url)
      && (s.type === 'direct' || !s.type) && !s.header?.referer)
    .slice(0, 6)
    .map((s, i) => ({ name: String(s.name || `Servidor ${i + 1}`).slice(0, 30), url: s.url }));
}

export function createRapidStream({
  apiKey = '', host = 'football-live-streaming-api.p.rapidapi.com', cacheSeconds = 120, maxPages = 5,
  fetchImpl = globalThis.fetch, log = () => {},
} = {}) {
  const enabled = !!apiKey;
  let cache = { at: 0, matches: [], error: null, pages: 0 };
  let inflight = null;
  const usage = { requests: 0, day: '' };

  async function page(n) {
    const day = new Date().toISOString().slice(0, 10);
    if (usage.day !== day) { usage.day = day; usage.requests = 0; }
    usage.requests += 1;
    const res = await fetchImpl(`https://${host}/matches?status=live&page=${n}`, {
      headers: { 'X-RapidAPI-Key': apiKey, 'X-RapidAPI-Host': host, Accept: 'application/json' },
      signal: AbortSignal.timeout(15_000),
    });
    const body = await res.json().catch(() => null);
    if (!res.ok) throw new Error(`HTTP ${res.status}${body?.message ? `: ${String(body.message).slice(0, 120)}` : ''}`);
    return body || {};
  }

  /** Every live match the API lists (cached). */
  async function liveMatches({ fresh = false } = {}) {
    if (!enabled) return { matches: [], error: 'RAPIDAPI_KEY em falta' };
    if (!fresh && Date.now() - cache.at < cacheSeconds * 1000) return cache;
    if (inflight) return inflight;
    inflight = (async () => {
      try {
        const matches = [];
        let n = 1;
        let pages = 0;
        for (; n <= maxPages; n++) {
          const body = await page(n);
          pages += 1;
          matches.push(...(Array.isArray(body.matches) ? body.matches : []));
          if (!body.pagination?.hasNext) break;
        }
        cache = { at: Date.now(), matches, error: null, pages };
      } catch (err) {
        log(`RapidAPI streaming: ${err.message}`);
        // Keep what we had; try again in a quarter of the cache time.
        cache = { ...cache, at: Date.now() - cacheSeconds * 750, error: err.message };
      } finally { inflight = null; }
      return cache;
    })();
    return inflight;
  }

  /** The API's match for one of our games (both names must agree), or null. */
  function findMatch(matches, home, away) {
    let best = null;
    for (const m of matches) {
      const direct = Math.min(nameScore(home, m.home_team_name), nameScore(away, m.away_team_name));
      const swapped = Math.min(nameScore(home, m.away_team_name), nameScore(away, m.home_team_name));
      const s = Math.max(direct, swapped);
      if (s >= 0.5 && (!best || s > best.score)) best = { match: m, score: s };
    }
    return best;
  }

  /** The playable streams for one of our live games: { servers: [{ name, url }], match } or { error }. */
  async function streamsFor(home, away) {
    const c = await liveMatches();
    if (!c.matches.length && c.error) return { error: c.error, servers: [] };
    const found = findMatch(c.matches, home, away);
    if (!found) return { servers: [], error: 'jogo não encontrado na API de transmissões' };
    const servers = playableServers(found.match.servers);
    return {
      servers, score: found.score,
      match: { home: found.match.home_team_name, away: found.match.away_team_name, league: found.match.league_name },
      error: servers.length ? null : 'sem servidor HLS direto para este jogo',
    };
  }

  const status = () => ({
    enabled, host, cachedAt: cache.at ? new Date(cache.at).toISOString() : null, matches: cache.matches.length,
    pages: cache.pages, error: cache.error, requestsToday: usage.requests, cacheSeconds,
  });

  return { enabled, liveMatches, findMatch, streamsFor, status };
}
