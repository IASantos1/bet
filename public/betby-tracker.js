// BETBY mini-field (minicampo) bridge — READ ONLY, additive, off unless the server sends state.config.betby.
//
// Why this exists: our live widgets only cover football (3D pitch), tennis and cricket (court). For every
// other sport we show nothing. BETBY serves a generic live tracker (ui.invisiblesport.com) keyed by a
// Statscore event id. This module reads BETBY's PUBLIC per-brand feeds in the visitor's browser (the
// Railway server itself gets 503 from BETBY), finds the BETBY event that matches the match the player is
// looking at — by team names, sport and kick-off time — and returns the tracker iframe URL for it.
//
// It never reads or writes odds, markets, bets, balances or settlement: those stay 100% WinHouse. It only
// turns "our event" into "a tracker URL". Any failure (feed down, no match, blocked host) returns null and
// the live screen simply shows what it showed before. The whole module is dormant until the server sends
// the betby config, which only happens when BETBY_BRAND_ID is set in the Railway Variables.

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

// The side feed carries one widget per game; the Statscore scoreboard is the one that opens the mini-field.
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

const TRACKER_PROVIDERS = new Set(['statscore', 'oddin', 'betgenius']);
function statscoreId(widgets) {
  const w = widgets?.find((x) => TRACKER_PROVIDERS.has(x.id) && x.event_id != null && /^\d{3,}$/.test(String(x.event_id)));
  return w ? { provider: w.id, eventId: String(w.event_id) } : null;
}

function trackerUrl(cfg, provider, sportId, eventId) {
  const providers = JSON.stringify({ id: provider, sportId: String(sportId), lang: cfg.locale.toLowerCase(), liveEvent: true, eventId: Number(eventId) || eventId });
  return `${cfg.tracker}/tracker.html?providers=${encodeURIComponent(providers)}`;
}

// ---- team-name matching (same accent/case stripping our app uses elsewhere) ----
const STOP = new Set(['fc', 'cf', 'sc', 'ac', 'afc', 'cd', 'ca', 'sd', 'ud', 'sad', 'club', 'clube', 'de', 'do', 'da', 'the', 'if', 'bk', 'fk', 'sk', 'u21', 'u20', 'u19', 'u23', 'b']);
function tokens(name) {
  return String(name || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/).filter((t) => t && t.length > 1 && !STOP.has(t));
}
const squash = (name) => tokens(name).join('');

function sameTeam(a, b) {
  const sa = squash(a), sb = squash(b);
  if (!sa || !sb) return false;
  if (sa === sb || sa.includes(sb) || sb.includes(sa)) return true;
  const ta = tokens(a), tb = tokens(b);
  const overlap = ta.filter((t) => tb.includes(t)).length;
  return overlap >= 2 || (overlap >= 1 && Math.min(ta.length, tb.length) === 1);
}

// Our sport name → the BETBY/Betradar sport id used in the tracker's sportId. A wrong id only mis-scales
// the pitch drawing, so this is best-effort; when the BETBY event already tells us its sport we use that.
const SPORT_ID = { futebol: '1', basquete: '2', tenis: '5', 'hoquei-gelo': '4', andebol: '6', voleibol: '23', basebol: '3', criquete: '21', 'futebol-americano': '16', rugby: '12', snooker: '19', dardos: '22', 'tenis-mesa': '20', badminton: '31', 'e-sports': '109' };

// ---- feed cache (one per brand, refreshed on a short interval, shared by every match on screen) ----
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
    // Live odds feed — only for the event descriptors (team names, sport, kick-off).
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

/**
 * The BETBY tracker (mini-field) URL for `event`, or null. `event` is our live match: { sport, home, away, start }.
 * Matches by both team names; when several match, the BETBY event whose kick-off is closest wins.
 */
export async function resolveBetbyTracker(cfg, event) {
  if (!cfg || !cfg.base || !cfg.brandId || !event || !event.home || !event.away) return null;
  const c = cacheFor(cfg);
  try { await ensureFresh(c); } catch { /* feed down: fall back */ }
  const ourStart = event.start ? Date.parse(event.start) : NaN;
  // When we know this sport's BETBY/Betradar id, require the BETBY event to be the SAME sport. This stops a
  // game matching another sport's fixture by a coincidental team name (which then loads a wrong/empty
  // tracker — "Widget could not be loaded"). When we don't know the id, fall back to team + time only.
  const wantSport = SPORT_ID[event.sport];
  let best = null;
  let bestGap = Infinity;
  for (const be of c.events.values()) {
    if (wantSport && be.desc?.sport != null && String(be.desc.sport) !== wantSport) continue;
    const names = (be.desc?.competitors || []).map((x) => x && x.name).filter(Boolean);
    if (names.length < 2) continue;
    // Either orientation (BETBY's home/away may differ from ours).
    const straight = sameTeam(event.home, names[0]) && sameTeam(event.away, names[1]);
    const swapped = sameTeam(event.home, names[1]) && sameTeam(event.away, names[0]);
    if (!straight && !swapped) continue;
    const bbStart = be.desc?.scheduled ? be.desc.scheduled * 1000 : NaN;
    const gap = Number.isFinite(ourStart) && Number.isFinite(bbStart) ? Math.abs(ourStart - bbStart) : 0;
    if (gap < bestGap) { best = be; bestGap = gap; }
  }
  if (!best) return null;
  // Kick-offs more than 12h apart are almost certainly two different fixtures of the same teams.
  if (Number.isFinite(bestGap) && bestGap > 12 * 3600 * 1000) return null;
  const hit = statscoreId(c.widgets.get(best.id));
  if (!hit) return null;
  const sportId = best.desc?.sport || SPORT_ID[event.sport] || '1';
  return trackerUrl(cfg, hit.provider, sportId, hit.eventId);
}
