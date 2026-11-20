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
    const perEvent = eventDescs.get(ev.id)?.markets || null; // real player names, when fetched
    const out = [];
    for (const [marketId, variants] of Object.entries(ev.markets || {})) {
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
        if (list.length) out.push({ marketId: String(marketId), marketType: entry.market_type, marketName: fillTemplate(descEntry?.name || entry.name, tmpl(variant)) || `Mercado ${marketId}`, variant, outcomes: list });
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
    // Probe a real football game's markets: dump each market's id + catalog name + market_type, so we
    // see how the football scorer / card markets are actually typed (not only the PlayerProps system).
    {
      const isFoot = (ev) => /soccer|football|futebol/i.test(sportName(ev?.desc?.sport) || '');
      const foot = [...stores.live.values(), ...stores.prematch.values()].filter((e) => isFoot(e) && Object.keys(e.markets || {}).length)
        .sort((a, b) => Object.keys(b.markets).length - Object.keys(a.markets).length)[0];
      if (!foot) {
        steps.push({ name: 'Jogo de futebol (mercados)', ok: false, detail: 'nenhum jogo de futebol com mercados no feed agora' });
      } else {
        const t = teamsOf(foot);
        const mids = Object.keys(foot.markets);
        const describe = (mid) => { const e = catalog?.markets?.get(String(mid)) || catalog?.markets?.get(String(Number(mid))); return `${mid}:${e?.name || '?'}${e?.market_type ? `[${e.market_type}]` : ''}`; };
        // Highlight the ones that look like scorer / card / player markets by name or type.
        const looksPlayer = (mid) => { const e = catalog?.markets?.get(String(mid)) || catalog?.markets?.get(String(Number(mid))); return isPlayerType(e?.market_type) || /scorer|goal ?scorer|marcador|card|booking|cart[aã]o|player|jogador|assist/i.test(e?.name || '') || /scorer|player|card|booking/i.test(e?.market_type || ''); };
        const players = mids.filter(looksPlayer);
        steps.push({ name: `Jogo de futebol: ${t.home || '?'} - ${t.away || '?'}`, ok: true, detail: `${mids.length} mercados · possíveis de jogador: ${players.length}` });
        steps.push({ name: 'Mercados de jogador (candidatos)', ok: players.length > 0, detail: players.slice(0, 12).map(describe).join(' · ') || 'nenhum pelo nome/tipo' });
        steps.push({ name: 'Todos os mercados do jogo', ok: true, detail: mids.slice(0, 25).map(describe).join(' · ').slice(0, 800) });
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

  return { on, poll, diagnose, status, stores, eventPlayerMarkets, teamsOf, fetchEventDescriptions, _internal: { applyDeltas, versionsOf, fillTemplate, isPlayerType, catalogOutcomes, setCatalog: (c) => { catalog = c; }, setEventDesc: (id, markets) => eventDescs.set(id, { at: Date.now(), markets }) } };
}
