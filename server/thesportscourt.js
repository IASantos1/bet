// Streams the live ball of a tennis / basketball / cricket match to the browser, to drive the 3D court
// (public/court3d.js). It links the site match to its TheSports tracker (through SportScore, see
// thesportslink.js), tells the live manager (thesportslive.js) to watch that tracker, and publishes
// { ball, score } on a bus keyed by the SITE event id — the same { snapshot, bus 'e:<id>', follow }
// shape the match-page SSE already speaks. The tracker is resolved once per match and memoised; the
// manager is watched only while at least one viewer is connected, and unwatched when the last leaves.
// Nothing here reaches the network directly (the reads go through the injected clients).

import { EventEmitter } from 'node:events';
import { resolveTracker, SS_SPORT } from './thesportslink.js';

const samePos = (a, b) => (a?.x ?? null) === (b?.x ?? null) && (a?.y ?? null) === (b?.y ?? null);

export function createTheSportsCourt({ thesportsLive = null, sportscore = null, pollMs = 400, log = () => {} } = {}) {
  const bus = new EventEmitter(); bus.setMaxListeners(0);
  const byEvent = new Map(); // eventId -> { trackerId, refs, timer, last, resolving, ev }
  const on = () => !!(thesportsLive?.enabled && sportscore?.enabled);

  // Only the sports that have a 3D court (football keeps its own pitch).
  const hasCourt = (sport) => sport === 'tenis' || sport === 'basquetebol' || sport === 'criquete';

  function emit(eventId, s, ball, score) {
    s.last = { ball: ball || null, score: score || null };
    bus.emit(`e:${eventId}`, { type: 'court', data: s.last });
  }

  function tick(eventId, s) {
    const m = s.trackerId && thesportsLive.get(s.trackerId);
    if (!m) return;
    const ball = m.ball || null, score = m.score || null;
    if (!samePos(ball, s.last.ball) || score !== s.last.score) emit(eventId, s, ball, score);
  }

  async function start(eventId, s) {
    if (!s.trackerId && !s.resolving) {
      s.resolving = true;
      try {
        const r = await resolveTracker(sportscore, { sport: s.ev.sport, home: s.ev.home, away: s.ev.away });
        if (r?.found) s.trackerId = r.trackerId;
        else log(`court: sem tracker para ${s.ev.home} vs ${s.ev.away} (${r?.reason || '—'})`);
      } catch (err) { log(`court resolve: ${err.message}`); }
      s.resolving = false;
    }
    if (!s.trackerId || s.refs <= 0 || !byEvent.has(eventId)) return;
    thesportsLive.watch(s.trackerId);
    clearInterval(s.timer);
    s.timer = setInterval(() => tick(eventId, s), pollMs);
    if (s.timer.unref) s.timer.unref();
    tick(eventId, s); // send at once if there is already a position
  }

  function stop(eventId, s) {
    clearInterval(s.timer); s.timer = null;
    if (s.trackerId) thesportsLive.unwatch(s.trackerId);
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
      if (!s) { s = { trackerId: null, refs: 0, timer: null, last: { ball: null, score: null }, resolving: false, ev }; byEvent.set(eventId, s); }
      s.ev = ev; s.refs += 1;
      if (s.refs === 1) start(eventId, s).catch((err) => log(`court start: ${err.message}`));
      let done = false;
      return () => { if (done) return; done = true; const cur = byEvent.get(eventId); if (!cur) return; cur.refs -= 1; if (cur.refs <= 0) stop(eventId, cur); };
    },
    status: () => ({ enabled: on(), watching: [...byEvent.values()].filter((s) => s.trackerId).length, viewers: [...byEvent.values()].reduce((n, s) => n + s.refs, 0) }),
    close() { for (const [id, s] of [...byEvent]) stop(id, s); },
  };
}

export { SS_SPORT };
