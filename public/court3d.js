// The 3D mini-courts (tennis, basketball, cricket), built on the same engine and layout as the football
// pitch (trk3d.js): a three.js stadium with stands, crowd, floodlights and BET62 boards, a TV camera
// above the open near side, and a ball that glides to the live position with a trail and a shadow. The
// court lies HORIZONTALLY — its length runs along X (left→right), its width along Z (near→far) — just
// like the football pitch. A live fix is a normalised { x, y } (x along the length, y across the width).
// createCourt3D returns null without WebGL.

import * as THREE from './vendor/three-0.169.0.module.min.js';

const seeded = (s) => () => { s = (s * 1664525 + 1013904223) % 4294967296; return s / 4294967296; };
const hex6 = (n) => `#${(n >>> 0).toString(16).padStart(6, '0').slice(-6)}`;
function shade(hex, amt) { let r = (hex >> 16) & 255, g = (hex >> 8) & 255, b = hex & 255; const f = (v) => Math.max(0, Math.min(255, Math.round(v + 255 * amt))); return (f(r) << 16) | (f(g) << 8) | f(b); }

// Per sport: court size (m, length × width), surface + line colours, the ball, camera framing.
const COURTS = {
  tennis: { L: 23.77, W: 10.97, apron: 4, surface: 0x2f6fb0, line: 0xffffff, ballColor: 0xc8ff32, ballR: 0.42, elev: 30, fov: 32 },
  basketball: { L: 28, W: 15, apron: 3.5, surface: 0xb5703a, line: 0xf3e6d6, ballColor: 0xe8742a, ballR: 0.5, elev: 31, fov: 34 },
  cricket: { L: 46, W: 46, apron: 2, surface: 0x2f8f57, line: 0xffffff, ballColor: 0xe02a2a, ballR: 0.9, elev: 38, fov: 34, oval: true },
};

/** The court markings drawn on a landscape canvas: X is the length, Z the width. */
function surfaceTexture(sport) {
  const C = COURTS[sport], PX = 22, HL = C.L / 2, HW = C.W / 2;
  const cw = Math.round((C.L + 2 * C.apron) * PX), ch = Math.round((C.W + 2 * C.apron) * PX);
  const cv = document.createElement('canvas'); cv.width = cw; cv.height = ch; const g = cv.getContext('2d');
  const X = (x) => (x + HL + C.apron) * PX, Z = (z) => (z + HW + C.apron) * PX, rnd = seeded(62);
  g.fillStyle = hex6(shade(C.surface, -0.3)); g.fillRect(0, 0, cw, ch);
  if (C.oval) { g.fillStyle = hex6(C.surface); g.beginPath(); g.ellipse(cw / 2, ch / 2, (HL + 1) * PX, (HW + 1) * PX, 0, 0, Math.PI * 2); g.fill(); }
  else { g.fillStyle = hex6(C.surface); g.fillRect(X(-HL - 2), Z(-HW - 2), (C.L + 4) * PX, (C.W + 4) * PX); }
  for (let i = 0, n = cw * ch / 70; i < n; i++) { g.fillStyle = `rgba(${rnd() < .5 ? '0,0,0' : '255,255,255'},${rnd() * 0.04})`; g.fillRect(rnd() * cw, rnd() * ch, 2, 2); }
  g.strokeStyle = hex6(C.line); g.lineWidth = Math.max(2, 0.08 * PX); g.lineJoin = 'round';
  const line = (x1, z1, x2, z2) => { g.beginPath(); g.moveTo(X(x1), Z(z1)); g.lineTo(X(x2), Z(z2)); g.stroke(); };
  const rect = (x1, z1, x2, z2) => g.strokeRect(X(x1), Z(z1), (x2 - x1) * PX, (z2 - z1) * PX);
  const arc = (x, z, r) => { g.beginPath(); g.ellipse(X(x), Z(z), r * PX, r * PX, 0, 0, Math.PI * 2); g.stroke(); };
  if (sport === 'tennis') {
    rect(-HL, -HW, HL, HW); const sw = 1.37;
    line(-HL, -HW + sw, HL, -HW + sw); line(-HL, HW - sw, HL, HW - sw); // singles lines (along length)
    line(0, -HW, 0, HW); // net
    line(-6.4, -HW + sw, -6.4, HW - sw); line(6.4, -HW + sw, 6.4, HW - sw); // service lines
    line(-6.4, 0, 6.4, 0); // centre service line
  } else if (sport === 'basketball') {
    rect(-HL, -HW, HL, HW); line(0, -HW, 0, HW); arc(0, 0, 1.8);
    for (const s of [-1, 1]) { const x = s * HL; rect(x, -2.45, x - s * 5.8, 2.45); arc(x - s * 6.75, 0, 4.1); }
  } else if (sport === 'cricket') {
    arc(0, 0, 0); g.beginPath(); g.ellipse(cw / 2, ch / 2, HL * PX, HW * PX, 0, 0, Math.PI * 2); g.stroke(); // boundary
    g.fillStyle = hex6(shade(C.surface, 0.14)); g.fillRect(X(-10), Z(-1.5), 20 * PX, 3 * PX); g.strokeRect(X(-10), Z(-1.5), 20 * PX, 3 * PX); // pitch strip
  }
  g.save(); g.globalAlpha = 0.16; g.font = `900 ${Math.round(1.8 * PX)}px system-ui, Arial, sans-serif`; g.textBaseline = 'middle';
  const wb = g.measureText('BET').width, w6 = g.measureText('62').width, x0 = cw / 2 - (wb + w6) / 2, y0 = ch / 2;
  g.fillStyle = '#fff'; g.fillText('BET', x0, y0); g.fillStyle = '#b4ff2e'; g.fillText('62', x0 + wb, y0); g.restore();
  return cv;
}

function buildArena(scene, C, q, aniso) {
  const v3 = (x, y, z) => new THREE.Vector3(x, y, z), rnd = seeded(7);
  const HL = C.L / 2, HW = C.W / 2;
  { const c = document.createElement('canvas'); c.width = 2; c.height = 128; const g = c.getContext('2d');
    const gr = g.createLinearGradient(0, 0, 0, 128); gr.addColorStop(0, '#0b1626'); gr.addColorStop(0.6, '#1f3550'); gr.addColorStop(1, '#43617d');
    g.fillStyle = gr; g.fillRect(0, 0, 2, 128); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; scene.background = t; }
  scene.add(new THREE.HemisphereLight(0xcfe4ff, 0x20331f, 1.15));
  const key = new THREE.DirectionalLight(0xffffff, 1.9); key.position.set(-30, 80, 40); scene.add(key);
  // surface (length along X, width along Z) + grass apron
  const tex = new THREE.CanvasTexture(surfaceTexture(scene.__sport)); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = aniso; tex.minFilter = THREE.LinearMipmapLinearFilter;
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(C.L + 2 * C.apron, C.W + 2 * C.apron), new THREE.MeshLambertMaterial({ map: tex }));
  ground.rotation.x = -Math.PI / 2; scene.add(ground);
  const apron = new THREE.Mesh(new THREE.PlaneGeometry(400, 360), new THREE.MeshLambertMaterial({ color: 0x25402c })); apron.rotation.x = -Math.PI / 2; apron.position.y = -0.03; scene.add(apron);
  // stands: far long side + both ends, near long side open (the camera's side) — the football layout
  const concrete = new THREE.MeshLambertMaterial({ color: 0x5b6470 }), seat = new THREE.MeshLambertMaterial({ color: 0x1f3c88 }), roofMat = new THREE.MeshLambertMaterial({ color: 0x2b313a }), wallMat = new THREE.MeshLambertMaterial({ color: 0x5b6470, side: THREE.DoubleSide });
  const people = [], rows = q.rows, rise = 0.32, depth = 0.8, base = 0.7;
  function stand(origin, along, out, length) {
    const ax = along.clone().normalize(), ox = out.clone().normalize(), rot = Math.atan2(ax.x, ax.z) - Math.PI / 2;
    for (let r = 0; r < rows; r++) {
      const step = new THREE.Mesh(new THREE.BoxGeometry(length, base + (r + 1) * rise, depth), r % 2 ? concrete : seat);
      step.position.copy(origin.clone().addScaledVector(ox, r * depth + depth / 2).addScaledVector(ax, length / 2).add(v3(0, (base + (r + 1) * rise) / 2, 0))); step.rotation.y = rot; scene.add(step);
      const per = Math.floor(length / 0.7);
      for (let i = 0; i < per; i++) { if (rnd() > q.fill) continue; const p = origin.clone().addScaledVector(ox, r * depth + depth * 0.45).addScaledVector(ax, (i + 0.5) * (length / per)).add(v3(0, base + (r + 1) * rise + 0.3, 0)); people.push([p.x, p.y, p.z, rot]); }
    }
    const topY = base + rows * rise; const wall = new THREE.Mesh(new THREE.BoxGeometry(length, topY + 2.5, 0.6), concrete);
    wall.position.copy(origin.clone().addScaledVector(ox, rows * depth + 0.3).addScaledVector(ax, length / 2).add(v3(0, (topY + 2.5) / 2, 0))); wall.rotation.y = rot; scene.add(wall);
    const roof = new THREE.Mesh(new THREE.BoxGeometry(length, 0.4, rows * depth * 0.8), roofMat);
    roof.position.copy(origin.clone().addScaledVector(ox, rows * depth * 0.6).addScaledVector(ax, length / 2).add(v3(0, topY + 2.2, 0))); roof.rotation.y = rot; scene.add(roof);
  }
  function corner(cx, cz, a0) {
    const sector = (r0, r1) => { const sh = new THREE.Shape(); sh.absarc(0, 0, r1, a0, a0 + Math.PI / 2, false); sh.absarc(0, 0, r0, a0 + Math.PI / 2, a0, true); return sh; };
    const solid = (shape, h, y, mat) => { const gg = new THREE.ExtrudeGeometry(shape, { depth: h, bevelEnabled: false, curveSegments: 16 }); gg.rotateX(-Math.PI / 2); const m = new THREE.Mesh(gg, mat); m.position.set(cx, y, cz); scene.add(m); };
    for (let r = 0; r < rows; r++) { solid(sector(r * depth + 0.001, (r + 1) * depth), base + (r + 1) * rise, 0, r % 2 ? concrete : seat);
      const R = r * depth + depth * 0.45, per = Math.floor((Math.PI / 2) * R / 0.75); for (let i = 0; i < per; i++) { if (rnd() > q.fill) continue; const t = a0 + (i + 0.5) / per * (Math.PI / 2); people.push([cx + Math.cos(t) * R, base + (r + 1) * rise + 0.3, cz - Math.sin(t) * R, Math.PI / 2 - t]); } }
    const topY = base + rows * rise, Rw = rows * depth + 0.3; const wall = new THREE.Mesh(new THREE.CylinderGeometry(Rw, Rw, topY + 2.5, 16, 1, true, Math.PI / 2 + a0, Math.PI / 2), wallMat); wall.position.set(cx, (topY + 2.5) / 2, cz); scene.add(wall);
  }
  const FAR = HW + C.apron + 3, END = HL + C.apron + 4, NEAR = HW + C.apron + 1;
  stand(v3(-END, 0, -FAR), v3(1, 0, 0), v3(0, 0, -1), 2 * END); // far long side
  stand(v3(-END, 0, NEAR), v3(0, 0, -1), v3(-1, 0, 0), NEAR + FAR); // left end
  stand(v3(END, 0, -FAR), v3(0, 0, 1), v3(1, 0, 0), NEAR + FAR); // right end
  corner(END, -FAR, 0); corner(-END, -FAR, Math.PI / 2);
  { const shirts = [0xc8102e, 0xffffff, 0x1d3f8f, 0xf2c200, 0x111111, 0xe35d1b, 0x0f8a5f], skins = [0xf1c27d, 0xe0ac69, 0xc68642, 0x8d5524];
    const body = new THREE.InstancedMesh(new THREE.BoxGeometry(0.44, 0.58, 0.3), new THREE.MeshLambertMaterial(), people.length), head = new THREE.InstancedMesh(new THREE.BoxGeometry(0.25, 0.25, 0.25), new THREE.MeshLambertMaterial(), people.length);
    const o = new THREE.Object3D(), col = new THREE.Color();
    people.forEach(([x, y, z, ry], i) => { o.position.set(x, y, z); o.rotation.set(0, ry, 0); o.updateMatrix(); body.setMatrixAt(i, o.matrix); o.position.y = y + 0.44; o.updateMatrix(); head.setMatrixAt(i, o.matrix); body.setColorAt(i, col.setHex(shirts[Math.floor(rnd() * shirts.length)])); head.setColorAt(i, col.setHex(skins[Math.floor(rnd() * skins.length)])); });
    scene.add(body, head); }
  // BET62 boards along the far side
  { const c = document.createElement('canvas'); c.width = 1024; c.height = 128; const g = c.getContext('2d'); g.fillStyle = '#10161d'; g.fillRect(0, 0, 1024, 128); g.font = 'italic 900 80px Arial'; g.textBaseline = 'middle';
    const wb = g.measureText('BET').width, w6 = g.measureText('62').width; for (let i = 0; i < 2; i++) { const x = i * 512 + (512 - wb - w6) / 2; g.fillStyle = '#fff'; g.fillText('BET', x, 68); g.fillStyle = '#9fb2c8'; g.fillText('62', x + wb, 68); g.fillStyle = '#42946b'; g.fillRect(i * 512 + 4, 20, 8, 88); }
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = THREE.RepeatWrapping; t.repeat.set((2 * END) / 12, 1);
    const board = new THREE.Mesh(new THREE.BoxGeometry(2 * END, 1, 0.15), [concrete, concrete, concrete, concrete, new THREE.MeshBasicMaterial({ map: t, toneMapped: false }), concrete]); board.position.set(0, 0.5, -HW - C.apron - 0.6); scene.add(board); }
  for (const sx of [-1, 1]) { const x = sx * (HL + C.apron + 8), z = -(HW + C.apron + 10); const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.6, 16, 8), concrete); mast.position.set(x, 8, z); scene.add(mast);
    const panel = new THREE.Mesh(new THREE.BoxGeometry(4, 1.8, 0.5), new THREE.MeshBasicMaterial({ color: 0xfff6dc, toneMapped: false })); panel.position.set(x, 16, z); panel.lookAt(0, 0, 0); scene.add(panel); }
}

function buildProps(scene, C, sport) {
  const white = new THREE.MeshLambertMaterial({ color: 0xffffff }), HL = C.L / 2, HW = C.W / 2;
  if (sport === 'tennis') {
    const netMat = new THREE.MeshLambertMaterial({ color: 0xf2f2f2, transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false });
    const net = new THREE.Mesh(new THREE.PlaneGeometry(C.W + 1.4, 1.07), netMat); net.rotation.y = Math.PI / 2; net.position.set(0, 0.53, 0); scene.add(net);
    const tape = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.06, C.W + 1.4), white); tape.position.set(0, 1.07, 0); scene.add(tape);
    for (const s of [-1, 1]) { const post = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.07, 8), white); post.position.set(0, 0.53, s * (HW + 0.7)); scene.add(post); }
  } else if (sport === 'basketball') {
    for (const s of [-1, 1]) { const g = new THREE.Group(); const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 3.05, 8), white); pole.position.y = 1.52; g.add(pole);
      const board = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 1.05), new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true, opacity: 0.85, side: THREE.DoubleSide })); board.rotation.y = Math.PI / 2; board.position.set(-s * 0.4, 3.0, 0); g.add(board);
      const rim = new THREE.Mesh(new THREE.TorusGeometry(0.23, 0.03, 8, 20), new THREE.MeshLambertMaterial({ color: 0xe8742a })); rim.rotation.x = -Math.PI / 2; rim.position.set(-s * 0.6, 2.75, 0); g.add(rim);
      g.position.x = s * HL; scene.add(g); }
  } else if (sport === 'cricket') {
    for (const s of [-1, 1]) { const g = new THREE.Group(); for (const dz of [-0.1, 0, 0.1]) { const st = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.71, 6), white); st.position.set(0, 0.355, dz); g.add(st); } g.position.set(s * 10, 0, 0); scene.add(g); }
    const rope = new THREE.Mesh(new THREE.TorusGeometry(1, 0.08, 8, 72), new THREE.MeshLambertMaterial({ color: 0xffffff })); rope.rotation.x = -Math.PI / 2; rope.scale.set(HL, HW, 1); rope.position.y = 0.05; scene.add(rope);
  }
}

export function createCourt3D(host, { sport = 'tennis', quality = 'high', onFrame = () => {} } = {}) {
  const C = COURTS[sport] || COURTS.tennis;
  const q = quality === 'low' ? { rows: 6, fill: 0.6 } : { rows: 8, fill: 0.82 };
  let renderer;
  try { renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'low-power' }); if (!renderer.getContext()) throw 0; } catch { return null; }
  renderer.setPixelRatio(Math.min(3, window.devicePixelRatio || 1)); renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping;
  const canvas = renderer.domElement; canvas.className = 'court3d-canvas'; host.append(canvas);

  const scene = new THREE.Scene(); scene.__sport = sport;
  buildArena(scene, C, q, renderer.capabilities.getMaxAnisotropy()); buildProps(scene, C, sport);
  const camera = new THREE.PerspectiveCamera(C.fov, 16 / 9, 0.5, 600);
  // TV camera above the open near side (the court lies horizontally, like the football pitch). The
  // elevation is fixed; the distance is computed so the whole court fills the frame (fitCamera).
  const camTarget = new THREE.Vector3(0, 0.6, 0);
  const th = (C.elev) * Math.PI / 180, dir = new THREE.Vector3(0, Math.sin(th), Math.cos(th));
  // the court's eight framing corners (ground + a little height for the net and the ball)
  const HLc = C.L / 2 + C.apron * 0.25, HWc = C.W / 2 + C.apron * 0.25, corners = [];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) for (const yy of [0, 1.8]) corners.push(new THREE.Vector3(sx * HLc, yy, sz * HWc));
  function fitCamera() {
    let lo = 4, hi = 400;
    for (let it = 0; it < 24; it++) {
      const d = (lo + hi) / 2; camera.position.copy(camTarget).addScaledVector(dir, d); camera.lookAt(camTarget); camera.updateMatrixWorld(); camera.updateProjectionMatrix();
      let m = 0; for (const c of corners) { const v = c.clone().project(camera); m = Math.max(m, Math.abs(v.x), Math.abs(v.y)); }
      if (m > 0.92) lo = d; else hi = d; // too big → move further; fits → come closer
    }
    camera.position.copy(camTarget).addScaledVector(dir, hi); camera.lookAt(camTarget); camera.updateProjectionMatrix();
  }

  const BR = C.ballR;
  const ball = new THREE.Mesh(new THREE.SphereGeometry(BR, 28, 20), new THREE.MeshStandardMaterial({ color: C.ballColor, emissive: C.ballColor, emissiveIntensity: 0.3, roughness: 0.5 }));
  const shadow = new THREE.Mesh(new THREE.CircleGeometry(BR * 1.2, 20), new THREE.MeshBasicMaterial({ color: 0, transparent: true, opacity: 0.32, depthWrite: false })); shadow.rotation.x = -Math.PI / 2;
  scene.add(ball, shadow);
  const trailMat = new THREE.MeshBasicMaterial({ color: C.ballColor, transparent: true, depthWrite: false, toneMapped: false }); let trail = null;

  const courtPoint = (nx, ny) => ({ x: (Math.max(0, Math.min(1, nx)) - 0.5) * C.L, z: (Math.max(0, Math.min(1, ny)) - 0.5) * C.W });
  const pos = new THREE.Vector3(0, BR, 0); let cur = null, target = null, from = null, moveAt = 0, hidden = true, raf = 0, onScreen = true;

  function drawTrail() {
    if (trail) { scene.remove(trail); trail.geometry.dispose(); trail = null; }
    if (!from || from.distanceTo(pos) < 1.5) return;
    trail = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([from.clone(), pos.clone()]), 8, BR * 0.5, 6, false), trailMat); trailMat.opacity = 0.5; scene.add(trail);
  }
  function frame() {
    raf = 0; const now = performance.now(); let busy = false;
    if (target) { if (!cur) cur = target.clone(); else { const k = Math.min(1, (now - moveAt) / 650); cur.lerpVectors(from, target, k); busy = k < 1; } pos.set(cur.x, BR, cur.z); }
    const pulse = 1 + 0.12 * Math.sin(now / 200);
    ball.visible = shadow.visible = !hidden; ball.position.copy(pos); ball.scale.setScalar(pulse);
    shadow.position.set(pos.x, 0.04, pos.z); shadow.scale.setScalar(pulse);
    drawTrail(); renderer.render(scene, camera);
    const p = pos.clone().add(new THREE.Vector3(0, BR + 0.6, 0)).project(camera);
    onFrame({ x: (p.x * 0.5 + 0.5) * 100, y: (-p.y * 0.5 + 0.5) * 100, visible: !hidden && p.z < 1 });
    if (busy || !hidden) schedule();
  }
  function schedule() { if (!raf && onScreen && !document.hidden) raf = requestAnimationFrame(frame); }
  function resize() { const w = host.clientWidth, h = host.clientHeight; if (!w || !h) return; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); fitCamera(); schedule(); }
  const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(resize) : null; ro?.observe(host);
  const io = typeof IntersectionObserver === 'function' ? new IntersectionObserver(([e]) => { onScreen = e.isIntersecting; schedule(); }) : null; io?.observe(host);
  const onVis = () => schedule(); document.addEventListener('visibilitychange', onVis); resize();

  return {
    setBall(b) {
      if (!b || !Number.isFinite(b.x) || !Number.isFinite(b.y)) { hidden = true; schedule(); return; }
      hidden = false; const p = courtPoint(b.x, b.y), to = new THREE.Vector3(p.x, BR, p.z);
      if (target && to.distanceTo(target) < 0.15) { schedule(); return; }
      from = (cur || to).clone(); target = to; moveAt = performance.now(); schedule();
    },
    destroy() {
      if (raf) cancelAnimationFrame(raf); raf = 0; onScreen = false; ro?.disconnect(); io?.disconnect(); document.removeEventListener('visibilitychange', onVis);
      scene.traverse((o) => { o.geometry?.dispose?.(); for (const m of [].concat(o.material || [])) { m.map?.dispose?.(); m.dispose?.(); } });
      renderer.dispose(); renderer.forceContextLoss?.(); canvas.remove();
    },
  };
}
