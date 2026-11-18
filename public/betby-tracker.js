// BETBY mini-field (minicampo) feed relay — READ ONLY, additive, off unless the server sends state.config.betby.
//
// Why this exists: BETBY's public per-brand live board can only be read from a visitor's browser (the Railway
// server itself gets 503 from BETBY). This module does the one thing that MUST happen in the browser: it
// fetches that public board and relays a trimmed snapshot (team names, sport, kick-off and the per-game
// widgets) to our own server. The matching "motor" — deciding which BETBY event is the game a player is
// looking at, by evaluating the names — lives entirely on the server (server/betby-engine.js) and never ships
// to the browser. The server hands back the resolved tracker URLs, and every live event then carries its
// `betbyTracker` URL for the mini-field to mount.
//
// It never reads or writes odds, markets, bets, balances or settlement: those stay 100% WinHouse.

// ---- feed addresses (same shapes the BET62 app reads; see its lib/betby.ts + lib/tracker.ts) ----
const feedUrl = (cfg, feed, cursor) => `${cfg.base}/api/v4/${feed}/brand/${cfg.brandId}/${cfg.locale}/${cursor}`;
const sideUrl = (cfg, cursor) => `${cfg.base}/api/v1/side/brand/${cfg.brandId}/${cursor}`;

async function getJson(url, signal) {
  const res = await fetch(url, { headers: { accept: 'application/json' }, cache: 'no-store', signal });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// The index lists which delta versions make up the current live board.
function versionsOf(index) {
  const list = [
    ...(Array.isArray(index?.top_events_versions) ? index.top_events_versions : []),
    ...(Array.isArray(index?.rest_events_versions) ? index.rest_events_versions : []),
  ];
  return [...new Set(list.map(String).filter((v) => /^\d+$/.test(v)))];
}

// Merge a delta payload into the event store. We only keep `desc` (competitors / sport / scheduled) —
// never markets. null removes a dropped event.
function applyDeltas(store, payload) {
  const events = payload?.events;
  if (!events || typeof events !== 'object' || Array.isArray(events)) return;
  for (const [id, raw] of Object.entries(events)) {
    if (raw === null) { store.delete(id); continue; }
    if (!raw || typeof raw !== 'object') continue;
    const cur = store.get(id) || { id };
    if (raw.desc) cur.desc = { ...cur.desc, ...raw.desc };
    store.set(id, cur);
  }
}

// The side feed carries one widget per game; the server picks the Statscore scoreboard out of it.
function applySideItems(store, payload) {
  const items = payload?.items;
  if (!Array.isArray(items)) return;
  for (const item of items) {
    if (!Array.isArray(item) || item.length !== 2) continue;
    const key = item[0];
    if (!Array.isArray(key) || key.length !== 2 || key[1] !== 'widget') continue;
    const eventId = String(key[0]);
    const value = item[1];
    if (value == null) store.delete(eventId);
    else if (Array.isArray(value)) store.set(eventId, value);
  }
}

// ---- feed cache (one per brand, refreshed on a short interval) ----
const caches = new Map();
function cacheFor(cfg) {
  const key = `${cfg.base}|${cfg.brandId}|${cfg.locale}`;
  let c = caches.get(key);
  if (!c) { c = { cfg, events: new Map(), widgets: new Map(), applied: new Set(), sideVersion: null, at: 0, inflight: null }; caches.set(key, c); }
  return c;
}

async function refresh(c) {
  const { cfg } = c;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  try {
    // Live feed — only the event descriptors (team names, sport, kick-off).
    const index = await getJson(feedUrl(cfg, 'live', 0), controller.signal);
    applyDeltas(c.events, index);
    const versions = versionsOf(index);
    const fresh = versions.filter((v) => !c.applied.has(v));
    const payloads = await Promise.all(fresh.map((v) => getJson(feedUrl(cfg, 'live', v), controller.signal).catch(() => null)));
    for (let i = 0; i < payloads.length; i++) { if (!payloads[i]) break; applyDeltas(c.events, payloads[i]); c.applied.add(fresh[i]); }
    const live = new Set(versions);
    for (const v of c.applied) if (!live.has(v)) c.applied.delete(v);
    // Side feed — the per-game widgets (the Statscore id that opens the mini-field).
    try {
      if (c.sideVersion == null) {
        const sideIndex = await getJson(sideUrl(cfg, 0), controller.signal);
        if (sideIndex?.version != null) c.sideVersion = String(sideIndex.version);
      }
      if (c.sideVersion != null) {
        const side = await getJson(sideUrl(cfg, c.sideVersion), controller.signal);
        applySideItems(c.widgets, side);
        if (side?.version != null) c.sideVersion = String(side.version);
      }
    } catch { c.sideVersion = null; }
    c.at = Date.now();
  } finally {
    clearTimeout(timer);
  }
}

const REFRESH_MS = 20000;
function ensureFresh(c) {
  if (c.inflight) return c.inflight;
  if (Date.now() - c.at < REFRESH_MS && c.events.size) return Promise.resolve();
  c.inflight = refresh(c).catch(() => {}).finally(() => { c.inflight = null; });
  return c.inflight;
}

// The trimmed snapshot the server engine evaluates: for each game its team names, sport and kick-off, plus
// the raw per-game widgets (the server picks the Statscore scoreboard out of them).
function snapshotOf(c) {
  const events = {};
  for (const [id, be] of c.events) {
    const names = (be.desc?.competitors || []).map((x) => x && x.name).filter(Boolean);
    if (names.length < 2) continue;
    events[id] = {
      sport: be.desc?.sport != null ? String(be.desc.sport) : null,
      scheduled: be.desc?.scheduled || null,
      names: [names[0], names[1]],
    };
  }
  const widgets = {};
  for (const [id, list] of c.widgets) widgets[id] = list;
  return { events, widgets };
}

/**
 * Fetch BETBY's public board and relay it to our server, which matches it against our live games. Returns the
 * server's map of { ourEventId: trackerUrl|null } (or null if the feed or the relay failed). Safe to call
 * often: the feed self-throttles. This is the browser's ONLY job — all the name matching happens server-side.
 */
export async function relayBetby(cfg) {
  if (!cfg || !cfg.base || !cfg.brandId) return null;
  const c = cacheFor(cfg);
  try { await ensureFresh(c); } catch { return null; }
  if (!c.events.size) return null;
  try {
    const res = await fetch('/api/betby/feed', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(snapshotOf(c)),
    });
    if (!res.ok) return null;
    const data = await res.json().catch(() => null);
    return data && data.urls ? data.urls : null;
  } catch { return null; }
}

// Kept name for the pre-load call sites — relaying the feed is what "warming" now means.
export const warmBetby = relayBetby;
