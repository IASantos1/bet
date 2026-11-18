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
// Club designators dropped before comparing names, so a prefix/suffix like "FC Porto" vs "Porto",
// "Gence BC" vs "Gence" or "CE Sabadell FC" vs "Sabadell" still matches. Covers football and basketball.
const STOP = new Set(['fc', 'cf', 'sc', 'ac', 'afc', 'cd', 'ca', 'sd', 'ud', 'sad', 'club', 'clube', 'de', 'do',
  'da', 'the', 'if', 'bk', 'fk', 'sk', 'u21', 'u20', 'u19', 'u23', 'b', 'bc', 'ce', 'cs', 'csu', 'csm', 'kk',
  'ec', 'asd', 'ssd', 'ad', 'us', 'usd', 'cska', 'bsc', 'calcio', 'basket', 'baloncesto']);
function tokens(name) {
  return String(name || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/).filter((t) => t && t.length > 1 && !STOP.has(t));
}
const squash = (name) => tokens(name).join('');

// How close two team names are, 0..1. 1 = same once club words are stripped; high for one name inside the
// other (added city/suffix); the Jaccard of the tokens otherwise; a floor when a long distinctive token is
// shared (the club's own name, for transliterated cities). The matching engine ranks candidates by this.
export function scoreTeams(a, b) {
  const sa = squash(a), sb = squash(b);
  if (!sa || !sb) return 0;
  if (sa === sb) return 1;
  const ta = tokens(a), tb = tokens(b);
  const setB = new Set(tb);
  const inter = ta.filter((t) => setB.has(t)).length;
  const union = new Set([...ta, ...tb]).size || 1;
  let s = inter / union; // Jaccard of the significant tokens
  // "Real Union" ⊂ "Real Union de Irun", "Radnicki 1923" ⊂ "FK Radnicki 1923 Kragujevac", "Utebo" ⊂ "Utebo FC".
  if ((sa.includes(sb) || sb.includes(sa)) && Math.min(sa.length, sb.length) >= 4) s = Math.max(s, 0.9);
  // A single short name that is one of the other's tokens (e.g. "Porto" in "FC Porto Futebol").
  if (overlapOk(ta, tb, inter)) s = Math.max(s, 0.75);
  // A long distinctive token in common (≥7 skips cities like madrid/napoli), e.g. "Kolossos" / "Radnicki".
  if (ta.some((t) => t.length >= 7 && setB.has(t))) s = Math.max(s, 0.8);
  return s;
}
const overlapOk = (ta, tb, inter) => inter >= 2 || (inter >= 1 && Math.min(ta.length, tb.length) === 1);

// Boolean match kept for callers/tests: names count as the same at 0.5 or above.
export function sameTeam(a, b) { return scoreTeams(a, b) >= 0.5; }

// Our sport name → the BETBY/Betradar sport id used in the tracker's sportId. A wrong id only mis-scales
// the pitch drawing, so this is best-effort; when the BETBY event already tells us its sport we use that.
// Keyed by the site's own sport slugs (server SPORTS): futebol, basquetebol, tenis, hoquei, voleibol, …
const SPORT_ID = { futebol: '1', basquetebol: '2', tenis: '5', hoquei: '4', andebol: '6', voleibol: '23', basebol: '3', criquete: '21', futamericano: '16', raguebi: '12', dardos: '22', tenismesa: '20', badminton: '31', futsal: '29', boxe: '10', mma: '117' };
// Reverse map: a BETBY/Betradar sport id → our sport slug, for the ids we recognise.
const SPORT_BY_ID = Object.fromEntries(Object.entries(SPORT_ID).map(([slug, id]) => [id, slug]));

// ---- feed cache (one per brand, refreshed on a short interval, shared by every match on screen) ----
const caches = new Map();
function cacheFor(cfg) {
  const key = `${cfg.base}|${cfg.brandId}|${cfg.locale}`;
  let c = caches.get(key);
  if (!c) { c = { cfg, events: new Map(), widgets: new Map(), applied: new Set(), sideVersion: null, at: 0, inflight: null, resolved: new Map() }; caches.set(key, c); }
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

/** Load the BETBY feed into cache ahead of time, so opening a game resolves the mini-field at once (no delay
 *  where the pressure graph shows first and is then replaced by the field). Safe to call often. */
export function warmBetby(cfg) {
  if (!cfg || !cfg.base || !cfg.brandId) return Promise.resolve();
  try { return ensureFresh(cacheFor(cfg)); } catch { return Promise.resolve(); }
}

const PAIR_MIN = 0.5;       // each team must score at least this in the chosen orientation
const PAIR_GOOD = 0.6;      // the pair's average score to accept the match
const ALIASES = { normal: new Map() }; // our-name → betby-name overrides, loaded from the admin catalog

// Replace any name the admin mapped in the catalog (so a team that won't auto-match can be pinned by hand).
const alias = (name) => ALIASES.normal.get(squash(name)) || name;

/** Load the admin alias catalog: [{ from, to }] (our name → BETBY name). Normalised once for fast lookup. */
export function setBetbyAliases(list) {
  ALIASES.normal = new Map();
  for (const a of (Array.isArray(list) ? list : [])) {
    if (a && a.from && a.to) ALIASES.normal.set(squash(a.from), String(a.to));
  }
}

// The best BETBY event for our game, with its score. Scores both team names (either orientation), keeps the
// orientation whose weaker side is strongest, and ranks by score then by closeness of kick-off.
function bestMatch(c, event) {
  const home = alias(event.home), away = alias(event.away);
  const ourStart = event.start ? Date.parse(event.start) : NaN;
  let best = null, bestScore = 0, bestGap = Infinity;
  for (const be of c.events.values()) {
    // Soft sport gate: reject only when BETBY's sport is one we recognise AND it differs from ours.
    const beSport = be.desc?.sport != null ? SPORT_BY_ID[String(be.desc.sport)] : undefined;
    if (beSport && beSport !== event.sport) continue;
    const names = (be.desc?.competitors || []).map((x) => x && x.name).filter(Boolean);
    if (names.length < 2) continue;
    const sh = scoreTeams(home, names[0]), sa = scoreTeams(away, names[1]);
    const xh = scoreTeams(home, names[1]), xa = scoreTeams(away, names[0]);
    const straightMin = Math.min(sh, sa), swapMin = Math.min(xh, xa);
    const pick = straightMin >= swapMin ? [straightMin, (sh + sa) / 2] : [swapMin, (xh + xa) / 2];
    const [minSide, avg] = pick;
    if (minSide < PAIR_MIN || avg < PAIR_GOOD) continue;
    const bbStart = be.desc?.scheduled ? be.desc.scheduled * 1000 : NaN;
    const gap = Number.isFinite(ourStart) && Number.isFinite(bbStart) ? Math.abs(ourStart - bbStart) : 0;
    if (gap > 12 * 3600 * 1000) continue; // same teams, different fixture
    if (avg > bestScore + 1e-6 || (Math.abs(avg - bestScore) <= 1e-6 && gap < bestGap)) { best = be; bestScore = avg; bestGap = gap; }
  }
  return best;
}

const sig = (event) => `${event.sport}|${squash(event.home)}|${squash(event.away)}`;

// Resolve one game to its mini-field URL (or null) and cache the verdict, so later lookups are instant.
function resolveOne(c, event) {
  const be = bestMatch(c, event);
  if (!be) return null;
  const hit = statscoreId(c.widgets.get(be.id));
  if (!hit) return null; // matched, but BETBY has no Statscore widget for it yet
  const sportId = be.desc?.sport || SPORT_ID[event.sport] || '1';
  return trackerUrl(c.cfg, hit.provider, sportId, hit.eventId);
}

/**
 * The BETBY tracker (mini-field) URL for `event` ({ sport, home, away, start }), or null. Backed by a cache:
 * once a game is matched with confidence the URL is locked in, so opening it is instant.
 */
export async function resolveBetbyTracker(cfg, event) {
  if (!cfg || !cfg.base || !cfg.brandId || !event || !event.home || !event.away) return null;
  const c = cacheFor(cfg);
  const key = sig(event);
  const hit = c.resolved.get(key);
  if (hit && hit.url) return hit.url; // a locked match — instant
  try { await ensureFresh(c); } catch { /* feed down: fall back */ }
  const url = resolveOne(c, event);
  c.resolved.set(key, { url: url || null, at: Date.now() });
  return url;
}

/**
 * The matching engine: given the list of our live/soon games, match each against the BETBY feed and LOCK the
 * confident ones (cache their URL) so, by the time a user opens the game, the mini-field is already resolved.
 * Runs in the background from the live page; safe to call every few seconds (the feed self-throttles).
 */
export async function runBetbyEngine(cfg, events) {
  if (!cfg || !cfg.base || !cfg.brandId || !Array.isArray(events) || !events.length) return;
  const c = cacheFor(cfg);
  try { await ensureFresh(c); } catch { return; }
  for (const e of events) {
    if (!e || !e.home || !e.away) continue;
    const key = sig(e);
    const prev = c.resolved.get(key);
    if (prev && prev.url) continue; // already locked
    const url = resolveOne(c, e);
    c.resolved.set(key, { url: url || null, at: Date.now() });
  }
}
