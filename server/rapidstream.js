import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { Readable } from 'node:stream';

// Second source of live football video, on trial beside WinHouse's own TV: a RapidAPI streaming API
// set in the Variables (RAPIDAPI_STREAM_HOST, its list route and the route of one game). Read only
// when a player opens a live match (never in the background), kept for `cacheSeconds` so the daily
// quota is not spent on every page view. A match is ours when both team names agree. HLS / FLV
// streams play through our own proxy (it sends the referer a browser cannot); DRM is left out.

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
 * The servers we can play: HLS (.m3u8) and FLV (.flv), never DRM. Every one goes through our proxy
 * (it sends the referer / user-agent a browser cannot, and the hosts refuse other sites' pages).
 */
export function playableServers(servers) {
  const kindOf = (u) => (/^https?:\/\/[^\s|"'<>]+\.m3u8(\?[^\s|"'<>]*)?$/i.test(u) ? 'hls' : /^https?:\/\/[^\s|"'<>]+\.flv(\?[^\s|"'<>]*)?$/i.test(u) ? 'flv' : null);
  // HLS before FLV (it plays on every device), direct before referer.
  const rank = (s) => (kindOf(s.url) === 'flv' ? 2 : 0) + (s.header?.referer ? 1 : 0);
  return (Array.isArray(servers) ? servers : [])
    .filter((s) => s && typeof s.url === 'string' && kindOf(s.url) && s.type !== 'drm' && safeTarget(s.url))
    .sort((a, b) => rank(a) - rank(b))
    .slice(0, 8)
    .map((s, i) => ({
      name: String(s.name || `Servidor ${i + 1}`).slice(0, 30), url: s.url, kind: kindOf(s.url),
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

const BROWSER_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const probes = new Map(); // url → { at, ok, ms }

/**
 * Puts the servers that answer first at the front and drops the ones that do not answer at all:
 * every playlist is asked for at once (with its own headers), `timeoutMs` at most, remembered a
 * minute. When none answers, the list stays as it was (the player still tries them).
 */
export async function rankServers(servers, { fetchImpl = globalThis.fetch, timeoutMs = 4000 } = {}) {
  const now = Date.now();
  const probe = async (s) => {
    const hit = probes.get(s.url);
    if (hit && now - hit.at < 60_000) return hit;
    const t0 = Date.now();
    let ok = false;
    try {
      const res = await fetchImpl(s.url, {
        headers: { 'User-Agent': s.ua || BROWSER_UA, ...(s.referer ? { Referer: s.referer, Origin: new URL(s.referer).origin } : {}), Accept: '*/*' },
        redirect: 'follow', signal: AbortSignal.timeout(timeoutMs),
      });
      if (s.kind === 'flv') {
        // A live FLV never ends: only its first bytes ("FLV" signature) are read.
        const reader = res.ok && res.body ? res.body.getReader() : null;
        const first = reader ? await reader.read() : null;
        ok = !!first?.value && Buffer.from(first.value.subarray(0, 3)).toString('latin1') === 'FLV';
        reader?.cancel().catch(() => {});
      } else ok = res.ok && (await res.text()).startsWith('#EXTM3U');
    } catch { ok = false; }
    const r = { at: Date.now(), ok, ms: Date.now() - t0 };
    probes.set(s.url, r);
    if (probes.size > 500) for (const [k, v] of probes) if (Date.now() - v.at > 60_000) probes.delete(k);
    return r;
  };
  const results = await Promise.all(servers.map(probe));
  const alive = servers.map((s, i) => ({ s, r: results[i] })).filter((x) => x.r.ok).sort((a, b) => a.r.ms - b.r.ms).map((x) => x.s);
  return alive.length ? alive : servers;
}

/**
 * Admin diagnosis of one stream, from our server (as the proxy would fetch it): the playlist with and
 * without the referer, then down the playlist to its first segment, with the first bytes of each.
 */
export async function probeStream(server, { fetchImpl = globalThis.fetch, timeoutMs = 8000 } = {}) {
  const get = async (url, referer) => {
    const t0 = Date.now();
    try {
      const res = await fetchImpl(url, {
        headers: { 'User-Agent': server.ua || BROWSER_UA, ...(referer ? { Referer: referer, Origin: new URL(referer).origin } : {}), Accept: '*/*' },
        redirect: 'follow', signal: AbortSignal.timeout(timeoutMs),
      });
      const buf = Buffer.from(await res.arrayBuffer());
      return { status: res.status, type: res.headers.get('content-type'), bytes: buf.length, ms: Date.now() - t0, url: res.url || url, buf };
    } catch (err) { return { error: err.name === 'TimeoutError' ? 'sem resposta' : err.message, ms: Date.now() - t0 }; }
  };
  const show = (r) => (r.buf ? { status: r.status, type: r.type, bytes: r.bytes, ms: r.ms, start: /^#EXTM3U/.test(r.buf.toString('latin1', 0, 7)) ? r.buf.toString('utf8', 0, 400) : r.buf.subarray(0, 16).toString('hex') } : r);
  const firstUri = (text, base) => {
    const line = String(text).split(/\r?\n/).find((l) => l.trim() && !l.startsWith('#'));
    try { return line ? new URL(line.trim(), base).href : null; } catch { return null; }
  };
  const out = { url: server.url, referer: server.referer || null };
  if (!safeTarget(server.url)) return { ...out, error: 'endereço recusado' };
  const plain = await get(server.url, null);
  out.semReferer = show(plain);
  const withRef = server.referer ? await get(server.url, server.referer) : plain;
  if (server.referer) out.comReferer = show(withRef);
  let cur = withRef.buf && withRef.status < 400 ? withRef : plain;
  // Down the playlists (a master names a media playlist) to the first segment.
  for (let depth = 0; depth < 3 && cur.buf && cur.buf.toString('latin1', 0, 7) === '#EXTM3U'; depth += 1) {
    const next = firstUri(cur.buf.toString('utf8'), cur.url);
    if (!next || !safeTarget(next)) break;
    const r = await get(next, server.referer);
    out[`passo${depth + 1}`] = { url: next.slice(0, 200), ...show(r) };
    cur = r;
  }
  return out;
}

// ---------- the relay: our server keeps the stream a few seconds ahead ----------
// While someone watches, the stream's media playlist is read every second and its new segments are
// fetched at once and kept in memory: the player gets both straight from us, so the host's slow
// moments (a playlist late by a few seconds) no longer reach it. One fetch per segment however many
// watch. A stream nobody asked for in a minute is dropped; at most `maxStreams` at a time.

const HEADERS = (hdr, referer) => ({
  'User-Agent': hdr.ua || BROWSER_UA,
  ...(referer ? { Referer: referer, Origin: new URL(referer).origin } : {}),
  Accept: '*/*',
});

const SEGMENT_TAG = /^#EXT(INF|-X-(DISCONTINUITY|PROGRAM-DATE-TIME|KEY|MAP|BYTERANGE|GAP))\b/;

/** Segment addresses of a media playlist, in order (none for a master playlist). */
export function mediaSegments(text, base) {
  const out = [];
  const lines = String(text).split(/\r?\n/);
  let inf = false;
  for (const line of lines) {
    if (line.startsWith('#EXTINF')) inf = true;
    else if (line.trim() && !line.startsWith('#')) {
      if (inf) { try { out.push(new URL(line.trim(), base).href); } catch { /* skipped */ } }
      inf = false;
    }
  }
  return out;
}

export function createStreamRelay({ fetchImpl = globalThis.fetch, everyMs = 1000, idleMs = 60_000, maxStreams = 12 } = {}) {
  const streams = new Map(); // playlist url → stream
  const bySegment = new Map(); // segment url → stream

  async function ask(url, hdr, timeoutMs) {
    const go = (referer) => fetchImpl(url, { headers: HEADERS(hdr, referer), redirect: 'follow', signal: AbortSignal.timeout(timeoutMs) });
    let res = await go(hdr.referer);
    if (hdr.referer && (res.status === 401 || res.status === 403)) res = await go(null);
    return res;
  }

  function drop(st) {
    clearTimeout(st.timer);
    streams.delete(st.url);
    for (const u of st.segs.keys()) if (bySegment.get(u) === st) bySegment.delete(u);
  }

  function fetchSegment(st, url) {
    const p = (async () => {
      try {
        const res = await ask(url, st.hdr, 20_000);
        if (!res.ok) return null;
        return { buf: Buffer.from(await res.arrayBuffer()), type: res.headers.get('content-type') || 'video/mp2t' };
      } catch { return null; }
    })();
    // A segment that failed here stays listed (the playlist never shrinks under the player, which
    // Safari takes for a broken stream); the proxy then asks the host for it directly.
    const entry = { promise: p, done: null, settled: false };
    p.then((v) => { entry.done = v; entry.settled = true; });
    return entry;
  }

  async function refresh(st) {
    try {
      const res = await ask(st.url, st.hdr, 8000);
      const text = res.ok ? await res.text() : '';
      if (text.startsWith('#EXTM3U')) {
        const base = res.url || st.url;
        const list = mediaSegments(text, base);
        if (!list.length) { st.master = true; } else {
          st.text = text; st.base = base; st.list = list; st.at = Date.now();
          for (const u of list) {
            if (!st.segs.has(u) && safeTarget(u)) { st.segs.set(u, fetchSegment(st, u)); bySegment.set(u, st); }
          }
          // Segments that left the playlist are let go (memory stays at one playlist's worth).
          const keep = new Set(list);
          for (const u of [...st.segs.keys()]) if (!keep.has(u)) { st.segs.delete(u); if (bySegment.get(u) === st) bySegment.delete(u); }
        }
      }
    } catch { /* tried again on the next round */ }
    if (st.master || Date.now() - st.lastAsk > idleMs) { if (!st.master) drop(st); return; }
    st.timer = setTimeout(() => { st.round = refresh(st); }, everyMs);
    st.timer.unref?.();
  }

  /**
   * The media playlist from the relay, cut before its first segment not yet here (the player never
   * waits on the host for one); null when this is no media playlist or the relay cannot help.
   */
  async function playlist(url, hdr) {
    let st = streams.get(url);
    if (!st) {
      if (streams.size >= maxStreams) return null;
      st = { url, hdr, segs: new Map(), lastAsk: Date.now(), at: 0, list: [], text: '', base: url, master: false, timer: null };
      streams.set(url, st);
      st.round = refresh(st);
    }
    st.lastAsk = Date.now();
    if (!st.at) await st.round;
    if (st.master || !st.at || Date.now() - st.at > 20_000) { if (st.master) streams.delete(url); return null; }
    // At the start the playlist's segments are worth waiting for (6 s at most): the player then
    // starts with a full window rather than one segment.
    if (!st.served) {
      const all = st.list.map((u) => st.segs.get(u)?.promise).filter(Boolean);
      await Promise.race([Promise.all(all), new Promise((r) => { setTimeout(r, 6000).unref?.(); })]);
      st.served = true;
    }
    const ready = new Set(st.list.filter((u) => st.segs.get(u)?.settled));
    if (!ready.size) return null;
    // Header lines as they are; each segment with its own tags, up to the first one not here yet.
    const out = [];
    let pending = [];
    for (const line of st.text.split(/\r?\n/)) {
      if (line.trim() && !line.startsWith('#')) {
        let abs = null;
        try { abs = new URL(line.trim(), st.base).href; } catch { /* skipped */ }
        if (!abs || !ready.has(abs)) break;
        out.push(...pending, line);
        pending = [];
      } else if (SEGMENT_TAG.test(line)) pending.push(line);
      else if (line.trim()) out.push(line);
    }
    if (!out.some((l) => l.trim() && !l.startsWith('#'))) return null;
    return { text: out.join('\n') + '\n', base: st.base };
  }

  /** A segment the relay holds (waiting for one on its way); null when it has none. */
  async function segment(url) {
    const st = bySegment.get(url);
    const e = st?.segs.get(url);
    if (!e) return null;
    st.lastAsk = Date.now();
    return e.settled ? e.done : await e.promise;
  }

  const status = () => ({ streams: streams.size, segments: [...streams.values()].reduce((n, st) => n + [...st.segs.values()].filter((e) => e.done).length, 0) });
  const stop = () => { for (const st of [...streams.values()]) drop(st); };
  return { playlist, segment, status, stop };
}

export function createVideoProxy({ secret = randomBytes(32), ttlSeconds = 4 * 3600, fetchImpl = globalThis.fetch, path = '/api/tv/p', relay = null } = {}) {
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
    // The relay's copy first (playlist and segments kept a few seconds ahead); the host otherwise.
    if (relay) {
      try {
        if (/\.m3u8$/i.test(new URL(t.u).pathname)) {
          const pl = await relay.playlist(t.u, hdr);
          if (pl) return res.set('Cache-Control', 'no-store').type('application/vnd.apple.mpegurl').send(rewrite(pl.text, pl.base, hdr));
        } else {
          const seg = await relay.segment(t.u);
          if (seg) return res.set('Cache-Control', 'no-store').type(seg.type).set('Content-Length', String(seg.buf.length)).send(seg.buf);
        }
      } catch { /* the host directly */ }
    }
    let up;
    // 20 s for the stream host to answer; after that the body flows for as long as it lasts (an FLV
    // stream is one long response). Closing the player stops it.
    const ctl = new AbortController();
    // A playlist is small: 8 s, so the player's own retry comes sooner than its 10 s timeout.
    const timer = setTimeout(() => ctl.abort(), /\.m3u8(\?|$)/i.test(t.u) ? 8_000 : 20_000);
    res.on('close', () => ctl.abort());
    const ask = (referer) => fetchImpl(t.u, {
      headers: {
        'User-Agent': t.a || BROWSER_UA,
        ...(referer ? { Referer: referer, Origin: new URL(referer).origin } : {}),
        Accept: '*/*',
      },
      redirect: 'follow',
      signal: ctl.signal,
    });
    try {
      up = await ask(t.r);
      // Refused with the referer: some hosts want none at all (asked once more without it).
      if (t.r && (up.status === 401 || up.status === 403)) up = await ask(null);
    } catch { return res.status(502).end(); } finally { clearTimeout(timer); }
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
    res.on('close', () => body.destroy());
    body.on('error', () => res.destroy());
    body.pipe(res);
  }

  return { sign, open, rewrite, handle };
}

/**
 * A listed match in one shape, whatever the API: { home_team_name, away_team_name, league_name,
 * match_status, id, servers }: the "football-live-stream-api" shape (result[] with home_name /
 * away_name / status "Live" / id) and the usual home_team_name / match_status spellings.
 */
export function normalizeMatch(m) {
  if (!m || typeof m !== 'object') return null;
  const home = m.home_team_name ?? m.home_name ?? m.homeTeam ?? m.home;
  const away = m.away_team_name ?? m.away_name ?? m.awayTeam ?? m.away;
  if (!home || !away) return null;
  return {
    ...m, home_team_name: String(home), away_team_name: String(away),
    league_name: String(m.league_name ?? m.league ?? '').trim(),
    match_status: String(m.match_status ?? m.status ?? '').toLowerCase(),
    id: m.id ?? m.match_id ?? null,
    servers: Array.isArray(m.servers) ? m.servers : [],
  };
}
const KICKED_OFF_MS = 10 * 60_000;
const UNDER_WAY_MS = 3 * 3600_000;
function isPlaying(m, now = Date.now()) {
  if (!m.match_status || m.match_status === 'live') return true;
  if (!/^(upcoming|scheduled|not started|ns)$/.test(m.match_status)) return false;
  const t = Date.parse(m.kickoff ?? m.start_time ?? '');
  return Number.isFinite(t) && t <= now + KICKED_OFF_MS && t > now - UNDER_WAY_MS;
}
const listOf = (body) => (Array.isArray(body) ? body : Array.isArray(body?.matches) ? body.matches : Array.isArray(body?.result) ? body.result
  : Array.isArray(body?.data) ? body.data : Array.isArray(body?.response) ? body.response : []);

/**
 * Every stream address in an API answer, whatever its shape: any string ending in .m3u8 / .flv
 * (an "url|drm…" one is DRM and skipped), with the referer / user-agent found beside it.
 */
const STREAM_URL = /^https?:\/\/\S+\.(m3u8|flv)(\?\S*)?$/i;

function unwrapPlayer(u) {
  let url;
  try { url = new URL(u); } catch { return null; }
  if (!url.search) return null;
  for (const key of ['url', 'src', 'source', 'file', 'stream', 'link']) {
    const val = url.searchParams.get(key);
    if (val && STREAM_URL.test(val.trim())) return { url: val.trim() };
  }
  return null;
}

export function findStreams(body) {
  const out = [];
  const seen = new Set();
  const walk = (v, ctx, depth) => {
    if (depth > 8 || v === null || v === undefined) return;
    if (typeof v === 'string') {
      let u = v.trim();
      let referer = ctx.referer;
      // A player page carrying the stream in its query (…/?url=https://…/playlist.m3u8): play the inner
      // link. No referer is sent for it: the stream host refuses the player page's own (403).
      const inner = unwrapPlayer(u);
      if (inner) u = inner.url;
      if (STREAM_URL.test(u) && !seen.has(u)) {
        seen.add(u);
        out.push({ name: ctx.name || `Servidor ${out.length + 1}`, url: u, type: referer ? 'referer' : 'direct', header: { referer: referer || undefined, 'user-agent': ctx.ua || undefined } });
      }
      return;
    }
    if (Array.isArray(v)) { for (const x of v) walk(x, ctx, depth + 1); return; }
    if (typeof v === 'object') {
      const h = v.header || v.headers || {};
      const next = {
        name: typeof v.name === 'string' ? v.name.slice(0, 30) : typeof v.label === 'string' ? v.label.slice(0, 30) : ctx.name,
        referer: v.referer || v.Referer || h.referer || h.Referer || ctx.referer,
        ua: v['user-agent'] || v.userAgent || h['user-agent'] || h['User-Agent'] || ctx.ua,
      };
      for (const x of Object.values(v)) walk(x, next, depth + 1);
    }
  };
  walk(body, {}, 0);
  return out;
}

export function createRapidStream({
  apiKey = '', host = 'football-live-stream-api.p.rapidapi.com', cacheSeconds = 120, maxPages = 5,
  listPath = '', streamPath = '', fetchImpl = globalThis.fetch, log = () => {},
} = {}) {
  // Both the key and the list route are needed (no route is assumed for an unknown API).
  const enabled = !!apiKey && !!listPath;
  let cache = { at: 0, matches: [], error: null, pages: 0 };
  let inflight = null;
  const usage = { requests: 0, day: '' };

  async function get(path) {
    const day = new Date().toISOString().slice(0, 10);
    if (usage.day !== day) { usage.day = day; usage.requests = 0; }
    usage.requests += 1;
    const res = await fetchImpl(`https://${host}${path}`, {
      headers: { 'X-RapidAPI-Key': apiKey, 'X-RapidAPI-Host': host, Accept: 'application/json' },
      signal: AbortSignal.timeout(15_000),
    });
    const body = await res.json().catch(() => null);
    if (!res.ok) throw new Error(`HTTP ${res.status}${body?.message ? `: ${String(body.message).slice(0, 120)}` : ''}`);
    return body || {};
  }
  const page = (n) => get(listPath.replace('{page}', String(n)));
  const paged = listPath.includes('{page}');

  /** Every live match the API lists (cached). */
  async function liveMatches({ fresh = false } = {}) {
    if (!enabled) return { matches: [], error: 'RAPIDAPI_KEY ou RAPIDAPI_STREAM_LIST_PATH em falta' };
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
          // Live ones (a list with every status gives "Live" / "live" games and the rest), plus the
          // "Upcoming" ones whose kick-off has come: the API is late to mark them live.
          matches.push(...listOf(body).map(normalizeMatch).filter((m) => m && isPlaying(m)));
          if (!paged || !body.pagination?.hasNext) break;
        }
        cache = { at: Date.now(), matches, error: null, pages };
      } catch (err) {
        log(`RapidAPI streaming: ${err.message}`);
        // Keep what we had; try again in a quarter of the cache time, or in 15 minutes when the
        // plan's quota is spent (HTTP 429: asking again only wastes requests).
        const wait = /HTTP 429/.test(err.message) ? 15 * 60_000 : cacheSeconds * 250;
        cache = { ...cache, at: Date.now() - cacheSeconds * 1000 + wait, error: err.message };
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

  const details = new Map(); // id → { at, servers }
  async function detailServers(id) {
    const hit = details.get(id);
    // A game's stream address holds for the whole match: one with servers is kept 30 min (the daily
    // quota of the API's plan is small); one without is asked again after `cacheSeconds`.
    const keepMs = hit?.servers?.length ? Math.max(cacheSeconds * 1000, 30 * 60_000) : cacheSeconds * 1000;
    if (hit && Date.now() - hit.at < keepMs) return hit.servers;
    let servers = [];
    let answer = null;
    try {
      const body = await get(streamPath.replace('{id}', encodeURIComponent(String(id))));
      answer = JSON.stringify(body).slice(0, 600);
      servers = findStreams(body);
    } catch (err) { answer = `erro: ${err.message}`; log(`RapidAPI streaming ${id}: ${err.message}`); }
    details.set(id, { at: Date.now(), servers, answer });
    if (details.size > 300) for (const [k, v] of details) if (Date.now() - v.at > 30 * 60_000) details.delete(k);
    return servers;
  }

  /** The playable streams for one of our live games: { servers: [{ name, url }], match } or { error }. */
  async function streamsFor(home, away) {
    const c = await liveMatches();
    if (!c.matches.length && c.error) return { error: c.error, servers: [] };
    const found = findMatch(c.matches, home, away);
    if (!found) return { servers: [], error: 'jogo não encontrado na API de transmissões' };
    // An API that lists games without their links: the game's own route gives them (cached too).
    if (!found.match.servers.length && streamPath && found.match.id) found.match.servers = await detailServers(found.match.id);
    const servers = playableServers(found.match.servers);
    return {
      servers, score: found.score,
      match: { id: found.match.id, home: found.match.home_team_name, away: found.match.away_team_name, league: found.match.league_name },
      // What the game's route answered (for the admin test), when it was asked.
      answer: details.get(found.match.id)?.answer ?? null,
      error: servers.length ? null : 'sem servidor HLS direto para este jogo',
    };
  }

  /**
   * Admin tool: any GET route of the configured API host, answered as it comes (status, JSON or a
   * slice of the text), to learn a new API's shape from the server (which can reach it).
   */
  async function raw(path) {
    const p = String(path || '/');
    if (!/^\/[\w\-./?=&%:,+]*$/.test(p) || p.includes('..')) throw new Error('caminho inválido (comece por /)');
    usage.requests += 1;
    const t0 = Date.now();
    const res = await fetchImpl(`https://${host}${p}`, {
      headers: { 'X-RapidAPI-Key': apiKey, 'X-RapidAPI-Host': host, Accept: 'application/json' },
      signal: AbortSignal.timeout(15_000),
    });
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch { /* not JSON */ }
    return { host, path: p, status: res.status, ms: Date.now() - t0, contentType: res.headers.get('content-type'), bytes: text.length, json: json ?? undefined, text: json ? undefined : text.slice(0, 3000) };
  }

  const status = () => ({
    enabled, host, cachedAt: cache.at ? new Date(cache.at).toISOString() : null, matches: cache.matches.length,
    pages: cache.pages, error: cache.error, requestsToday: usage.requests, cacheSeconds,
  });

  return { enabled, liveMatches, findMatch, streamsFor, status, raw, rank: (servers) => rankServers(servers, { fetchImpl }), probe: (server) => probeStream(server, { fetchImpl }) };
}
