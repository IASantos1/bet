// The football mini-pitch in 3D: the Bet62 stadium (a render, seen from the front as on TV), with
// the ball the live tracker moves: it glides between fixes (in the air for long balls and shots) with a
// white→red trail, and the attacking side's zone lights up to it, as the 2D arrow does.
// Loaded only when a live football tracker is shown; draws only while something moves, and not at
// all when the tab is hidden or the pitch is off screen. createPitch3D returns null when the device
// has no WebGL: the page then keeps the 2D pitch.

import * as THREE from './vendor/three-0.169.0.module.min.js';
import { PITCH, pitchPoint, flightHeight, zoneStyle, arrowShape, glidePoint } from './trk3dmath.js';

const { L, W } = PITCH;
const HL = L / 2;
const MOVE_MS = 900;    // a fix's glide (the 2D ball's transition)
const TRAIL_MS = 1400;  // how long a trail stays after the ball arrives
const BR = 1.35;        // the ball, drawn bigger than life so it reads in a small box


/**
 * The stadium is a picture: the Bet62 stadium render (public/img/trk-estadio62.jpg, the banner's),
 * seen from the front as on TV. The page shows it behind a see-through canvas where only the ball,
 * its trail and the attacking zone are drawn, with the render's own camera, so they sit on its grass.
 */
export const STADIUM_CAM = { fov: 52, aspect: 1600 / 1000, pos: [0, 26, 66], look: [0, 9, -18] };

/**
 * Builds the 3D pitch in `host` (an element sized by the page). Returns
 * { setBall({ x, y, side, tier, situation, instant, resting, hidden }), destroy() }, or null without WebGL.
 * `onFrame({ x, y, visible })` gets, on every drawn frame, where the ball's label goes (in % of the box).
 */
export function createPitch3D(host, { quality = 'high', onFrame = () => {} } = {}) {
  // Sharp on every screen: drawn at the screen's full pixel density (up to 3×, retina / 4K) with
  // antialiasing (phones up to 2×). It draws only while the ball moves.
  const q = quality === 'low'
    ? { dpr: 2, aa: true }
    : { dpr: 3, aa: true };
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: q.aa, alpha: true, powerPreference: 'low-power' });
    if (!renderer.getContext()) throw new Error('no context');
  } catch {
    return null;
  }
  renderer.setPixelRatio(Math.min(q.dpr, window.devicePixelRatio || 1));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;
  renderer.setClearColor(0x000000, 0);
  const canvas = renderer.domElement;
  canvas.className = 'trk3d-canvas';
  host.append(canvas);

  host.classList.add('trk3d-stadium');
  const scene = new THREE.Scene();
  // the render's light, for the ball
  scene.add(new THREE.HemisphereLight(0x7d95c4, 0x1c2a1c, 0.55));
  for (const [x, z] of [[-60, -60], [60, -60], [-70, 40], [70, 40]]) { const d = new THREE.DirectionalLight(0xf2f6ff, 1.0); d.position.set(x, 60, z); scene.add(d); }
  // the render's camera (the picture is stretched to the box as the canvas is, so they stay matched)
  const camera = new THREE.PerspectiveCamera(STADIUM_CAM.fov, STADIUM_CAM.aspect, 0.5, 600);
  camera.position.set(...STADIUM_CAM.pos);
  camera.lookAt(...STADIUM_CAM.look);

  // the ball, its shadow, the trail and the attacking zone
  const ballTex = (() => {
    const c = document.createElement('canvas'); c.width = 512; c.height = 256; const g = c.getContext('2d');
    g.fillStyle = '#f4f6f8'; g.fillRect(0, 0, 512, 256); g.fillStyle = '#15191d';
    for (const [x, y] of [[64, 128], [192, 56], [192, 200], [320, 128], [448, 56], [448, 200]]) { g.beginPath(); for (let k = 0; k < 5; k++) { const a = k * 2 * Math.PI / 5 - Math.PI / 2; g.lineTo(x + 32 * Math.cos(a), y + 32 * Math.sin(a)); } g.fill(); }
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  })();
  const ball = new THREE.Mesh(new THREE.SphereGeometry(BR, 40, 28), new THREE.MeshLambertMaterial({ map: ballTex }));
  const shadow = new THREE.Mesh(new THREE.CircleGeometry(BR * 1.1, 20), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35, depthWrite: false }));
  shadow.rotation.x = -Math.PI / 2;
  scene.add(ball, shadow);
  const zoneTex = (() => { const c = document.createElement('canvas'); c.width = 128; c.height = 2; const g = c.getContext('2d');
    const gr = g.createLinearGradient(0, 0, 128, 0); gr.addColorStop(0, 'rgba(255,255,255,0.35)'); gr.addColorStop(1, 'rgba(255,255,255,1)');
    g.fillStyle = gr; g.fillRect(0, 0, 128, 2); return new THREE.CanvasTexture(c); })();
  const zone = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial({ map: zoneTex, transparent: true, depthWrite: false, toneMapped: false }));
  zone.rotation.x = -Math.PI / 2; zone.position.y = 0.04; zone.renderOrder = 1; scene.add(zone);
  let zoneLen = -1;
  /** The arrow's outline for this length, the texture's fade running from the goal line to the tip. */
  function shapeZone(len) {
    if (Math.abs(len - zoneLen) < 0.05) return;
    zoneLen = len;
    const geo = new THREE.ShapeGeometry(new THREE.Shape(arrowShape(len, W).map(([x, y]) => new THREE.Vector2(x, y))));
    const p = geo.attributes.position, uv = geo.attributes.uv;
    for (let j = 0; j < p.count; j++) uv.setXY(j, p.getX(j) / Math.max(0.5, len), 0.5);
    zone.geometry.dispose(); zone.geometry = geo;
  }
  const trailMat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, toneMapped: false });
  let trail = null;

  // motion state
  const pos = new THREE.Vector3(0, BR, 0);
  let move = null; // { from, to, air, moving, at, hot }
  let target = null; // the spot the last fix asked for (a repeat of it changes nothing)
  const roll = new THREE.Quaternion(), axis = new THREE.Vector3();
  let zoneState = { side: 'home', tier: 'neutral', hidden: true };
  let hidden = true;
  let raf = 0;
  let onScreen = true;

  // the ball pulses gently while it is shown (so it is found at a glance)
  let pulse = 1;
  function placeAt(p) { ball.position.copy(p); ball.scale.setScalar(pulse); shadow.position.set(p.x, 0.05, p.z); shadow.scale.setScalar(pulse * Math.max(0.4, 1 - (p.y - BR) / 12)); }
  function drawTrail(now) {
    if (trail) { scene.remove(trail); trail.geometry.dispose(); trail = null; }
    if (!move) return false;
    const age = now - move.at;
    const fade = age <= MOVE_MS ? 1 : Math.max(0, 1 - (age - MOVE_MS) / (TRAIL_MS - MOVE_MS));
    if (fade <= 0 || move.from.distanceTo(move.to) < 4) return false;
    const k = Math.min(1, age / MOVE_MS);
    const pts = [];
    for (let j = 0; j <= 20; j++) pts.push(pointOf(move, k * j / 20));
    if (pts[0].distanceTo(pts[20]) < 1) return fade > 0;
    const geo = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 40, 0.22, 6, false);
    const col = []; const n = geo.attributes.position.count; const red = new THREE.Color(move.hot ? 0xe32222 : 0xffd0d0), wh = new THREE.Color(0xffffff);
    for (let j = 0; j < n; j++) { const c = wh.clone().lerp(red, Math.min(1, Math.floor(j / 7) / 40 * 1.1)); col.push(c.r, c.g, c.b); }
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    trailMat.opacity = 0.9 * fade;
    trail = new THREE.Mesh(geo, trailMat); scene.add(trail);
    return true;
  }
  function pointOf(m, k) { const p = glidePoint(m, k, BR); return new THREE.Vector3(p.x, p.y, p.z); }
  function styleZone(now) {
    const { side, tier } = zoneState;
    if (zoneState.hidden || hidden) { zone.visible = false; return false; }
    const s = zoneStyle(tier);
    const from = side === 'away' ? HL : -HL;
    const len = Math.max(0.5, Math.abs(pos.x - from));
    zone.visible = true;
    shapeZone(len); zone.position.x = from; zone.rotation.z = side === 'away' ? Math.PI : 0;
    zone.material.color.setHex(s.color);
    zone.material.opacity = s.pulse ? s.opacity * (0.75 + 0.25 * Math.sin(now / 140)) : s.opacity;
    return s.pulse;
  }
  const proj = new THREE.Vector3();
  function frame() {
    raf = 0;
    const now = performance.now();
    let busy = false;
    if (move) {
      const k = Math.min(1, (now - move.at) / MOVE_MS);
      const next = pointOf(move, k);
      // it rolls the way it goes, by as much as it travelled
      const dx = next.x - pos.x, dz = next.z - pos.z, d = Math.hypot(dx, dz);
      if (d > 1e-4) { roll.setFromAxisAngle(axis.set(dz / d, 0, -dx / d), d / BR); ball.quaternion.premultiply(roll); }
      pos.copy(next);
      busy = k < 1;
    }
    ball.visible = shadow.visible = !hidden;
    pulse = 1 + 0.14 * Math.sin(now / 200);
    placeAt(pos);
    busy = busy || !hidden;
    busy = drawTrail(now) || busy;
    busy = styleZone(now) || busy;
    renderer.render(scene, camera);
    proj.copy(pos).add(new THREE.Vector3(0, BR + 0.6, 0)).project(camera); // just above the ball (the label sits over it)
    onFrame({ x: (proj.x * 0.5 + 0.5) * 100, y: (-proj.y * 0.5 + 0.5) * 100, visible: !hidden && proj.z < 1 });
    if (busy) schedule();
  }
  function schedule() { if (!raf && onScreen && !document.hidden) raf = requestAnimationFrame(frame); }

  function resize() {
    const w = host.clientWidth, h = host.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    schedule();
  }
  const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(resize) : null;
  ro?.observe(host);
  const io = typeof IntersectionObserver === 'function' ? new IntersectionObserver(([e]) => { onScreen = e.isIntersecting; schedule(); }) : null;
  io?.observe(host);
  const onVis = () => schedule();
  document.addEventListener('visibilitychange', onVis);
  resize();

  return {
    /** A tracker fix: glide there (or jump with `instant`); `hidden` when there is no position. */
    setBall({ x, y, side = 'home', tier = 'neutral', situation = null, instant = false, resting = false, hidden: hide = false }) {
      const wasHidden = hidden;
      hidden = !!hide;
      zoneState = { side, tier, hidden: hidden || resting };
      if (hidden) { target = null; schedule(); return; }
      const p = pitchPoint(x, y);
      const to = new THREE.Vector3(p.x, BR, p.z);
      // The same spot again (a page refresh, a new situation for the same fix): the glide under way
      // and its trail go on untouched; only the zone follows.
      if (target && !wasHidden && to.distanceTo(target) < 0.2) { schedule(); return; }
      target = to;
      const now = performance.now();
      if (instant || wasHidden || to.distanceTo(pos) < 0.2) { move = null; pos.copy(to); }
      else {
        // from where the ball is now, its height included, keeping its pace if it was still going
        const moving = !!move && now - move.at < MOVE_MS;
        move = { from: pos.clone(), to, air: flightHeight({ x: pos.x, z: pos.z }, p, situation), moving, at: now, hot: tier === 'danger' };
      }
      schedule();
    },
    destroy() {
      if (raf) cancelAnimationFrame(raf);
      raf = 0; onScreen = false;
      ro?.disconnect(); io?.disconnect();
      document.removeEventListener('visibilitychange', onVis);
      scene.traverse((o) => {
        o.geometry?.dispose?.();
        for (const m of [].concat(o.material || [])) { m.map?.dispose?.(); m.dispose?.(); }
      });
      renderer.dispose();
      renderer.forceContextLoss?.();
      canvas.remove();
    },
  };
}
