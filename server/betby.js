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

export function createBetby(cfg = {}, { fetchImpl = globalThis.fetch, log = () => {} } = {}) {
  const baseUrl = String(cfg.baseUrl || 'https://demoapi.betby.com').replace(/\/+$/, '');
  const brandId = cfg.brandId || '';
  const locale = cfg.locale || 'en-gb';
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

  // The market descriptions catalog: market and outcome (player) names. Its exact shape is confirmed by
  // the diagnostic; we parse defensively and keep the raw head so the parser can be matched to reality.
  async function fetchCatalog() {
    const url = `${baseUrl}/api/v3/descriptions/brand/${brandId}/markets/${locale}`;
    const raw = await requestJson('', url);
    catalogRaw = JSON.stringify(raw).slice(0, 1200);
    const markets = new Map();
    // Try the likely shapes: an array of markets, or an object keyed by market id.
    const entries = Array.isArray(raw) ? raw.map((m) => [m.id ?? m.marketId, m])
      : raw && typeof raw === 'object' ? Object.entries(raw.markets || raw.data || raw) : [];
    for (const [id, m] of entries) {
      if (!m || typeof m !== 'object' || id == null) continue;
      const outcomes = new Map();
      const outs = Array.isArray(m.outcomes) ? m.outcomes : Array.isArray(m.selections) ? m.selections : m.outcomes && typeof m.outcomes === 'object' ? Object.entries(m.outcomes).map(([oid, o]) => ({ id: oid, ...(o && typeof o === 'object' ? o : { name: o }) })) : [];
      for (const o of outs) { const oid = o.id ?? o.outcomeId; if (oid != null) outcomes.set(String(oid), o.player || o.playerName || o.name || o.title || null); }
      markets.set(String(id), { name: m.name || m.title || m.marketName || null, kind: m.type || m.kind || m.marketType || null, outcomes });
    }
    catalog = { at: Date.now(), markets };
    return markets.size;
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
    return steps;
  }

  const status = () => ({ on, lastRunAt, lastOkAt, lastError, live: stores.live.size, prematch: stores.prematch.size, markets: catalog?.markets?.size || 0 });

  return { on, poll, diagnose, status, stores, _internal: { applyDeltas, versionsOf, digestField } };
}
