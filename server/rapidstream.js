import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { Readable } from 'node:stream';

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

/**
 * The servers we can play: HTTPS HLS (.m3u8) without DRM. Direct ones first; the ones that need a
 * referer go through our proxy like the rest (it sends the headers a browser cannot).
 */
export function playableServers(servers) {
  return (Array.isArray(servers) ? servers : [])
    .filter((s) => s && typeof s.url === 'string' && /^https?:\/\/[^\s|"'<>]+\.m3u8(\?[^\s|"'<>]*)?$/i.test(s.url)
      && s.type !== 'drm' && safeTarget(s.url))
    .sort((a, b) => (a.header?.referer ? 1 : 0) - (b.header?.referer ? 1 : 0))
    .slice(0, 6)
    .map((s, i) => ({
      name: String(s.name || `Servidor ${i + 1}`).slice(0, 30), url: s.url,
      referer: typeof s.header?.referer === 'string' ? s.header.referer.slice(0, 300) : null,
      ua: typeof s.header?.['user-agent'] === 'string' ? s.header['user-agent'].slice(0, 300) : null,
    }));
}

// ---------- the video proxy ----------
// The stream hosts refuse other sites' pages (CORS) and some want a referer: our server fetches the
// playlists and segments for the player instead. Only addresses we signed (the API's servers and
// what their playlists name) are fetched, for a few hours, and never private / local hosts. Plain
// HTTP hosts are fine here: the browser only ever talks to us, over HTTPS.

const PRIVATE_HOST = /^(localhost|.*\.local|.*\.internal|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.|0\.|\[|::1$)/i;
export const safeTarget = (u) => {
  try {
    const x = new URL(u);
    return (x.protocol === 'https:' || x.protocol === 'http:') && !x.username && !x.password && !PRIVATE_HOST.test(x.hostname) ? x : null;
  } catch { return null; }
};

export function createVideoProxy({ secret = randomBytes(32), ttlSeconds = 4 * 3600, fetchImpl = globalThis.fetch, path = '/api/tv/p' } = {}) {
  const b64 = (buf) => Buffer.from(buf).toString('base64url');
  const sig = (data) => createHmac('sha256', secret).update(data).digest().subarray(0, 18);

  /** A signed address of our proxy for `url`, carrying the headers the stream host wants. */
  function sign(url, { referer = null, ua = null } = {}) {
    const data = b64(JSON.stringify({ u: url, r: referer || undefined, a: ua || undefined, e: Math.floor(Date.now() / 1000) + ttlSeconds }));
    return `${path}?t=${data}.${b64(sig(data))}`;
  }

  /** The target of a signed token, or null (bad signature, expired, not a safe address). */
  function open(token) {
    const [data, mac] = String(token || '').split('.');
    if (!data || !mac) return null;
    const want = sig(data);
    const got = Buffer.from(mac, 'base64url');
    if (got.length !== want.length || !timingSafeEqual(got, want)) return null;
    let t;
    try { t = JSON.parse(Buffer.from(data, 'base64url').toString('utf8')); } catch { return null; }
    if (!t || typeof t.u !== 'string' || !(t.e > Date.now() / 1000) || !safeTarget(t.u)) return null;
    return t;
  }

  /** A playlist with every address in it (lines and URI="…") turned into signed proxy addresses. */
  function rewrite(text, base, hdr) {
    const abs = (u) => { try { return new URL(u.trim(), base).href; } catch { return null; } };
    return String(text).split(/\r?\n/).map((line) => {
      if (!line.trim()) return line;
      if (line.startsWith('#')) {
        return line.replace(/URI="([^"]+)"/g, (m, u) => { const a = abs(u); return a && safeTarget(a) ? `URI="${sign(a, hdr)}"` : m; });
      }
      const a = abs(line);
      return a && safeTarget(a) ? sign(a, hdr) : '';
    }).join('\n');
  }

  /** Express handler: fetches the signed target; playlists are rewritten, segments streamed through. */
  async function handle(req, res) {
    const t = open(req.query.t);
    if (!t) return res.status(403).end();
    const hdr = { referer: t.r || null, ua: t.a || null };
    let up;
    try {
      up = await fetchImpl(t.u, {
        headers: {
          'User-Agent': t.a || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
          ...(t.r ? { Referer: t.r, Origin: new URL(t.r).origin } : {}),
          Accept: '*/*',
        },
        redirect: 'follow',
        signal: AbortSignal.timeout(20_000),
      });
    } catch { return res.status(502).end(); }
    if (!up.ok || !up.body) return res.status(up.status === 404 ? 404 : 502).end();
    const type = String(up.headers.get('content-type') || '');
    const playlist = /mpegurl/i.test(type) || /\.m3u8$/i.test(new URL(up.url || t.u).pathname);
    res.set('Cache-Control', 'no-store');
    if (playlist) {
      const text = await up.text();
      if (!text.startsWith('#EXTM3U')) return res.status(502).end();
      return res.type('application/vnd.apple.mpegurl').send(rewrite(text, up.url || t.u, hdr));
    }
    res.type(type || 'video/mp2t');
    const len = up.headers.get('content-length');
    if (len) res.set('Content-Length', len);
    const body = Readable.fromWeb(up.body);
    req.on('close', () => body.destroy());
    body.on('error', () => res.destroy());
    body.pipe(res);
  }

  return { sign, open, rewrite, handle };
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

  /**
   * The API's match for one of our games (both names must agree), or null. The API can list the
   * same game more than once (under two league names, each with its own servers): every listing
   * that agrees is merged, servers included, so none is lost.
   */
  function findMatch(matches, home, away) {
    let best = null;
    const servers = [];
    const urls = new Set();
    for (const m of matches) {
      const direct = Math.min(nameScore(home, m.home_team_name), nameScore(away, m.away_team_name));
      const swapped = Math.min(nameScore(home, m.away_team_name), nameScore(away, m.home_team_name));
      const s = Math.max(direct, swapped);
      if (s < 0.5) continue;
      if (!best || s > best.score) best = { match: m, score: s };
      for (const v of Array.isArray(m.servers) ? m.servers : []) {
        if (v?.url && !urls.has(v.url)) { urls.add(v.url); servers.push(v); }
      }
    }
    return best && { ...best, match: { ...best.match, servers } };
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
