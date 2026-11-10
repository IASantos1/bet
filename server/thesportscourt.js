// Streams the live ball of a tennis / basketball / cricket match to the browser, to drive the 3D court
// (public/court3d.js). It links the SITE match to its TheSports feed game (its uuid), then publishes
// { ball, score } on a bus keyed by the SITE event id — the same { snapshot, bus 'e:<id>', follow }
// shape the match-page SSE already speaks.
//
// Finding the uuid: the live feed itself does NOT carry the players' names (only uuid + score + ball),
// so we cannot match by names from the feed alone. We therefore (1) try the feed's own lineup names in
// case they are present, then (2) ask SportScore, whose match list IS the names→uuid index the feed
// lacks. Either way the BALL always comes from the feed (held open with thesportslive.hold while a court
// is watched, which reliably delivers it). The match is kept only while a viewer is connected.

import { EventEmitter } from 'node:events';
import { resolveTracker } from './thesportslink.js';
import { matchFeedGame } from './thesportsfeedlink.js';

const samePos = (a, b) => (a?.x ?? null) === (b?.x ?? null) && (a?.y ?? null) === (b?.y ?? null);
const RESOLVE_EVERY = 6000; // don't hammer SportScore while a match stays unlinked

export function createTheSportsCourt({ thesportsLive = null, sportscore = null, pollMs = 400, log = () => {} } = {}) {
  const bus = new EventEmitter(); bus.setMaxListeners(0);
  const byEvent = new Map();
  const on = () => !!(thesportsLive?.enabled);

  // Only the sports that have a 3D court (football keeps its own pitch).
  const hasCourt = (sport) => sport === 'tenis' || sport === 'basquetebol' || sport === 'criquete';

  function emit(eventId, s, ball, score) {
    s.last = { ball: ball || null, score: score || null };
    if (ball) { s.balls += 1; s.lastBallAt = Date.now(); }
    bus.emit(`e:${eventId}`, { type: 'court', data: s.last });
  }

  // Find the feed game (uuid) for this fixture: the feed's own names first (free), else SportScore.
  async function resolve(s) {
    if (s.resolving || Date.now() < s.nextResolveAt) return;
    s.resolving = true;
    try {
      const hit = matchFeedGame(thesportsLive.games(), s.ev.home, s.ev.away);
      if (hit) { s.trackerId = hit.id; s.ids = [hit.id]; s.reason = 'ok (feed)'; log(`court: ${s.ev.home} vs ${s.ev.away} → feed ${hit.id}`); return; }
      if (sportscore?.enabled) {
        const r = await resolveTracker(sportscore, { sport: s.ev.sport, home: s.ev.home, away: s.ev.away });
        if (r?.found) { s.trackerId = r.trackerId; s.ids = [r.trackerId, r.trackerProfile].filter(Boolean); s.reason = 'ok (sportscore)'; log(`court: ${s.ev.home} vs ${s.ev.away} → sportscore ${s.ids.join('/')}`); return; }
        s.reason = r?.reason || 'sem correspondência na SportScore';
      } else { s.reason = 'à procura no feed (sem jogo com estes nomes)'; }
    } catch (err) { s.reason = err.message; log(`court resolve: ${err.message}`); }
    finally { s.resolving = false; s.nextResolveAt = Date.now() + RESOLVE_EVERY; }
  }

  function tick(eventId, s) {
    if (!s.trackerId) { resolve(s).catch(() => {}); return; }
    // The feed may publish the ball under the tracker's id OR its profile — try both.
    let m = null; for (const id of s.ids || [s.trackerId]) { m = thesportsLive.get(id); if (m) { s.feedId = id; break; } }
    if (!m) return;
    s.msgs = m.msgs || 0;
    const ball = m.ball || null, score = m.score || null;
    if (!samePos(ball, s.last.ball) || score !== s.last.score) emit(eventId, s, ball, score);
  }

  function start(eventId, s) {
    thesportsLive.hold(); // keep the whole feed flowing so the ball is delivered reliably
    clearInterval(s.timer);
    s.timer = setInterval(() => tick(eventId, s), pollMs);
    if (s.timer.unref) s.timer.unref();
    tick(eventId, s);
  }

  function stop(eventId, s) {
    clearInterval(s.timer); s.timer = null;
    thesportsLive.release();
    // Keep the record for a while so the admin can open the match, come back here, and see what happened
    // (on one device you cannot be on the match page and the admin at the same time).
    s.endedAt = Date.now();
  }
  const KEEP_MS = 10 * 60_000;
  function prune() { const now = Date.now(); for (const [id, s] of byEvent) if (s.refs <= 0 && s.endedAt && now - s.endedAt > KEEP_MS) byEvent.delete(id); }

  return {
    get enabled() { return on(); },
    bus,
    hasCourt,
    /** True when this match can show a live 3D court (feed enabled + a court sport). */
    covers: (ev) => on() && !!ev && ev.status === 'live' && hasCourt(ev.sport),
    /** What a browser joining should see first. */
    snapshot: (eventId) => byEvent.get(eventId)?.last || { ball: null, score: null },
    isFollowing: (eventId) => !!byEvent.get(eventId)?.trackerId,
    /** A viewer opened the match page; returns an unfollow fn (call on disconnect). */
    follow(eventId, ev) {
      if (!on() || !hasCourt(ev?.sport)) return () => {};
      prune();
      let s = byEvent.get(eventId);
      if (!s) { s = { trackerId: null, ids: null, feedId: null, refs: 0, timer: null, last: { ball: null, score: null }, ev, reason: null, balls: 0, lastBallAt: null, msgs: 0, resolving: false, nextResolveAt: 0, endedAt: null }; byEvent.set(eventId, s); }
      s.ev = ev; s.refs += 1; s.endedAt = null;
      if (s.refs === 1) start(eventId, s);
      let done = false;
      return () => { if (done) return; done = true; const cur = byEvent.get(eventId); if (!cur) return; cur.refs -= 1; if (cur.refs <= 0) stop(eventId, cur); };
    },
    status: () => {
      prune();
      const feedIds = new Set((thesportsLive?.games?.() || []).map((g) => g.id));
      return {
        enabled: on(), watching: [...byEvent.values()].filter((s) => s.refs > 0 && s.trackerId).length, viewers: [...byEvent.values()].reduce((n, s) => n + s.refs, 0),
        feedGames: feedIds.size,
        matches: [...byEvent.entries()].sort((a, b) => b[1].refs - a[1].refs).map(([eventId, s]) => ({
          eventId, home: s.ev?.home || null, away: s.ev?.away || null, sport: s.ev?.sport || null,
          trackerId: s.trackerId || null, ids: s.ids || null, feedId: s.feedId || null,
          inFeed: !!(s.ids || []).some((id) => feedIds.has(id)),
          reason: s.reason, viewers: s.refs, active: s.refs > 0, msgs: s.msgs || 0, balls: s.balls || 0,
          hasBall: !!s.last?.ball, lastBallAt: s.lastBallAt ? new Date(s.lastBallAt).toISOString() : null,
          endedAt: s.endedAt ? new Date(s.endedAt).toISOString() : null,
        })),
      };
    },
    close() { for (const [id, s] of [...byEvent]) stop(id, s); },
  };
}
