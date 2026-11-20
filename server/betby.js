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

const digestField = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

// Market types (catalog field market_type) that are player markets — the ones WinHouse does not have
// and we settle ourselves from GOAL API. Taken from the sister project's live match page.
const PLAYER_TYPES = new Set(['PlayerProps', 'PlayerPropsPlus', 'PlayerPropsPlus2', 'PlayerPropsH2H',
  'PlayerPropsTotal', 'PlayerPropsCombo', 'PlayerPropsExtra', 'PlayerPropsYesNo', 'PlayerPropsPrebuilt',
  'PlayerPropsOddEven', 'PlayerPropsEP', 'PlayersH2H']);
const isPlayerType = (t) => Boolean(t && PLAYER_TYPES.has(String(t)));

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
    applyDeltas(store, index);
    const base = indexUrl.slice(0, indexUrl.lastIndexOf('/'));
    let versions = versionsOf(index);
    for (const version of versions) { const payload = await requestJson(feed, `${base}/${version}`).catch(() => null); if (payload) applyDeltas(store, payload); }
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
  // variant, else the market's only variant group. Returns [{ id, name }] or null.
  function catalogOutcomes(entry, variant) {
    const vs = entry?.variants;
    if (!vs || typeof vs !== 'object') return null;
    const group = vs[variant] ?? vs[`variant=${variant}`] ?? Object.values(vs)[0];
    return Array.isArray(group) ? group[0]?.outcomes || null : null;
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
  function eventPlayerMarkets(ev) {
    if (!ev || !catalog?.markets) return [];
    const teams = teamsOf(ev);
    const tmpl = (variant) => ({ ...specifiersOf(variant), competitor1: teams.home || '', competitor2: teams.away || '' });
    const out = [];
    for (const [marketId, variants] of Object.entries(ev.markets || {})) {
      const entry = catalog.markets.get(String(marketId)) || catalog.markets.get(String(Number(marketId)));
      if (!entry || !isPlayerType(entry.market_type)) continue;
      for (const [variant, outcomes] of Object.entries(variants || {})) {
        if (!outcomes || typeof outcomes !== 'object') continue;
        const names = catalogOutcomes(entry, variant);
        const list = [];
        for (const [outcomeId, cell] of Object.entries(outcomes)) {
          const named = names?.find((x) => String(x.id) === String(outcomeId))?.name;
          list.push({ id: String(outcomeId), name: named ? fillTemplate(named, tmpl(variant)) : null, odd: cell?.k != null ? Number(cell.k) : null, blocked: cell?.b === 1 });
        }
        if (list.length) out.push({ marketId: String(marketId), marketType: entry.market_type, marketName: fillTemplate(entry.name, tmpl(variant)) || `Mercado ${marketId}`, variant, outcomes: list });
      }
    }
    return out;
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
      lastError = errs.length ? errs.join(' | ') : null;
      if (!errs.length) lastOkAt = new Date().toISOString();
    } finally { running = false; }
  }

  // Admin diagnostic: is it on, does the server reach BETBY (or 503 bc), store sizes, and raw samples of
  // a feed event's markets and of the descriptions catalog — so the player-market parser can be built.
  function diagnose() {
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
    // Player markets across the live + prematch stores: how many games, how many with names resolved,
    // and up to three named examples with their sport id (so we confirm football scorer/card markets).
    let withPlayer = 0; let named = 0; const examples = [];
    for (const store of [stores.live, stores.prematch]) {
      for (const ev of store.values()) {
        const pm = eventPlayerMarkets(ev);
        if (!pm.length) continue;
        withPlayer += 1;
        const withName = pm.find((m) => m.outcomes.some((o) => o.name));
        if (!withName) continue;
        named += 1;
        if (examples.length < 3) { const t = teamsOf(ev); examples.push({ t, sport: ev?.desc?.sport ?? '?', m: withName }); }
      }
    }
    steps.push({ name: 'Mercados de jogador encontrados', ok: named > 0, detail: `${withPlayer} jogos · ${named} com nomes resolvidos` });
    for (const ex of examples) {
      const sel = ex.m.outcomes.slice(0, 4).map((o) => `${o.name || `#${o.id}`}${o.odd ? ` @${o.odd}` : ''}`).join(' · ');
      steps.push({ name: `Exemplo (desporto ${ex.sport}): ${ex.t.home || '?'} - ${ex.t.away || '?'}`, ok: true, detail: `${ex.m.marketName} [${ex.m.marketType}]: ${sel}` });
    }
    return steps;
  }

  const status = () => ({ on, lastRunAt, lastOkAt, lastError, live: stores.live.size, prematch: stores.prematch.size, markets: catalog?.markets?.size || 0 });

  return { on, poll, diagnose, status, stores, eventPlayerMarkets, teamsOf, _internal: { applyDeltas, versionsOf, fillTemplate, isPlayerType, catalogOutcomes, setCatalog: (c) => { catalog = c; } } };
}
