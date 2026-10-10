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

/** Situations that make the play dangerous (red, pulsing arrow; the label glows). */
export const DANGER = new Set(['dangerous_attack', 'corner', 'goal', 'freekick', 'shotoffwoodwork', 'goalkeeper_saved']);

/**
 * The arrow's tier for a situation: dangerous attack (and set pieces near goal) 'danger', an attack
 * — or the ball deep in the opponent's half — 'attacking', plain possession 'neutral'.
 * `depth` is how far (%) the side in possession has the ball from its own goal line.
 */
export function zoneTier(situation, depth) {
  if (DANGER.has(situation)) return 'danger';
  if (situation === 'attack' || depth > 60) return 'attacking';
  return 'neutral';
}

/**
 * The attacking arrow's look for a tier: colour, opacity, and whether it pulses. Possession is a
 * clear white so the arrow never fades into the grass; attack orange; dangerous attack red.
 */
export function zoneStyle(tier) {
  if (tier === 'danger') return { color: 0xe01010, opacity: 0.5, pulse: true };
  if (tier === 'attacking') return { color: 0xff8a1e, opacity: 0.42, pulse: false };
  return { color: 0xffffff, opacity: 0.3, pulse: false };
}

/**
 * The arrow's outline (m, flat on the pitch): from its own goal line (x = 0) the full width of the
 * pitch to the ball at x = `len`, the last `tip` metres narrowing to a point on the halfway line
 * across — as the 2D pitch's arrow. A short arrow is all tip.
 */
export function arrowShape(len, width, tip = 6.3) {
  const l = Math.max(0.5, len);
  const body = Math.max(0, l - tip);
  return [[0, -width / 2], [body, -width / 2], [l, 0], [body, width / 2], [0, width / 2]];
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

const inOut = (k) => (k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2);
const out = (k) => 1 - (1 - k) ** 2;
/**
 * Where the ball is at `k` (0..1) of a glide from `from` (x, y, z — it may start in the air) to
 * `to` (x, z, on the grass at height `ground`). A glide from rest eases in and out; one that takes
 * over a glide still under way (`moving`) keeps its speed and only eases out, so a new fix never
 * makes the ball stop and restart. In the air (`air` m at the top) it flies at an even pace, and a
 * ball caught mid-flight comes down smoothly instead of dropping to the grass.
 */
export function glidePoint({ from, to, air = 0, moving = false }, k, ground = 0) {
  const t = Math.max(0, Math.min(1, k));
  const e = air ? t : moving ? out(t) : inOut(t);
  const lift = Math.max(0, (from.y ?? ground) - ground) * (1 - e);
  return {
    x: from.x + (to.x - from.x) * e,
    y: ground + lift + (air ? Math.sin(Math.PI * e) * air : 0),
    z: from.z + (to.z - from.z) * e,
  };
}
