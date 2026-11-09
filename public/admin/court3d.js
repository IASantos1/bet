// A small perspective court drawn on a canvas, in the BET62 look (dark, green court, lime ball). It
// takes a normalised ball position { x, y } (0..1 across the court, 0..1 from the near to the far side)
// and eases the ball toward it, with a fading trail — the live tracker's job is only to feed positions.
// Tennis, basketball and cricket draw their own lines. No dependency; works without WebGL. Used first in
// the admin test panel; the same component can later drive the court on the public match page.

const COLORS = {
  tennis: { court: '#2f8f57', line: '#eaf6ee', bg0: '#0a1f14', bg1: '#06120b' },
  basketball: { court: '#b5703a', line: '#f3e6d6', bg0: '#201309', bg1: '#120a04' },
  cricket: { court: '#2f8f57', line: '#eaf6ee', bg0: '#0a1f14', bg1: '#06120b' },
};
const BALL = '#b4ff2e';
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

export function createCourt(canvas) {
  const ctx = canvas.getContext('2d');
  let sport = 'tennis', target = null, cur = null, score = '', raf = null, trail = [];

  // Perspective: a point (nx 0..1 across, ny 0..1 near→far) → screen {x, y, scale}.
  function project(nx, ny, w, h) {
    const padX = w * 0.08, topY = h * 0.14, botY = h * 0.94;
    const halfNear = w * 0.5 - padX, halfFar = halfNear * 0.52;
    const y = botY + (topY - botY) * ny;
    const half = halfNear + (halfFar - halfNear) * ny;
    const scale = 1 + (0.42 - 1) * ny; // nearer = bigger
    return { x: w / 2 + (nx - 0.5) * 2 * half, y, scale };
  }
  const poly = (pts) => { ctx.beginPath(); pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y))); ctx.closePath(); };
  const line = (ax, ay, bx, by, w, h) => { const a = project(ax, ay, w, h), b = project(bx, by, w, h); ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); };

  function drawCourt(w, h) {
    const c = COLORS[sport] || COLORS.tennis;
    const bg = ctx.createLinearGradient(0, 0, 0, h); bg.addColorStop(0, c.bg0); bg.addColorStop(1, c.bg1);
    ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h);
    // court floor
    const corners = [project(0, 0, w, h), project(1, 0, w, h), project(1, 1, w, h), project(0, 1, w, h)];
    poly(corners); const g = ctx.createLinearGradient(0, h, 0, 0); g.addColorStop(0, c.court); g.addColorStop(1, shade(c.court, -0.18));
    ctx.fillStyle = g; ctx.fill();
    ctx.strokeStyle = c.line; ctx.lineWidth = 2; ctx.lineJoin = 'round'; poly(corners); ctx.stroke();
    ctx.lineWidth = 1.6;
    if (sport === 'tennis') {
      line(0, 0.5, 1, 0.5, w, h); // net
      line(0.5, 0.12, 0.5, 0.88, w, h); // centre service line
      line(0.08, 0.12, 0.08, 0.88, w, h); line(0.92, 0.12, 0.92, 0.88, w, h); // singles lines
      line(0.08, 0.3, 0.92, 0.3, w, h); line(0.08, 0.7, 0.92, 0.7, w, h); // service lines
    } else if (sport === 'basketball') {
      line(0, 0.5, 1, 0.5, w, h); // centre
      const circ = (cy) => { const p = project(0.5, cy, w, h); ctx.beginPath(); ctx.ellipse(p.x, p.y, 38 * p.scale, 16 * p.scale, 0, 0, Math.PI * 2); ctx.stroke(); };
      circ(0.5); // centre circle
      [[0.32, 0.68, 0.08], [0.32, 0.68, 0.92]].forEach(([a, b, ny]) => { const p1 = project(a, ny, w, h), p2 = project(b, ny, w, h), p3 = project(b, ny + (ny < 0.5 ? 0.2 : -0.2), w, h), p4 = project(a, ny + (ny < 0.5 ? 0.2 : -0.2), w, h); poly([p1, p2, p3, p4]); ctx.stroke(); }); // keys
    } else if (sport === 'cricket') {
      const p = project(0.5, 0.5, w, h); ctx.beginPath(); ctx.ellipse(p.x, p.y, (w * 0.42), (h * 0.34), 0, 0, Math.PI * 2); ctx.stroke(); // boundary
      ctx.fillStyle = shade(c.court, 0.1); const a = project(0.46, 0.2, w, h), b = project(0.54, 0.2, w, h), d = project(0.54, 0.8, w, h), e = project(0.46, 0.8, w, h); poly([a, b, d, e]); ctx.fill(); ctx.stroke(); // pitch strip
    }
  }

  function drawBall(w, h) {
    if (!cur) return;
    const p = project(clamp01(cur.x), clamp01(cur.y), w, h), r = 7 * p.scale;
    // trail
    for (let i = 0; i < trail.length; i++) { const t = trail[i], tp = project(clamp01(t.x), clamp01(t.y), w, h); ctx.globalAlpha = (i / trail.length) * 0.5; ctx.fillStyle = BALL; ctx.beginPath(); ctx.arc(tp.x, tp.y, r * (0.4 + i / trail.length * 0.6), 0, Math.PI * 2); ctx.fill(); }
    ctx.globalAlpha = 1;
    // shadow on the floor
    ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.beginPath(); ctx.ellipse(p.x, p.y + r * 0.9, r * 1.1, r * 0.4, 0, 0, Math.PI * 2); ctx.fill();
    // ball with glow
    const gl = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r * 2.4); gl.addColorStop(0, 'rgba(180,255,46,.55)'); gl.addColorStop(1, 'rgba(180,255,46,0)');
    ctx.fillStyle = gl; ctx.beginPath(); ctx.arc(p.x, p.y, r * 2.4, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = BALL; ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2); ctx.fill();
    if (score) { ctx.fillStyle = '#eaf6ee'; ctx.font = '600 13px system-ui,sans-serif'; ctx.textAlign = 'center'; ctx.fillText(score, w / 2, h - 8); }
  }

  function frame() {
    const w = canvas.width, h = canvas.height;
    if (target) {
      if (!cur) cur = { ...target };
      else {
        const nx = cur.x + (target.x - cur.x) * 0.18, ny = cur.y + (target.y - cur.y) * 0.18;
        if (Math.hypot(nx - cur.x, ny - cur.y) > 0.002) { trail.push({ ...cur }); if (trail.length > 10) trail.shift(); }
        cur = { x: nx, y: ny };
      }
    }
    ctx.clearRect(0, 0, w, h); drawCourt(w, h); drawBall(w, h);
    raf = requestAnimationFrame(frame);
  }

  return {
    setSport(s) { if (COLORS[s]) sport = s; },
    setBall(b) { target = b && Number.isFinite(b.x) && Number.isFinite(b.y) ? { x: b.x, y: b.y } : target; },
    setScore(s) { score = s || ''; },
    start() { if (!raf) frame(); },
    stop() { if (raf) cancelAnimationFrame(raf); raf = null; },
  };
}

function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16); let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  const f = (v) => Math.max(0, Math.min(255, Math.round(v + 255 * amt)));
  return `rgb(${f(r)},${f(g)},${f(b)})`;
}
