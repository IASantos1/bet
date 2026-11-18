// BETBY mini-field matching engine — the "motor" that decides which BETBY event is the game a player is
// looking at, by evaluating team names, sport and kick-off time. It lives ONLY on the server: the browser
// never sees this logic. The browser can reach BETBY's public feed (the Railway server gets 503 from it),
// so it relays the raw feed snapshot to us; everything below — the name evaluation and the lock — is ours.
//
// It never touches odds, markets, bets or settlement. It only turns "our event" into a tracker URL.

// ---- team-name matching (same accent/case stripping the rest of the app uses) ----
// Club designators dropped before comparing names, so "FC Porto" vs "Porto", "Gence BC" vs "Gence" or
// "CE Sabadell FC" vs "Sabadell" still match. Covers football and basketball.
const STOP = new Set(['fc', 'cf', 'sc', 'ac', 'afc', 'cd', 'ca', 'sd', 'ud', 'sad', 'club', 'clube', 'de', 'do',
  'da', 'the', 'if', 'bk', 'fk', 'sk', 'u21', 'u20', 'u19', 'u23', 'b', 'bc', 'ce', 'cs', 'csu', 'csm', 'kk',
  'ec', 'asd', 'ssd', 'ad', 'us', 'usd', 'cska', 'bsc', 'calcio', 'basket', 'baloncesto']);
function tokens(name) {
  return String(name || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/).filter((t) => t && t.length > 1 && !STOP.has(t));
}
const squash = (name) => tokens(name).join('');
const overlapOk = (ta, tb, inter) => inter >= 2 || (inter >= 1 && Math.min(ta.length, tb.length) === 1);

// How close two team names are, 0..1. 1 = same once club words are stripped; high for one name inside the
// other (added city/suffix); the Jaccard of the tokens otherwise; a floor when a long distinctive token is
// shared (the club's own name, for transliterated cities).
export function scoreTeams(a, b) {
  const sa = squash(a), sb = squash(b);
  if (!sa || !sb) return 0;
  if (sa === sb) return 1;
  if (sa.length >= 4 && sb.length >= 4 && (sa.includes(sb) || sb.includes(sa))) return 0.9;
  const ta = tokens(a), tb = tokens(b);
  const setB = new Set(tb);
  const inter = ta.filter((t) => setB.has(t));
  const union = new Set([...ta, ...tb]);
  const jaccard = union.size ? inter.length / union.size : 0;
  if (overlapOk(ta, tb, inter.length)) return Math.max(0.75, jaccard);
  if (inter.some((t) => t.length >= 7)) return Math.max(0.8, jaccard);
  return jaccard;
}
export function sameTeam(a, b) { return scoreTeams(a, b) >= 0.5; }

// Our sport slug → BETBY/Betradar sport id (for the tracker's sportId and the soft sport gate).
const SPORT_ID = { futebol: '1', basquetebol: '2', tenis: '5', hoquei: '4', andebol: '6', voleibol: '23', basebol: '3', criquete: '21', futamericano: '16', raguebi: '12', dardos: '22', tenismesa: '20', badminton: '31', futsal: '29', boxe: '10', mma: '117' };
const SPORT_BY_ID = Object.fromEntries(Object.entries(SPORT_ID).map(([slug, id]) => [id, slug]));

const TRACKER_PROVIDERS = new Set(['statscore', 'oddin', 'betgenius']);
function statscoreId(widgets) {
  const w = Array.isArray(widgets) ? widgets.find((x) => x && TRACKER_PROVIDERS.has(x.id) && x.event_id != null && /^\d{3,}$/.test(String(x.event_id))) : null;
  return w ? { provider: w.id, eventId: String(w.event_id) } : null;
}

function trackerUrl(cfg, provider, sportId, eventId) {
  const providers = JSON.stringify({ id: provider, sportId: String(sportId), lang: String(cfg.locale || 'en').toLowerCase(), liveEvent: true, eventId: Number(eventId) || eventId });
  return `${cfg.tracker}/tracker.html?providers=${encodeURIComponent(providers)}`;
}

const PAIR_MIN = 0.5;   // each side must score at least this in the chosen orientation
const PAIR_GOOD = 0.6;  // the pair's average score to accept the match
const sig = (event) => `${event.sport}|${squash(event.home)}|${squash(event.away)}`;

/**
 * The hidden engine. Holds the latest BETBY feed snapshot (relayed by a browser), the admin alias catalog,
 * and a lock cache of resolved tracker URLs so a confident match stays fixed.
 */
export function createBetbyEngine() {
  let events = new Map();   // betby event id → { sport, scheduled, names: [a, b] }
  let widgets = new Map();  // betby event id → [widget objects]
  const resolved = new Map(); // our sig → { url, at }
  let aliases = new Map();   // squash(our name) → BETBY name
  let feedAt = 0;

  const alias = (name) => aliases.get(squash(name)) || name;

  // The best BETBY event for our game. Scores both team names (either orientation), keeps the orientation
  // whose weaker side is strongest, and ranks by score then by closeness of kick-off.
  function bestMatch(event) {
    const home = alias(event.home), away = alias(event.away);
    const ourStart = event.start ? Date.parse(event.start) : NaN;
    let best = null, bestScore = 0, bestGap = Infinity;
    for (const be of events.values()) {
      const beSport = be.sport != null ? SPORT_BY_ID[String(be.sport)] : undefined;
      if (beSport && beSport !== event.sport) continue; // soft sport gate
      const names = Array.isArray(be.names) ? be.names.filter(Boolean) : [];
      if (names.length < 2) continue;
      const sh = scoreTeams(home, names[0]), sa = scoreTeams(away, names[1]);
      const xh = scoreTeams(home, names[1]), xa = scoreTeams(away, names[0]);
      const straightMin = Math.min(sh, sa), swapMin = Math.min(xh, xa);
      const [minSide, avg] = straightMin >= swapMin ? [straightMin, (sh + sa) / 2] : [swapMin, (xh + xa) / 2];
      if (minSide < PAIR_MIN || avg < PAIR_GOOD) continue;
      const bbStart = be.scheduled ? be.scheduled * 1000 : NaN;
      const gap = Number.isFinite(ourStart) && Number.isFinite(bbStart) ? Math.abs(ourStart - bbStart) : 0;
      if (gap > 12 * 3600 * 1000) continue; // same teams, different fixture
      if (avg > bestScore + 1e-6 || (Math.abs(avg - bestScore) <= 1e-6 && gap < bestGap)) { best = be; bestScore = avg; bestGap = gap; }
    }
    return best;
  }

  function resolveOne(cfg, event) {
    const be = bestMatch(event);
    if (!be) return null;
    const hit = statscoreId(widgets.get(be.id));
    if (!hit) return null;
    const sportId = be.sport || SPORT_ID[event.sport] || '1';
    return trackerUrl(cfg, hit.provider, sportId, hit.eventId);
  }

  return {
    /** Replace the feed snapshot with what a browser relayed: { events: {id:{sport,scheduled,names}}, widgets: {id:[...] } }. */
    ingest(snapshot) {
      const ev = snapshot && snapshot.events;
      const wd = snapshot && snapshot.widgets;
      if (ev && typeof ev === 'object') {
        const next = new Map();
        for (const [id, d] of Object.entries(ev)) {
          if (!d || typeof d !== 'object') continue;
          const names = Array.isArray(d.names) ? d.names.map((n) => String(n || '')).filter(Boolean) : [];
          next.set(String(id), { id: String(id), sport: d.sport != null ? String(d.sport) : null, scheduled: Number(d.scheduled) || null, names });
        }
        events = next;
      }
      if (wd && typeof wd === 'object') {
        const next = new Map();
        for (const [id, list] of Object.entries(wd)) if (Array.isArray(list)) next.set(String(id), list);
        widgets = next;
      }
      feedAt = Date.now();
    },

    /** Resolve one of our games to its locked tracker URL (or null). cfg = { tracker, locale }. */
    resolve(cfg, event) {
      if (!cfg || !event || !event.home || !event.away) return null;
      const key = sig(event);
      const hit = resolved.get(key);
      if (hit && hit.url) return hit.url;          // a confident match — locked, instant, forever
      if (hit && hit.at >= feedAt) return hit.url; // already evaluated against this exact feed (still no match)
      if (!events.size) return hit ? hit.url : null;
      const url = resolveOne(cfg, event);
      resolved.set(key, { url: url || null, at: Date.now() });
      return url;
    },

    /** Batch: { ourId: url|null } for a list of our events (each { id, sport, home, away, start }). */
    urlsFor(cfg, list) {
      const out = {};
      for (const e of (Array.isArray(list) ? list : [])) {
        if (!e || e.id == null || !e.home || !e.away) continue;
        out[e.id] = this.resolve(cfg, e) || null;
      }
      return out;
    },

    setAliases(list) {
      const m = new Map();
      for (const a of (Array.isArray(list) ? list : [])) if (a && a.from && a.to) m.set(squash(a.from), String(a.to));
      aliases = m;
    },

    /** Diagnostic: the top BETBY candidates for our game (no threshold), each with its score and whether it
     *  carries a mini-field widget. Lets an operator see the exact BETBY name to pin in the catalog. */
    candidates(event, n = 3) {
      if (!event || !event.home || !event.away) return [];
      const home = alias(event.home), away = alias(event.away);
      const ourStart = event.start ? Date.parse(event.start) : NaN;
      const out = [];
      for (const be of events.values()) {
        const beSport = be.sport != null ? SPORT_BY_ID[String(be.sport)] : undefined;
        if (beSport && event.sport && beSport !== event.sport) continue;
        const names = Array.isArray(be.names) ? be.names.filter(Boolean) : [];
        if (names.length < 2) continue;
        const sh = scoreTeams(home, names[0]), sa = scoreTeams(away, names[1]);
        const xh = scoreTeams(home, names[1]), xa = scoreTeams(away, names[0]);
        const straight = Math.min(sh, sa), swap = Math.min(xh, xa);
        const [minSide, avg, swapped] = straight >= swap ? [straight, (sh + sa) / 2, false] : [swap, (xh + xa) / 2, true];
        const bbStart = be.scheduled ? be.scheduled * 1000 : NaN;
        const gapH = Number.isFinite(ourStart) && Number.isFinite(bbStart) ? Math.round(Math.abs(ourStart - bbStart) / 3_600_000) : null;
        out.push({
          home: swapped ? names[1] : names[0], away: swapped ? names[0] : names[1],
          score: Math.round(avg * 100) / 100, minSide: Math.round(minSide * 100) / 100,
          hasWidget: !!statscoreId(widgets.get(be.id)), gapH,
        });
      }
      out.sort((a, b) => b.score - a.score);
      return out.slice(0, n);
    },

    status() { return { feedAt, events: events.size, widgets: widgets.size, locked: [...resolved.values()].filter((r) => r.url).length }; },
  };
}
