import { nowIso, tx } from './db.js';
import { settleEvent, resultCode } from './betting.js';

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
  const m = /^(.*?)\s*\[([^\]]+)\]\s*$/.exec(label);
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
      const m = /^(.*?)\s*\[([^\]]+)\]\s*$/.exec(String(v.market || ''));
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

const WORDS = { over: 'Mais de', under: 'Menos de', yes: 'Sim', no: 'Não', odd: 'Ímpar', even: 'Par', exactly: 'Exatamente', exact: 'Exatamente', draw: 'Empate', neither: 'Nenhum' };
const clean = (v, max) => String(v ?? '').replace(/[~|\n\r]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
const ptWords = (t) => t.replace(/\b(over|under|yes|no|odd|even|exactly|exact|draw|neither)\b/gi, (w) => WORDS[w.toLowerCase()]);

/**
 * Every market of a game page we do not settle ourselves (for that sport) → operator-settled 'x' selections,
 * "x|<marketId>~<market>~<selection>". The market title is the first one the page gives for that
 * id, without the "[CODE]" tag; a line goes next to the selection: "Mais de (8.5)".
 */
export function extraPrices(odds, { sport = null, limit = 600 } = {}) {
  const own = new Set(SPORT_MARKETS[sport] || []);
  const out = {};
  const titles = new Map();
  let n = 0;
  for (const o of odds) {
    if (own.has(o.marketId) || n >= limit) continue;
    const v = x100(o.price);
    if (!v) continue;
    if (!titles.has(o.marketId)) titles.set(o.marketId, clean(String(o.marketName || '').replace(/\s*\[[^\]]*\]/g, ' '), 70) || `Mercado ${o.marketId}`);
    const label = clean(`${ptWords(String(o.selection))}${o.special ? ` (${o.special})` : ''}`, 70);
    if (!label) continue;
    const key = `x|${o.marketId}~${titles.get(o.marketId)}~${label}`;
    if (out[key] !== undefined) continue;
    out[key] = v;
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
  baseUrl = '', lang = 'pt', routes = {}, timeoutMs = 20_000, fetchImpl = globalThis.fetch, log = () => {},
} = {}) {
  const base = String(baseUrl || '').replace(/\/+$/, '');
  const paths = { ...ROUTES, ...Object.fromEntries(Object.entries(routes).filter(([, v]) => v)) };
  const enabled = /^https:\/\//.test(base);
  const url = (key, vars = {}) => base + paths[key].replace('{lang}', encodeURIComponent(lang)).replace('{gameId}', encodeURIComponent(vars.gameId ?? ''))
    .replace('{eid}', encodeURIComponent(vars.eid ?? '')).replace('{akey}', encodeURIComponent(vars.akey ?? ''));

  async function request(key, vars) {
    if (!enabled) throw new Error('WinHouse desligado: defina WINHOUSE_BASE_URL (https://…) no servidor.');
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), timeoutMs);
    const started = Date.now();
    try {
      const res = await fetchImpl(url(key, vars), {
        headers: { Accept: 'application/json', 'User-Agent': 'BET62-Data-Service/1.0', Referer: `${base}/` },
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
      id = eventsOf(list.body).find((e) => e?.id)?.id ?? null;
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
    prematchEvent: (gameId) => request('prematchEvent', { gameId }),
    liveEvent: (gameId) => request('liveEvent', { gameId }),
    widget: (gameId) => request('widget', { gameId }),
    widgetData: (eid, akey) => request('widgetData', { eid, akey }),
    tracker: (gameId) => request('tracker', { gameId }),
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
/** True when the competition or a team marks the game as women's / youth / minor (as configured). */
export function blockedGame(ev, { women = true, youth = true, minor = true, extra = null } = {}) {
  const text = [ev?.league, ev?.name, ev?.home_team, ev?.away_team].filter(Boolean).join(' · ');
  const sport = ev?.sport || SPORTS[Number(ev?.sport_id)];
  return (women && WOMEN.test(text)) || (youth && YOUTH.test(text))
    || (minor && (MINOR.test(text) || (sport === 'tenismesa' && MINOR_TT.test(text))))
    || (!!extra && extra.test(text));
}

const x100 = (p) => { const n = Math.round(Number(p) * 100); return Number.isFinite(n) && n > 100 && n < 100_000 ? n : null; };
// Half or whole line (a whole line voids on a push); quarter lines (2.25) would split the stake: not offered.
const plainLine = (v) => Number.isFinite(v) && v > 0 && Number.isInteger(v * 2);

const ODD_EVEN = { odd: 'ODD', even: 'EVEN', 'ímpar': 'ODD', impar: 'ODD', par: 'EVEN' };

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
  const m = /^(over|under|mais de|menos de|acima de|abaixo de|o|u)\s*([\d.,]+)$/i.exec(String(sel).trim());
  if (!m) return null;
  const side = /^(over|mais|acima|o)/i.test(m[1]) ? 'O' : 'U';
  const line = Number(m[2].replace(',', '.'));
  return plainLine(line) ? [side, line] : null;
}

/**
 * One event's odds → { 'market|code': x100 } in our markets. Only full markets the settlement
 * understands: 1X2 / double chance / goal totals (football), winner incl. overtime and point
 * totals (basketball), regulation 1X2 / double chance / totals / odd-even (ice hockey), match winner
 * (tennis). Whole-line totals void on a push; quarter lines are skipped. A price of 1.00 is a
 * suspended selection and closes its market.
 */
export function pricesFor(odds, sport) {
  const out = {};
  for (const o of odds) {
    const raw = String(o.selection).toLowerCase().trim();
    // Game pages carry the line apart (special_value): "over" + "2.5" → "over 2.5".
    const sel = o.special && !/\d/.test(raw) ? `${raw} ${o.special}` : raw;
    const v = x100(o.price);
    if (!v) continue;
    if (sport === 'futebol' || sport === 'andebol' || sport === 'futsal') {
      if (o.marketId === 1001) { const c = { 1: '1', x: 'X', 2: '2' }[sel]; if (c) out[`1x2|${c}`] = v; }
      else if (o.marketId === 1005) { const c = { '1x': '1X', 12: '12', x2: 'X2' }[sel]; if (c) out[`dc|${c}`] = v; }
      else if (o.marketId === 1018) { const ou = overUnder(sel); if (ou) out[`ou|${ou[0]}${ou[1]}`] = v; }
      else if (o.marketId === 1007) { const c = { yes: 'Y', no: 'N', sim: 'Y', 'não': 'N', nao: 'N' }[raw]; if (c) out[`btts|${c}`] = v; }
      else if (o.marketId === 1019) { const c = ODD_EVEN[raw]; if (c) out[`oe|${c}`] = v; }
      else if (o.marketId === 1011) { const h = asianHandicap(raw, o.special); if (h) out[`hcp|${h}`] = v; }
      else if (o.marketId === 1708) { const cs = exactScore(raw); if (cs) out[`cs|${cs}`] = v; }
      else if (o.marketId === 1725 || o.marketId === 1714) { const ou = overUnder(sel); if (ou) out[`tou|${o.marketId === 1725 ? 1 : 2}${ou[0]}${ou[1]}`] = v; }
    } else if (sport === 'basquetebol') {
      if (o.marketId === 1022) { const c = { 1: '1', 2: '2' }[sel]; if (c) out[`ml|${c}`] = v; }
      else if (o.marketId === 1672) { const ou = overUnder(sel); if (ou) out[`ou|${ou[0]}${ou[1]}`] = v; }
      else if (o.marketId === 1011) { const h = asianHandicap(raw, o.special); if (h) out[`hcp|${h}`] = v; }
    } else if (sport === 'hoquei') {
      if (o.marketId === 1045) { const c = { 1: '1', x: 'X', 2: '2' }[sel]; if (c) out[`1x2|${c}`] = v; }
      else if (o.marketId === 1161) { const cs = exactScore(sel); if (cs) out[`cs|${cs}`] = v; } // regulation correct score
      else if (o.marketId === 1168) { const c = { '1x': '1X', 12: '12', x2: 'X2' }[sel]; if (c) out[`dc|${c}`] = v; }
      else if (o.marketId === 1870) { const ou = overUnder(sel); if (ou) out[`ou|${ou[0]}${ou[1]}`] = v; }
      else if (o.marketId === 1160) { const c = ODD_EVEN[raw]; if (c) out[`oe|${c}`] = v; }
    } else if (sport === 'tenis') {
      if (o.marketId === 1016) { const c = { 1: '1', 2: '2' }[sel]; if (c) out[`1x2|${c}`] = v; }
    } else if (sport === 'tenismesa' || sport === 'badminton') {
      if (o.marketId === 1044) { const c = { 1: '1', 2: '2' }[sel]; if (c) out[`ml|${c}`] = v; }
      else if (o.marketId === 1992) { const cs = exactScore(sel); if (cs) out[`cs|${cs}`] = v; } // sets
    } else if (sport === 'voleibol') {
      // Volleyball has no draw: only the two winners of its "1x2" are offered.
      if (o.marketId === 1001) { const c = { 1: '1', 2: '2' }[sel]; if (c) out[`ml|${c}`] = v; }
    }
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
  return out;
}

/** "56:21" → 56.35 (minutes elapsed). */
export const minutesOf = (v) => {
  const m = /^(\d{1,3}):(\d{2})$/.exec(String(v || '').trim());
  return m ? Number(m[1]) + Number(m[2]) / 60 : null;
};

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
    prices: (() => { const odds = parseOdds(ev.odd); return { ...extraPrices(odds, { sport }), ...pricesFor(odds, sport) }; })(),
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
  client, tzOffsetMinutes = null, finishConfirmSeconds = 600, prematchStaleSeconds = 900, blockWomen = true, blockYouth = true, blockMinor = true, blockLeagues = '',
  detailHours = 12, detailPerCycle = 20, detailRefreshMinutes = 30, liveDetailPerCycle = 10, liveDetailSeconds = 30, log = () => {},
} = {}) {
  const block = { women: blockWomen, youth: blockYouth, minor: blockMinor, extra: leagueTerms(blockLeagues) };
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
  const liveFresh = (ext) => { const p = livePages.get(ext); return p && Date.now() - p.at < liveDetailSeconds * 2000 ? p.prices : {}; };
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

  function writePrices(eventId, prices) {
    db.prepare('UPDATE selections SET active = 0 WHERE event_id = ?').run(eventId);
    for (const [k, v] of Object.entries(prices)) upsertSel.run(eventId, ...k.split('|'), v);
    return Object.keys(prices).length;
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
    for (const raw of items) {
      const ev = normalizeItem(raw, { tzOffsetMinutes: offset(), block });
      if (!ev) continue;
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
          const overtime = row.sport === 'hoquei' && ev.minutes !== null && ev.minutes >= 60 && !row.wh_overtime;
          db.prepare(`UPDATE events SET status = 'live', home_score = ?, away_score = ?, clock = ?, wh_minute = COALESCE(?, wh_minute),
              wh_seen_at = ?, wh_missing_since = NULL, review_reason = NULL, postponed_at = NULL, updated_at = ? WHERE id = ?`)
            .run(home, away, clockText(row.sport, ev.minutes, ev.clockRaw), ev.minutes, nowIso(), nowIso(), row.id);
          if (overtime) {
            const tie = Math.min(home, away);
            db.prepare('UPDATE events SET wh_overtime = 1, reg_home_score = ?, reg_away_score = ? WHERE id = ?').run(tie, tie, row.id);
          }
          if (scoreChanged) db.prepare('UPDATE events SET score_at = ? WHERE id = ?').run(nowIso(), row.id);
          // The live list carries the book's in-play prices; a suspended market comes as 1.00.
          if (scoreChanged) livePages.delete(ev.externalId);
          liveListPrices.set(ev.externalId, ev.prices);
          const n = writePrices(row.id, Object.keys(ev.prices).length ? { ...liveFresh(ev.externalId), ...ev.prices } : {});
          db.prepare('UPDATE events SET live_odds_at = ? WHERE id = ?').run(n ? nowIso() : null, row.id);
          if (n) open += 1;
        });
      } catch (err) { log(`WinHouse ao vivo ${ev.externalId}: ${err.message}`); }
    }
    const ended = finishMissing(seen);
    state.last.live = { at: nowIso(), live: seen.size, withOdds: open, ...ended };
    return state.last.live;
  }

  /** Matches no longer in the live list: wait finishConfirmSeconds, then settle or flag. */
  function finishMissing(seen) {
    const now = Date.now();
    let finished = 0;
    let review = 0;
    for (const row of db.prepare("SELECT * FROM events WHERE source = ? AND status = 'live'").all(SOURCE)) {
      if (seen.has(row.external_id)) continue;
      if (!row.wh_missing_since) {
        tx(db, () => {
          db.prepare('UPDATE events SET wh_missing_since = ?, live_odds_at = NULL WHERE id = ?').run(nowIso(), row.id);
          db.prepare('UPDATE selections SET active = 0 WHERE event_id = ?').run(row.id);
        });
        continue;
      }
      if (now - new Date(row.wh_missing_since).getTime() < finishConfirmSeconds * 1000 || row.review_reason) continue;
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
    return { finished, review };
  }

  /** Every minute: the three pre-match lists → upcoming matches and their prices. */
  async function syncPrematch() {
    const lists = await Promise.all([client.prematchMain(), client.prematchTop(), client.prematch24h()].map((p) => p.catch((err) => ({ ok: false, error: err.message }))));
    const failed = lists.filter((r) => !r.ok);
    if (failed.length === lists.length) throw new Error(`pré-jogo: ${failed.map((r) => r.error || `HTTP ${r.status}`).join(' · ')}`);
    const byId = new Map();
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
    const stale = new Date(now - prematchStaleSeconds * 1000).toISOString();
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
  async function syncDetails() {
    const until = new Date(Date.now() + detailHours * 3600_000).toISOString();
    const now = Date.now();
    const rows = db.prepare(`SELECT id, sport, external_id FROM events WHERE source = ? AND status = 'scheduled' AND start_time > ? AND start_time <= ?
      ORDER BY start_time`).all(SOURCE, nowIso(), until);
    for (const ext of [...pagePrices.keys()]) if (!rows.some((r) => r.external_id === ext)) { pagePrices.delete(ext); listPrices.delete(ext); }
    const due = rows.filter((r) => { const p = pagePrices.get(r.external_id); return !p || now - p.at >= detailRefreshMinutes * 60_000; })
      .sort((a, b) => (pagePrices.get(a.external_id)?.at ?? 0) - (pagePrices.get(b.external_id)?.at ?? 0))
      .slice(0, detailPerCycle);
    let read = 0;
    let markets = 0;
    let failed = 0;
    for (const r of due) {
      try {
        const res = await client.prematchEvent(r.external_id);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const odds = detailOdds(res.body);
        const prices = { ...extraPrices(odds, { sport: r.sport }), ...pricesFor(odds, r.sport) };
        pagePrices.set(r.external_id, { at: Date.now(), prices });
        read += 1;
        markets += new Set(Object.keys(prices).map((k) => k.split('|')[0])).size;
        tx(db, () => {
          const row = db.prepare('SELECT status FROM events WHERE id = ?').get(r.id);
          if (row?.status !== 'scheduled') return; // started meanwhile: the live list owns it
          writePrices(r.id, { ...prices, ...(listPrices.get(r.external_id) || {}) });
        });
      } catch (err) {
        failed += 1;
        pagePrices.set(r.external_id, { at: Date.now() - detailRefreshMinutes * 30_000, prices: pagePrices.get(r.external_id)?.prices || {} }); // retry in half the time
        log(`WinHouse página ${r.external_id}: ${err.message}`);
      }
    }
    state.last.details = { at: nowIso(), due: due.length, read, failed, markets, cached: pagePrices.size, window: rows.length };
    return state.last.details;
  }

  /** Games imported before a block was set: removed while nobody has a bet on them. */
  function purgeBlocked() {
    if (!block.women && !block.youth && !block.minor && !block.extra) return 0;
    let n = 0;
    for (const e of db.prepare("SELECT id, sport, competition, home, away FROM events WHERE source = ? AND status IN ('scheduled', 'live')").all(SOURCE)) {
      if (!blockedGame({ sport: e.sport, league: e.competition, home_team: e.home, away_team: e.away }, block)) continue;
      if (db.prepare('SELECT 1 FROM bet_legs WHERE event_id = ? LIMIT 1').get(e.id)) continue;
      db.prepare('DELETE FROM events WHERE id = ?').run(e.id);
      n += 1;
    }
    return n;
  }

  /**
   * Every in-play market: each live game's own page (WINHOUSE_LIVE_EVENT), games with open prices
   * only, least recently read first, at most `liveDetailPerCycle` per run, each every
   * `liveDetailSeconds`. A route that answers 404 to a whole run is paused for 10 minutes.
   */
  async function syncLiveDetails() {
    if (!liveDetailPerCycle || !client.liveEvent) return null;
    const now = Date.now();
    if (now < liveDetailPausedUntil) return state.last.liveDetails;
    const rows = db.prepare(`SELECT id, sport, external_id, home_score, away_score FROM events
      WHERE source = ? AND status = 'live' AND live_odds_at IS NOT NULL AND wh_missing_since IS NULL`).all(SOURCE);
    const ids = new Set(rows.map((r) => r.external_id));
    for (const ext of [...livePages.keys()]) if (!ids.has(ext)) livePages.delete(ext);
    for (const ext of [...liveListPrices.keys()]) if (!ids.has(ext)) liveListPrices.delete(ext);
    const due = rows.filter((r) => { const p = livePages.get(r.external_id); return !p || now - p.at >= liveDetailSeconds * 1000; })
      .sort((a, b) => (livePages.get(a.external_id)?.at ?? 0) - (livePages.get(b.external_id)?.at ?? 0))
      .slice(0, liveDetailPerCycle);
    let read = 0;
    let markets = 0;
    let failed = 0;
    let notFound = 0;
    for (const r of due) {
      try {
        const res = await livePage(r.external_id);
        if (!res.ok) { if (res.status === 404) notFound += 1; throw new Error(res.status === 204 ? 'página sem odds' : `HTTP ${res.status}`); }
        const { odds } = res;
        const prices = { ...extraPrices(odds, { sport: r.sport }), ...pricesFor(odds, r.sport) };
        read += 1;
        markets += new Set(Object.keys(prices).map((k) => k.split('|')[0])).size;
        tx(db, () => {
          const row = db.prepare('SELECT status, home_score, away_score, live_odds_at, wh_missing_since FROM events WHERE id = ?').get(r.id);
          // Ended, suspended or a goal while the page was being read: those prices are stale.
          if (row?.status !== 'live' || !row.live_odds_at || row.wh_missing_since || row.home_score !== r.home_score || row.away_score !== r.away_score) return;
          const list = liveListPrices.get(r.external_id) || {};
          if (!Object.keys(list).length) return;
          livePages.set(r.external_id, { at: Date.now(), prices });
          writePrices(r.id, { ...prices, ...list });
        });
      } catch (err) {
        failed += 1;
        livePages.set(r.external_id, { at: Date.now(), prices: {} }); // retry after liveDetailSeconds
        log(`WinHouse página ao vivo ${r.external_id}: ${err.message}`);
      }
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
    live().then(pre).then(details).then(liveDetails);
    const timers = [setInterval(live, liveMs), setInterval(pre, prematchMs), setInterval(details, detailMs), setInterval(liveDetails, liveDetailMs)];
    return () => timers.forEach(clearInterval);
  }

  const status = () => ({
    enabled: state.enabled, last: state.last, lastError: state.lastError, lastErrorAt: state.lastErrorAt,
    tzOffsetMinutes: state.offset, tzOffsetSource: state.offsetSource, block: { ...block, extra: block.extra ? block.extra.source : null },
    events: Object.fromEntries(db.prepare('SELECT status, COUNT(*) AS n FROM events WHERE source = ? GROUP BY status').all(SOURCE).map((r) => [r.status, r.n])),
    review: db.prepare('SELECT COUNT(*) AS n FROM events WHERE source = ? AND review_reason IS NOT NULL').get(SOURCE).n,
  });

  return { enabled: state.enabled, syncLive, syncPrematch, syncDetails, syncLiveDetails, finishMissing, start, status, source: SOURCE };
}
