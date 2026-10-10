// The 3D mini-pitch's rules, apart from the drawing (public/trk3d.js) so they can be tested:
// where a tracker fix lands on the 3D pitch, how high the ball flies, how much the device can draw,
// and how the TV camera frames the stadium in a box of any shape.

/** The pitch (metres): 105 × 68, x along its length (home attacks +x), z across (far touchline -z). */
export const PITCH = { L: 105, W: 68 };

/** A tracker fix (x, y in % — 0,0 the far-left corner, home attacking left→right) → ground point in metres. */
export function pitchPoint(x, y) {
  const cx = Math.max(-2, Math.min(102, Number(x)));
  const cy = Math.max(0, Math.min(100, Number(y)));
  return { x: -PITCH.L / 2 + (cx / 100) * PITCH.L, z: -PITCH.W / 2 + (cy / 100) * PITCH.W };
}

const AIR = new Set(['shot', 'corner', 'freekick', 'goalkick', 'goal', 'goalkeeper_saved', 'shotoffwoodwork']);
/**
 * How high (m) the ball rises between two fixes: a long ball (over 28 m) or a set piece / shot is
 * in the air, the higher the longer (at most 9 m); a short pass stays on the grass.
 */
export function flightHeight(from, to, situation) {
  const d = Math.hypot(to.x - from.x, to.z - from.z);
  if (d < 6) return 0;
  if (d > 28 || AIR.has(situation)) return Math.min(9, 0.8 + d * 0.13);
  return 0;
}

/** The attacking zone's look for a tier (as the 2D arrow's): colour, opacity, and whether it pulses. */
export function zoneStyle(tier) {
  if (tier === 'danger') return { color: 0xd20a0a, opacity: 0.38, pulse: true };
  if (tier === 'attacking') return { color: 0xdc8228, opacity: 0.3, pulse: false };
  return { color: 0x6b6b6b, opacity: 0.22, pulse: false };
}

/**
 * How much this device should draw: 'low' on phones, small screens, few cores or data saver
 * (smaller crowd, no shadows, lower resolution), else 'high'.
 */
export function qualityTier({ coarse = false, width = 1280, cores = 8, saveData = false, memory = 8 } = {}) {
  if (saveData || coarse || width < 760 || cores <= 4 || memory <= 2) return 'low';
  return 'high';
}

/**
 * The TV camera's vertical field of view for a box of this aspect: it keeps the horizontal view
 * of a 16:9 frame at `baseFov`, so the whole pitch fits however narrow the box is.
 */
export function fovFor(aspect, baseFov = 40) {
  const a = Math.max(0.5, Number(aspect) || 16 / 9);
  if (a >= 16 / 9) return baseFov;
  const h = 2 * Math.atan(Math.tan((baseFov * Math.PI) / 360) * (16 / 9));
  return Math.min(75, (2 * Math.atan(Math.tan(h / 2) / a) * 180) / Math.PI);
}

/** Whether the 3D pitch is wanted: on unless the viewer chose 2D (kept in localStorage). */
export const PREF_KEY = 'b62_trk3d';
export const wants3D = (stored) => stored !== '0';
