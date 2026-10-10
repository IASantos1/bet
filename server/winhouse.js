import { divisionOf } from './footballdivisions.js';
import { tourOf } from './tennistours.js';
import { createHmac } from 'node:crypto';
import { nowIso, tx } from './db.js';
import { settleEvent, resultCode } from './betting.js';
import { leagueTier } from './leagues.js';
import { normalizeWidgetData } from './whtracker.js';

// WinHouse — data source being evaluated to replace / complement the odds providers.
//
// The HTTP client, the parsers of its payloads, a health check that calls each route from the
// server, and the collector (createWinHouseFeed) that keeps events, scores, odds and results in
// the database: pre-match lists every minute, the live list every 15 s.
//
// Every URL lives in the environment (WINHOUSE_*), so a route change on WinHouse's side is a
// variable change, not a code change. Use of these data outside the iframe is under the operator's
// agreement with WinHouse.

const ROUTES = {
  live: '/ajax/livegames?lang={lang}',
  prematchMain: '/ajax/prematchgamesmainleague?lang={lang}',
  prematchTop: '/ajax/toptenprematchgames?lang={lang}',
  prematch24h: '/ajax/prematchgames24hour?lang={lang}',
  // Every upcoming fixture of one sport, no time window (the book's own "Upcoming" board): games weeks ahead.
  prematchBySport: '/ajax/prematchgamesbysport/{sportId}?lang={lang}',
  prematchEvent: '/ajax/prematchgame/{gameId}?lang={lang}',
  // A live game's page (every in-play market). WINHOUSE_LIVE_EVENT changes it if WinHouse uses another path.
  liveEvent: '/ajax/livegame/{gameId}?lang={lang}',
  // Match tracker: the widget page gives the tracker's event id and key, widget-data the state.
  widget: '/ajax/widget?event_id={gameId}&bg=transparent',
  widgetData: '/widget-data?event_id={eid}&api_key={akey}',
  // Live tracker frames (ball position, situation…) about every second, same host over wss://.
  wsWidget: '/ws-widget?api_key={akey}&event_id={eid}',
  // A simpler tracker (no key): score, stats, situation, xy, timeline for a game id.
  tracker: '/ajax/tracker/{gameId}?lang={lang}',
  // Games with live video: { success, ids: [gameId…] } for the operator's embed key (WINHOUSE_TENANT).
  streams: '/ajax/streams?tenant={tenant}',
  // A game's live video: { success, embed_url: ".../tv/play?t=TOKEN", expires_at } (whlive.js).
  livestream: '/ajax/livestream?event_id={gameId}',
  // Seamless wallet (model B): a book session for a player, server-to-server with the wallet API key.
  tenantSession: '/tenant/session',
  // The same session from a signed launch token (what bet62.plus's "play" does): not tied to the Server IP.
  tenantSso: '/tenant/sso',
  // The book's sign-in token (from sso/session) → a read-scope token (~1 h): what /ajax/livestream takes.
  tokenL: '/aaa/token_l',
};

/**
 * One odd as WinHouse sends it — "1223894688|1.28|1|1001|1x2 [1x2]" — into
 * { oddId, price, selection, marketId, marketName, marketCode }, or null.
 */
export function parseOdd(raw) {
  if (typeof raw !== 'string') return null;
  const parts = raw.split('|').map((p) => p.trim());
  if (parts.length < 5) return null;
  const [oddId, price, selection, marketId, ...rest] = parts;
  const label = rest.join('|');
  const m = /^(.*?)\s*\[([^\]]+)\]/.exec(label);
  const p = Number(price);
  if (!/^\d+$/.test(oddId) || !Number.isFinite(p) || p <= 1 || !/^\d+$/.test(marketId) || !selection) return null;
  return {
    oddId: Number(oddId), price: p, selection, marketId: Number(marketId),
    marketName: (m ? m[1] : label).trim(), marketCode: m ? m[2].trim() : null,
  };
}

/** The `odd` field of an event: an array, or one string with the odds separated by ; , newline or #. */
export function parseOdds(field) {
  const list = Array.isArray(field) ? field : typeof field === 'string' ? field.split(/[;\n#]+|,(?=\d+\|)/) : [];
  return list.map((x) => parseOdd(typeof x === 'string' ? x : x?.odd ?? x?.raw)).filter(Boolean);
}

/** Our market|code for a WinHouse odd (only the markets we can settle; the rest is ignored). */
export function marketKey(o) {
  const code = String(o.marketCode || o.marketName || '').toLowerCase();
  const sel = String(o.selection).toLowerCase();
  if (o.marketId === 1001 || code === '1x2') return { 1: '1x2|1', x: '1x2|X', 2: '1x2|2' }[sel] || null;
  if (o.marketId === 1005 || code === 'dc') return { '1x': 'dc|1X', 12: 'dc|12', x2: 'dc|X2' }[sel] || null;
  return null;
}

/** "Cordoba - Tenerife", "2-1", "56:21" → { home, away, homeScore, awayScore, minute }. */
export function parseLiveEvent(ev) {
  if (!ev || typeof ev !== 'object') return null;
  const [home, away] = String(ev.name || '').split(/\s+-\s+/);
  const score = /^(\d+)\s*[-:]\s*(\d+)$/.exec(String(ev.result || '').trim());
  const minute = /^(\d+)/.exec(String(ev.current_minute || ''));
  return {
    gameId: ev.id ?? null, sportId: ev.sport_id ?? null, league: ev.league ?? null,
    home: home?.trim() || null, away: away?.trim() || null,
    homeScore: score ? Number(score[1]) : null, awayScore: score ? Number(score[2]) : null,
    minute: minute ? Number(minute[1]) : null, clock: ev.current_minute ?? null,
    odds: parseOdds(ev.odd),
  };
}

/** Events in a payload, whatever the wrapper ({ data: [...] }, { games: [...] }, [...]). */
export function eventsOf(body) {
  if (Array.isArray(body)) return body;
  for (const k of ['data', 'games', 'events', 'items', 'result', 'results']) if (Array.isArray(body?.[k])) return body[k];
  return [];
}

const shape = (v, depth = 0) => {
  if (Array.isArray(v)) return depth > 1 ? `array(${v.length})` : [`array(${v.length})`, v.length ? shape(v[0], depth + 1) : null];
  if (v && typeof v === 'object') return depth > 1 ? 'object' : Object.fromEntries(Object.entries(v).slice(0, 40).map(([k, x]) => [k, shape(x, depth + 1)]));
  if (typeof v === 'string') return v.length > 120 ? `${v.slice(0, 120)}…` : v;
  return v;
};

/** Market ids we already turn into bets (per sport); the rest are listed as "not mapped yet". */
const FOOTBALL_MARKETS = [1001, 1005, 1007, 1011, 1018, 1019, 1708, 1714, 1725];
/** Market ids we settle ourselves, per sport; every other market goes to the operator ('x'). */
export const SPORT_MARKETS = {
  futebol: FOOTBALL_MARKETS, andebol: FOOTBALL_MARKETS, futsal: FOOTBALL_MARKETS,
  basquetebol: [1022, 1672, 1011], hoquei: [1045, 1161, 1160, 1168, 1870], tenis: [1016],
  tenismesa: [1044, 1992], badminton: [1044, 1992], voleibol: [1001],
};
export const MAPPED_MARKETS = new Set(Object.values(SPORT_MARKETS).flat());

/**
 * A game page (`prematchgame/{id}`): groups of odd objects, one group per market —
 * { id, odd: "1.89", market_id: "1001", market: "1x2 [1x2]", market_option: "1 ",
 *   special_value: null | "2.5" | …, mainCategory: "Main", … } → our odd objects.
 */
export function detailOdds(body) {
  const out = [];
  const walk = (v, depth) => {
    if (depth > 6 || v === null || typeof v !== 'object') return;
    if (Array.isArray(v)) { for (const x of v) walk(x, depth + 1); return; }
    const price = Number(v.odd);
    const marketId = Number(v.market_id);
    const selection = String(v.market_option ?? '').trim();
    // A suspended pick comes as 1.00 or with game_status "0" (the sportsbook's own rule): skip it.
    const suspended = v.game_status !== undefined && v.game_status !== null && String(v.game_status) === '0';
    if (Number.isFinite(price) && price > 1.001 && !suspended && Number.isInteger(marketId) && marketId > 0 && selection) {
      // "Handicap [Handicap] 0:1": the name, the code; the line after the tag is the first line's, not the market's.
      const m = /^(.*?)\s*\[([^\]]+)\]/.exec(String(v.market || ''));
      const special = v.special_value === null || v.special_value === undefined || v.special_value === '' ? null : String(v.special_value).trim();
      out.push({
        oddId: Number(v.id) || 0, price, selection, marketId,
        marketName: (m ? m[1] : String(v.market || '')).trim(), marketCode: m ? m[2].trim() : null,
        special, category: v.mainCategory ?? null,
      });
      return;
    }
    for (const x of Object.values(v)) walk(x, depth + 1);
  };
  walk(body, 0);
  return out;
}

// The game pages come with their selections in English or in Albanian (sipër / poshtë = over / under,
// po / jo = yes / no, tek / çift = odd / even, saktë = exactly, skuadra = team): all shown in Portuguese.
const WORDS = {
  over: 'Mais de', under: 'Menos de', yes: 'Sim', no: 'Não', odd: 'Ímpar', even: 'Par', exactly: 'Exatamente', exact: 'Exatamente', draw: 'Empate', neither: 'Nenhum',
  'sipër': 'Mais de', siper: 'Mais de', 'poshtë': 'Menos de', poshte: 'Menos de', po: 'Sim', jo: 'Não', tek: 'Ímpar', 'çift': 'Par', cift: 'Par',
  'saktë': 'Exatamente', sakte: 'Exatamente', skuadra: 'Equipa', golat: 'golos', gol: 'golo', dhe: 'e', ose: 'ou', 'asnjëri': 'Nenhum', pjesa: 'parte',
};
const WORD_RE = new RegExp(`(?<![\\p{L}\\d])(${Object.keys(WORDS).join('|')})(?![\\p{L}\\d])`, 'giu');
const clean = (v, max) => String(v ?? '').replace(/[~|\n\r]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
const ptWords = (t) => t.replace(WORD_RE, (w) => WORDS[w.toLowerCase()] ?? w);

/**
 * Every market of a game page we do not settle ourselves (for that sport), and the lines of our own
 * markets we cannot settle (quarter lines), → operator-settled 'x' selections, so every market shows:
 * "x|<marketId>~<market>~<selection>". The market title is the first one the page gives for that
 * id, without the "[CODE]" tag; a line goes next to the selection: "Mais de (8.5)".
 */
export function extraPrices(odds, { sport = null, limit = 3000, ids = null } = {}) {
  const own = new Set(SPORT_MARKETS[sport] || []);
  const out = {};
  const titles = new Map();
  let n = 0;
  for (const o of odds) {
    // Our own markets stay ours; only their lines we do not settle (2.25, 1.75…) go to the operator.
    if ((own.has(o.marketId) && ownKey(o, sport)) || n >= limit) continue;
    const v = x100(o.price);
    if (!v) continue;
    if (!titles.has(o.marketId)) titles.set(o.marketId, clean(String(o.marketName || '').replace(/\s*\[[^\]]*\]/g, ' '), 70) || `Mercado ${o.marketId}`);
    const label = clean(`${ptWords(String(o.selection))}${o.special ? ` (${o.special})` : ''}`, 70);
    if (!label) continue;
    const key = `x|${o.marketId}~${titles.get(o.marketId)}~${label}`;
    if (out[key] !== undefined) continue;
    out[key] = v;
    if (ids && o.oddId) ids.set(key, o.oddId);
    n += 1;
  }
  return out;
}

/** Every market one game page offers, grouped: name, code, category, a few selections (line, price). */
export function marketCatalog(body) {
  const odds = Array.isArray(body) ? detailOdds(body) : [];
  if (!odds.length) for (const ev of eventsOf(body)) odds.push(...parseOdds(ev?.odd));
  const byMarket = new Map();
  for (const o of odds) {
    const m = byMarket.get(o.marketId) || { marketId: o.marketId, name: o.marketName, code: o.marketCode, category: o.category ?? null, mapped: MAPPED_MARKETS.has(o.marketId), count: 0, selections: [] };
    m.count += 1;
    if (m.selections.length < 10) m.selections.push(`${o.selection}${o.special ? ` [${o.special}]` : ''} @ ${o.price}`);
    byMarket.set(o.marketId, m);
  }
  return { totalOdds: odds.length, markets: [...byMarket.values()].sort((a, b) => a.marketId - b.marketId) };
}

export function createWinHouseClient({
  baseUrl = '', lang = 'pt', routes = {}, tenant = '', apiKey = '', walletKey = '', timeoutMs = 20_000, fetchImpl = globalThis.fetch, log = () => {},
} = {}) {
  const base = String(baseUrl || '').replace(/\/+$/, '');
  const paths = { ...ROUTES, ...Object.fromEntries(Object.entries(routes).filter(([, v]) => v)) };
  const enabled = /^https:\/\//.test(base);
  const url = (key, vars = {}) => base + paths[key].replace('{lang}', encodeURIComponent(lang)).replace('{gameId}', encodeURIComponent(vars.gameId ?? ''))
    .replace('{sportId}', encodeURIComponent(vars.sportId ?? '')).replace('{eid}', encodeURIComponent(vars.eid ?? '')).replace('{akey}', encodeURIComponent(vars.akey ?? '')).replace('{tenant}', encodeURIComponent(tenant));

  async function request(key, vars, extraHeaders = {}, { method = 'GET', body: payload } = {}) {
    if (!enabled) throw new Error('WinHouse desligado: defina WINHOUSE_BASE_URL (https://…) no servidor.');
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), timeoutMs);
    const started = Date.now();
    try {
      const res = await fetchImpl(url(key, vars), {
        method,
        headers: { Accept: 'application/json', 'User-Agent': 'BET62-Data-Service/1.0', Referer: `${base}/`, ...(payload ? { 'Content-Type': 'application/json' } : {}), ...extraHeaders },
        body: payload ? JSON.stringify(payload) : undefined,
        signal: ctl.signal,
      });
      const text = await res.text();
      let body = null;
      try { body = JSON.parse(text); } catch { /* not JSON */ }
      return { status: res.status, ok: res.ok, ms: Date.now() - started, bytes: text.length, contentType: res.headers?.get?.('content-type') || null, body, text };
    } catch (err) {
      throw new Error(err.name === 'AbortError' ? `sem resposta em ${timeoutMs / 1000} s` : `rede: ${err.message}`);
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Calls the six routes from this server and reports, for each: HTTP status, time, size, whether
   * it is JSON, how many events, the shape of the first one and how many of its odds we can read.
   * The pre-match page uses the first game id of the pre-match lists (or `gameId`); the live page, the first live game.
   */
  /**
   * One game's page (`prematchgame/{id}`; without an id, the first game of the main pre-match
   * list): every market it offers, grouped, so new markets can be mapped. Read-only.
   */
  async function markets({ gameId = null, live = false } = {}) {
    let id = gameId;
    if (!id) {
      const list = await request(live ? 'live' : 'prematchMain', {});
      const evs = eventsOf(list.body).filter((e) => e?.id);
      // Live: the best game we would show (football first, then the biggest league), not just the first.
      const pick = live ? bestLiveGame(evs) : evs[0];
      id = pick?.id ?? null;
      if (!id) throw new Error(live ? 'Nenhum jogo na lista ao vivo para abrir.' : 'Nenhum jogo na lista pré-jogo para abrir.');
    }
    let key = live ? 'liveEvent' : 'prematchEvent';
    let r = await request(key, { gameId: id });
    let cat = marketCatalog(r.body);
    // What the live page itself answered, even when the pre-match page is used instead.
    const liveAttempt = live ? {
      route: paths.liveEvent.replace('{lang}', lang).replace('{gameId}', id), status: r.status, bytes: r.bytes, contentType: r.contentType,
      json: r.body !== null, totalOdds: cat.totalOdds,
      keys: r.body && typeof r.body === 'object' && !Array.isArray(r.body) ? Object.keys(r.body).slice(0, 40) : null,
      sample: (r.body !== null ? JSON.stringify(r.body) : r.text || '').slice(0, 6000),
    } : undefined;
    // No live page (or an empty one): the pre-match page of the same game.
    if (live && (!r.ok || !cat.totalOdds)) {
      const alt = await request('prematchEvent', { gameId: id });
      const altCat = marketCatalog(alt.body);
      if (alt.ok && altCat.totalOdds) { key = 'prematchEvent'; r = alt; cat = altCat; }
    }
    return {
      at: new Date().toISOString(), gameId: String(id), live, route: paths[key].replace('{lang}', lang).replace('{gameId}', id), status: r.status, bytes: r.bytes, json: r.body !== null,
      ...cat,
      liveAttempt,
      // The first entries in full (field names and values), so unknown layouts can be mapped.
      sample: cat.totalOdds ? undefined : r.body === null ? r.text.slice(0, 2000) : JSON.stringify(Array.isArray(r.body) ? r.body.slice(0, 4) : r.body).slice(0, 8000),
    };
  }

  /**
   * Admin: the routes WinHouse's own iframe uses. Reads its pages and their same-origin scripts
   * and lists every "/ajax/…" (and widget / ws) path found, so the live game page can be set in
   * WINHOUSE_LIVE_EVENT without guessing. Read-only; at most `maxScripts` scripts.
   */
  async function discover({ gameId = null, maxScripts = 25, maxBytes = 4_000_000 } = {}) {
    if (!enabled) throw new Error('WinHouse desligado: defina WINHOUSE_BASE_URL (https://…) no servidor.');
    const get = async (u) => {
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), timeoutMs);
      try {
        const res = await fetchImpl(u, { headers: { 'User-Agent': 'BET62-Data-Service/1.0', Referer: `${base}/` }, signal: ctl.signal });
        const text = (await res.text()).slice(0, maxBytes);
        return { status: res.status, text };
      } catch (err) { return { status: null, text: '', error: err.message }; } finally { clearTimeout(timer); }
    };
    const origin = new URL(base).origin;
    const routes = new Map(); // path → [where]
    const add = (path, where) => {
      const p = path.replace(/["'`\\]+$/, '');
      if (!routes.has(p)) routes.set(p, []);
      if (routes.get(p).length < 3 && !routes.get(p).includes(where)) routes.get(p).push(where);
    };
    // Where the known routes are mentioned, with the text around them (how the iframe builds its URLs).
    const hits = [];
    const KEYWORDS = /livegames|prematchgame|livegame|liveevent|live_game|liveodds|live-odds|gameodds|getgame|event_odds|ws-widget|widget-data|socket\.io|sockjs|signalr/gi;
    const scan = (text, where) => {
      for (const m of text.matchAll(/["'`](\/?(?:ajax|api|ws-|widget|socket|live|game|event|odds|sport)[A-Za-z0-9_\-./{}$:?=&+]*)["'`]/gi)) add(m[1], where);
      for (const m of text.matchAll(/\/ajax\/[A-Za-z0-9_\-/]+/g)) add(m[0], where);
      for (const m of text.matchAll(/wss?:\/\/[A-Za-z0-9_\-./]+(?:\/[A-Za-z0-9_\-./?=&{}$]*)?/g)) add(m[0], where);
      for (const m of text.matchAll(KEYWORDS)) {
        if (hits.length >= 40) break;
        hits.push({ where, around: text.slice(Math.max(0, m.index - 120), m.index + 160).replace(/\s+/g, ' ') });
      }
    };
    // Crawl the iframe: same-origin pages (links, iframes) and scripts (script src, preloads, imports).
    // The iframe's own documentation first (llms.txt, docs/agent.md, docs): it lists the API routes.
    const DOCS = ['/llms.txt', '/docs/agent.md', '/docs'];
    const pagesQ = [...DOCS, '/', '/portal', gameId ? `/ajax/widget?event_id=${encodeURIComponent(gameId)}&bg=transparent` : null].filter(Boolean).map((p) => origin + p);
    const docs = {};
    const session = []; // code around the book's sign-in and session handling
    const docRoutes = new Set();
    const LOCALE = /^\/[a-z]{2}\/?$/; // /de/, /pt … the same portal in other languages
    const scriptsQ = [];
    const seen = new Set();
    const visited = [];
    const links = new Set();
    const local = (ref, from) => { try { const u = new URL(ref, from); return u.origin === origin ? u.href.split('#')[0] : null; } catch { return null; } };
    let pagesRead = 0;
    let scriptsRead = 0;
    while ((pagesQ.length && pagesRead < 15) || (scriptsQ.length && scriptsRead < maxScripts)) {
      const isPage = pagesQ.length && pagesRead < 15;
      const u = isPage ? pagesQ.shift() : scriptsQ.shift();
      if (seen.has(u)) continue;
      seen.add(u);
      const r = await get(u);
      const name = new URL(u).pathname + new URL(u).search;
      visited.push({ [isPage ? 'page' : 'script']: name, status: r.status, bytes: r.text.length, error: r.error });
      if (isPage) pagesRead += 1; else scriptsRead += 1;
      if (!r.text) continue;
      scan(r.text, name);
      // The sportsbook's own API client and push feed: how it calls /ajax and subscribes to odds.
      if (/^\/sb\/assets\/js\/(api|push)\.js$/.test(new URL(u).pathname)) docs[new URL(u).pathname] = r.text.slice(0, 40_000);
      // How the book signs a player in and sends that session (live video needs one): the code around it.
      if (/\/sb\/assets\/js\//.test(new URL(u).pathname)) {
        // The live video uses a short read-scope token (lToken), swapped for the sign-in one (rToken):
        // its definitions get a longer window, to see which route makes that swap.
        for (const m of r.text.matchAll(/function [lr]Token\b|read-scope|livestream|tenant\/sso|tenant\/session|ajaxauth|setLaunch|launch=|Authorization|X-WH-[A-Za-z]+|document\.cookie|sessionToken|authToken/g)) {
          if (session.length >= 40) break;
          const wide = /Token\b|read-scope/.test(m[0]);
          const around = r.text.slice(Math.max(0, m.index - (wide ? 200 : 300)), m.index + (wide ? 1600 : 400)).replace(/\s+/g, ' ');
          if (!session.some((x) => x.around === around)) session.push({ where: name, match: m[0], around });
        }
      }
      if (DOCS.includes(new URL(u).pathname)) {
        // Documentation: its text (tags removed) and every route it names.
        const text = r.text.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/[ \t]+/g, ' ').replace(/\n\s*\n+/g, '\n');
        docs[new URL(u).pathname] = text.slice(0, 30_000);
        for (const m of text.matchAll(/(?:https?:\/\/[^\s"'<>)]+)?\/(?:ajax|api|widget-data|ws-widget|ws)[^\s"'<>)`,]*/g)) docRoutes.add(m[0]);
      }
      if (isPage) {
        for (const m of r.text.matchAll(/<script[^>]+src=["']([^"']+)["']/gi)) { const l = local(m[1], u); if (l) scriptsQ.push(l); }
        for (const m of r.text.matchAll(/<link[^>]+href=["']([^"']+\.m?js[^"']*)["']/gi)) { const l = local(m[1], u); if (l) scriptsQ.push(l); }
        for (const m of r.text.matchAll(/<(?:iframe|frame)[^>]+src=["']([^"']+)["']/gi)) { const l = local(m[1], u); if (l) { links.add(new URL(l).pathname); pagesQ.push(l); } }
        for (const m of r.text.matchAll(/<a[^>]+href=["']([^"'#?]+)[^"']*["']/gi)) {
          const l = local(m[1], u);
          if (l && !/\.(png|jpe?g|svg|webp|gif|ico|css|pdf|zip)$/i.test(l)) {
            links.add(new URL(l).pathname);
            if (!LOCALE.test(new URL(l).pathname) && !/\/(terms|privacy)$/.test(new URL(l).pathname)) pagesQ.push(l);
          }
        }
      } else {
        // Chunks loaded by the script: import("./x.js"), from "./x.js", "/assets/x.js".
        for (const m of r.text.matchAll(/["'`]((?:\.{0,2}\/)?[A-Za-z0-9_\-./]+\.m?js)["'`]/g)) { const l = local(m[1], u); if (l) scriptsQ.push(l); }
        // Pages the script navigates to (location / href = "/sport…").
        for (const m of r.text.matchAll(/["'`](\/(?:sport|sports|esporte|desporto|live|inplay|in-play|prematch|betting|bet|game|event|match)[A-Za-z0-9_\-./]*)["'`]/gi)) { const l = local(m[1], u); if (l) { links.add(m[1]); pagesQ.push(l); } }
      }
    }
    const list = [...routes.entries()].map(([path, where]) => ({ path, where }))
      .sort((a, b) => (/live/i.test(b.path) - /live/i.test(a.path)) || a.path.localeCompare(b.path));
    return {
      at: new Date().toISOString(), baseUrl: base, visited, links: [...links].slice(0, 60), scriptsFound: seen.size - pagesRead,
      docRoutes: [...docRoutes].slice(0, 200),
      routes: list.slice(0, 300), live: list.filter((r) => /live|game|event|match|odd|market/i.test(r.path)).map((r) => r.path).slice(0, 60), hits,
      docs,
      // The token swap first (it is what the live video is missing).
      session: [...session.filter((x) => /Token|read-scope/.test(x.match)), ...session.filter((x) => !/Token|read-scope/.test(x.match))],
    };
  }

  async function health({ gameId = null } = {}) {
    const out = [];
    let firstId = gameId;
    let liveId = null;
    for (const key of ['live', 'liveEvent', 'prematchMain', 'prematchTop', 'prematch24h', 'prematchEvent']) {
      const page = key === 'prematchEvent' || key === 'liveEvent';
      const id = key === 'liveEvent' ? liveId : firstId;
      if (page && !id) { out.push({ route: key, skipped: key === 'liveEvent' ? 'nenhum jogo na lista ao vivo' : 'nenhum gameId nas listas pré-jogo' }); continue; }
      try {
        const r = await request(key, { gameId: id });
        const events = page ? [] : eventsOf(r.body);
        if (key === 'live') liveId = events.find((e) => e?.id)?.id ?? null;
        else if (!firstId && !page) firstId = events.find((e) => e?.id)?.id ?? null;
        const first = page ? r.body : events[0];
        const pageOdds = page ? detailOdds(r.body) : [];
        const odds = pageOdds.length ? pageOdds : first ? parseOdds(first.odd ?? first.odds) : [];
        out.push({
          route: key, path: paths[key].replace('{lang}', lang).replace('{gameId}', id ?? ''), status: r.status, ok: r.ok, ms: r.ms, bytes: r.bytes,
          json: r.body !== null, contentType: r.contentType, events: events.length,
          oddsParsed: odds.length, oddsMapped: odds.filter(marketKey).length, markets: page ? new Set(odds.map((o) => o.marketId)).size : undefined,
          firstItem: first && !page ? shape(first) : null,
          bodyStart: r.body === null ? r.text.slice(0, 300) : undefined,
        });
      } catch (err) {
        out.push({ route: key, error: err.message });
      }
    }
    log(`WinHouse health: ${out.map((x) => `${x.route}=${x.status ?? x.error ?? x.skipped}`).join(' ')}`);
    return { at: new Date().toISOString(), baseUrl: base, lang, routes: out };
  }

  return {
    enabled, health,
    live: () => request('live'),
    prematchMain: () => request('prematchMain'),
    prematchTop: () => request('prematchTop'),
    prematch24h: () => request('prematch24h'),
    prematchBySport: (sportId) => request('prematchBySport', { sportId }),
    prematchEvent: (gameId) => request('prematchEvent', { gameId }),
    liveEvent: (gameId) => request('liveEvent', { gameId }),
    widget: (gameId) => request('widget', { gameId }),
    widgetData: (eid, akey) => request('widgetData', { eid, akey }),
    tracker: (gameId) => request('tracker', { gameId }),
    streams: () => request('streams'),
    // The operator's credentials go only on this call (on the odds lists the tenant would change the margin).
    // The book sends the player's session as x-access-token (betting.js); without one: error_not_logged_in.
    livestream: (gameId, sessionToken = null) => request('livestream', { gameId }, {
      ...(tenant ? { 'X-WH-Tenant': tenant } : {}), ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
      ...(sessionToken ? { 'x-access-token': sessionToken } : {}),
    }),
    hasWallet: !!(walletKey && tenant),
    /** POST /tenant/session → { ok, token, username, tenant }: a book session for one of our players. */
    tenantSession: (playerId) => request('tenantSession', {}, { Authorization: `Bearer ${walletKey}` },
      { method: 'POST', body: { customer_key: tenant, player_id: String(playerId) } }),
    /**
     * POST /tenant/sso { key, launch } → { ok, token, username }. launch =
     * playerId.expiry(ms).session.HMAC_SHA256("playerId|expiry|session", wallet key) — the key only signs, it is never sent.
     */
    tenantSso: (playerId, { session = 'bet62-tv', ttlMs = 5 * 60_000, now = Date.now() } = {}) => {
      const player = String(playerId);
      const expiry = now + ttlMs;
      const sig = createHmac('sha256', walletKey).update(`${player}|${expiry}|${session}`).digest('hex');
      return request('tenantSso', {}, {}, { method: 'POST', body: { key: tenant, launch: `${player}.${expiry}.${session}.${sig}` } });
    },
    /** POST /aaa/token_l (x-access-token: the sign-in token) → { lToken }, as betting.js does before the video. */
    tokenL: (signInToken) => request('tokenL', {}, { 'x-access-token': signInToken }, { method: 'POST', body: {} }),
    hasTenant: !!tenant,
    wsUrl: (eid, akey) => url('wsWidget', { eid, akey }).replace(/^https:/, 'wss:'),
    origin: base,
    markets,
    discover,
  };
}

// ---------- collector (events, odds, live, settlement) ----------


export const SOURCE = 'winhouse';

/** WinHouse sport_id → our sport (only the sports Bet62 shows and can settle). */
export const SPORTS = {
  1: 'futebol', 2: 'basquetebol', 4: 'hoquei', 5: 'tenis', 6: 'andebol', 20: 'tenismesa', 23: 'voleibol', 29: 'futsal', 31: 'badminton',
};

// Women's, youth and minor competitions can be left out (WINHOUSE_BLOCK_WOMEN / _YOUTH / _MINOR).
const WOMEN = /\b(women|woman|womens|feminino|feminina|femenino|femenina|féminin|feminine|femmes?|damen|frauen|ladies|mulheres|wta)\b|\((w|f)\)/i;
const YOUTH = /\b(u-?\s?\d{2}|sub-?\s?\d{2}|under-?\s?\d{2}|junior|juniors|júnior|juniores|juvenil|juvenis|youth|jugend|primavera|academy|academia)\b/i;
// Virtual / e-football (FIFA 4x4, 5x5, subsoccer, cyber…), the small table tennis circuits
// (ATT, Setka Cup, TT Cup…) and UTR tennis: played around the clock, of little interest.
const MINOR = new RegExp([
  String.raw`\b(e-?soccer|e-?football|e-?sports? battle|cyber|subsoccer|sub soccer|h2h gg|gt leagues|esoccer)\b`,
  String.raw`\b\d\s?x\s?\d\b`,
  String.raw`\bfifa\b(?!\s*(world cup|club world cup|intercontinental|series|copa do mundo|mundial))`,
  String.raw`\b(att|setka cup|tt cup|win cup|tt elite series|tt star series|pro tennis series|utr)\b`,
].join('|'), 'i');
const MINOR_TT = /\bliga pro\b/i; // table tennis only ("LigaPro" is also Ecuador's football league)
/** Extra terms from WINHOUSE_BLOCK_LEAGUES ("ATT, Setka") → one case-insensitive pattern, or null. */
export function leagueTerms(list) {
  const terms = String(list || '').split(/[,;\n]/).map((t) => t.trim()).filter(Boolean)
    .map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  return terms.length ? new RegExp(terms.join('|'), 'i') : null;
}
// Football: only these competitions (WinHouse's own names; WINHOUSE_FOOTBALL_LEAGUES replaces the list, "*" = all).
// Grouped by country / region as the sidebar shows them.
export const FOOTBALL_TREE = [
  ['Africa', ['Africa Cup of Nations']],
  ['Argentina', ['Argentina. Primera B Metropolitana', 'Argentina. Primera B Nacional', 'Argentina. Primera Division', 'Copa Argentina']],
  ['Australia', ['Australia. A League']],
  ['Austria', ['Austria. Bundesliga']],
  ['Belgium', ['Belgium. Jupiler League']],
  ['Brazil', ['Brazil. Campeonato Brasileiro. Serie A', 'Brazil. Campeonato Brasileiro. Serie B', 'Brazil. Copa do Brasil']],
  ['Canada', ['Canada. Premier League']],
  ['Chile', ['Chile Cup', 'Chile. Primera Division']],
  ['Colombia', ['Colombia. Categoria Primera A', 'Colombia. Categoria Primera B']],
  ['Czech Republic', ['Czech Republic. Chance Liga']],
  ['Denmark', ['Denmark. Superliga']],
  ['Ecuador', ['Ecuador. Serie A']],
  ['England', ['England. Championship', 'England. League One', 'England. League Two', 'England. National League', 'England. Premier League']],
  ['Europe', ['UEFA Champions League', 'UEFA Conference League', 'UEFA Europa League', 'UEFA Nations League']],
  ['Finland', ['Finland. Veikkausliiga']],
  ['France', ['France. Ligue 1', 'France. Ligue 2']],
  ['Germany', ['Germany DFB Pokal', 'Germany. 2. Bundesliga', 'Germany. Bundesliga']],
  ['Greece', ['Greece. SuperLeague', 'Greek Cup']],
  ['Israel', ['Israel. Liga Alef. North']],
  ['Italy', ['Italy. Serie A', 'Italy. Serie B', 'Italy. Serie C. Group A']],
  ['Japan', ['Japan. J-League Division 2']],
  ['Mexico', ['Mexico. Liga MX']],
  ['Netherlands', ['Netherlands. Eerste Divisie', 'Netherlands. Eredivisie']],
  ['Norway', ['Norway. Eliteserien']],
  ['Paraguay', ['Paraguay. Fourth Division', 'Paraguay. Primera Division']],
  ['Peru', ['Peru. Liga 1']],
  ['Poland', ['Poland Championship. Liga 2', 'Poland. Ekstraklasa']],
  ['Portugal', ['Portugal. Primeira Liga', 'Portugal. Segunda Liga']],
  ['Romania', ['Romania. Liga 1']],
  ['Serbia', ['Serbia. 1st League', 'Serbia. SuperLiga']],
  ['South America', ['Copa Libertadores', 'Copa Sudamericana']],
  ['South Korea', ['South Korea. League K3']],
  ['Spain', ['Spain. La Liga', 'Spain. Primera Division RFEF. Group 1', 'Spain. Primera Division RFEF. Group 2', 'Spain. Segunda Division']],
  ['Sweden', ['Sweden. Allsvenskan', 'Sweden. Division 1']],
  ['Switzerland', ['Switzerland. SuperLeague']],
  ['Turkey', ['Turkey. SuperLiga']],
  ['United States', ['USA. MLS']],
  ['Uruguay', ['Uruguay. Primera Division']],
  ['World', ['Club Friendlies', 'Friendlies. National Teams']],
];
export const FOOTBALL_LEAGUES = FOOTBALL_TREE.flatMap(([, leagues]) => leagues);
// Basketball and tennis: only these competitions too (WINHOUSE_BASKETBALL_LEAGUES / WINHOUSE_TENNIS_LEAGUES
// replace the lists, "*" = all). Tennis also takes every ATP / WTA / Challenger tournament on its own
// (tennistours.js); the list below adds ITF ones by name (they change every week).
export const BASKETBALL_TREE = [
  ['Europe', ['ABA League', 'Euroleague']],
  ['France', ['France. LNB']],
  ['Germany', ['Germany. BBL']],
  ['Italy', ['Italy. Lega A']],
  ['Philippines', ['Philippines. NCAA']],
  ['Spain', ['Spain. Liga ACB']],
  ['United States', ['NBA', 'WNBA']],
];
export const TENNIS_TREE = [
  ['Australia', ['World Tennis. Darwin', 'World Tennis. Darwin. Doubles', 'World Tennis. Wagga Wagga. Women', 'World Tennis. Wagga Wagga. Women. Doubles']],
  ['China', ['World Tennis. Luan', 'World Tennis. Luan. Doubles', 'World Tennis. Maanshan. Women', 'World Tennis. Maanshan. Women. Doubles']],
  ['Egypt', ['World Tennis. Sharm El Sheikh', 'World Tennis. Sharm El Sheikh. Doubles', 'World Tennis. Sharm El Sheikh. Women']],
  ['Rwanda', ['World Tennis. Kigali']],
  ['Tunisia', ['World Tennis. Monastir 2', 'World Tennis. Monastir 2. Doubles', 'World Tennis. Monastir. Women']],
];
/** The sidebar's country → leagues trees, per sport. */
export const LEAGUE_TREES = { futebol: FOOTBALL_TREE, basquetebol: BASKETBALL_TREE, tenis: TENNIS_TREE };
/** A competition name compared loosely: case, accents, dots and spaces ignored. */
export const leagueKey = (name) => String(name || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '');
/** The tree's competitions plus, for football, every covered country's first and second division. */
class LeagueSet extends Set {
  has(k) { return super.has(k) || !!divisionOf(k); }
}
/** The tree's competitions plus every ATP, WTA and Challenger tournament (singles, doubles, qualifying). */
class TourSet extends Set {
  has(k) { return super.has(k) || !!tourOf(k); }
}
/**
 * A list of competitions (names separated by ; or new lines) → the allowed ones (Set of keys); "*" =
 * all (null). Empty = the tree's, and for football also the first and second division of every
 * covered country (footballdivisions.js), for tennis every ATP / WTA / Challenger tournament
 * (tennistours.js), whatever WinHouse calls them.
 */
export function allowedLeagues(list, tree = FOOTBALL_TREE) {
  const text = String(list ?? '').trim();
  if (text === '*' || /^(all|todas|todos)$/i.test(text)) return null;
  const names = text ? text.split(/[;\n]|,(?!\s*\d)/).map((t) => t.trim()).filter(Boolean) : tree.flatMap(([, leagues]) => leagues);
  const keys = names.map(leagueKey);
  if (!text && tree === FOOTBALL_TREE) return new LeagueSet(keys);
  if (!text && tree === TENNIS_TREE) return new TourSet(keys);
  return new Set(keys);
}
/** WINHOUSE_FOOTBALL_LEAGUES → the allowed football competitions (Set of keys), or null for all. */
export const footballLeagues = (list) => allowedLeagues(list, FOOTBALL_TREE);

/** Admin sample: a shown sport, not blocked, football first, then the highest league tier. */
export function bestLiveGame(evs) {
  return liveGamesByRank(evs)[0] || null;
}
/** The live list in the order we would show it: football first, then the biggest leagues. */
export function liveGamesByRank(evs) {
  const rank = (e) => {
    const sport = SPORTS[Number(e.sport_id)];
    if (!sport || blockedGame(e)) return 1e6;
    return (sport === 'futebol' ? 0 : 100) + leagueTier(sport, e.league || e.league_name || '');
  };
  return [...evs].sort((a, b) => rank(a) - rank(b));
}
/**
 * True when the game is left out: its sport has a list of competitions and this one is not in it, or
 * the competition or a team marks it as women's / youth / minor (as configured). `leagues` is
 * { sport: Set of keys } (a Set alone: football's). A competition listed by name is shown even when
 * it is a women's one (WTA, "… Women"): it was picked on purpose.
 */
export function blockedGame(ev, { women = true, youth = true, minor = true, extra = null, leagues = null } = {}) {
  const text = [ev?.league, ev?.name, ev?.home_team, ev?.away_team].filter(Boolean).join(' · ');
  const sport = ev?.sport || SPORTS[Number(ev?.sport_id)];
  const allow = leagues instanceof Set ? (sport === 'futebol' ? leagues : null) : leagues?.[sport] || null;
  if (allow && !allow.has(leagueKey(ev?.league))) return true;
  // Listed: the competition's own name does not count for the women's filter (the teams still do).
  const womenText = allow ? [ev?.name, ev?.home_team, ev?.away_team].filter(Boolean).join(' · ') : text;
  return (women && WOMEN.test(womenText)) || (youth && YOUTH.test(text))
    || (minor && (MINOR.test(text) || (sport === 'tenismesa' && MINOR_TT.test(text))))
    || (!!extra && extra.test(text));
}

const x100 = (p) => { const n = Math.round(Number(p) * 100); return Number.isFinite(n) && n > 100 && n < 100_000 ? n : null; };
// Half or whole line (a whole line voids on a push); quarter lines (2.25) would split the stake: not offered.
const plainLine = (v) => Number.isFinite(v) && v > 0 && Number.isInteger(v * 2);

const ODD_EVEN = { odd: 'ODD', even: 'EVEN', 'ímpar': 'ODD', impar: 'ODD', par: 'EVEN', tek: 'ODD', 'çift': 'EVEN', cift: 'EVEN' };
const YES_NO = { yes: 'Y', no: 'N', sim: 'Y', 'não': 'N', nao: 'N', po: 'Y', jo: 'N' };

/**
 * Asian handicap from a game page: the line is the home side's ("1 [-1.5]" and "2 [-1.5]" are
 * home −1.5 / away +1.5). Whole and half lines only (quarter lines split the stake). → "1-1.5".
 */
function asianHandicap(side, special) {
  const line = Number(String(special ?? '').replace(',', '.'));
  if ((side !== '1' && side !== '2') || special === null || special === undefined || !Number.isFinite(line) || !Number.isInteger(line * 2) || Math.abs(line) > 50) return null;
  const own = side === '1' ? line : -line;
  return `${side}${own >= 0 ? '+' : ''}${own === 0 ? 0 : own}`;
}

/** "3:1" → "3:1" (a correct score), or null. */
const exactScore = (sel) => { const m = /^(\d{1,2})\s*[:-]\s*(\d{1,2})$/.exec(String(sel).trim()); return m ? `${Number(m[1])}:${Number(m[2])}` : null; };

/** "over 2.5" / "under 2.5" (also translated wordings) → ['O', 2.5]. */
function overUnder(sel) {
  // "over 2.5", "Mais 2.5", "mais de 2,5", "Acima (2.5)", "2.5 Mais"… (the book answers in Portuguese).
  const s = String(sel).toLowerCase().replace(/[()[\]]/g, ' ').replace(/\s+/g, ' ').trim();
  const WORD = '(over|under|mais(?: de)?|menos(?: de)?|acima(?: de)?|abaixo(?: de)?|sipër|siper|poshtë|poshte|o|u)';
  let m = new RegExp(`^${WORD}\\s*([\\d.,]+)$`, 'i').exec(s);
  if (!m) { const r = new RegExp(`^([\\d.,]+)\\s*${WORD}$`, 'i').exec(s); if (r) m = [r[0], r[2], r[1]]; }
  if (!m) return null;
  const side = /^(over|mais|acima|sip|o)/i.test(m[1]) ? 'O' : 'U';
  const line = Number(m[2].replace(',', '.'));
  return plainLine(line) ? [side, line] : null;
}

/** Our 'market|code' for one odd of a game, or null (the markets pricesFor understands). */
function ownKey(o, sport) {
  const raw = String(o.selection).toLowerCase().trim();
  // Game pages carry the line apart (special_value): "over" + "2.5" → "over 2.5".
  const sel = o.special && !/\d/.test(raw) ? `${raw} ${o.special}` : raw;
  let c;
  if (sport === 'futebol' || sport === 'andebol' || sport === 'futsal') {
    if (o.marketId === 1001) return (c = { 1: '1', x: 'X', 2: '2' }[sel]) ? `1x2|${c}` : null;
    if (o.marketId === 1005) return (c = { '1x': '1X', 12: '12', x2: 'X2' }[sel]) ? `dc|${c}` : null;
    if (o.marketId === 1018) return (c = overUnder(sel)) ? `ou|${c[0]}${c[1]}` : null;
    if (o.marketId === 1007) return (c = YES_NO[raw]) ? `btts|${c}` : null;
    if (o.marketId === 1019) return (c = ODD_EVEN[raw]) ? `oe|${c}` : null;
    if (o.marketId === 1011) return (c = asianHandicap(raw, o.special)) ? `hcp|${c}` : null;
    if (o.marketId === 1708) return (c = exactScore(raw)) ? `cs|${c}` : null;
    if (o.marketId === 1725 || o.marketId === 1714) return (c = overUnder(sel)) ? `tou|${o.marketId === 1725 ? 1 : 2}${c[0]}${c[1]}` : null;
  } else if (sport === 'basquetebol') {
    if (o.marketId === 1022) return (c = { 1: '1', 2: '2' }[sel]) ? `ml|${c}` : null;
    if (o.marketId === 1672) return (c = overUnder(sel)) ? `ou|${c[0]}${c[1]}` : null;
    if (o.marketId === 1011) return (c = asianHandicap(raw, o.special)) ? `hcp|${c}` : null;
  } else if (sport === 'hoquei') {
    if (o.marketId === 1045) return (c = { 1: '1', x: 'X', 2: '2' }[sel]) ? `1x2|${c}` : null;
    if (o.marketId === 1161) return (c = exactScore(sel)) ? `cs|${c}` : null; // regulation correct score
    if (o.marketId === 1168) return (c = { '1x': '1X', 12: '12', x2: 'X2' }[sel]) ? `dc|${c}` : null;
    if (o.marketId === 1870) return (c = overUnder(sel)) ? `ou|${c[0]}${c[1]}` : null;
    if (o.marketId === 1160) return (c = ODD_EVEN[raw]) ? `oe|${c}` : null;
  } else if (sport === 'tenis') {
    if (o.marketId === 1016) return (c = { 1: '1', 2: '2' }[sel]) ? `1x2|${c}` : null;
  } else if (sport === 'tenismesa' || sport === 'badminton') {
    if (o.marketId === 1044) return (c = { 1: '1', 2: '2' }[sel]) ? `ml|${c}` : null;
    if (o.marketId === 1992) return (c = exactScore(sel)) ? `cs|${c}` : null; // sets
  } else if (sport === 'voleibol') {
    // Volleyball has no draw: only the two winners of its "1x2" are offered.
    if (o.marketId === 1001) return (c = { 1: '1', 2: '2' }[sel]) ? `ml|${c}` : null;
  }
  return null;
}

/**
 * One event's odds → { 'market|code': x100 } in our markets. Only full markets the settlement
 * understands: 1X2 / double chance / goal totals (football), winner incl. overtime and point
 * totals (basketball), regulation 1X2 / double chance / totals / odd-even (ice hockey), match winner
 * (tennis). Whole-line totals void on a push; quarter lines are skipped. A price of 1.00 is a
 * suspended selection and closes its market.
 */
export function pricesFor(odds, sport, ids = null) {
  const out = {};
  const mine = ids ? new Map() : null;
  for (const o of odds) {
    const v = x100(o.price);
    if (!v) continue;
    const k = ownKey(o, sport);
    if (!k) continue;
    out[k] = v;
    if (mine && o.oddId) mine.set(k, o.oddId);
  }
  // Complete markets only.
  const has = (k) => out[k] !== undefined;
  for (const k of Object.keys(out)) {
    const [market, code] = k.split('|');
    let ok = true;
    if (market === '1x2') ok = has('1x2|1') && has('1x2|2') && (sport === 'tenis' || has('1x2|X'));
    else if (market === 'cs') ok = Object.keys(out).filter((x) => x.startsWith('cs|')).length >= 2;
    else if (market === 'dc') ok = has('dc|1X') && has('dc|12') && has('dc|X2');
    else if (market === 'ml') ok = has('ml|1') && has('ml|2');
    else if (market === 'oe') ok = has('oe|ODD') && has('oe|EVEN');
    else if (market === 'btts') ok = has('btts|Y') && has('btts|N');
    else if (market === 'tou') ok = has(`tou|${code[0]}O${code.slice(2)}`) && has(`tou|${code[0]}U${code.slice(2)}`);
    else if (market === 'hcp') { // its other side: 1-1.5 ↔ 2+1.5
      const line = Number(code.slice(1));
      ok = has(`hcp|${code[0] === '1' ? '2' : '1'}${-line >= 0 ? '+' : ''}${-line}`);
    }
    else if (market === 'ou') ok = has(`ou|O${code.slice(1)}`) && has(`ou|U${code.slice(1)}`);
    if (!ok) delete out[k];
  }
  if (ids) for (const [k, id] of mine) if (out[k] !== undefined) ids.set(k, id);
  return out;
}

/** "56:21" → 56.35 (minutes elapsed). */
export const minutesOf = (v) => {
  const m = /^(\d{1,3}):(\d{2})$/.exec(String(v || '').trim());
  return m ? Number(m[1]) + Number(m[2]) / 60 : null;
};

/** Odds → { prices: { 'market|code': x100 }, coefs: Map 'market|code' → WinHouse odd id (for the push feed) }. */
export function bookOf(odds, sport) {
  const coefs = new Map();
  const prices = { ...extraPrices(odds, { sport, ids: coefs }), ...pricesFor(odds, sport, coefs) };
  return { prices, coefs };
}

/** A list item (live or pre-match) → our event, or null for an unsupported sport / bad item. */
export function normalizeItem(ev, { tzOffsetMinutes = 0, block = null } = {}) {
  if (!ev || typeof ev !== 'object' || ev.id === undefined) return null;
  const sport = SPORTS[Number(ev.sport_id)];
  if (!sport) return null;
  if (block && blockedGame(ev, block)) return null;
  const [n1, n2] = String(ev.name || '').split(/\s+-\s+/);
  const home = String(ev.home_team || n1 || '').trim().slice(0, 80);
  const away = String(ev.away_team || n2 || '').trim().slice(0, 80);
  const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(ev.game_date || ''));
  const t = /^(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(String(ev.game_time || ''));
  if (!home || !away || !d || !t) return null;
  // game_date / game_time are WinHouse's local wall time; tzOffsetMinutes is that zone's offset from UTC.
  const start = Date.UTC(+d[1], +d[2] - 1, +d[3], +t[1], +t[2], +(t[3] || 0)) - tzOffsetMinutes * 60_000;
  const score = /^(\d+)\s*-\s*(\d+)$/.exec(String(ev.result || '').trim());
  const minutes = minutesOf(ev.current_minute);
  const safeLogo = (u) => (typeof u === 'string' && /^https:\/\/cdn\.sportapi\.net\/[\w./-]+$/.test(u) ? u : null);
  return {
    externalId: String(ev.id), sport, competition: String(ev.league || 'WinHouse').slice(0, 80), home, away,
    startTime: new Date(start).toISOString(), localStart: `${d[0]}T${t[1]}:${t[2]}`,
    homeScore: score ? Number(score[1]) : null, awayScore: score ? Number(score[2]) : null,
    minutes, clockRaw: ev.current_minute || null,
    homeLogo: safeLogo(ev.home_logo), awayLogo: safeLogo(ev.away_logo),
    // Every market of the list: the settleable ones mapped, the rest operator-settled ('x').
    ...bookOf(parseOdds(ev.odd), sport),
  };
}

/**
 * WinHouse's clock zone, from the live list: a match started (now − minutes played) ago, and its
 * game_time read as UTC is ahead of that by the zone's offset. Median of the early-stage matches,
 * rounded to 30 min; null with fewer than 3 samples.
 */
export function estimateOffset(items, now = Date.now()) {
  const samples = [];
  for (const ev of items) {
    const mins = minutesOf(ev?.current_minute);
    const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(ev?.game_date || ''));
    const t = /^(\d{2}):(\d{2})/.exec(String(ev?.game_time || ''));
    if (mins === null || mins > 30 || !d || !t) continue;
    const asUtc = Date.UTC(+d[1], +d[2] - 1, +d[3], +t[1], +t[2]);
    samples.push((asUtc - (now - mins * 60_000)) / 60_000);
  }
  if (samples.length < 3) return null;
  samples.sort((a, b) => a - b);
  return Math.round(samples[Math.floor(samples.length / 2)] / 30) * 30;
}

// Sports whose clock counts up through the match.
/** How long a match in review with no bets waits, gone from the live list, before it is closed. */
const STALE_CLOSE_MS = 60 * 60_000;
const CLOCK_SPORTS = new Set(['futebol', 'hoquei', 'andebol', 'futsal']);

const clockText = (sport, minutes, raw) => {
  if (minutes === null) return raw ? String(raw).slice(0, 20) : null;
  if (['futebol', 'hoquei', 'andebol', 'futsal'].includes(sport)) return `${Math.floor(minutes)}'`;
  return null; // basketball / tennis: the score says more than an elapsed-time clock
};

/**
 * End of a match that left the live list (and stayed out for the confirmation time). Settles from
 * the last score seen only when it is clearly over; anything else goes to the operator.
 */
export function finishVerdict(row) {
  const m = row.wh_minute;
  const h = row.home_score;
  const a = row.away_score;
  if (!Number.isInteger(h) || !Number.isInteger(a)) return { review: 'sem placar' };
  switch (row.sport) {
    case 'futebol':
      return m >= 88 ? { home: h, away: a } : { review: `saiu do ao vivo ao minuto ${Math.floor(m ?? 0)}` };
    case 'basquetebol': {
      const full = /\bNBA\b/i.test(row.competition) ? 47 : 39;
      if (h === a) return { review: 'empate no último placar visto' };
      return m >= full ? { home: h, away: a } : { review: `saiu do ao vivo ao minuto ${Math.floor(m ?? 0)}` };
    }
    case 'hoquei':
      // Overtime is only played after a regulation draw: the regulation result is that draw.
      if (row.wh_overtime) return { home: h, away: a, regHome: row.reg_home_score, regAway: row.reg_away_score };
      return m >= 59 ? { home: h, away: a, regHome: h, regAway: a } : { review: `saiu do ao vivo ao minuto ${Math.floor(m ?? 0)}` };
    case 'tenis':
    case 'badminton':
      return Math.max(h, a) >= 2 && h !== a ? { home: h, away: a } : { review: `sets ${h}-${a}: possível desistência` };
    case 'tenismesa':
      // Best of five: three sets won.
      return Math.max(h, a) >= 3 && h !== a ? { home: h, away: a } : { review: `sets ${h}-${a}: jogo incompleto` };
    case 'voleibol': {
      // Best of five, or of three in beach / 4x4 / duo formats.
      const need = /beach|praia|4x4|duo/i.test(`${row.competition} ${row.home} ${row.away}`) ? 2 : 3;
      return Math.max(h, a) >= need && h !== a ? { home: h, away: a } : { review: `sets ${h}-${a}: jogo incompleto` };
    }
    case 'andebol':
      return m >= 58 ? { home: h, away: a } : { review: `saiu do ao vivo ao minuto ${Math.floor(m ?? 0)}` };
    case 'futsal':
      return m >= 38 ? { home: h, away: a } : { review: `saiu do ao vivo ao minuto ${Math.floor(m ?? 0)}` };
    default:
      return { review: 'desporto sem regra de fim' };
  }
}

export function createWinHouseFeed(db, {
  client, tzOffsetMinutes = null, finishConfirmSeconds = 600, prematchStaleSeconds = 900, blockWomen = true, blockYouth = true, blockMinor = true, blockLeagues = '', footballLeagues: allowLeagues = undefined, basketballLeagues = undefined, tennisLeagues = undefined,
  detailHours = 12, footballDetailHours = 48, detailPerCycle = 20, detailRefreshMinutes = 30, liveDetailPerCycle = 10, liveDetailSeconds = 30, onOdds = null, log = () => {},
  futureDays = 0, futureMinutes = 10,
} = {}) {
  // Per sport, the competitions shown (a sport left undefined shows all of its own).
  const allow = Object.fromEntries(Object.entries({ futebol: allowLeagues, basquetebol: basketballLeagues, tenis: tennisLeagues })
    .filter(([, list]) => list !== undefined).map(([sp, list]) => [sp, allowedLeagues(list, LEAGUE_TREES[sp])]));
  const block = { women: blockWomen, youth: blockYouth, minor: blockMinor, extra: leagueTerms(blockLeagues), leagues: Object.keys(allow).length ? allow : null };
  const state = {
    enabled: !!client?.enabled, last: {}, lastError: null, lastErrorAt: null,
    offset: Number.isFinite(tzOffsetMinutes) ? tzOffsetMinutes : null, offsetSource: Number.isFinite(tzOffsetMinutes) ? 'WINHOUSE_TZ_OFFSET_MINUTES' : null,
  };
  const offset = () => state.offset ?? 0;
  // Every market of a game comes from its own page (prematchgame/{id}); the lists carry 2–3.
  // Page prices are kept here and merged under the lists' (fresher) ones when prices are written.
  const listPrices = new Map(); // externalId → prices from the last pre-match lists
  const pagePrices = new Map(); // externalId → { at, prices }
  const pageFresh = (ext) => { const p = pagePrices.get(ext); return p && Date.now() - p.at < detailRefreshMinutes * 2 * 60_000 ? p.prices : {}; };
  // In play the same: the live list carries 2–3 markets, the game's live page all of them. Page
  // prices count only for 2 × liveDetailSeconds, are dropped on a goal, and only show while the
  // list itself has open prices (a suspended list means a suspended game).
  const liveListPrices = new Map(); // externalId → prices from the last live list
  const livePages = new Map(); // externalId → { at, prices }
  // A game a player has open is read again once its page is this old (seconds).
  const LIVE_WATCHED_S = Math.min(liveDetailSeconds, 12);
  const liveFresh = (ext) => { const p = livePages.get(ext); return p && Date.now() - p.at < liveDetailSeconds * 2000 ? p.prices : {}; };
  // Fallback after a restart (deploy): the page markets lived only in memory, so the first list read
  // would drop them until each page was read again. They are taken back from the database instead,
  // as if read just past their refresh time: still shown, but first in line to be read again, and
  // replaced as soon as WinHouse answers. Pre-match they last one refresh period at most; in play
  // only liveDetailSeconds (a goal, or the live list suspending the game, still closes them).
  (function restorePages() {
    const rows = db.prepare(`SELECT e.external_id AS ext, e.status, s.market, s.code, s.odds_x100 FROM events e
        JOIN selections s ON s.event_id = e.id WHERE e.source = ? AND e.status IN ('scheduled', 'live') AND s.active = 1`).all(SOURCE);
    const byEvent = new Map();
    for (const r of rows) {
      if (!byEvent.has(r.ext)) byEvent.set(r.ext, { live: r.status === 'live', prices: {} });
      byEvent.get(r.ext).prices[`${r.market}|${r.code}`] = r.odds_x100;
    }
    const t = Date.now();
    for (const [ext, { live, prices }] of byEvent) {
      if (live) livePages.set(ext, { at: t - liveDetailSeconds * 1000, prices, restored: true });
      else pagePrices.set(ext, { at: t - detailRefreshMinutes * 60_000, prices, restored: true });
    }
    state.restored = { at: nowIso(), prematch: [...byEvent.values()].filter((v) => !v.live).length, live: [...byEvent.values()].filter((v) => v.live).length };
  })();
  let liveDetailPausedUntil = 0;
  let livePageRoute = null; // 'live' or 'pre': which page answered for live games
  /**
   * A live game's page: the live route, or (when that route does not exist: 404) the pre-match
   * page of the same game, which is then used for every live game.
   */
  async function livePage(ext) {
    let res = null;
    if (livePageRoute !== 'pre') {
      res = await client.liveEvent(ext);
      const odds = res.ok ? detailOdds(res.body) : [];
      if (odds.length) { livePageRoute = 'live'; return { ok: true, odds }; }
      if (res.status !== 404) return { ok: false, status: res.ok ? 204 : res.status };
    }
    res = await client.prematchEvent(ext);
    const odds = res.ok ? detailOdds(res.body) : [];
    if (odds.length) { livePageRoute = 'pre'; return { ok: true, odds }; }
    return { ok: false, status: res.ok ? 204 : res.status };
  }
  const findEvent = db.prepare('SELECT * FROM events WHERE source = ? AND external_id = ?');
  const upsertSel = db.prepare(
    `INSERT INTO selections (event_id, market, code, odds_x100, active) VALUES (?, ?, ?, ?, 1)
     ON CONFLICT (event_id, market, code) DO UPDATE SET odds_x100 = excluded.odds_x100, active = 1, src = NULL`
  );

  const closedSel = db.prepare(`SELECT s.id, s.market, s.code FROM selections s WHERE s.event_id = ? AND s.active = 0 AND s.src IS NULL
    AND s.market NOT IN ('1x2', 'ml') AND NOT EXISTS (SELECT 1 FROM bet_legs l WHERE l.selection_id = s.id)`);
  const dropSel = db.prepare('DELETE FROM selections WHERE id = ?');

  function writePrices(eventId, prices) {
    prices = withPushed(eventId, prices);
    db.prepare('UPDATE selections SET active = 0 WHERE event_id = ?').run(eventId);
    for (const [k, v] of Object.entries(prices)) upsertSel.run(eventId, ...k.split('|'), v);
    // Lines the book no longer offers go (they would pile up as locked picks); a pick suspended by
    // the push a moment ago stays, locked, and so does anything with bets on it.
    const held = pushed.get(eventId);
    for (const r of closedSel.all(eventId)) {
      const p = held?.get(`${r.market}|${r.code}`);
      if (p && p.v === 0 && Date.now() - p.at < PUSH_FRESH_MS) continue;
      dropSel.run(r.id);
    }
    return Object.keys(prices).length;
  }

  // ---------- real-time odds (socket.io `new-coefs`, see whpush.js) ----------
  // WinHouse odd id → our selection, for the games in play (from every live list and page read).
  const coefIndex = new Map(); // oddId → { ext, eventId, key }
  const eventCoefs = new Map(); // external id → [oddId]
  // Prices pushed lately: they outrank a page read for PUSH_FRESH_MS (the /ajax pages are cached), 0 = suspended.
  const pushed = new Map(); // eventId → Map key → { v, at }
  const PUSH_FRESH_MS = 30_000;
  let oddsPush = null; // the socket (whpush.js), for status()
  const pushStats = { received: 0, matched: 0, changed: 0, suspended: 0, lastAt: null };
  const notified = new Map(); // eventId → last onOdds call

  function indexCoefs(ext, eventId, coefs) {
    if (!coefs?.size) return;
    const list = eventCoefs.get(ext) || [];
    for (const [key, oddId] of coefs) {
      const id = String(oddId);
      if (!coefIndex.has(id)) list.push(id);
      coefIndex.set(id, { ext, eventId, key });
    }
    eventCoefs.set(ext, list);
  }
  function dropCoefs(ext) {
    const list = eventCoefs.get(ext);
    if (!list) return;
    for (const id of list) {
      const hit = coefIndex.get(id);
      if (hit) pushed.delete(hit.eventId);
      coefIndex.delete(id);
    }
    eventCoefs.delete(ext);
  }
  function withPushed(eventId, prices) {
    const p = pushed.get(eventId);
    if (!p) return prices;
    const now = Date.now();
    const out = { ...prices };
    for (const [k, { v, at }] of p) {
      if (now - at >= PUSH_FRESH_MS) { p.delete(k); continue; }
      if (out[k] === undefined) continue; // gone from the book: stays gone
      if (v) out[k] = v; else delete out[k];
    }
    if (!p.size) pushed.delete(eventId);
    return out;
  }
  const setPushed = db.prepare('UPDATE selections SET odds_x100 = ?, active = 1 WHERE event_id = ? AND market = ? AND code = ? AND src IS NULL');
  const closePushed = db.prepare('UPDATE selections SET active = 0 WHERE event_id = ? AND market = ? AND code = ? AND src IS NULL');
  const liveRow = db.prepare('SELECT status, live_odds_at, wh_missing_since FROM events WHERE id = ?');

  /** A `new-coefs` batch: the prices of our live games move (or close at 1.00) at once. Returns the games touched. */
  function applyCoefs(coefs) {
    if (!Array.isArray(coefs)) return [];
    const now = Date.now();
    const byEvent = new Map();
    pushStats.received += coefs.length;
    for (const c of coefs) {
      const hit = coefIndex.get(String(c?.coef_id));
      if (!hit) continue;
      const price = Number(c.odd);
      if (!Number.isFinite(price)) continue;
      const v = price <= 1.001 ? 0 : x100(price);
      if (v === null) continue;
      pushStats.matched += 1;
      if (!byEvent.has(hit.eventId)) byEvent.set(hit.eventId, []);
      byEvent.get(hit.eventId).push([hit.key, v]);
    }
    const touched = [];
    if (!byEvent.size) return touched;
    tx(db, () => {
      for (const [eventId, list] of byEvent) {
        const row = liveRow.get(eventId);
        if (row?.status !== 'live' || !row.live_odds_at || row.wh_missing_since) continue;
        if (!pushed.has(eventId)) pushed.set(eventId, new Map());
        const p = pushed.get(eventId);
        let n = 0;
        for (const [key, v] of list) {
          const prev = p.get(key);
          p.set(key, { v, at: now });
          if (prev && prev.v === v) continue;
          const [market, code] = key.split('|');
          const r = v ? setPushed.run(v, eventId, market, code) : closePushed.run(eventId, market, code);
          if (r.changes) { n += 1; if (!v) pushStats.suspended += 1; }
        }
        if (n) { pushStats.changed += n; touched.push(eventId); }
      }
    });
    if (touched.length) pushStats.lastAt = nowIso();
    for (const id of touched) {
      if (now - (notified.get(id) || 0) < 1000) continue;
      notified.set(id, now);
      try { onOdds?.(id); } catch { /* listener */ }
    }
    return touched;
  }

  function insert(ev, status) {
    const ts = nowIso();
    const { lastInsertRowid } = db.prepare(
      `INSERT INTO events (sport, competition, home, away, start_time, status, home_score, away_score, clock, source, external_id,
                           home_team_ext, away_team_ext, wh_seen_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?)`
    ).run(ev.sport, ev.competition, ev.home, ev.away, ev.startTime, status, status === 'live' ? ev.homeScore ?? 0 : null,
      status === 'live' ? ev.awayScore ?? 0 : null, SOURCE, ev.externalId, ev.homeLogo, ev.awayLogo, ts, ts, ts);
    return db.prepare('SELECT * FROM events WHERE id = ?').get(Number(lastInsertRowid));
  }

  const liveRaw = new Map(); // WinHouse game id → its entry of the last live list (no odds)
  let liveListAt = null; // when that list was read
  /** Every 15 s: scores, clock and in-play odds; matches gone from the list are finished or flagged. */
  async function syncLive() {
    const r = await client.live();
    if (!r.ok) throw new Error(`livegames HTTP ${r.status}`);
    const items = eventsOf(r.body);
    if (!Number.isFinite(tzOffsetMinutes)) {
      const est = estimateOffset(items);
      if (est !== null) { state.offset = est; state.offsetSource = 'estimado pelo ao vivo'; }
    }
    const seen = new Set();
    let open = 0;
    // Each game's entry as WinHouse sent it (without its odds), for the admin's "WinHouse data".
    liveRaw.clear();
    liveListAt = nowIso();
    for (const raw of items) {
      if (raw?.id !== undefined) { const { odd: _odd, ...fields } = raw; liveRaw.set(String(raw.id), fields); }
      let ev = normalizeItem(raw, { tzOffsetMinutes: offset(), block });
      // A blocked game that already has bets keeps its score and clock (to be settled), with no prices.
      if (!ev) {
        const kept = normalizeItem(raw, { tzOffsetMinutes: offset() });
        const row = kept && findEvent.get(SOURCE, kept.externalId);
        if (!row || !db.prepare('SELECT 1 FROM bet_legs WHERE event_id = ? LIMIT 1').get(row.id)) continue;
        ev = { ...kept, prices: {}, coefs: new Map() };
      }
      seen.add(ev.externalId);
      try {
        tx(db, () => {
          let row = findEvent.get(SOURCE, ev.externalId);
          if (row && (row.status === 'finished' || row.status === 'cancelled')) return;
          if (!row) row = insert(ev, 'live');
          const home = ev.homeScore ?? row.home_score ?? 0;
          const away = ev.awayScore ?? row.away_score ?? 0;
          const scoreChanged = row.status === 'live' && (row.home_score !== home || row.away_score !== away);
          // Ice hockey: once past 60 minutes it is overtime, which follows a regulation draw.
          // The clock only moves forward: at the final whistle WinHouse can send 0 ("00:00") for a
          // finished match, which would show 0' and stop it being settled as over.
          const minutes = CLOCK_SPORTS.has(row.sport) && ev.minutes !== null && Number(row.wh_minute) > ev.minutes ? Number(row.wh_minute) : ev.minutes;
          const overtime = row.sport === 'hoquei' && minutes !== null && minutes >= 60 && !row.wh_overtime;
          db.prepare(`UPDATE events SET status = 'live', home_score = ?, away_score = ?, clock = ?, wh_minute = COALESCE(?, wh_minute),
              wh_seen_at = ?, wh_missing_since = NULL, review_reason = NULL, postponed_at = NULL, updated_at = ? WHERE id = ?`)
            .run(home, away, clockText(row.sport, minutes, ev.clockRaw), minutes, nowIso(), nowIso(), row.id);
          if (overtime) {
            const tie = Math.min(home, away);
            db.prepare('UPDATE events SET wh_overtime = 1, reg_home_score = ?, reg_away_score = ? WHERE id = ?').run(tie, tie, row.id);
          }
          if (scoreChanged) db.prepare('UPDATE events SET score_at = ? WHERE id = ?').run(nowIso(), row.id);
          // The live list carries the book's in-play prices; a suspended market comes as 1.00.
          // A goal makes every earlier price stale, pushed ones too.
          if (scoreChanged) { livePages.delete(ev.externalId); pushed.delete(row.id); }
          liveListPrices.set(ev.externalId, ev.prices);
          const video = String(raw.stream_url || '').trim();
          if (/^https:\/\//.test(video)) streamUrls.set(ev.externalId, video); else streamUrls.delete(ev.externalId);
          indexCoefs(ev.externalId, row.id, ev.coefs);
          const n = writePrices(row.id, Object.keys(ev.prices).length ? { ...liveFresh(ev.externalId), ...ev.prices } : {});
          db.prepare('UPDATE events SET live_odds_at = ? WHERE id = ?').run(n ? nowIso() : null, row.id);
          if (n) open += 1;
        });
      } catch (err) { log(`WinHouse ao vivo ${ev.externalId}: ${err.message}`); }
    }
    for (const ext of [...streamUrls.keys()]) if (!seen.has(ext)) streamUrls.delete(ext);
    const ended = finishMissing(seen);
    state.last.live = { at: nowIso(), live: seen.size, withOdds: open, ...ended };
    return state.last.live;
  }

  /**
   * Matches no longer in the live list: wait finishConfirmSeconds, then settle or flag; a flagged one
   * with no bets is closed STALE_CLOSE_MS after it left (it would otherwise stay "live" for days).
   */
  function finishMissing(seen) {
    const now = Date.now();
    let finished = 0;
    let review = 0;
    let closed = 0;
    for (const row of db.prepare("SELECT * FROM events WHERE source = ? AND status = 'live'").all(SOURCE)) {
      if (seen.has(row.external_id)) continue;
      if (!row.wh_missing_since) {
        tx(db, () => {
          db.prepare('UPDATE events SET wh_missing_since = ?, live_odds_at = NULL WHERE id = ?').run(nowIso(), row.id);
          db.prepare('UPDATE selections SET active = 0 WHERE event_id = ?').run(row.id);
        });
        continue;
      }
      const gone = now - new Date(row.wh_missing_since).getTime();
      if (gone < finishConfirmSeconds * 1000) continue;
      if (row.review_reason) {
        // In review, with no bet on it, an hour after it left: nothing to decide — it is closed on the
        // last score seen (a match with bets stays for the operator, or its own automatic void).
        if (gone >= STALE_CLOSE_MS && !db.prepare('SELECT 1 FROM bet_legs WHERE event_id = ? LIMIT 1').get(row.id)) {
          const h = row.home_score;
          const a = row.away_score;
          db.prepare(`UPDATE events SET status = 'finished', result = ?, review_reason = NULL, clock = 'Final', updated_at = ? WHERE id = ? AND status = 'live'`)
            .run(Number.isInteger(h) && Number.isInteger(a) ? resultCode(h, a) : null, nowIso(), row.id);
          closed += 1;
        }
        continue;
      }
      const v = finishVerdict(row);
      tx(db, () => {
        if (v.review) {
          db.prepare('UPDATE events SET review_reason = ? WHERE id = ?').run(`WinHouse: ${v.review} (placar ${row.home_score}-${row.away_score})`, row.id);
          review += 1;
          return;
        }
        db.prepare(`UPDATE events SET status = 'finished', home_score = ?, away_score = ?, reg_home_score = ?, reg_away_score = ?, result = ?,
            clock = 'Final', updated_at = ? WHERE id = ?`)
          .run(v.home, v.away, v.regHome ?? null, v.regAway ?? null, resultCode(v.home, v.away), nowIso(), row.id);
        settleEvent(db, row.id, { source: 'feed', note: 'WinHouse: último placar ao vivo' });
        finished += 1;
      });
    }
    if (closed) log(`WinHouse: ${closed} jogo(s) sem apostas fechados (saíram do ao vivo sem resultado claro)`);
    return { finished, review, closed };
  }

  /**
   * Matches flagged for review when they left the live list (e.g. before the 88th minute): the
   * match tracker is asked again (each game at most every 5 minutes, 5 games a run). When it says
   * the match is over and gives a score not lower than the last one seen, that score settles it.
   */
  const TRACKER_ENDED = /\b(ended|finished|full.?time|ft|aet|ap|after (extra|over)time|after penalties|terminad[oa]|final|fim)\b/i;
  const reviewAsked = new Map();
  async function confirmReviews({ now = Date.now() } = {}) {
    if (typeof client.tracker !== 'function') return { asked: 0, confirmed: 0 };
    const rows = db.prepare(`SELECT * FROM events WHERE source = ? AND status = 'live' AND review_reason IS NOT NULL
      AND sport IN ('futebol', 'andebol', 'futsal') ORDER BY start_time LIMIT 50`).all(SOURCE);
    let asked = 0;
    let confirmed = 0;
    for (const row of rows) {
      if (asked >= 5 || now - (reviewAsked.get(row.id) || 0) < 5 * 60_000) continue;
      reviewAsked.set(row.id, now);
      asked += 1;
      let s = null;
      try {
        const r = await client.tracker(row.external_id);
        if (r?.ok && r.body && typeof r.body === 'object' && !Array.isArray(r.body)) s = normalizeWidgetData(r.body);
      } catch { /* asked again in 5 minutes */ }
      if (!s || !TRACKER_ENDED.test(`${s.status ?? ''} ${s.period ?? ''}`)) continue;
      const h = s.homeScore;
      const a = s.awayScore;
      if (!Number.isInteger(h) || !Number.isInteger(a) || h < (row.home_score ?? 0) || a < (row.away_score ?? 0)) continue;
      tx(db, () => {
        const r = db.prepare(`UPDATE events SET status = 'finished', home_score = ?, away_score = ?, result = ?, review_reason = NULL,
            clock = 'Final', updated_at = ? WHERE id = ? AND status = 'live'`).run(h, a, resultCode(h, a), nowIso(), row.id);
        if (r.changes) settleEvent(db, row.id, { source: 'feed', note: 'WinHouse: resultado final confirmado pelo tracker' });
      });
      reviewAsked.delete(row.id);
      confirmed += 1;
    }
    if (confirmed) log(`WinHouse: ${confirmed} jogo(s) em revisão confirmados pelo tracker`);
    return { asked, confirmed };
  }

  // Future games: each sport's full list, every `futureMinutes` (sooner than prices go stale).
  // `futureDays` may be a function (the admin setting, read on every run).
  const futureDaysNow = () => Math.min(90, Math.max(0, Number(typeof futureDays === 'function' ? futureDays() : futureDays) || 0));
  let futureAt = 0;
  async function readFuture(days) {
    const until = Date.now() + days * 86_400_000;
    const games = [];
    const bySport = {};
    let failed = 0;
    for (const [id, sport] of Object.entries(SPORTS)) {
      try {
        const r = await client.prematchBySport(id);
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        let n = 0;
        let last = null;
        for (const raw of eventsOf(r.body)) {
          if (raw?.id === undefined) continue;
          const ev = normalizeItem(raw, { tzOffsetMinutes: offset(), block });
          if (!ev) continue;
          const t = new Date(ev.startTime).getTime();
          if (t > until) continue;
          games.push(raw);
          n += 1;
          if (!last || t > last) last = t;
        }
        bySport[sport] = { games: n, until: last ? new Date(last).toISOString() : null };
      } catch (err) {
        failed += 1;
        bySport[sport] = { error: err.message };
      }
    }
    state.last.future = { at: nowIso(), days, games: games.length, failed, bySport };
    return games;
  }

  /**
   * Every minute: the three pre-match lists → upcoming matches and their prices; every
   * `futureMinutes` (or when `force`) also each sport's full list, for games up to `futureDays` ahead.
   */
  async function syncPrematch({ force = false } = {}) {
    const lists = await Promise.all([client.prematchMain(), client.prematchTop(), client.prematch24h()].map((p) => p.catch((err) => ({ ok: false, error: err.message }))));
    const failed = lists.filter((r) => !r.ok);
    if (failed.length === lists.length) throw new Error(`pré-jogo: ${failed.map((r) => r.error || `HTTP ${r.status}`).join(' · ')}`);
    const byId = new Map();
    const days = futureDaysNow();
    if (days > 0 && client.prematchBySport && (force || Date.now() - futureAt >= futureMinutes * 60_000)) {
      futureAt = Date.now();
      for (const raw of await readFuture(days)) byId.set(String(raw.id), raw);
    } else if (!days) state.last.future = { off: true };
    // The short lists last: theirs are the freshest prices.
    for (const r of lists) if (r.ok) for (const raw of eventsOf(r.body)) if (raw?.id !== undefined) byId.set(String(raw.id), raw);
    const now = Date.now();
    let created = 0;
    let priced = 0;
    for (const raw of byId.values()) {
      const ev = normalizeItem(raw, { tzOffsetMinutes: offset(), block });
      if (!ev || new Date(ev.startTime).getTime() <= now) continue;
      try {
        tx(db, () => {
          let row = findEvent.get(SOURCE, ev.externalId);
          if (row && row.status !== 'scheduled') return; // started: the live list owns it
          if (!row) { row = insert(ev, 'scheduled'); created += 1; }
          db.prepare(`UPDATE events SET competition = ?, home = ?, away = ?, start_time = ?, home_team_ext = COALESCE(?, home_team_ext),
              away_team_ext = COALESCE(?, away_team_ext), wh_seen_at = ?, updated_at = ? WHERE id = ?`)
            .run(ev.competition, ev.home, ev.away, ev.startTime, ev.homeLogo, ev.awayLogo, nowIso(), nowIso(), row.id);
          listPrices.set(ev.externalId, ev.prices);
          if (writePrices(row.id, { ...pageFresh(ev.externalId), ...ev.prices })) priced += 1;
        });
      } catch (err) { log(`WinHouse pré-jogo ${ev.externalId}: ${err.message}`); }
    }
    // Pre-match prices not confirmed by any list for a while are closed (the match left the lists).
    // Future games are confirmed every `futureMinutes`: their prices must outlive that gap.
    const stale = new Date(now - Math.max(prematchStaleSeconds, futureMinutes * 90) * 1000).toISOString();
    db.prepare(`UPDATE selections SET active = 0 WHERE event_id IN (SELECT id FROM events WHERE source = ? AND status = 'scheduled' AND (wh_seen_at IS NULL OR wh_seen_at < ?))`)
      .run(SOURCE, stale);
    const removed = purgeBlocked();
    state.last.prematch = { at: nowIso(), games: byId.size, created, priced, listsFailed: failed.length, removed };
    return state.last.prematch;
  }

  /**
   * Each game's own page, for every market it offers: games starting within `detailHours`, never
   * read (or read longest ago) first, at most `detailPerCycle` per run, each again after
   * `detailRefreshMinutes`.
   */
  /** One game's page → its markets (written over the list's). The number of markets, or null when it failed. */
  async function readPage(r) {
    try {
      const res = await client.prematchEvent(r.external_id);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const odds = detailOdds(res.body);
      const prices = { ...extraPrices(odds, { sport: r.sport }), ...pricesFor(odds, r.sport) };
      pagePrices.set(r.external_id, { at: Date.now(), prices });
      tx(db, () => {
        const row = db.prepare('SELECT status FROM events WHERE id = ?').get(r.id);
        if (row?.status !== 'scheduled') return; // started meanwhile: the live list owns it
        writePrices(r.id, { ...prices, ...(listPrices.get(r.external_id) || {}) });
      });
      return new Set(Object.keys(prices).map((k) => k.split('|')[0])).size;
    } catch (err) {
      pagePrices.set(r.external_id, { at: Date.now() - detailRefreshMinutes * 30_000, prices: pagePrices.get(r.external_id)?.prices || {} }); // retry in half the time
      log(`WinHouse página ${r.external_id}: ${err.message}`);
      return null;
    }
  }

  /**
   * A player opens a game page: a game whose page was not read lately (further ahead than the
   * background reads go, or not reached yet) is read now, so every market (goal totals, both teams
   * to score…) is there. At most 30 such reads a minute; one at a time per game.
   */
  const onDemand = { minute: 0, n: 0, liveMinute: 0, live: 0, busy: new Map() };
  async function readPageNow(eventId) {
    const r = db.prepare("SELECT id, sport, status, external_id, home_score, away_score, live_odds_at FROM events WHERE id = ? AND source = ? AND status IN ('scheduled', 'live')").get(Number(eventId), SOURCE);
    if (!r) return false;
    if (r.status === 'live') return readLiveNow(r);
    const p = pagePrices.get(r.external_id);
    if (p && Date.now() - p.at < detailRefreshMinutes * 60_000) return false;
    if (onDemand.busy.has(r.id)) return onDemand.busy.get(r.id);
    const minute = Math.floor(Date.now() / 60_000);
    if (minute !== onDemand.minute) { onDemand.minute = minute; onDemand.n = 0; }
    if (onDemand.n >= 30) return false;
    onDemand.n += 1;
    const job = readPage(r).then((n) => n !== null).finally(() => onDemand.busy.delete(r.id));
    onDemand.busy.set(r.id, job);
    return job;
  }

  /** A live game on a player's screen: its page when the last read is LIVE_WATCHED_S old (shared cap of 60 a minute). */
  function readLiveNow(r) {
    watched.set(r.external_id, Date.now());
    if (!liveDetailPerCycle || !client.liveEvent || !r.live_odds_at || Date.now() < liveDetailPausedUntil) return false;
    const p = livePages.get(r.external_id);
    if (p && !p.restored && Date.now() - p.at < LIVE_WATCHED_S * 1000) return false;
    if (onDemand.busy.has(r.id)) return p && !p.restored ? false : onDemand.busy.get(r.id);
    const minute = Math.floor(Date.now() / 60_000);
    if (minute !== onDemand.liveMinute) { onDemand.liveMinute = minute; onDemand.live = 0; }
    if (onDemand.live >= 60) return false;
    onDemand.live += 1;
    const job = readLive(r).then((n) => typeof n === 'number' && n !== 404).finally(() => onDemand.busy.delete(r.id));
    onDemand.busy.set(r.id, job);
    // Read before: the refresh runs in the background and the page answers at once with what is
    // there (its next poll, seconds later, gets the fresh markets). Only a first read is waited for.
    return p && !p.restored ? false : job;
  }

  async function syncDetails() {
    const until = new Date(Date.now() + detailHours * 3600_000).toISOString();
    // Football further ahead: its page brings the goal totals and the other markets that the
    // "Construa o seu ganho" cards (next 48 h) are made of.
    const untilFootball = new Date(Date.now() + Math.max(detailHours, footballDetailHours) * 3600_000).toISOString();
    const now = Date.now();
    const rows = db.prepare(`SELECT id, sport, external_id FROM events WHERE source = ? AND status = 'scheduled' AND start_time > ?
      AND (start_time <= ? OR (sport = 'futebol' AND start_time <= ?)) ORDER BY start_time`).all(SOURCE, nowIso(), until, untilFootball);
    for (const ext of [...pagePrices.keys()]) if (!rows.some((r) => r.external_id === ext)) { pagePrices.delete(ext); listPrices.delete(ext); }
    const due = rows.filter((r) => { const p = pagePrices.get(r.external_id); return !p || now - p.at >= detailRefreshMinutes * 60_000; })
      .sort((a, b) => (pagePrices.get(a.external_id)?.at ?? 0) - (pagePrices.get(b.external_id)?.at ?? 0))
      .slice(0, detailPerCycle);
    let read = 0;
    let markets = 0;
    let failed = 0;
    for (const r of due) {
      const n = await readPage(r);
      if (n === null) failed += 1; else { read += 1; markets += n; }
    }
    state.last.details = { at: nowIso(), due: due.length, read, failed, markets, cached: pagePrices.size, window: rows.length };
    return state.last.details;
  }

  /** Games imported before a block was set: removed while nobody has a bet on them. */
  function purgeBlocked() {
    if (!block.women && !block.youth && !block.minor && !block.extra && !block.leagues) return 0;
    let n = 0;
    for (const e of db.prepare("SELECT id, sport, competition, home, away FROM events WHERE source = ? AND status IN ('scheduled', 'live')").all(SOURCE)) {
      if (!blockedGame({ sport: e.sport, league: e.competition, home_team: e.home, away_team: e.away }, block)) continue;
      if (db.prepare('SELECT 1 FROM bet_legs WHERE event_id = ? LIMIT 1').get(e.id)) continue;
      db.prepare('DELETE FROM events WHERE id = ?').run(e.id);
      n += 1;
    }
    return n;
  }

  // ---------- live video ----------
  const streamIds = new Set(); // WinHouse game ids with live video right now (/ajax/streams)
  const streamUrls = new Map(); // game id → video address the live list gives (stream_url), if any
  /** Every minute: which games have video (needs WINHOUSE_TENANT, the operator's embed key). */
  async function syncStreams() {
    if (!client.streams || !client.hasTenant) return null;
    const r = await client.streams();
    if (!r.ok || !Array.isArray(r.body?.ids)) throw new Error(`streams HTTP ${r.status}`);
    streamIds.clear();
    for (const id of r.body.ids) streamIds.add(String(id).replace(/\s+/g, ''));
    const live = db.prepare("SELECT external_id FROM events WHERE source = ? AND status = 'live'").all(SOURCE);
    state.last.streams = { at: nowIso(), ids: streamIds.size, live: live.filter((e) => streamIds.has(e.external_id)).length };
    return state.last.streams;
  }
  const streamOf = (ext) => {
    const id = String(ext);
    const url = streamUrls.get(id) || null;
    return { has: streamIds.has(id) || !!url, url };
  };

  /**
   * Every in-play market: each live game's own page (WINHOUSE_LIVE_EVENT), games with open prices
   * only, least recently read first, at most `liveDetailPerCycle` per run, each every
   * `liveDetailSeconds`. A route that answers 404 to a whole run is paused for 10 minutes.
   */
  /**
   * One live game's page → every in-play market written over the list's. The number of markets,
   * null when it failed, 404 when the route does not exist.
   */
  async function readLive(r) {
    try {
      const res = await livePage(r.external_id);
      if (!res.ok) {
        if (res.status === 404) { livePages.set(r.external_id, { at: Date.now(), prices: {} }); return 404; }
        throw new Error(res.status === 204 ? 'página sem odds' : `HTTP ${res.status}`);
      }
      const { prices, coefs } = bookOf(res.odds, r.sport);
      tx(db, () => {
        const row = db.prepare('SELECT status, home_score, away_score, live_odds_at, wh_missing_since FROM events WHERE id = ?').get(r.id);
        // Ended, suspended or a goal while the page was being read: those prices are stale.
        if (row?.status !== 'live' || !row.live_odds_at || row.wh_missing_since || row.home_score !== r.home_score || row.away_score !== r.away_score) return;
        const list = liveListPrices.get(r.external_id) || {};
        if (!Object.keys(list).length) return;
        livePages.set(r.external_id, { at: Date.now(), prices });
        indexCoefs(r.external_id, r.id, coefs);
        writePrices(r.id, { ...prices, ...list });
      });
      return new Set(Object.keys(prices).map((k) => k.split('|')[0])).size;
    } catch (err) {
      livePages.set(r.external_id, { at: Date.now(), prices: {} }); // retry after liveDetailSeconds
      log(`WinHouse página ao vivo ${r.external_id}: ${err.message}`);
      return null;
    }
  }

  // Live games someone has open right now (their match page asks every few seconds): read first,
  // and again as soon as their page is a few seconds old, so all their markets stay on screen.
  const watched = new Map(); // externalId → last time a player asked
  const WATCH_MS = 30_000;
  const isWatched = (ext) => Date.now() - (watched.get(ext) || 0) < WATCH_MS;

  async function syncLiveDetails() {
    if (!liveDetailPerCycle || !client.liveEvent) return null;
    const now = Date.now();
    if (now < liveDetailPausedUntil) return state.last.liveDetails;
    const rows = db.prepare(`SELECT id, sport, external_id, home_score, away_score FROM events
      WHERE source = ? AND status = 'live' AND live_odds_at IS NOT NULL AND wh_missing_since IS NULL`).all(SOURCE);
    const ids = new Set(rows.map((r) => r.external_id));
    for (const ext of [...livePages.keys()]) if (!ids.has(ext)) livePages.delete(ext);
    for (const ext of [...liveListPrices.keys()]) if (!ids.has(ext)) liveListPrices.delete(ext);
    for (const ext of [...eventCoefs.keys()]) if (!ids.has(ext)) dropCoefs(ext);
    for (const id of [...notified.keys()]) if (Date.now() - notified.get(id) > 60_000) notified.delete(id);
    for (const ext of [...watched.keys()]) if (!isWatched(ext)) watched.delete(ext);
    const age = (r) => now - (livePages.get(r.external_id)?.at ?? 0);
    const due = rows.filter((r) => age(r) >= (isWatched(r.external_id) ? LIVE_WATCHED_S : liveDetailSeconds) * 1000)
      .sort((a, b) => (isWatched(b.external_id) - isWatched(a.external_id)) || (age(b) - age(a)))
      .slice(0, liveDetailPerCycle);
    let read = 0;
    let markets = 0;
    let failed = 0;
    let notFound = 0;
    for (const r of due) {
      const n = await readLive(r);
      if (n === null || n === 404) { failed += 1; if (n === 404) notFound += 1; } else { read += 1; markets += n; }
    }
    const paused = due.length > 0 && notFound === due.length;
    if (paused) liveDetailPausedUntil = Date.now() + 10 * 60_000;
    state.last.liveDetails = {
      at: nowIso(), due: due.length, read, failed, markets, live: rows.length, route: livePageRoute === 'pre' ? 'prematchgame' : livePageRoute === 'live' ? 'livegame' : null,
      pausedUntil: paused ? new Date(liveDetailPausedUntil).toISOString() : null,
    };
    return state.last.liveDetails;
  }

  const run = (kind, fn) => async () => {
    try { return await fn(); } catch (err) {
      state.lastError = `${kind}: ${err.message}`;
      state.lastErrorAt = nowIso();
      log(`WinHouse ${state.lastError}`);
      return null;
    }
  };

  function start({ liveMs = 15_000, prematchMs = 60_000, detailMs = 60_000, liveDetailMs = 10_000 } = {}) {
    if (!state.enabled) return () => {};
    const busy = new Set();
    const guard = (kind, fn) => async () => {
      if (busy.has(kind)) return;
      busy.add(kind);
      try { await run(kind, fn)(); } finally { busy.delete(kind); }
    };
    const live = guard('ao vivo', syncLive);
    const pre = guard('pré-jogo', syncPrematch);
    // Live first: it also finds WinHouse's clock zone before pre-match start times are read.
    const details = guard('páginas dos jogos', syncDetails);
    const liveDetails = guard('páginas ao vivo', syncLiveDetails);
    const streams = guard('streams', syncStreams);
    const reviews = guard('revisão', confirmReviews);
    live().then(pre).then(details).then(liveDetails).then(streams);
    const timers = [setInterval(streams, 60_000), setInterval(reviews, 60_000), setInterval(live, liveMs), setInterval(pre, prematchMs), setInterval(details, detailMs), setInterval(liveDetails, liveDetailMs)];
    return () => timers.forEach(clearInterval);
  }

  const status = () => ({
    enabled: state.enabled, last: state.last, lastError: state.lastError, lastErrorAt: state.lastErrorAt,
    tzOffsetMinutes: state.offset, tzOffsetSource: state.offsetSource, block: { ...block, extra: block.extra ? block.extra.source : null, leagues: block.leagues ? Object.fromEntries(Object.entries(block.leagues).map(([sp, set]) => [sp, set ? set.size : 'todas'])) : null },
    events: Object.fromEntries(db.prepare('SELECT status, COUNT(*) AS n FROM events WHERE source = ? GROUP BY status').all(SOURCE).map((r) => [r.status, r.n])),
    review: db.prepare('SELECT COUNT(*) AS n FROM events WHERE source = ? AND review_reason IS NOT NULL').get(SOURCE).n,
    streams: client.hasTenant ? (state.last.streams || null) : false,
    push: { socket: oddsPush?.status() ?? null, ...pushStats, tracked: coefIndex.size, games: eventCoefs.size },
    futureDays: futureDaysNow(), futureMinutes, restored: state.restored ?? null,
  });

  return {
    enabled: state.enabled, rawLive: (ext) => liveRaw.get(String(ext)) || null,
    /** A game of this sport in WinHouse's last live list (its raw entry), or null. */
    rawLiveOfSport: (sport) => [...liveRaw.values()].find((r) => SPORTS[Number(r.sport_id)] === sport) || null,
    liveListAt: () => liveListAt, syncLive, syncPrematch, syncDetails, readPageNow, syncLiveDetails, finishMissing, confirmReviews, start, status, applyCoefs, syncStreams, streamOf, setOddsPush: (p) => { oddsPush = p; }, source: SOURCE };
}
