// PropLine (api.prop-line.com) — second odds source.
//
// Bzzoiro stays the main provider: it creates the events, scores, statistics, the live tracker and
// the results every bet is settled on. PropLine only brings prices, and only where the main
// provider has none for that market: its games are matched to ours by sport, kick-off time and
// team / player names, and each of its prices is written with selections.src = 'pl'.
//
// Rules that keep it safe:
//   - A market the main provider prices (an active row of ours) is never overwritten.
//   - Before the start: the average across bookmakers (DFS books and prediction markets left out),
//     American prices converted to decimal. Only half lines for totals, half / whole lines for
//     handicaps (quarter lines split the stake), game totals only (no team totals).
//   - In play: only bookmakers that really price in play (`pregame_only` false), markets not
//     suspended, outcomes seen in the last PROPLINE_LIVE_MAX_AGE seconds, and priced after the last
//     goal (events.score_at). events.pl_live_at records it; betting.js refuses PropLine prices in
//     play when it is older than LIVE_ODDS_MAX_AGE_SECONDS. Kick-off and goals close them.
//   - Requests are budgeted per day (PROPLINE_DAILY_REQUESTS) and the API's own quota headers are
//     followed; a 429 pauses until the reset, a 401/403 stops the source until the key is fixed.
//     No error ever reaches the main provider: each sport key is synced on its own.
//   - The API key is only read from the environment and only sent in the X-API-Key header.

import { nowIso, tx } from './db.js';
import { hcpCode } from './markets.js';

export const PROVIDER = 'propline';

/** Our sport for a PropLine sport key. */
export function sportFor(key) {
  const k = String(key || '').toLowerCase();
  if (k.startsWith('soccer_')) return 'futebol';
  if (k === 'tennis' || k.startsWith('tennis_')) return 'tenis';
  if (k.startsWith('basketball_')) return 'basquetebol';
  if (k.startsWith('hockey_') || k.startsWith('icehockey_')) return 'hoquei';
  return null;
}

export const DEFAULT_SPORT_KEYS = [
  'soccer_epl', 'soccer_la_liga', 'soccer_serie_a', 'soccer_bundesliga', 'soccer_ligue_1', 'soccer_mls',
  'tennis', 'basketball_nba', 'hockey_nhl',
];

/** Markets asked for per sport (game lines every book carries, plus the sport's own). */
const MARKETS = {
  futebol: ['h2h', 'totals', 'spreads', 'both_teams_to_score'],
  tenis: ['h2h', 'totals', 'spreads', 'total_sets'],
  basquetebol: ['h2h', 'totals', 'spreads'],
  // Ice hockey here only brings the moneyline (overtime included): our totals and handicaps
  // settle on regulation time, which US books' lines do not.
  hoquei: ['h2h'],
};

// Books that do not quote a real price (DFS pick'em, prediction markets).
const SKIP_BOOKS = new Set(['prizepicks', 'underdog', 'sleeper', 'kalshi', 'polymarket']);

/** American → decimal ×100 (−125 → 180, +150 → 250). */
export function americanToX100(v) {
  const n = Number(v);
  if (!Number.isFinite(n) || n === 0 || Math.abs(n) < 100) return null;
  const dec = n > 0 ? 1 + n / 100 : 1 + 100 / Math.abs(n);
  const x = Math.round(dec * 100);
  return x > 101 && x < 100_000 ? x : null;
}

// ---------- matching ----------

const STOP = new Set(['fc', 'cf', 'sc', 'afc', 'ac', 'club', 'de', 'the', 'cd', 'ud', 'sd', 'rc', 'ss', 'as', 'us', 'fk', 'sk', 'bk', 'if', 'calcio', 'football', 'futbol', 'cp', 'sv', 'vfb', 'vfl', 'tsg', 'rcd', 'ca', 'cr', 'ec', 'se']);
const ALIAS = { utd: 'united', man: 'manchester', st: 'saint', inter: 'internazionale', psg: 'paris' };

export function nameTokens(name) {
  return String(name || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/).filter(Boolean)
    .map((t) => ALIAS[t] || t).filter((t) => !STOP.has(t));
}

/** 0…1 — how sure we are that two spellings name the same team or player. */
export function nameScore(a, b, { player = false } = {}) {
  const x = nameTokens(a);
  const y = nameTokens(b);
  if (!x.length || !y.length) return 0;
  if (x.join(' ') === y.join(' ')) return 1;
  if (player) {
    // "B. Shick" / "Bernard Shick" / "Shick B.": same surname and, when both have one, same initial.
    const sur = (t) => t.filter((w) => w.length > 1);
    const common = sur(x).filter((w) => sur(y).includes(w));
    if (!common.length) return 0;
    const initials = (t) => t.map((w) => w[0]);
    const rest = (t) => t.filter((w) => !common.includes(w));
    const rx = rest(x);
    const ry = rest(y);
    if (!rx.length || !ry.length) return 0.85;
    return initials(rx).some((c) => initials(ry).includes(c)) ? 0.95 : 0.4;
  }
  const sx = new Set(x);
  const common = y.filter((t) => sx.has(t)).length;
  const jac = common / new Set([...x, ...y]).size;
  const contains = x.join(' ').includes(y.join(' ')) || y.join(' ').includes(x.join(' '));
  return Math.max(jac, contains ? 0.85 : 0);
}

/**
 * Best of our events for a PropLine game: same sport, kick-off close enough (tennis schedules
 * move more), both sides matching (either way round). Returns { event, swapped } or null.
 */
export function matchEvent(pl, candidates, sport) {
  const t = new Date(pl.commence_time).getTime();
  if (!Number.isFinite(t) || !pl.home_team || !pl.away_team) return null;
  const window = sport === 'tenis' ? 4 * 3_600_000 : 20 * 60_000;
  const player = sport === 'tenis';
  let best = null;
  for (const ev of candidates) {
    if (Math.abs(new Date(ev.start_time).getTime() - t) > window) continue;
    const straight = Math.min(nameScore(pl.home_team, ev.home, { player }), nameScore(pl.away_team, ev.away, { player }));
    const swapped = Math.min(nameScore(pl.home_team, ev.away, { player }), nameScore(pl.away_team, ev.home, { player }));
    const score = Math.max(straight, swapped);
    if (score >= 0.6 && (!best || score > best.score)) best = { event: ev, swapped: swapped > straight, score };
  }
  return best;
}

// ---------- prices ----------

const median = (vals) => {
  const v = [...vals].sort((a, b) => a - b);
  return v.length % 2 ? v[(v.length - 1) / 2] : (v[v.length / 2 - 1] + v[v.length / 2]) / 2;
};

/**
 * One PropLine game → { 'market|code': x100 } for our event. `live` keeps only real in-play
 * quotes: books with an in-play feed, markets on the board, outcomes seen in the last `maxAgeMs`
 * and changed since `since` (the last goal).
 */
export function pricesFrom(game, sport, { swapped = false, live = false, maxAgeMs = 90_000, since = 0, now = Date.now() } = {}) {
  const collect = new Map(); // key -> [x100…]
  const add = (key, x) => { if (x) { if (!collect.has(key)) collect.set(key, []); collect.get(key).push(x); } };
  const side = (name) => {
    const a = nameScore(name, game.home_team, { player: sport === 'tenis' });
    const b = nameScore(name, game.away_team, { player: sport === 'tenis' });
    if (a >= 0.6 && a > b) return swapped ? '2' : '1';
    if (b >= 0.6 && b > a) return swapped ? '1' : '2';
    return null;
  };
  const halfLine = (p) => Number.isFinite(p) && p > 0 && Math.round(p * 2) % 2 === 1;
  const hcpLine = (p) => Number.isFinite(p) && Number.isInteger(p * 2) && Math.abs(p) < 100;

  for (const book of Array.isArray(game.bookmakers) ? game.bookmakers : []) {
    if (SKIP_BOOKS.has(String(book.key || '').toLowerCase())) continue;
    if (live && book.pregame_only !== false) continue;
    for (const m of Array.isArray(book.markets) ? book.markets : []) {
      if (m.period) continue; // full game only
      if (live && m.suspended_at) continue;
      if (m.team) continue; // team totals
      for (const o of Array.isArray(m.outcomes) ? m.outcomes : []) {
        if (o.payout_multiplier !== undefined && o.payout_multiplier !== null && o.payout_multiplier !== 1) continue;
        if (o.dfs_odds_type) continue;
        if (live) {
          const seen = new Date(o.last_seen_at || m.last_update || 0).getTime();
          const changed = new Date(o.last_change_at || 0).getTime();
          if (!(now - seen <= maxAgeMs) || (since && !(changed >= since))) continue;
        }
        const x = americanToX100(o.price);
        const point = o.point === null || o.point === undefined ? null : Number(o.point);
        const name = String(o.name || '');
        const up = name.toUpperCase();
        switch (m.key) {
          case 'h2h': {
            if (up === 'DRAW' || up === 'TIE') { if (sport === 'futebol') add('1x2|X', x); break; }
            const s = side(name);
            if (!s) break;
            const market = sport === 'futebol' || sport === 'tenis' ? '1x2' : 'ml';
            add(`${market}|${s}`, x);
            break;
          }
          case 'totals': {
            if (!halfLine(point) || !['OVER', 'UNDER'].includes(up)) break;
            const market = sport === 'tenis' ? 'gou' : 'ou';
            add(`${market}|${up[0]}${point}`, x);
            break;
          }
          case 'total_sets':
            if (sport === 'tenis' && halfLine(point) && ['OVER', 'UNDER'].includes(up)) add(`ou|${up[0]}${point}`, x);
            break;
          case 'spreads': {
            if (!hcpLine(point)) break;
            const s = side(name);
            if (!s) break;
            add(`${sport === 'tenis' ? 'ghcp' : 'hcp'}|${hcpCode(s, point)}`, x);
            break;
          }
          case 'both_teams_to_score':
          case 'btts':
            if (sport === 'futebol' && (up === 'YES' || up === 'NO')) add(`btts|${up === 'YES' ? 'Y' : 'N'}`, x);
            break;
          default:
        }
      }
    }
  }
  const out = {};
  for (const [key, vals] of collect) out[key] = Math.round(median(vals));
  // Only complete markets: both sides of a line, every outcome of a result.
  const has = (k) => out[k] !== undefined;
  for (const key of Object.keys(out)) {
    const [market, code] = key.split('|');
    let ok = true;
    if (market === '1x2') ok = has('1x2|1') && has('1x2|2') && (sport !== 'futebol' || has('1x2|X'));
    else if (market === 'ml') ok = has('ml|1') && has('ml|2');
    else if (['ou', 'gou'].includes(market)) ok = has(`${market}|O${code.slice(1)}`) && has(`${market}|U${code.slice(1)}`);
    else if (['hcp', 'ghcp'].includes(market)) {
      const line = Number(code.slice(1));
      ok = has(`${market}|${hcpCode('1', code[0] === '1' ? line : -line)}`) && has(`${market}|${hcpCode('2', code[0] === '2' ? line : -line)}`);
    } else if (market === 'btts') ok = has('btts|Y') && has('btts|N');
    if (!ok) delete out[key];
  }
  // A ladder of lines: keep the five most balanced per market.
  for (const market of ['ou', 'gou', 'hcp', 'ghcp']) {
    const lines = [...new Set(Object.keys(out).filter((k) => k.startsWith(`${market}|`)).map((k) => Math.abs(Number(k.split('|')[1].slice(1)))))];
    if (lines.length <= 5) continue;
    const pair = (l) => (['ou', 'gou'].includes(market) ? [`${market}|O${l}`, `${market}|U${l}`]
      : Object.keys(out).filter((k) => k.startsWith(`${market}|`) && Math.abs(Number(k.split('|')[1].slice(1))) === l));
    const balance = (l) => { const [a, b] = pair(l).map((k) => out[k]); return a && b ? Math.abs(Math.log(a / b)) : 9; };
    for (const l of lines.sort((a, b) => balance(a) - balance(b)).slice(5)) for (const k of pair(l)) delete out[k];
  }
  // A result book that is not a book (margin far off) is dropped: 1/p summed must look like a market.
  const overround = (keys) => keys.reduce((t, k) => t + 100 / out[k], 0);
  const r = sport === 'futebol' ? ['1x2|1', '1x2|X', '1x2|2'] : [`${sport === 'tenis' ? '1x2' : 'ml'}|1`, `${sport === 'tenis' ? '1x2' : 'ml'}|2`];
  if (r.every(has)) { const o = overround(r); if (o < 0.95 || o > 1.25) r.forEach((k) => delete out[k]); }
  return out;
}

// ---------- feed ----------

export function createPropLineFeed(db, {
  apiKey = '', baseUrl = 'https://api.prop-line.com/v1', sportKeys = DEFAULT_SPORT_KEYS, dailyRequests = 900,
  prematchSeconds = 0, liveSeconds = 60, liveMaxAge = 90, maxLiveEvents = 20, timeoutMs = 15_000,
  fetchImpl = globalThis.fetch, log = () => {},
} = {}) {
  const keys = sportKeys.filter((k) => sportFor(k));
  const state = {
    enabled: !!apiKey && keys.length > 0, stopped: null, lastError: null, lastErrorAt: null, pausedUntil: 0,
    quota: null, usedToday: 0, day: new Date().toISOString().slice(0, 10), bySport: {}, live: null,
  };
  // Pre-match cadence from the daily budget: 60 % of it for pre-match, the rest for live.
  // (never below 60 s when derived, 30 s when set explicitly)
  const prematchEvery = prematchSeconds
    ? Math.max(30, prematchSeconds)
    : Math.max(60, Math.ceil((86_400 * keys.length) / Math.max(1, dailyRequests * 0.6)));
  const lastRun = new Map();

  function budgetLeft() {
    const day = new Date().toISOString().slice(0, 10);
    if (day !== state.day) { state.day = day; state.usedToday = 0; }
    const own = dailyRequests - state.usedToday;
    const api = state.quota?.remaining;
    return Math.min(own, api === undefined || api === null ? own : api);
  }

  async function get(path, params = {}) {
    if (state.stopped) throw new Error(state.stopped);
    if (Date.now() < state.pausedUntil) throw new Error('quota diária esgotada — em pausa até ao reset');
    if (budgetLeft() <= 0) throw new Error('orçamento diário de pedidos esgotado');
    const url = new URL(`${baseUrl.replace(/\/$/, '')}${path}`);
    for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, v);
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), timeoutMs);
    let res;
    try {
      state.usedToday += 1;
      res = await fetchImpl(url, { headers: { 'X-API-Key': apiKey, Accept: 'application/json' }, signal: ctl.signal });
    } catch (err) {
      throw new Error(err.name === 'AbortError' ? 'tempo de resposta esgotado' : `rede: ${err.message}`);
    } finally {
      clearTimeout(timer);
    }
    const h = (n) => { const v = res.headers?.get?.(n); return v === null || v === undefined || v === '' ? null : Number(v); };
    if (h('X-Daily-Limit') !== null) {
      state.quota = { limit: h('X-Daily-Limit'), used: h('X-Daily-Used'), remaining: h('X-Daily-Remaining'), resetAt: h('X-Daily-Reset') ? new Date(h('X-Daily-Reset') * 1000).toISOString() : null };
    }
    let body = null;
    try { body = await res.json(); } catch { /* empty */ }
    if (res.status === 401 || res.status === 403) {
      state.stopped = `chave recusada (${res.status}) — verifique PROPLINE_API_KEY`;
      throw new Error(state.stopped);
    }
    if (res.status === 429) {
      const retry = Number(body?.retry_after_seconds) || (h('Retry-After') ?? 0);
      const reset = state.quota?.resetAt ? new Date(state.quota.resetAt).getTime() : 0;
      state.pausedUntil = Math.max(Date.now() + (retry || 900) * 1000, reset);
      throw new Error('limite de pedidos atingido (429)');
    }
    if (!res.ok) throw new Error(`${res.status}: ${String(body?.detail || body?.message || '').slice(0, 120)}`);
    return body;
  }

  const findLink = db.prepare('SELECT * FROM provider_links WHERE provider = ? AND provider_event_id = ?');
  const saveLink = db.prepare(`INSERT INTO provider_links (provider, provider_event_id, event_id, sport_key, swapped, matched_at) VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT (provider, provider_event_id) DO UPDATE SET event_id = excluded.event_id, swapped = excluded.swapped, matched_at = excluded.matched_at`);

  /** Our event for a PropLine game (cached link, else a fresh match). */
  function linkFor(game, sportKey, sport) {
    const id = String(game.id);
    const known = findLink.get(PROVIDER, id);
    if (known) {
      const ev = db.prepare('SELECT * FROM events WHERE id = ?').get(known.event_id);
      if (ev) return { event: ev, swapped: !!known.swapped };
    }
    const t = new Date(game.commence_time).getTime();
    if (!Number.isFinite(t)) return null;
    const candidates = db.prepare(
      `SELECT * FROM events WHERE sport = ? AND source <> 'manual' AND status IN ('scheduled', 'live') AND start_time BETWEEN ? AND ?`
    ).all(sport, new Date(t - 5 * 3_600_000).toISOString(), new Date(t + 5 * 3_600_000).toISOString());
    const m = matchEvent(game, candidates, sport);
    if (!m) return null;
    saveLink.run(PROVIDER, id, m.event.id, sportKey, m.swapped ? 1 : 0, nowIso());
    return m;
  }

  const upsert = db.prepare(
    `INSERT INTO selections (event_id, market, code, odds_x100, active, src) VALUES (?, ?, ?, ?, 1, 'pl')
     ON CONFLICT (event_id, market, code) DO UPDATE SET odds_x100 = excluded.odds_x100, active = 1, src = 'pl'
       WHERE selections.src = 'pl' OR selections.active = 0`
  );

  /** Writes PropLine's prices for one event, leaving every market the main provider prices alone. */
  function write(eventId, prices, { live }) {
    const ours = new Set(db.prepare('SELECT DISTINCT market FROM selections WHERE event_id = ? AND active = 1 AND src IS NULL').all(eventId).map((r) => r.market));
    db.prepare("UPDATE selections SET active = 0 WHERE event_id = ? AND src = 'pl'").run(eventId);
    let n = 0;
    for (const [key, x100] of Object.entries(prices)) {
      const [market, code] = key.split('|');
      if (ours.has(market)) continue;
      n += upsert.run(eventId, market, code, x100).changes;
    }
    if (live) db.prepare('UPDATE events SET pl_live_at = ? WHERE id = ?').run(n ? nowIso() : null, eventId);
    return n;
  }

  /** Pre-match: one bulk request per sport key. */
  async function syncSport(sportKey) {
    const sport = sportFor(sportKey);
    const games = await get(`/sports/${encodeURIComponent(sportKey)}/odds`, { markets: MARKETS[sport].join(',') });
    let matched = 0;
    let priced = 0;
    for (const game of Array.isArray(games) ? games : []) {
      if (!game || game.is_outright) continue;
      const link = linkFor(game, sportKey, sport);
      if (!link) continue;
      matched += 1;
      const ev = db.prepare('SELECT status, start_time FROM events WHERE id = ?').get(link.event.id);
      if (!ev || ev.status !== 'scheduled' || new Date(ev.start_time).getTime() <= Date.now()) continue;
      const prices = pricesFrom(game, sport, { swapped: link.swapped });
      if (tx(db, () => write(link.event.id, prices, { live: false }))) priced += 1;
    }
    state.bySport[sportKey] = { at: nowIso(), games: Array.isArray(games) ? games.length : 0, matched, priced };
    return state.bySport[sportKey];
  }

  /** In play: one request per linked live game (a budget-capped handful per pass). */
  async function syncLive() {
    const rows = db.prepare(
      `SELECT l.provider_event_id, l.sport_key, l.swapped, e.id, e.sport, e.score_at, e.home_score, e.away_score
         FROM provider_links l JOIN events e ON e.id = l.event_id
        WHERE l.provider = ? AND e.status = 'live' ORDER BY e.start_time LIMIT ?`
    ).all(PROVIDER, maxLiveEvents);
    let open = 0;
    for (const r of rows) {
      if (budgetLeft() <= 5) break;
      let game;
      try {
        game = await get(`/sports/${encodeURIComponent(r.sport_key)}/events/${encodeURIComponent(r.provider_event_id)}/odds`, { markets: MARKETS[r.sport].join(',') });
      } catch (err) {
        noteError(err);
        continue;
      }
      const prices = pricesFrom(game || {}, r.sport, {
        swapped: !!r.swapped, live: true, maxAgeMs: liveMaxAge * 1000, since: r.score_at ? new Date(r.score_at).getTime() : 0,
      });
      // The score the book priced must be the one we show: a lopsided result book is refused.
      const lead = r.sport === 'futebol' && Math.abs((r.home_score ?? 0) - (r.away_score ?? 0)) >= 2;
      if (lead) {
        const [l, t] = r.home_score > r.away_score ? [prices['1x2|1'], prices['1x2|2']] : [prices['1x2|2'], prices['1x2|1']];
        if (l && t && l >= t) for (const k of Object.keys(prices)) delete prices[k];
      }
      if (tx(db, () => write(r.id, prices, { live: true }))) open += 1;
    }
    state.live = { at: nowIso(), checked: rows.length, open };
    return state.live;
  }

  function noteError(err) {
    state.lastError = err.message;
    state.lastErrorAt = nowIso();
    log(`PropLine: ${err.message}`);
  }

  let busy = false;
  async function tick() {
    if (!state.enabled || state.stopped || busy) return;
    busy = true;
    try {
      const now = Date.now();
      if (now - (lastRun.get('live') || 0) >= liveSeconds * 1000 && liveSeconds > 0) {
        lastRun.set('live', now);
        try { await syncLive(); } catch (err) { noteError(err); }
      }
      for (const key of keys) {
        if (now - (lastRun.get(key) || 0) < prematchEvery * 1000) continue;
        lastRun.set(key, now);
        try { await syncSport(key); } catch (err) { noteError(err); state.bySport[key] = { ...(state.bySport[key] || {}), error: err.message }; }
      }
    } finally {
      busy = false;
    }
  }

  // The loop ticks as often as the in-play cadence needs (5 s at the fastest, 15 s at most).
  function start({ tickMs = Math.min(15_000, Math.max(5_000, (liveSeconds || 15) * 1000)) } = {}) {
    if (!state.enabled) return () => {};
    const first = setTimeout(tick, 5_000);
    const timer = setInterval(tick, tickMs);
    return () => { clearTimeout(first); clearInterval(timer); };
  }

  const status = () => ({
    enabled: state.enabled, keySet: !!apiKey, stopped: state.stopped, lastError: state.lastError, lastErrorAt: state.lastErrorAt,
    pausedUntil: state.pausedUntil > Date.now() ? new Date(state.pausedUntil).toISOString() : null,
    quota: state.quota, usedToday: state.usedToday, dailyBudget: dailyRequests, prematchEverySeconds: prematchEvery, liveEverySeconds: liveSeconds,
    sports: keys.map((k) => ({ key: k, sport: sportFor(k), ...(state.bySport[k] || {}) })), live: state.live,
    linked: db.prepare('SELECT COUNT(*) AS n FROM provider_links WHERE provider = ?').get(PROVIDER).n,
    selections: db.prepare("SELECT COUNT(*) AS n FROM selections WHERE src = 'pl' AND active = 1").get().n,
  });

  /** Raw PropLine odds for one of our events (admin diagnostics). */
  async function rawOdds(eventId) {
    const l = db.prepare('SELECT * FROM provider_links WHERE provider = ? AND event_id = ?').get(PROVIDER, eventId);
    if (!l) return null;
    return get(`/sports/${encodeURIComponent(l.sport_key)}/events/${encodeURIComponent(l.provider_event_id)}/odds`);
  }

  return { enabled: state.enabled, start, tick, syncSport, syncLive, status, rawOdds };
}
