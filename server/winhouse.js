// WinHouse — data source being evaluated to replace / complement the odds providers.
//
// Step 1 (this module): the HTTP client, the parsers for what we already know of its payloads, and
// a health check that calls each route FROM THE SERVER and reports status, time, size and the shape
// of the first item. The collector that writes events / odds is built on top once the real shapes
// have been seen in production. Nothing here writes to the database yet.
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

export function createWinHouseClient({
  baseUrl = '', lang = 'pt', routes = {}, timeoutMs = 20_000, fetchImpl = globalThis.fetch, log = () => {},
} = {}) {
  const base = String(baseUrl || '').replace(/\/+$/, '');
  const paths = { ...ROUTES, ...Object.fromEntries(Object.entries(routes).filter(([, v]) => v)) };
  const enabled = /^https:\/\//.test(base);
  const url = (key, vars = {}) => base + paths[key].replace('{lang}', encodeURIComponent(lang)).replace('{gameId}', encodeURIComponent(vars.gameId ?? ''));

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
   * Calls the five routes from this server and reports, for each: HTTP status, time, size, whether
   * it is JSON, how many events, the shape of the first one and how many of its odds we can read.
   * The event route uses the first game id found in the pre-match lists (or `gameId`).
   */
  async function health({ gameId = null } = {}) {
    const out = [];
    let firstId = gameId;
    for (const key of ['live', 'prematchMain', 'prematchTop', 'prematch24h', 'prematchEvent']) {
      if (key === 'prematchEvent' && !firstId) { out.push({ route: key, skipped: 'nenhum gameId nas listas pré-jogo' }); continue; }
      try {
        const r = await request(key, { gameId: firstId });
        const events = eventsOf(r.body);
        if (!firstId && key !== 'live') firstId = events.find((e) => e?.id)?.id ?? null;
        const first = key === 'prematchEvent' ? r.body : events[0];
        const odds = first ? parseOdds(first.odd ?? first.odds) : [];
        out.push({
          route: key, path: paths[key].replace('{lang}', lang).replace('{gameId}', firstId ?? ''), status: r.status, ok: r.ok, ms: r.ms, bytes: r.bytes,
          json: r.body !== null, contentType: r.contentType, events: events.length,
          oddsParsed: odds.length, oddsMapped: odds.filter(marketKey).length,
          firstItem: first ? shape(first) : null,
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
  };
}
