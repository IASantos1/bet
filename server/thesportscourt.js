// Streams the live ball of a tennis / basketball / cricket match to the browser, to drive the 3D court
// (public/court3d.js). It links the SITE match to its TheSports feed game WITHOUT SportScore: while a
// court is open it holds the whole feed flowing (thesportslive.hold) and matches the fixture to a feed
// game by the players' names (thesportsfeedlink.matchFeedGame) — for tennis these are the two players,
// so the link is exact. It then publishes { ball, score } on a bus keyed by the SITE event id — the
// same { snapshot, bus 'e:<id>', follow } shape the match-page SSE already speaks. The match is kept
// only while at least one viewer is connected. Nothing here reaches the network directly.

import { EventEmitter } from 'node:events';
import { matchFeedGame } from './thesportsfeedlink.js';

const samePos = (a, b) => (a?.x ?? null) === (b?.x ?? null) && (a?.y ?? null) === (b?.y ?? null);

export function createTheSportsCourt({ thesportsLive = null, pollMs = 400, log = () => {} } = {}) {
  const bus = new EventEmitter(); bus.setMaxListeners(0);
  const byEvent = new Map(); // eventId -> { trackerId, refs, timer, last, ev, reason, balls, lastBallAt, msgs }
  const on = () => !!(thesportsLive?.enabled);

  // Only the sports that have a 3D court (football keeps its own pitch).
  const hasCourt = (sport) => sport === 'tenis' || sport === 'basquetebol' || sport === 'criquete';

  function emit(eventId, s, ball, score) {
    s.last = { ball: ball || null, score: score || null };
    if (ball) { s.balls += 1; s.lastBallAt = Date.now(); }
    bus.emit(`e:${eventId}`, { type: 'court', data: s.last });
  }

  // Each tick: if not yet linked, try to match the fixture to a feed game by names; then stream its ball.
  function tick(eventId, s) {
    if (!s.trackerId) {
      const hit = matchFeedGame(thesportsLive.games(), s.ev.home, s.ev.away);
      if (hit) { s.trackerId = hit.id; s.reason = 'ok'; log(`court: ${s.ev.home} vs ${s.ev.away} → feed ${hit.id}`); }
      else { s.reason = 'à procura no feed (sem jogo com estes nomes)'; return; }
    }
    const m = thesportsLive.get(s.trackerId);
    if (!m) return;
    s.msgs = m.msgs || 0;
    const ball = m.ball || null, score = m.score || null;
    if (!samePos(ball, s.last.ball) || score !== s.last.score) emit(eventId, s, ball, score);
  }

  function start(eventId, s) {
    thesportsLive.hold(); // keep the whole feed flowing so we can match by names
    clearInterval(s.timer);
    s.timer = setInterval(() => tick(eventId, s), pollMs);
    if (s.timer.unref) s.timer.unref();
    tick(eventId, s);
  }

  function stop(eventId, s) {
    clearInterval(s.timer); s.timer = null;
    thesportsLive.release();
    byEvent.delete(eventId);
  }

  return {
    get enabled() { return on(); },
    bus,
    hasCourt,
    /** True when this match can show a live 3D court (enabled + a court sport). */
    covers: (ev) => on() && !!ev && ev.status === 'live' && hasCourt(ev.sport),
    /** What a browser joining should see first. */
    snapshot: (eventId) => byEvent.get(eventId)?.last || { ball: null, score: null },
    isFollowing: (eventId) => !!byEvent.get(eventId)?.trackerId,
    /** A viewer opened the match page; returns an unfollow fn (call on disconnect). */
    follow(eventId, ev) {
      if (!on() || !hasCourt(ev?.sport)) return () => {};
      let s = byEvent.get(eventId);
      if (!s) { s = { trackerId: null, refs: 0, timer: null, last: { ball: null, score: null }, ev, reason: null, balls: 0, lastBallAt: null, msgs: 0 }; byEvent.set(eventId, s); }
      s.ev = ev; s.refs += 1;
      if (s.refs === 1) start(eventId, s);
      let done = false;
      return () => { if (done) return; done = true; const cur = byEvent.get(eventId); if (!cur) return; cur.refs -= 1; if (cur.refs <= 0) stop(eventId, cur); };
    },
    status: () => ({
      enabled: on(), watching: [...byEvent.values()].filter((s) => s.trackerId).length, viewers: [...byEvent.values()].reduce((n, s) => n + s.refs, 0),
      // Per followed match, for the admin: did we match a feed game, and are balls flowing?
      matches: [...byEvent.entries()].map(([eventId, s]) => ({
        eventId, home: s.ev?.home || null, away: s.ev?.away || null, sport: s.ev?.sport || null,
        trackerId: s.trackerId || null, reason: s.reason, viewers: s.refs, msgs: s.msgs || 0, balls: s.balls || 0,
        hasBall: !!s.last?.ball, lastBallAt: s.lastBallAt ? new Date(s.lastBallAt).toISOString() : null,
      })),
    }),
    close() { for (const [id, s] of [...byEvent]) stop(id, s); },
  };
}
