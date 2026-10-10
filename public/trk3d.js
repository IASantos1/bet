// The football mini-pitch in 3D: the stadium (stands as an upside-down U, joined at the far
// corners, the near side — the technical staff's — open so the whole pitch is seen), with the ball
// the live tracker moves: it glides between fixes (in the air for long balls and shots) with a
// white→red trail, and the attacking side's zone lights up to it, as the 2D arrow does.
// Loaded only when a live football tracker is shown; draws only while something moves, and not at
// all when the tab is hidden or the pitch is off screen. createPitch3D returns null when the device
// has no WebGL: the page then keeps the 2D pitch.

import * as THREE from './vendor/three-0.169.0.module.min.js';
import { PITCH, pitchPoint, flightHeight, zoneStyle, fovFor } from './trk3dmath.js';

const { L, W } = PITCH;
const HL = L / 2, HW = W / 2;
const MOVE_MS = 900;    // a fix's glide (the 2D ball's transition)
const TRAIL_MS = 1400;  // how long a trail stays after the ball arrives
const BR = 1.35;        // the ball, drawn bigger than life so it reads in a small box

function seeded(seed) { let x = seed; return () => { x = (x * 1664525 + 1013904223) % 4294967296; return x / 4294967296; }; }
const ease = (k) => (k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2);

/** The stadium (built once per pitch). `q` = quality settings. */
function buildStadium(scene, q) {
  const v3 = (x, y, z) => new THREE.Vector3(x, y, z);
  const rnd = seeded(62);
  // sky
  { const c = document.createElement('canvas'); c.width = 2; c.height = 128;
    const g = c.getContext('2d'); const gr = g.createLinearGradient(0, 0, 0, 128);
    gr.addColorStop(0, '#0b1626'); gr.addColorStop(0.55, '#1f3550'); gr.addColorStop(1, '#4a6a88');
    g.fillStyle = gr; g.fillRect(0, 0, 2, 128);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; scene.background = t; }
  scene.add(new THREE.HemisphereLight(0xcfe4ff, 0x2a4a2a, 1.1));
  const key = new THREE.DirectionalLight(0xffffff, 2.0); key.position.set(-40, 90, 60); scene.add(key);

  // pitch: stripes and lines on a canvas
  { const PX = q.px, AX = 14, AZ = 12;
    const cw = Math.round((L + 2 * AX) * PX), ch = Math.round((W + 2 * AZ) * PX);
    const c = document.createElement('canvas'); c.width = cw; c.height = ch; const g = c.getContext('2d');
    const X = (x) => (x + HL + AX) * PX, Z = (z) => (z + HW + AZ) * PX;
    for (let i = 0; i < 18; i++) { g.fillStyle = i % 2 ? '#3a8d55' : '#337f4c'; g.fillRect(i * cw / 18, 0, cw / 18 + 1, ch); }
    for (let i = 0; i < cw * ch / 40; i++) { g.fillStyle = `rgba(${rnd() < .5 ? '0,0,0' : '255,255,255'},${rnd() * 0.045})`; g.fillRect(rnd() * cw, rnd() * ch, 2, 2); }
    g.strokeStyle = 'rgba(255,255,255,.93)'; g.lineWidth = Math.max(1.5, 0.14 * PX);
    const line = (x1, z1, x2, z2) => { g.beginPath(); g.moveTo(X(x1), Z(z1)); g.lineTo(X(x2), Z(z2)); g.stroke(); };
    const rect = (x1, z1, x2, z2) => g.strokeRect(X(x1), Z(z1), (x2 - x1) * PX, (z2 - z1) * PX);
    const arc = (x, z, r, a0, a1) => { g.beginPath(); g.arc(X(x), Z(z), r * PX, a0, a1); g.stroke(); };
    const spot = (x, z) => { g.fillStyle = '#fff'; g.beginPath(); g.arc(X(x), Z(z), Math.max(1.5, 0.13 * PX), 0, Math.PI * 2); g.fill(); };
    rect(-HL, -HW, HL, HW); line(0, -HW, 0, HW); arc(0, 0, 9.15, 0, Math.PI * 2); spot(0, 0);
    for (const s of [-1, 1]) {
      const gx = s * HL;
      rect(s < 0 ? gx : gx - 16.5, -20.16, s < 0 ? gx + 16.5 : gx, 20.16);
      rect(s < 0 ? gx : gx - 5.5, -9.16, s < 0 ? gx + 5.5 : gx, 9.16);
      spot(gx - s * 11, 0);
      const a = Math.acos(5.5 / 9.15);
      arc(gx - s * 11, 0, 9.15, s < 0 ? -a : Math.PI - a, s < 0 ? a : Math.PI + a);
    }
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = q.aniso;
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(L + 2 * AX, W + 2 * AZ), new THREE.MeshLambertMaterial({ map: tex }));
    ground.rotation.x = -Math.PI / 2; scene.add(ground);
    const apron = new THREE.Mesh(new THREE.PlaneGeometry(300, 260), new THREE.MeshLambertMaterial({ color: 0x2b3038 }));
    apron.rotation.x = -Math.PI / 2; apron.position.y = -0.02; scene.add(apron); }

  // goals and corner flags
  const white = new THREE.MeshLambertMaterial({ color: 0xffffff });
  const netMat = new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false });
  for (const s of [-1, 1]) {
    const g = new THREE.Group();
    const post = (h) => new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, h, 10), white);
    const l = post(2.44); l.position.set(0, 1.22, -3.66); g.add(l);
    const r = post(2.44); r.position.set(0, 1.22, 3.66); g.add(r);
    const bar = post(7.5); bar.rotation.x = Math.PI / 2; bar.position.set(0, 2.44, 0); g.add(bar);
    const back = new THREE.Mesh(new THREE.PlaneGeometry(7.32, 2.44), netMat); back.rotation.y = Math.PI / 2; back.position.set(s * 2, 1.22, 0); g.add(back);
    const roof = new THREE.Mesh(new THREE.PlaneGeometry(2, 7.32), netMat); roof.rotation.x = -Math.PI / 2; roof.position.set(s, 2.44, 0); g.add(roof);
    for (const t of [-1, 1]) { const side = new THREE.Mesh(new THREE.PlaneGeometry(2, 2.44), netMat); side.position.set(s, 1.22, t * 3.66); g.add(side); }
    g.position.x = s * HL; scene.add(g);
  }
  const flagMat = new THREE.MeshBasicMaterial({ color: 0xe32222, side: THREE.DoubleSide });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const p = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.6, 6), white); p.position.set(sx * HL, 0.8, sz * HW); scene.add(p);
    const f = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.4), flagMat); f.position.set(sx * HL - sx * 0.3, 1.4, sz * HW); scene.add(f);
  }

  // stands: far side and both ends, joined by curved corners; the crowd is instanced
  const concrete = new THREE.MeshLambertMaterial({ color: 0x5b6470 });
  const seatA = new THREE.MeshLambertMaterial({ color: 0x1f3c88 });
  const roofMat = new THREE.MeshLambertMaterial({ color: 0x2b313a });
  const wallMat = new THREE.MeshLambertMaterial({ color: 0x5b6470, side: THREE.DoubleSide });
  const people = [];
  const { rows, fill } = q;
  const rise = 0.5 * (26 / rows), depth = 0.9 * (26 / rows), base = 1.4; // same height and depth with fewer rows
  function stand(origin, along, out, length) {
    const ax = along.clone().normalize(), ox = out.clone().normalize();
    const rot = Math.atan2(ax.x, ax.z) - Math.PI / 2;
    for (let r = 0; r < rows; r++) {
      const step = new THREE.Mesh(new THREE.BoxGeometry(length, base + (r + 1) * rise, depth), r % 2 ? concrete : seatA);
      step.position.copy(origin.clone().addScaledVector(ox, r * depth + depth / 2).addScaledVector(ax, length / 2).add(v3(0, (base + (r + 1) * rise) / 2, 0)));
      step.rotation.y = rot; scene.add(step);
      const per = Math.floor(length / q.spacing);
      for (let i = 0; i < per; i++) {
        if (rnd() > fill) continue;
        const p = origin.clone().addScaledVector(ox, r * depth + depth * 0.45).addScaledVector(ax, (i + 0.5) * (length / per)).add(v3(0, base + (r + 1) * rise + 0.3, 0));
        people.push([p.x, p.y, p.z, rot]);
      }
    }
    const topY = base + rows * rise;
    const wall = new THREE.Mesh(new THREE.BoxGeometry(length, topY + 7, 0.6), concrete);
    wall.position.copy(origin.clone().addScaledVector(ox, rows * depth + 0.3).addScaledVector(ax, length / 2).add(v3(0, (topY + 7) / 2, 0))); wall.rotation.y = rot; scene.add(wall);
    const roof = new THREE.Mesh(new THREE.BoxGeometry(length, 0.4, rows * depth * 0.8), roofMat);
    roof.position.copy(origin.clone().addScaledVector(ox, rows * depth * 0.6).addScaledVector(ax, length / 2).add(v3(0, topY + 6.5, 0))); roof.rotation.y = rot; scene.add(roof);
  }
  function corner(cx, cz, a0) {
    const sector = (r0, r1) => { const sh = new THREE.Shape(); sh.absarc(0, 0, r1, a0, a0 + Math.PI / 2, false); sh.absarc(0, 0, r0, a0 + Math.PI / 2, a0, true); return sh; };
    const solid = (shape, h, y, mat) => {
      const g = new THREE.ExtrudeGeometry(shape, { depth: h, bevelEnabled: false, curveSegments: q.curve });
      g.rotateX(-Math.PI / 2); const m = new THREE.Mesh(g, mat); m.position.set(cx, y, cz); scene.add(m);
    };
    for (let r = 0; r < rows; r++) {
      solid(sector(r * depth + 0.001, (r + 1) * depth), base + (r + 1) * rise, 0, r % 2 ? concrete : seatA);
      const R = r * depth + depth * 0.45, per = Math.floor((Math.PI / 2) * R / q.spacing);
      for (let i = 0; i < per; i++) {
        if (rnd() > fill) continue;
        const t = a0 + (i + 0.5) / per * (Math.PI / 2);
        people.push([cx + Math.cos(t) * R, base + (r + 1) * rise + 0.3, cz - Math.sin(t) * R, Math.PI / 2 - t]);
      }
    }
    const topY = base + rows * rise, Rw = rows * depth + 0.3;
    const wall = new THREE.Mesh(new THREE.CylinderGeometry(Rw, Rw, topY + 7, q.curve, 1, true, Math.PI / 2 + a0, Math.PI / 2), wallMat);
    wall.position.set(cx, (topY + 7) / 2, cz); scene.add(wall);
    solid(sector(rows * depth * 0.2, rows * depth + 0.6), 0.4, topY + 6.3, roofMat);
  }
  const FAR = HW + 7, END = HL + 9, NEAR = HW + 4;
  stand(v3(-END, 0, -FAR), v3(1, 0, 0), v3(0, 0, -1), 2 * END);
  stand(v3(-END, 0, NEAR), v3(0, 0, -1), v3(-1, 0, 0), NEAR + FAR);
  stand(v3(END, 0, -FAR), v3(0, 0, 1), v3(1, 0, 0), NEAR + FAR);
  corner(END, -FAR, 0);
  corner(-END, -FAR, Math.PI / 2);
  { const shirts = [0xc8102e, 0xffffff, 0x1d3f8f, 0xf2c200, 0x111111, 0xe35d1b, 0x0f8a5f];
    const skins = [0xf1c27d, 0xe0ac69, 0xc68642, 0x8d5524, 0xffdbac];
    const body = new THREE.InstancedMesh(new THREE.BoxGeometry(0.46, 0.6, 0.32), new THREE.MeshLambertMaterial(), people.length);
    const head = new THREE.InstancedMesh(new THREE.BoxGeometry(0.26, 0.26, 0.26), new THREE.MeshLambertMaterial(), people.length);
    const o = new THREE.Object3D(), col = new THREE.Color();
    people.forEach(([x, y, z, ry], i) => {
      o.position.set(x, y, z); o.rotation.set(0, ry, 0); o.updateMatrix(); body.setMatrixAt(i, o.matrix);
      o.position.y = y + 0.45; o.updateMatrix(); head.setMatrixAt(i, o.matrix);
      body.setColorAt(i, col.setHex(shirts[Math.floor(rnd() * shirts.length)]));
      head.setColorAt(i, col.setHex(skins[Math.floor(rnd() * skins.length)]));
    });
    scene.add(body, head); }

  // BET62 boards along the stands (none on the open side)
  { const c = document.createElement('canvas'); c.width = 512; c.height = 64; const g = c.getContext('2d');
    g.fillStyle = '#10161d'; g.fillRect(0, 0, 512, 64); g.font = 'italic 900 40px Arial'; g.textBaseline = 'middle';
    const wb = g.measureText('BET').width, w6 = g.measureText('62').width;
    for (let i = 0; i < 2; i++) { const x = i * 256 + (256 - wb - w6) / 2; g.fillStyle = '#fff'; g.fillText('BET', x, 34); g.fillStyle = '#9fb2c8'; g.fillText('62', x + wb, 34); g.fillStyle = '#42946b'; g.fillRect(i * 256 + 2, 10, 4, 44); }
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.wrapS = THREE.RepeatWrapping;
    const board = (len, x, z, ry) => {
      const t = tex.clone(); t.needsUpdate = true; t.repeat.set(len / 14, 1);
      const m = new THREE.Mesh(new THREE.BoxGeometry(len, 1, 0.15), [concrete, concrete, concrete, concrete, new THREE.MeshBasicMaterial({ map: t, toneMapped: false }), concrete]);
      m.position.set(x, 0.5, z); m.rotation.y = ry; scene.add(m);
    };
    board(L + 6, 0, -HW - 4, 0); board(W + 4, -HL - 5, 0, Math.PI / 2); board(W + 4, HL + 5, 0, -Math.PI / 2); }

  // floodlights behind the far corners
  for (const sx of [-1, 1]) {
    const x = sx * (HL + 22), z = -(HW + 24);
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.8, 44, 8), concrete); mast.position.set(x, 22, z); scene.add(mast);
    const panel = new THREE.Mesh(new THREE.BoxGeometry(9, 4, 0.6), new THREE.MeshBasicMaterial({ color: 0xfff6dc, toneMapped: false }));
    panel.position.set(x, 44, z); panel.lookAt(0, 0, 0); scene.add(panel);
  }
}

/**
 * Builds the 3D pitch in `host` (an element sized by the page). Returns
 * { setBall({ x, y, side, tier, situation, instant, resting, hidden }), destroy() }, or null without WebGL.
 * `onFrame({ x, y, visible })` gets, on every drawn frame, where the ball's label goes (in % of the box).
 */
export function createPitch3D(host, { quality = 'high', onFrame = () => {} } = {}) {
  const q = quality === 'low'
    ? { rows: 12, fill: 0.6, spacing: 0.75, px: 9, aniso: 2, curve: 10, dpr: 1.25, aa: false }
    : { rows: 20, fill: 0.85, spacing: 0.62, px: 16, aniso: 8, curve: 18, dpr: 2, aa: true };
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: q.aa, powerPreference: 'low-power' });
    if (!renderer.getContext()) throw new Error('no context');
  } catch {
    return null;
  }
  renderer.setPixelRatio(Math.min(q.dpr, window.devicePixelRatio || 1));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  const canvas = renderer.domElement;
  canvas.className = 'trk3d-canvas';
  host.append(canvas);

  const scene = new THREE.Scene();
  buildStadium(scene, q);
  const camera = new THREE.PerspectiveCamera(40, 16 / 9, 0.5, 600);
  // TV camera above the open side, steep enough that the pitch fills the box with the stands behind it.
  camera.position.set(0, 60, HW + 64);
  camera.lookAt(0, 0, 4);

  // the ball, its shadow, the trail and the attacking zone
  const ballTex = (() => {
    const c = document.createElement('canvas'); c.width = 128; c.height = 64; const g = c.getContext('2d');
    g.fillStyle = '#f4f6f8'; g.fillRect(0, 0, 128, 64); g.fillStyle = '#15191d';
    for (const [x, y] of [[16, 32], [48, 14], [48, 50], [80, 32], [112, 14], [112, 50]]) { g.beginPath(); for (let k = 0; k < 5; k++) { const a = k * 2 * Math.PI / 5 - Math.PI / 2; g.lineTo(x + 8 * Math.cos(a), y + 8 * Math.sin(a)); } g.fill(); }
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  })();
  const ball = new THREE.Mesh(new THREE.SphereGeometry(BR, 24, 16), new THREE.MeshLambertMaterial({ map: ballTex }));
  const shadow = new THREE.Mesh(new THREE.CircleGeometry(BR * 1.1, 20), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35, depthWrite: false }));
  shadow.rotation.x = -Math.PI / 2;
  scene.add(ball, shadow);
  const zoneTex = (() => { const c = document.createElement('canvas'); c.width = 128; c.height = 2; const g = c.getContext('2d');
    const gr = g.createLinearGradient(0, 0, 128, 0); gr.addColorStop(0, 'rgba(255,255,255,0.15)'); gr.addColorStop(1, 'rgba(255,255,255,1)');
    g.fillStyle = gr; g.fillRect(0, 0, 128, 2); return new THREE.CanvasTexture(c); })();
  const zone = new THREE.Mesh(new THREE.PlaneGeometry(1, W), new THREE.MeshBasicMaterial({ map: zoneTex, transparent: true, depthWrite: false }));
  zone.rotation.x = -Math.PI / 2; zone.position.y = 0.04; scene.add(zone);
  const trailMat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, toneMapped: false });
  let trail = null;

  // motion state
  const pos = new THREE.Vector3(0, BR, 0);
  let move = null; // { from, to, air, at, hot }
  let zoneState = { side: 'home', tier: 'neutral', hidden: true };
  let hidden = true;
  let raf = 0;
  let onScreen = true;

  function placeAt(p) { ball.position.copy(p); shadow.position.set(p.x, 0.05, p.z); shadow.scale.setScalar(Math.max(0.4, 1 - (p.y - BR) / 12)); }
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
  function pointOf(m, k) {
    const e = m.air ? k : ease(k);
    const p = m.from.clone().lerp(m.to, e);
    p.y = BR + (m.air ? Math.sin(Math.PI * e) * m.air : 0);
    return p;
  }
  function styleZone(now) {
    const { side, tier } = zoneState;
    if (zoneState.hidden || hidden) { zone.visible = false; return false; }
    const s = zoneStyle(tier);
    const from = side === 'away' ? HL : -HL;
    const len = Math.max(0.5, Math.abs(pos.x - from));
    zone.visible = true;
    zone.scale.x = len; zone.position.x = (from + pos.x) / 2; zone.rotation.z = side === 'away' ? Math.PI : 0;
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
      pos.copy(pointOf(move, k));
      ball.rotation.x -= 0.25 * (1 - k); ball.rotation.z += 0.08 * (1 - k);
      busy = k < 1;
    }
    ball.visible = shadow.visible = !hidden;
    placeAt(pos);
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
    camera.aspect = w / h;
    camera.fov = fovFor(camera.aspect);
    camera.updateProjectionMatrix();
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
      hidden = !!hide;
      zoneState = { side, tier, hidden: hidden || resting };
      if (!hidden) {
        const p = pitchPoint(x, y);
        const to = new THREE.Vector3(p.x, BR, p.z);
        if (instant || to.distanceTo(pos) < 0.2) { move = null; pos.copy(to); }
        else {
          const from = pos.clone(); from.y = BR;
          move = { from, to, air: flightHeight({ x: from.x, z: from.z }, p, situation), at: performance.now(), hot: tier === 'danger' };
        }
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
