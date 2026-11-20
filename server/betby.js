// Server-side BETBY market collector (in-process, no second service, no volume). It polls the BETBY
// live / prematch feeds and the market descriptions catalog so we can offer and settle ourselves the
// player markets WinHouse does not have. Adapted from the standalone betby-collector; here it keeps the
// per-event market state in memory (markets are ephemeral) and the catalog that turns market / outcome
// ids into readable names (and player names). It only runs when BETBY_COLLECT=1 and the BETBY account
// has authorized the server's IP — otherwise the feed answers 503 with header bb-rsn: bc.
//
// Feed shape (from the collector's README, confirmed against a real index):
//   /api/v4/{feed}/brand/{brand}/{locale}/0  -> a version index: { top_events_versions, rest_events_versions }
//   /api/v4/{feed}/brand/{brand}/{locale}/{version} -> { events: { eventId: delta | null } }
//   delta = { state, score, markets: { marketId: { variant: { outcomeId: { k: odd, b: 1=blocked } } } } }
// Team / competition names are NOT in the feed; the descriptions catalog carries market and player names.

import { scoreTeams, SPORT_ID } from './betby-engine.js';

const SPORT_BY_ID = Object.fromEntries(Object.entries(SPORT_ID).map(([slug, id]) => [id, slug]));
const PAIR_MIN = 0.5;  // each side must score at least this in the chosen orientation
const PAIR_GOOD = 0.6; // the pair's average score to accept the match (same thresholds as the mini-field)

const digestField = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

// Market types (catalog field market_type) that are player markets — the ones WinHouse does not have
// and we settle ourselves from GOAL API. Taken from the sister project's live match page.
const PLAYER_TYPES = new Set(['PlayerProps', 'PlayerPropsPlus', 'PlayerPropsPlus2', 'PlayerPropsH2H',
  'PlayerPropsTotal', 'PlayerPropsCombo', 'PlayerPropsExtra', 'PlayerPropsYesNo', 'PlayerPropsPrebuilt',
  'PlayerPropsOddEven', 'PlayerPropsEP', 'PlayersH2H']);
const isPlayerType = (t) => Boolean(t && PLAYER_TYPES.has(String(t)));

// Map a BETBY player market to a grader kind (server/playermarkets.js) we can settle from GOAL API.
// By market id first (confirmed from a real match: 40 anytime scorer, 898 2+, 899 3+), then by name.
const MARKET_KIND_BY_ID = { 40: 'anytime_scorer', 898: 'scorer_2plus', 899: 'hattrick', 39: 'last_scorer' };
function kindOf(marketId, marketName = '', variant = '') {
  const id = Number(marketId);
  // Market 38 is the Nth goalscorer (variant goalnr): only the FIRST goalscorer is one we settle.
  if (id === 38) return specifiersOf(variant).goalnr === '1' ? 'first_scorer' : null;
  const byId = MARKET_KIND_BY_ID[id];
  if (byId) return byId;
  const n = String(marketName).toLowerCase();
  if (/\bexpuls|sent.?off|cart[aã]o vermelho|red card/.test(n)) return 'to_be_sent_off';
  if (/advertido|amarelo|booked|carded|cart[aã]o|booking/.test(n)) return 'to_be_carded';
  if (/assist[êe]ncia|\bassist/.test(n)) return 'anytime_assist';
  if (/[uú]ltimo marcador|last goalscorer/.test(n)) return 'last_scorer';
  if (/primeiro marcador|1.?\s*marcador|first goalscorer/.test(n)) return 'first_scorer';
  if (/3\s*\+|hat.?trick|tr[êe]s ou mais/.test(n)) return 'hattrick';
  if (/2\s*\+|dois ou mais|marcar 2/.test(n)) return 'scorer_2plus';
  if (/marcador em qualquer|qualquer altura|a qualquer momento|anytime|a marcar\b|to score/.test(n)) return 'anytime_scorer';
  return null; // a player market we do not settle (yet)
}

// Fill the BETBY name template markers ({$competitor1}, {total}, {hcp}…) with plain text; drop the rest.
function fillTemplate(template, values) {
  return String(template || '').replace(/\{[^}]+\}/g, (tok) => {
    const key = tok.slice(1, -1).trim().replace(/^[!%$]/, '').toLowerCase();
    if (key === 'competitor1') return values.competitor1 || '';
    if (key === 'competitor2') return values.competitor2 || '';
    return values[key] != null ? String(values[key]) : '';
  }).replace(/\s+/g, ' ').trim();
}

// The specifiers of a feed variant ("total=2.5|hcp=-1") as a map.
function specifiersOf(variant) {
  const out = {};
  for (const part of String(variant || '').split('|')) { const i = part.indexOf('='); if (i > 0) out[part.slice(0, i).trim().toLowerCase()] = part.slice(i + 1).trim(); }
  return out;
}

// The feed deltas carry only the top markets (1x2, totals). The full market list of an event — scorer,
// cards, player props — comes from a per-event endpoint. BETBY's exact path varies, so we try the
// candidates the sister project discovered, in order, and keep the first that returns markets.
const EVENT_CANDIDATES = [
  '{base}/api/v4/{feed}/brand/{brand}/event/{locale}/{id}',
  '{base}/api/v4/{feed}/brand/{brand}/{locale}/event/{id}',
  '{base}/api/v4/{feed}/brand/{brand}/{locale}/events/{id}',
  '{base}/api/v4/{feed}/brand/{brand}/{locale}/match/{id}',
  '{base}/api/v4/event/brand/{brand}/{locale}/{id}',
  '{base}/api/v3/{feed}/brand/{brand}/{locale}/event/{id}',
  '{base}/api/v2/{feed}/brand/{brand}/{locale}/event/{id}',
  '{base}/api/v1/events/brand/{brand}/event/{id}/{locale}',
];

// Find the markets object anywhere in a per-event response (shape varies): the sister project's extractMarkets.
function extractMarkets(payload, eventId) {
  const seen = new Set();
  const preferred = ['markets', String(eventId), 'events', 'event', 'response', 'result', 'payload', 'data', 'body'];
  const visit = (value, depth = 0) => {
    if (!value || typeof value !== 'object' || depth > 8 || seen.has(value)) return null;
    seen.add(value);
    if (Array.isArray(value)) { for (const item of value) { const f = visit(item, depth + 1); if (f) return f; } return null; }
    if (value.markets && typeof value.markets === 'object' && !Array.isArray(value.markets)) return value.markets;
    for (const key of preferred) { if (key !== 'markets' && key in value) { const f = visit(value[key], depth + 1); if (f) return f; } }
    for (const [key, child] of Object.entries(value)) { if (!preferred.includes(key) && key !== 'markets') { const f = visit(child, depth + 1); if (f) return f; } }
    return null;
  };
  return visit(payload);
}

export function createBetby(cfg = {}, { fetchImpl = globalThis.fetch, log = () => {} } = {}) {
  const baseUrl = String(cfg.baseUrl || 'https://demoapi.betby.com').replace(/\/+$/, '');
  const brandId = cfg.brandId || '';
  const locale = cfg.locale || 'en-gb';
  const marketLocale = cfg.marketLocale || 'pt';
  const timeoutMs = Math.max(1000, Number(cfg.timeoutMs || 12000));
  const on = Boolean(cfg.collect && brandId);

  const paths = {
    live: `/api/v4/live/brand/${brandId}/${locale}/0`,
    prematch: `/api/v4/prematch/brand/${brandId}/${locale}/0`,
  };
  const stores = { live: new Map(), prematch: new Map() };
  const feeds = { live: {}, prematch: {} };
  const dict = { sports: {}, categories: {}, tournaments: {} }; // names from the feed payloads
  const sportName = (id) => dict.sports[String(id)]?.name || null;
  const mergeDict = (payload) => { for (const k of ['sports', 'categories', 'tournaments']) if (payload?.[k] && typeof payload[k] === 'object') Object.assign(dict[k], payload[k]); };
  let catalog = null; // { at, markets: Map(marketId -> { name, kind, outcomes: Map(outcomeId -> name) }) }
  let catalogRaw = null; // first slice of the raw catalog, for the diagnostic
  let lastError = null;
  let lastRunAt = null;
  let lastOkAt = null;
  let running = false;

  async function requestJson(feed, url) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetchImpl(url, { headers: { accept: 'application/json', 'user-agent': 'BET62-collector/1.0' }, signal: controller.signal });
      const text = await res.text();
      const blockReason = res.headers.get('bb-rsn');
      if (feed) feeds[feed] = { ...feeds[feed], url, httpStatus: res.status, blockReason, bodyPreview: text.slice(0, 200), checkedAt: new Date().toISOString() };
      if (!res.ok) throw new Error(`HTTP ${res.status}${blockReason ? ` (bb-rsn: ${blockReason})` : ''}`);
      try { return JSON.parse(text); } catch { throw new Error('resposta não é JSON'); }
    } finally { clearTimeout(timer); }
  }

  // Merge one feed payload's deltas into the per-event store.
  function applyDeltas(store, payload) {
    const events = payload && typeof payload === 'object' ? payload.events : null;
    if (!events || typeof events !== 'object' || Array.isArray(events)) return 0;
    let applied = 0;
    for (const [id, delta] of Object.entries(events)) {
      applied += 1;
      if (delta === null) { store.delete(id); continue; }
      if (!delta || typeof delta !== 'object') continue;
      const cur = store.get(id) ?? { id, markets: {} };
      if (delta.state) cur.state = { ...cur.state, ...delta.state };
      if (delta.score) cur.score = { ...cur.score, ...delta.score };
      if (delta.markets && typeof delta.markets === 'object') {
        for (const [marketId, variants] of Object.entries(delta.markets)) {
          if (variants === null) { delete cur.markets[marketId]; continue; }
          const merged = { ...cur.markets[marketId] };
          for (const [variant, outcomes] of Object.entries(variants)) {
            if (outcomes === null) delete merged[variant]; else merged[variant] = outcomes;
          }
          cur.markets[marketId] = merged;
        }
      }
      for (const [k, v] of Object.entries(delta)) if (!['state', 'score', 'markets'].includes(k)) cur[k] = v;
      cur.updatedAt = Date.now();
      store.set(id, cur);
    }
    return applied;
  }

  const versionsOf = (index) => {
    if (!index || typeof index !== 'object') return [];
    const list = [...(Array.isArray(index.top_events_versions) ? index.top_events_versions : []),
      ...(Array.isArray(index.rest_events_versions) ? index.rest_events_versions : [])];
    return [...new Set(list.map(String).filter((v) => /^\d+$/.test(v)))];
  };

  async function fetchFeed(feed) {
    const indexUrl = baseUrl + paths[feed];
    const index = await requestJson(feed, indexUrl);
    const store = stores[feed];
    mergeDict(index);
    applyDeltas(store, index);
    const base = indexUrl.slice(0, indexUrl.lastIndexOf('/'));
    let versions = versionsOf(index);
    for (const version of versions) { const payload = await requestJson(feed, `${base}/${version}`).catch(() => null); if (payload) { mergeDict(payload); applyDeltas(store, payload); } }
    feeds[feed] = { ...feeds[feed], ok: true, error: null, events: store.size, indexKeys: Object.keys(index || {}).slice(0, 12), versions: versions.length };
  }

  // The brand's market descriptions catalog, served whole in one request and keyed by market id:
  //   { marketId: { id, name, market_type, variants: { variant: [{ outcomes: [{ id, name }] }] }, ... } }
  // name / outcome name carry markers ({$competitor1}, {total}…); market_type tells a player market.
  // (Confirmed against the sister project's lib/betby.ts.) Kept as-is for name lookup at settlement.
  async function fetchCatalog() {
    const url = `${baseUrl}/api/v3/descriptions/brand/${brandId}/markets/${marketLocale}`;
    const raw = await requestJson('', url);
    catalogRaw = JSON.stringify(raw).slice(0, 1200);
    const markets = new Map();
    const entries = Array.isArray(raw) ? raw.map((m) => [m?.id, m]) : raw && typeof raw === 'object' ? Object.entries(raw.markets || raw.data || raw) : [];
    for (const [id, m] of entries) {
      if (!m || typeof m !== 'object' || id == null) continue;
      markets.set(String(id), { id: String(id), name: m.name || null, market_type: m.market_type || m.marketType || m.type || null, variants: m.variants || null });
    }
    catalog = { at: Date.now(), markets };
    return markets.size;
  }

  // The catalog outcome names for a market+variant (the sister project's catalogOutcomes): the exact
  // variant, else the market's only variant group. Works on both the static catalog entry and a
  // per-event description entry (same shape). Returns [{ id, name }] or null.
  function catalogOutcomes(entry, variant) {
    const vs = entry?.variants;
    if (!vs || typeof vs !== 'object') return null;
    const group = vs[variant] ?? vs[`variant=${variant}`] ?? Object.values(vs)[0];
    return Array.isArray(group) ? group[0]?.outcomes || null : null;
  }

  // Per-event descriptions: the REAL player names for a match (the static catalog has only generic
  // market names; players differ per game). Shape: { markets: { marketId: { name, variants } } }.
  // Cached per event (players barely change during a match).
  const eventDescs = new Map(); // eventId -> { at, markets: Map(marketId -> entry) }
  async function fetchEventDescriptions(eventId) {
    const hit = eventDescs.get(eventId);
    if (hit && Date.now() - hit.at < 10 * 60_000) return hit;
    const url = `${baseUrl}/api/v3/descriptions/brand/${brandId}/event/${encodeURIComponent(eventId)}/${marketLocale}`;
    const raw = await requestJson('', url).catch(() => null);
    const markets = new Map();
    const src = raw?.markets && typeof raw.markets === 'object' ? raw.markets : null;
    if (src) for (const [mid, m] of Object.entries(src)) if (m && typeof m === 'object') markets.set(String(mid), m);
    const entry = { at: Date.now(), markets };
    eventDescs.set(eventId, entry);
    return entry;
  }

  // The full markets of one event (scorer, cards, player props) from the per-event endpoint. The working
  // URL template is discovered once and kept. Returns a markets object { marketId: { variant: { outcomeId: cell } } }.
  let eventTpl = null;
  const eventMarketsCache = new Map(); // eventId -> { at, markets }
  async function fetchEventMarkets(feed, eventId) {
    const hit = eventMarketsCache.get(eventId);
    if (hit && Date.now() - hit.at < 30_000) return hit.markets;
    const fill = (t) => t.replace('{base}', baseUrl).replace('{feed}', feed).replace('{brand}', brandId).replace('{locale}', locale).replace('{id}', eventId);
    const tryOne = async (t) => { const raw = await requestJson('', fill(t)).catch(() => null); const m = raw ? extractMarkets(raw, eventId) : null; return m && Object.keys(m).length ? m : null; };
    let markets = null;
    if (eventTpl) markets = await tryOne(eventTpl);
    if (!markets) for (const t of EVENT_CANDIDATES) { const m = await tryOne(t); if (m) { eventTpl = t; markets = m; break; } }
    if (markets) eventMarketsCache.set(eventId, { at: Date.now(), markets });
    return markets;
  }

  // The team names of a feed event, from its desc.competitors (the feed DOES carry them in desc).
  function teamsOf(ev) {
    const c = ev?.desc?.competitors;
    if (!Array.isArray(c) || c.length < 2) return { home: null, away: null };
    return { home: c[0]?.name || null, away: c[1]?.name || null };
  }

  /**
   * The player markets of one feed event, named from the catalog: for every market whose catalog
   * market_type is a PlayerProps type, each outcome with its player name and current odd. Shape:
   *   [{ marketId, marketType, marketName, variant, outcomes: [{ id, name, odd, blocked }] }]
   * Empty when the catalog is not loaded or the event has no player markets.
   */
  function eventPlayerMarkets(ev, marketsOverride = null) {
    if (!ev || !catalog?.markets) return [];
    const teams = teamsOf(ev);
    const tmpl = (variant) => ({ ...specifiersOf(variant), competitor1: teams.home || '', competitor2: teams.away || '' });
    const perEvent = eventDescs.get(ev.id)?.markets || null; // real player names, when fetched
    const markets = marketsOverride || ev.markets || {};
    const out = [];
    for (const [marketId, variants] of Object.entries(markets)) {
      const entry = catalog.markets.get(String(marketId)) || catalog.markets.get(String(Number(marketId)));
      if (!entry || !isPlayerType(entry.market_type)) continue;
      const descEntry = perEvent?.get(String(marketId)) || perEvent?.get(String(Number(marketId))) || null;
      for (const [variant, outcomes] of Object.entries(variants || {})) {
        if (!outcomes || typeof outcomes !== 'object') continue;
        // Player names from the per-event descriptions first, generic catalog names as fallback.
        const names = catalogOutcomes(descEntry, variant) || catalogOutcomes(entry, variant);
        const list = [];
        for (const [outcomeId, cell] of Object.entries(outcomes)) {
          const named = names?.find((x) => String(x.id) === String(outcomeId))?.name;
          list.push({ id: String(outcomeId), name: named ? fillTemplate(named, tmpl(variant)) : null, odd: cell?.k != null ? Number(cell.k) : null, blocked: cell?.b === 1 });
        }
        const marketName = fillTemplate(descEntry?.name || entry.name, tmpl(variant)) || `Mercado ${marketId}`;
        if (list.length) out.push({ marketId: String(marketId), marketType: entry.market_type, marketName, variant, kind: kindOf(marketId, marketName, variant), outcomes: list });
      }
    }
    return out;
  }

  /**
   * The player markets of a football match, with real player names, ready to offer and to settle. Fetches
   * the full per-event markets (scorer/cards are not in the feed) and the per-event descriptions (names),
   * then names and maps them to our grader kinds. Only markets we can settle (a known kind) are returned.
   */
  async function footballPlayerMarkets(ev) {
    if (!on || !ev?.id) return [];
    const feed = stores.live.has(ev.id) ? 'live' : 'prematch';
    const [full] = await Promise.all([fetchEventMarkets(feed, ev.id).catch(() => null), fetchEventDescriptions(ev.id).catch(() => null)]);
    return eventPlayerMarkets(ev, full || ev.markets).filter((m) => m.kind);
  }

  /**
   * The BETBY event that is our game, or null. Same evaluation as the mini-field engine: both team names
   * scored in either orientation (the stronger orientation wins), a soft sport gate, and kick-off within
   * 12 h. `our` = { sport, home, away, start }. Returns { event, feed, score, swapped } for the best match.
   */
  function matchEvent(our) {
    if (!on || !our?.home || !our?.away) return null;
    // The team names to match the BETBY event against: our WinHouse names, plus any alternatives (the GOAL
    // API names of the same game). WinHouse and BETBY name teams differently; the GOAL API names align with
    // WinHouse and are a second key, so a game BETBY names its own way still links through GOAL.
    const pairs = [{ home: our.home, away: our.away }, ...(Array.isArray(our.altNames) ? our.altNames : [])]
      .filter((p) => p && p.home && p.away);
    const ourStart = our.start ? Date.parse(our.start) : NaN;
    let best = null;
    for (const feed of ['live', 'prematch']) {
      for (const be of stores[feed].values()) {
        const beSport = be?.desc?.sport != null ? SPORT_BY_ID[String(be.desc.sport)] : undefined;
        if (beSport && our.sport && beSport !== our.sport) continue; // soft sport gate
        const t = teamsOf(be);
        if (!t.home || !t.away) continue;
        const bbStart = be?.desc?.scheduled ? be.desc.scheduled * 1000 : NaN;
        const gap = Number.isFinite(ourStart) && Number.isFinite(bbStart) ? Math.abs(ourStart - bbStart) : 0;
        if (gap > 12 * 3600_000) continue; // same teams, different fixture
        // Best score across every name pair (our names and the GOAL API names), either orientation.
        for (const p of pairs) {
          const sh = scoreTeams(p.home, t.home), sa = scoreTeams(p.away, t.away);
          const xh = scoreTeams(p.home, t.away), xa = scoreTeams(p.away, t.home);
          const straightMin = Math.min(sh, sa), swapMin = Math.min(xh, xa);
          const swapped = swapMin > straightMin;
          const minSide = swapped ? swapMin : straightMin;
          const avg = swapped ? (xh + xa) / 2 : (sh + sa) / 2;
          if (minSide < PAIR_MIN || avg < PAIR_GOOD) continue;
          if (!best || avg > best.score + 1e-6 || (Math.abs(avg - best.score) <= 1e-6 && gap < best.gap)) best = { event: be, feed, score: avg, swapped, gap };
        }
      }
    }
    return best;
  }

  async function poll() {
    if (!on || running) return;
    running = true;
    lastRunAt = new Date().toISOString();
    try {
      if (!catalog || Date.now() - catalog.at > 30 * 60_000) await fetchCatalog().catch((e) => { lastError = `catálogo: ${e.message}`; });
      const errs = [];
      for (const feed of Object.keys(paths)) {
        try { await fetchFeed(feed); } catch (e) { feeds[feed] = { ...feeds[feed], ok: false, error: e.message }; errs.push(`${feed}: ${e.message}`); }
      }
      // Fetch the real player names for live games that have player markets (cached ~10 min each).
      const livePm = [...stores.live.values()].filter((ev) => eventPlayerMarkets(ev).length).slice(0, 30);
      for (const ev of livePm) await fetchEventDescriptions(ev.id).catch(() => {});
      lastError = errs.length ? errs.join(' | ') : null;
      if (!errs.length) lastOkAt = new Date().toISOString();
    } finally { running = false; }
  }

  // Admin diagnostic: is it on, does the server reach BETBY (or 503 bc), store sizes, and raw samples of
  // a feed event's markets and of the descriptions catalog — so the player-market parser can be built.
  async function diagnose() {
    const steps = [{ name: 'Coletor BETBY', ok: on, detail: on ? `ligado · brand ${brandId} · ${baseUrl}` : 'desligado (BETBY_COLLECT=1 + BETBY_BRAND_ID para ligar)' }];
    if (!on) return steps;
    steps.push({ name: 'Último ciclo', ok: Boolean(lastOkAt), detail: `corrido: ${lastRunAt || 'nunca'} · ok: ${lastOkAt || 'nunca'}${lastError ? ` · erro: ${lastError}` : ''}` });
    for (const feed of Object.keys(paths)) {
      const f = feeds[feed];
      const blocked = f?.blockReason ? ` · bb-rsn: ${f.blockReason}` : '';
      steps.push({ name: `Feed ${feed}`, ok: Boolean(f?.ok), detail: f ? `HTTP ${f.httpStatus ?? '?'}${blocked} · ${stores[feed].size} jogos${f.error ? ` · ${f.error}` : ''}` : 'ainda não pedido' });
    }
    // A sample live event's markets (ids), so we see the real market/outcome id structure.
    const sample = [...stores.live.values()].find((e) => Object.keys(e.markets || {}).length) || [...stores.prematch.values()].find((e) => Object.keys(e.markets || {}).length);
    if (sample) {
      const mids = Object.keys(sample.markets).slice(0, 6);
      steps.push({ name: 'Exemplo de mercados (ids)', ok: true, detail: `jogo ${sample.id}: ${mids.length} mercados · ${JSON.stringify(sample.markets[mids[0]]).slice(0, 300)}` });
    }
    steps.push({ name: 'Catálogo de nomes', ok: Boolean(catalog?.markets?.size), detail: catalog ? `${catalog.markets.size} mercados com nome` : 'não carregado' });
    if (catalogRaw) steps.push({ name: 'Catálogo cru (forma)', ok: true, detail: catalogRaw });
    // Probe SEVERAL real football matches (1x2 present, two teams — not outrights). The feed carries only
    // top markets, so fetch each one's full per-event markets and look for scorer / card / player markets.
    // Small leagues often have none; the big leagues do — so scan up to 8 and report which have them.
    {
      const isFoot = (ev) => /soccer|football|futebol/i.test(sportName(ev?.desc?.sport) || '');
      const isMatch = (ev) => ev.markets && ('1' in ev.markets) && Array.isArray(ev?.desc?.competitors) && ev.desc.competitors.length === 2;
      const describe = (mid) => { const e = catalog?.markets?.get(String(mid)) || catalog?.markets?.get(String(Number(mid))); return `${mid}:${e?.name || '?'}${e?.market_type ? `[${e.market_type}]` : ''}`; };
      const looksPlayer = (mid) => { const e = catalog?.markets?.get(String(mid)) || catalog?.markets?.get(String(Number(mid))); return isPlayerType(e?.market_type) || /scorer|goal ?scorer|marcador|golo|card|booking|cart[aã]o|player|jogador|assist/i.test(e?.name || '') || /scorer|player|card|booking|goal/i.test(e?.market_type || ''); };
      const matches = [...stores.live.values(), ...stores.prematch.values()].filter((e) => isFoot(e) && isMatch(e))
        .sort((a, b) => Object.keys(b.markets).length - Object.keys(a.markets).length).slice(0, 8);
      if (!matches.length) {
        steps.push({ name: 'Jogos de futebol (mercados)', ok: false, detail: 'nenhum jogo de futebol real (com 1x2) no feed agora' });
      } else {
        let withPlayers = 0; let maxMarkets = 0; let best = null;
        for (const ev of matches) {
          const feed = stores.live.has(ev.id) ? 'live' : 'prematch';
          const full = await fetchEventMarkets(feed, ev.id).catch(() => null);
          const mids = Object.keys({ ...ev.markets, ...(full || {}) });
          maxMarkets = Math.max(maxMarkets, mids.length);
          const players = mids.filter(looksPlayer);
          if (players.length) { withPlayers += 1; if (!best) best = { ev, mids, players }; }
        }
        steps.push({ name: 'Endpoint de mercados por evento', ok: Boolean(eventTpl), detail: eventTpl ? `funciona: ${eventTpl}` : `nenhum dos ${EVENT_CANDIDATES.length} candidatos respondeu` });
        steps.push({ name: 'Futebol com mercados de jogador (completos)', ok: withPlayers > 0, detail: `${withPlayers} de ${matches.length} jogos sondados têm · até ${maxMarkets} mercados por jogo` });
        if (best) {
          const t = teamsOf(best.ev);
          steps.push({ name: `Exemplo: ${t.home || '?'} - ${t.away || '?'}`, ok: true, detail: best.players.slice(0, 14).map(describe).join(' · ') });
          steps.push({ name: 'Todos os mercados desse jogo', ok: true, detail: best.mids.slice(0, 30).map(describe).join(' · ').slice(0, 900) });
          // Named, settleable player markets of that match (full markets + player names + grader kind).
          const pm = await footballPlayerMarkets(best.ev).catch(() => []);
          const lines = pm.slice(0, 4).map((m) => `${m.marketName} →${m.kind}: ${m.outcomes.filter((o) => o.name).slice(0, 3).map((o) => `${o.name}${o.odd ? ` @${o.odd}` : ''}`).join(', ')}`);
          steps.push({ name: 'Mercados liquidáveis (com nomes)', ok: pm.length > 0, detail: lines.join(' · ') || 'nenhum mapeado ainda' });
        } else {
          const ex = matches[0]; const feed = stores.live.has(ex.id) ? 'live' : 'prematch';
          const full = await fetchEventMarkets(feed, ex.id).catch(() => null);
          const mids = Object.keys({ ...ex.markets, ...(full || {}) });
          steps.push({ name: 'Mercados do maior jogo sondado', ok: true, detail: mids.slice(0, 30).map(describe).join(' · ').slice(0, 900) });
        }
      }
    }
    // Player markets across the live + prematch stores. Player NAMES live in the per-event descriptions
    // (not the static catalog), so fetch those for the first few player-market games before resolving.
    const pmEvents = [];
    for (const store of [stores.live, stores.prematch]) for (const ev of store.values()) if (eventPlayerMarkets(ev).length) pmEvents.push(ev);
    // Count player-market games per sport (named when the dictionary has it) so we see if football is there.
    const bySport = new Map();
    const isFootball = (ev) => /soccer|football|futebol/i.test(sportName(ev?.desc?.sport) || '');
    for (const ev of pmEvents) { const key = sportName(ev?.desc?.sport) || `#${ev?.desc?.sport ?? '?'}`; bySport.set(key, (bySport.get(key) || 0) + 1); }
    steps.push({ name: 'Mercados de jogador por desporto', ok: pmEvents.length > 0, detail: [...bySport].sort((a, b) => b[1] - a[1]).map(([n, c]) => `${n} (${c})`).join(' · ') || 'nenhum' });
    // Prefer football events for the examples (that is what we can settle); fetch their player names.
    const ordered = [...pmEvents].sort((a, b) => Number(isFootball(b)) - Number(isFootball(a)));
    for (const ev of ordered.slice(0, 6)) await fetchEventDescriptions(ev.id).catch(() => {});
    const footballPm = pmEvents.filter(isFootball);
    steps.push({ name: 'Futebol com mercados de jogador', ok: footballPm.length > 0, detail: footballPm.length ? `${footballPm.length} jogos de futebol` : 'nenhum jogo de futebol com mercados de jogador agora' });
    let named = 0; const examples = [];
    for (const ev of ordered) {
      const withName = eventPlayerMarkets(ev).find((m) => m.outcomes.some((o) => o.name));
      if (!withName) continue;
      named += 1;
      if (examples.length < 3) { const t = teamsOf(ev); examples.push({ t, sport: sportName(ev?.desc?.sport) || ev?.desc?.sport || '?', m: withName }); }
    }
    steps.push({ name: 'Nomes resolvidos', ok: named > 0, detail: `${named} de ${pmEvents.length} jogos (nos buscados)` });
    for (const ex of examples) {
      const sel = ex.m.outcomes.slice(0, 4).map((o) => `${o.name || `#${o.id}`}${o.odd ? ` @${o.odd}` : ''}`).join(' · ');
      steps.push({ name: `Exemplo (${ex.sport}): ${ex.t.home || '?'} - ${ex.t.away || '?'}`, ok: true, detail: `${ex.m.marketName} [${ex.m.marketType}]: ${sel}` });
    }
    return steps;
  }

  const status = () => ({ on, lastRunAt, lastOkAt, lastError, live: stores.live.size, prematch: stores.prematch.size, markets: catalog?.markets?.size || 0 });

  return { on, poll, diagnose, status, stores, eventPlayerMarkets, footballPlayerMarkets, matchEvent, teamsOf, fetchEventDescriptions, fetchEventMarkets, _internal: { applyDeltas, versionsOf, fillTemplate, isPlayerType, catalogOutcomes, setCatalog: (c) => { catalog = c; }, setEventDesc: (id, markets) => eventDescs.set(id, { at: Date.now(), markets }) } };
}
