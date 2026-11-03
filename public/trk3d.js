// The football mini-pitch in 3D: the stadium (stands as an upside-down U, joined at the far
// corners, the near side — the technical staff's — open so the whole pitch is seen), with the ball
// the live tracker moves: it glides between fixes (in the air for long balls and shots) with a
// white→red trail, and the attacking side's zone lights up to it, as the 2D arrow does.
// Loaded only when a live football tracker is shown; draws only while something moves, and not at
// all when the tab is hidden or the pitch is off screen. createPitch3D returns null when the device
// has no WebGL: the page then keeps the 2D pitch.

import * as THREE from './vendor/three-0.169.0.module.min.js';
import { PITCH, pitchPoint, flightHeight, zoneStyle, arrowShape, fovFor, glidePoint } from './trk3dmath.js';

const { L, W } = PITCH;
const HL = L / 2, HW = W / 2;
const MOVE_MS = 900;    // a fix's glide (the 2D ball's transition)
const TRAIL_MS = 1400;  // how long a trail stays after the ball arrives
const CAM_FOV = 48;     // the TV camera's view (16:9), wide enough for the four lines and the corner flags
const BR = 1.35;        // the ball, drawn bigger than life so it reads in a small box

function seeded(seed) { let x = seed; return () => { x = (x * 1664525 + 1013904223) % 4294967296; return x / 4294967296; }; }

/** The stadium (built once per pitch). `q` = quality settings. */
function buildStadium(scene, q, maxAniso = 4) {
  q = { ...q, aniso: Math.min(q.aniso, maxAniso) };
  const v3 = (x, y, z) => new THREE.Vector3(x, y, z);
  const rnd = seeded(62);
  // sky
  { const c = document.createElement('canvas'); c.width = 2; c.height = 128;
    const g = c.getContext('2d'); const gr = g.createLinearGradient(0, 0, 0, 128);
    gr.addColorStop(0, '#02050d'); gr.addColorStop(0.35, '#0a1630'); gr.addColorStop(0.7, '#1d3358'); gr.addColorStop(1, '#3a5a86');
    g.fillStyle = gr; g.fillRect(0, 0, 2, 128);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; scene.background = t; }
  // floodlit at night: a cool sky light and the roof lights from all round
  scene.add(new THREE.HemisphereLight(0x7d95c4, 0x1c2a1c, 0.55));
  for (const [x, z] of [[-60, -60], [60, -60], [-70, 40], [70, 40]]) { const d = new THREE.DirectionalLight(0xf2f6ff, 1.0); d.position.set(x, 60, z); scene.add(d); }

  // pitch: stripes and lines on a canvas
  { const PX = q.px, AX = 14, AZ = 40; // striped grass far beyond the lines (the open side is all grass)
    const cw = Math.round((L + 2 * AX) * PX), ch = Math.round((W + 2 * AZ) * PX);
    const c = document.createElement('canvas'); c.width = cw; c.height = ch; const g = c.getContext('2d');
    const X = (x) => (x + HL + AX) * PX, Z = (z) => (z + HW + AZ) * PX;
    for (let i = 0; i < 18; i++) { g.fillStyle = i % 2 ? '#2f7a33' : '#3b8d3d'; g.fillRect(i * cw / 18, 0, cw / 18 + 1, ch); }
    for (let i = 0, n = Math.min(70000, cw * ch / 40); i < n; i++) { g.fillStyle = `rgba(${rnd() < .5 ? '0,0,0' : '255,255,255'},${rnd() * 0.045})`; g.fillRect(rnd() * cw, rnd() * ch, 2, 2); }
    g.strokeStyle = 'rgba(255,255,255,.93)'; g.lineWidth = Math.max(1.5, 0.14 * PX);
    const line = (x1, z1, x2, z2) => { g.beginPath(); g.moveTo(X(x1), Z(z1)); g.lineTo(X(x2), Z(z2)); g.stroke(); };
    const rect = (x1, z1, x2, z2) => g.strokeRect(X(x1), Z(z1), (x2 - x1) * PX, (z2 - z1) * PX);
    const arc = (x, z, r, a0, a1) => { g.beginPath(); g.arc(X(x), Z(z), r * PX, a0, a1); g.stroke(); };
    const spot = (x, z) => { g.fillStyle = '#fff'; g.beginPath(); g.arc(X(x), Z(z), Math.max(1.5, 0.13 * PX), 0, Math.PI * 2); g.fill(); };
    rect(-HL, -HW, HL, HW); line(0, -HW, 0, HW); arc(0, 0, 9.15, 0, Math.PI * 2); spot(0, 0);
    // BET62 faint in the centre circle (painted on the grass, as a sponsor's logo)
    { g.save(); g.globalAlpha = 0.2; g.font = `900 ${Math.round(5.2 * PX)}px system-ui, -apple-system, 'Segoe UI', Arial, sans-serif`;
      g.textBaseline = 'middle'; const wb = g.measureText('BET').width, w6 = g.measureText('62').width;
      const x0 = X(0) - (wb + w6) / 2, y0 = Z(0);
      g.fillStyle = '#ffffff'; g.fillText('BET', x0, y0); g.fillStyle = '#9fb2c8'; g.fillText('62', x0 + wb, y0); g.restore(); }
    for (const s of [-1, 1]) {
      const gx = s * HL;
      rect(s < 0 ? gx : gx - 16.5, -20.16, s < 0 ? gx + 16.5 : gx, 20.16);
      rect(s < 0 ? gx : gx - 5.5, -9.16, s < 0 ? gx + 5.5 : gx, 9.16);
      spot(gx - s * 11, 0);
      const a = Math.acos(5.5 / 9.15);
      arc(gx - s * 11, 0, 9.15, s < 0 ? -a : Math.PI - a, s < 0 ? a : Math.PI + a);
    }
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = q.aniso;
    tex.generateMipmaps = true; tex.minFilter = THREE.LinearMipmapLinearFilter;
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(L + 2 * AX, W + 2 * AZ), new THREE.MeshLambertMaterial({ map: tex }));
    ground.rotation.x = -Math.PI / 2; scene.add(ground);
    // grass all round (the open side's foreground is grass, not concrete)
    const apron = new THREE.Mesh(new THREE.PlaneGeometry(300, 260), new THREE.MeshLambertMaterial({ color: 0x1b2a1c }));
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

  // The stadium of the banner's render (public/img/banner-estadio62.jpg): the far side and both ends
  // in two tiers with the crowd, roofs with a row of floodlights, their glow and soft beams, and the
  // BET62 boards; the near side is open so all four lines of the pitch are seen.
  const concrete = new THREE.MeshLambertMaterial({ color: 0x2a2f37 });
  const seatMat = new THREE.MeshLambertMaterial({ color: 0x1d2a44 });
  const roofMat = new THREE.MeshLambertMaterial({ color: 0x1a1f27 });
  const people = [];
  const low = q.rows < 20;
  const lowerRows = low ? 14 : 26, upperRows = low ? 10 : 18;
  const rowD = 0.85 * (26 / lowerRows), rowUp = 0.5 * (26 / lowerRows);
  const upD = 0.85 * (18 / upperRows), upUp = 0.5 * (18 / upperRows);
  const TIERS = [{ start: 0, rows: lowerRows, h: 1.0, d: rowD, up: rowUp }, { start: 26 * 0.85 + 4, rows: upperRows, h: 14, d: upD, up: upUp, ribbon: true }];
  const ROOF_H = 29; // lower than the render's, so the TV camera sees the whole pitch under it

  // BET62 boards (dark, BET white, 62 green)
  const led = document.createElement('canvas'); led.width = 1024; led.height = 64;
  { const g = led.getContext('2d'); g.fillStyle = '#04110a'; g.fillRect(0, 0, 1024, 64);
    g.font = 'italic 900 44px Arial'; g.textBaseline = 'middle';
    for (let i = 0; i < 4; i++) { const x = i * 256 + 40; g.fillStyle = '#ffffff'; g.fillText('BET', x, 34); g.fillStyle = '#7cff6b'; g.fillText('62', x + g.measureText('BET').width, 34); } }
  const ledTex = new THREE.CanvasTexture(led); ledTex.colorSpace = THREE.SRGBColorSpace; ledTex.wrapS = THREE.RepeatWrapping;
  const ledMat = (len, tone) => { const t = ledTex.clone(); t.needsUpdate = true; t.repeat.set(len / 24, 1); return new THREE.MeshBasicMaterial({ map: t, toneMapped: false, color: tone }); };
  const board = (len, x, z, ry) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(len, 0.9), ledMat(len, 0xbfbfbf)); m.position.set(x, 0.45, z); m.rotation.y = ry; scene.add(m); };
  board(L + 10, 0, -(W / 2 + 4), 0); board(W + 6, -(L / 2 + 4.5), 0, Math.PI / 2); board(W + 6, L / 2 + 4.5, 0, -Math.PI / 2);

  function stand({ side, base: b0, length }) {
    const far = side === 'far', sx = side === 'west' ? -1 : 1;
    const put = (m, out, y, along = 0) => { if (far) m.position.set(along, y, -out); else m.position.set(sx * out, y, along); scene.add(m); };
    for (const t of TIERS) {
      for (let r = 0; r < t.rows; r++) {
        const out = b0 + t.start + r * t.d, up = t.h + r * t.up, len = length(out);
        const n = Math.floor(len / q.spacing);
        for (let i = 0; i < n; i++) {
          if (rnd() > q.fill) continue;
          const along = ((i + 0.5) / n - 0.5) * len + (rnd() - 0.5) * 0.12, y = up + 0.3 + rnd() * 0.12;
          if (far) people.push([along, y, -out, 0]); else people.push([sx * out, y, along, -sx * Math.PI / 2]);
        }
        put(new THREE.Mesh(new THREE.BoxGeometry(far ? len : t.d, 0.5, far ? t.d : len), r % 2 ? concrete : seatMat), out, up);
      }
      const front = b0 + t.start, len = length(front);
      put(new THREE.Mesh(new THREE.BoxGeometry(far ? len : 0.4, t.h + 0.25, far ? 0.4 : len), concrete), front - 0.6, (t.h + 0.25) / 2);
      if (t.ribbon) { const rb = new THREE.Mesh(new THREE.PlaneGeometry(len, 0.8), ledMat(len, 0x9a9a9a)); if (!far) rb.rotation.y = -sx * Math.PI / 2; put(rb, front - 0.39, t.h - 0.2); }
    }
  }
  stand({ side: 'far', base: W / 2 + 7, length: (o) => L + 14 + (o - 41) * 1.1 });
  stand({ side: 'west', base: L / 2 + 8, length: (o) => W + 14 + (o - 60) * 1.1 });
  stand({ side: 'east', base: L / 2 + 8, length: (o) => W + 14 + (o - 60) * 1.1 });
  { const CLOTH = [0xd8d8d8, 0x1c1c1c, 0x2b3e6b, 0x8b1d1d, 0x3a5f3a, 0xb9b29a, 0x5a4a3a, 0x6d6d6d, 0xaa3333, 0xe8e2d0, 0x264d8c, 0x111111, 0x0a7a3e, 0xc9c9c9];
    const SKIN = [0xe0b899, 0xc68e6a, 0x8d5a3b, 0xf1d3bc, 0x5b3a29];
    const body = new THREE.InstancedMesh(new THREE.BoxGeometry(0.42, 0.62, 0.34), new THREE.MeshLambertMaterial(), people.length);
    const head = new THREE.InstancedMesh(new THREE.SphereGeometry(0.13, 6, 5), new THREE.MeshLambertMaterial(), people.length);
    const o = new THREE.Object3D(), col = new THREE.Color();
    people.forEach(([x, y, z, ry], i) => {
      o.position.set(x, y, z); o.rotation.set(0, ry, 0); o.scale.set(1, 0.9 + rnd() * 0.25, 1); o.updateMatrix(); body.setMatrixAt(i, o.matrix);
      o.position.y = y + 0.42; o.scale.set(1, 1, 1); o.updateMatrix(); head.setMatrixAt(i, o.matrix);
      body.setColorAt(i, col.setHex(CLOTH[Math.floor(rnd() * CLOTH.length)]).multiplyScalar(0.55 + rnd() * 0.45));
      head.setColorAt(i, col.setHex(SKIN[Math.floor(rnd() * SKIN.length)]).multiplyScalar(0.7));
    });
    scene.add(body, head); }

  // roofs with the floodlights: lamps, their glow, columns at the back; soft beams over the far side
  const gc = document.createElement('canvas'); gc.width = gc.height = 128;
  { const g = gc.getContext('2d'); const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(.15, 'rgba(225,238,255,.6)'); gr.addColorStop(1, 'rgba(200,220,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 128, 128); }
  const glowMat = new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(gc), color: 0xdde9ff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.9 });
  const lampMat = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }), lampGeo = new THREE.BoxGeometry(1.1, 0.5, 1.1);
  for (const side of ['far', 'west', 'east']) {
    const far = side === 'far', sx = side === 'west' ? -1 : 1, len = far ? 190 : 150, depth = 34, front = far ? W / 2 + 14 : L / 2 + 15;
    const at = (out, y, along) => (far ? v3(along, y, -out) : v3(sx * out, y, along));
    const r = new THREE.Mesh(new THREE.BoxGeometry(far ? len : depth, 1.2, far ? depth : len), roofMat); r.position.copy(at(front + depth / 2, ROOF_H, 0)); scene.add(r);
    const n = far ? 34 : 22;
    for (let i = 0; i < n; i++) {
      const p = at(front, ROOF_H - 0.9, ((i + 0.5) / n - 0.5) * (len - 20));
      const lamp = new THREE.Mesh(lampGeo, lampMat); lamp.position.copy(p); scene.add(lamp);
      const g = new THREE.Sprite(glowMat); g.position.copy(p); g.scale.setScalar(11); scene.add(g);
    }
    for (let i = 0; i <= 4; i++) { const c = new THREE.Mesh(new THREE.BoxGeometry(1.2, ROOF_H, 1.2), roofMat); c.position.copy(at(front + depth, ROOF_H / 2, (i / 4 - 0.5) * len)); scene.add(c); }
  }
  { const coneMat = new THREE.MeshBasicMaterial({ color: 0x9fbcff, transparent: true, opacity: 0.06, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    const geo = new THREE.ConeGeometry(14 * ROOF_H / 38, ROOF_H * 44 / 38, 24, 1, true);
    for (let i = 0; i < 9; i++) { const c = new THREE.Mesh(geo, coneMat); c.position.set((i / 8 - 0.5) * 150, ROOF_H / 2, -(W / 2 + 2)); c.rotation.x = -0.45; scene.add(c); } }
}

/**
 * Builds the 3D pitch in `host` (an element sized by the page). Returns
 * { setBall({ x, y, side, tier, situation, instant, resting, hidden }), destroy() }, or null without WebGL.
 * `onFrame({ x, y, visible })` gets, on every drawn frame, where the ball's label goes (in % of the box).
 */
export function createPitch3D(host, { quality = 'high', onFrame = () => {} } = {}) {
  // Sharp on every screen: drawn at the screen's full pixel density (up to 3×, retina / 4K) with
  // antialiasing and fine textures; phones keep a lighter crowd. It draws only while the ball moves.
  const q = quality === 'low'
    ? { rows: 14, fill: 0.7, spacing: 0.7, px: 16, aniso: 16, curve: 14, dpr: 3, aa: true }
    : { rows: 20, fill: 0.85, spacing: 0.62, px: 22, aniso: 16, curve: 20, dpr: 3, aa: true };
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
  renderer.toneMappingExposure = 1.1;
  const canvas = renderer.domElement;
  canvas.className = 'trk3d-canvas';
  host.append(canvas);

  const scene = new THREE.Scene();
  buildStadium(scene, q, renderer.capabilities.getMaxAnisotropy());
  const camera = new THREE.PerspectiveCamera(40, 16 / 9, 0.5, 600);
  // TV camera from the open side, at the banner render's angle (the far stand and its floodlights in
  // front), high and far enough back that all four lines and the corner flags are in view.
  camera.position.set(0, 40, HW + 62);
  camera.lookAt(0, 2, -12);

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
    camera.aspect = w / h;
    camera.fov = fovFor(camera.aspect, CAM_FOV);
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
