// The short 3D clips the football mini-pitch plays over itself: the goal celebration when a team
// scores, and the corner (from the flag, right or left of the goal, until the cross drops into the
// box) at the moment the corner is taken — not when it is awarded. Pure rules here (what to play,
// when); the page does the playing.

export const CLIPS = {
  goal: { src: '/media/trk-golo', ms: 3900 },
  'corner-right': { src: '/media/trk-canto-direito', ms: 2250 },
  'corner-left': { src: '/media/trk-canto-esquerdo', ms: 2250 },
};
export const CLIP_FORMATS = { mp4: 'video/mp4; codecs="avc1.4D401E"', webm: 'video/webm; codecs="vp9"' };

/**
 * The file type this browser plays (each clip is in both): MP4 (H.264) where it is sure, else WebM
 * (VP9: Chromium and Firefox builds without H.264), else MP4 on a "maybe"; null when neither.
 */
export function clipFormat(canPlayType) {
  const mp4 = canPlayType(CLIP_FORMATS.mp4);
  if (mp4 === 'probably') return 'mp4';
  if (canPlayType(CLIP_FORMATS.webm)) return 'webm';
  return mp4 ? 'mp4' : null;
}

/** Who scored, from the score before and after (null when nobody did, or a goal was taken back). */
export function scorer(before, after) {
  if (!before || !after) return null;
  const dh = Number(after.home) - Number(before.home);
  const da = Number(after.away) - Number(before.away);
  if (!(dh >= 0 && da >= 0)) return null;
  if (dh > 0 && da === 0) return 'home';
  if (da > 0 && dh === 0) return 'away';
  return null;
}

/**
 * Which corner clip: the flag right or left of the goal, as seen from the pitch facing that goal.
 * Our pitch has home attacking left→right with y going down, so for home the bottom flags (y > 50)
 * are on the right of the goal; for away (attacking right→left) the top ones. A guessed position
 * (no fix from the tracker) says nothing about the side: the two clips take turns.
 */
export function cornerClip(ball, turn = 0) {
  const y = Number(ball?.y);
  if (ball && !ball.estimated && Number.isFinite(y) && y !== 50) {
    const bottom = y > 50;
    return (ball.side === 'away' ? !bottom : bottom) ? 'corner-right' : 'corner-left';
  }
  return turn % 2 ? 'corner-left' : 'corner-right';
}

/** A tracker frame that starts a clip: the situation turning into a goal (or a corner being awarded). */
export function situationClip(prev, next) {
  const s = next?.situation;
  if (!s || s === prev?.situation) return null;
  return s === 'goal' || s === 'corner' ? s : null;
}

export const GOAL_GAP_MS = 45_000;   // one celebration per goal (the score and the situation both say it)
export const CORNER_GAP_MS = 15_000; // one corner clip per corner (the situation repeats every second)

/**
 * Decides whether a clip may start now: a goal takes over a corner that is playing, a corner never
 * cuts a goal, and the same kind does not play twice for one happening.
 */
export function createClipGate(now = () => Date.now()) {
  const last = { goal: -Infinity, corner: -Infinity };
  let playing = null; // { kind, until }
  return {
    want(kind) {
      const t = now();
      const k = kind === 'goal' ? 'goal' : 'corner';
      if (t - last[k] < (k === 'goal' ? GOAL_GAP_MS : CORNER_GAP_MS)) return false;
      if (playing && playing.until > t && (k === 'corner' || playing.kind === 'goal')) return false;
      return true;
    },
    start(kind, ms) {
      const k = kind === 'goal' ? 'goal' : 'corner';
      last[k] = now();
      playing = { kind: k, until: now() + ms };
    },
    stop() { playing = null; },
    get playing() { return playing && playing.until > now() ? playing.kind : null; },
  };
}

export const CORNER_WAIT_MS = 90_000; // a corner not seen taken by then (data gap, half time) plays nothing
const atFlag = (b) => (b.x < 8 || b.x > 92) && (b.y < 10 || b.y > 90);
const moved = (a, b) => Math.hypot(b.x - a.x, (b.y - a.y) / 1.55) > 12; // % of the pitch length

/**
 * Follows a corner from the moment it is awarded to the kick, frame by frame. A corner is taken
 * when the tracker moves on from it (attack, dangerous attack, shot, clearance…) or, while it still
 * says "corner", when a real fix shows the ball gone from the flag. `frame(ball)` gives the corner
 * clip at that moment (the flag right or left of the goal, as the ball stood), else null.
 */
export function createCornerWatch(now = () => Date.now()) {
  let pending = null; // { side, clip, at, spot }
  let turn = 0;
  const take = () => { const { clip } = pending; pending = null; return clip; };
  return {
    frame(b) {
      const s = b?.situation;
      if (s === 'corner') {
        const real = !b.estimated && Number.isFinite(b.x) && Number.isFinite(b.y);
        if (!pending || pending.side !== b.side) {
          pending = { side: b.side, clip: cornerClip(b, turn++), at: now(), spot: real && atFlag(b) ? { x: b.x, y: b.y } : null };
        } else if (real && !pending.spot && atFlag(b)) {
          pending.spot = { x: b.x, y: b.y };
          pending.clip = cornerClip(b);
        } else if (real && pending.spot && moved(pending.spot, b)) return take();
        return null;
      }
      if (!pending) return null;
      if (!s || s === 'halftime' || now() - pending.at > CORNER_WAIT_MS) { pending = null; return null; }
      return take();
    },
    reset() { pending = null; },
    get pending() { return !!pending; },
  };
}
