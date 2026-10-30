// "Ganhou!": the full screen a player sees when one of their bets has won (app.js checkWins). Calm on
// purpose: the stadium drawn behind (sharp on any screen), the bolt floating with a soft glow and a
// few small sparks, the title by the size of the win (BOA! / MAGNÍFICO! / LENDÁRIO!), the ticket's
// picks ticked one by one and the amount counting up. One won ticket at a time; a short vibration.

const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const R = (a, b) => a + Math.random() * (b - a);
const tierOf = (odds, won) => (odds >= 20 || won >= 1000 ? 'LENDÁRIO!' : odds >= 4 || won >= 50 ? 'MAGNÍFICO!' : 'BOA!');

function drawStadium(c) {
  const d = Math.min(3, devicePixelRatio || 1), w = innerWidth, h = innerHeight;
  c.width = w * d; c.height = h * d;
  const x = c.getContext('2d');
  x.setTransform(d, 0, 0, d, 0, 0);
  let seed = 62; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  let gr = x.createLinearGradient(0, 0, 0, h);
  gr.addColorStop(0, '#010805'); gr.addColorStop(0.35, '#04170b'); gr.addColorStop(0.62, '#0a2c14'); gr.addColorStop(1, '#06180c');
  x.fillStyle = gr; x.fillRect(0, 0, w, h);
  const horizon = h * 0.66;
  // the stands, the crowd in tiny lights
  for (const side of [-1, 1]) {
    x.save(); x.beginPath();
    x.moveTo(w / 2 + side * w * 0.05, horizon); x.quadraticCurveTo(w / 2 + side * w * 0.55, horizon - h * 0.02, w / 2 + side * w * 0.75, h * 0.16);
    x.lineTo(w / 2 + side * w * 0.75, horizon + h * 0.1); x.closePath();
    gr = x.createLinearGradient(0, h * 0.15, 0, horizon); gr.addColorStop(0, '#061a0d'); gr.addColorStop(1, '#0d3519');
    x.fillStyle = gr; x.fill(); x.clip();
    for (let i = 0; i < 1400; i++) {
      x.fillStyle = `hsla(${100 + rnd() * 60}, ${30 + rnd() * 40}%, ${40 + rnd() * 45}%, ${0.1 + rnd() * 0.25})`;
      x.beginPath(); x.arc(w / 2 + side * rnd() * w * 0.75, h * 0.14 + rnd() * (horizon - h * 0.14), 0.5 + rnd() * 1.2, 0, Math.PI * 2); x.fill();
    }
    x.restore();
  }
  // floodlight rings curving up both sides
  const ring = (cy, rx, ry, a0, a1, n, size) => {
    for (let i = 0; i <= n; i++) {
      const a = a0 + (a1 - a0) * (i / n), px = w / 2 + Math.cos(a) * rx, py = cy + Math.sin(a) * ry;
      const g = x.createRadialGradient(px, py, 0, px, py, size * 7); g.addColorStop(0, 'rgba(225,255,230,.5)'); g.addColorStop(1, 'rgba(124,255,107,0)');
      x.fillStyle = g; x.beginPath(); x.arc(px, py, size * 7, 0, Math.PI * 2); x.fill();
      x.fillStyle = '#f4fff4'; x.beginPath(); x.arc(px, py, size, 0, Math.PI * 2); x.fill();
    }
  };
  for (const [cy, rx, ry, n, sz] of [[h * 0.78, w * 0.66, h * 0.5, 26, Math.max(1.5, w / 240)], [h * 0.8, w * 0.8, h * 0.42, 22, Math.max(1.2, w / 300)]]) {
    ring(cy, rx, ry, Math.PI + 0.1, Math.PI + 0.82, n, sz);
    ring(cy, rx, ry, Math.PI * 2 - 0.82, Math.PI * 2 - 0.1, n, sz);
  }
  for (const [px, py, r] of [[w * 0.1, h * 0.3, w * 0.7], [w * 0.9, h * 0.3, w * 0.7], [w * 0.5, h * 0.12, w * 0.8]]) {
    const g = x.createRadialGradient(px, py, 0, px, py, r); g.addColorStop(0, 'rgba(140,255,150,.14)'); g.addColorStop(1, 'rgba(124,255,107,0)');
    x.fillStyle = g; x.fillRect(0, 0, w, h);
  }
  // the pitch, mown stripes in perspective
  x.save(); x.beginPath(); x.rect(0, horizon, w, h - horizon); x.clip();
  gr = x.createLinearGradient(0, horizon, 0, h); gr.addColorStop(0, '#1d5a24'); gr.addColorStop(1, '#0b2e10'); x.fillStyle = gr; x.fillRect(0, horizon, w, h - horizon);
  for (let i = -14; i < 14; i += 2) {
    const x1 = w / 2 + i * w * 0.2, x2 = w / 2 + (i + 1) * w * 0.2;
    x.fillStyle = 'rgba(255,255,255,.035)'; x.beginPath();
    x.moveTo(w / 2 + (x1 - w / 2) * 0.12, horizon); x.lineTo(w / 2 + (x2 - w / 2) * 0.12, horizon); x.lineTo(x2, h); x.lineTo(x1, h); x.closePath(); x.fill();
  }
  x.restore();
  const v = x.createRadialGradient(w / 2, h * 0.45, h * 0.2, w / 2, h * 0.45, h * 0.85); v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,6,2,.75)');
  x.fillStyle = v; x.fillRect(0, 0, w, h);
}

// small sparks around the bolt (a few, soft) and ribbons drifting down
function effects(canvas, boltEl) {
  const x = canvas.getContext('2d');
  let d = 1, W = 0, H = 0;
  const size = () => { d = Math.min(3, devicePixelRatio || 1); W = innerWidth; H = innerHeight; canvas.width = W * d; canvas.height = H * d; x.setTransform(d, 0, 0, d, 0, 0); };
  size(); addEventListener('resize', size);
  const zig = (x1, y1, x2, y2, r, depth, out) => {
    if (!depth) { out.push([x2, y2]); return; }
    const mx = (x1 + x2) / 2 + R(-r, r), my = (y1 + y2) / 2 + R(-r, r) * 0.5;
    zig(x1, y1, mx, my, r / 2, depth - 1, out); zig(mx, my, x2, y2, r / 2, depth - 1, out);
  };
  const ribbons = Array.from({ length: 12 }, () => ({ x: R(0, W), y: R(-H, 0), w: R(4, 8), h: R(12, 20), r: R(0, 6), vr: R(-1.2, 1.2), vy: R(25, 55), sw: R(0, 6), c: Math.random() < 0.8 ? `hsl(${R(105, 125)}, 90%, ${R(60, 78)}%)` : '#f2fff2' }));
  let sparks = [], next = 0, raf = 0, last = performance.now();
  const frame = (now) => {
    const dt = Math.min(0.05, (now - last) / 1000), t = now / 1000; last = now;
    x.clearRect(0, 0, W, H);
    for (const r of ribbons) {
      r.y += r.vy * dt; r.r += r.vr * dt; r.sw += dt * 1.6; r.x += Math.sin(r.sw) * 0.3;
      if (r.y > H + 30) { r.y = R(-80, -20); r.x = R(0, W); }
      x.save(); x.globalAlpha = 0.7; x.translate(r.x, r.y); x.rotate(r.r); x.scale(1, Math.abs(Math.cos(r.sw)) * 0.8 + 0.2);
      x.fillStyle = r.c; x.fillRect(-r.w / 2, -r.h / 2, r.w, r.h); x.restore();
    }
    if (t > next) {
      const b = boltEl.getBoundingClientRect();
      sparks = Array.from({ length: 1 + Math.floor(R(0, 2)) }, () => {
        const px = b.left + b.width * R(0.3, 0.8), py = b.top + b.height * R(0.1, 0.9), an = R(0, Math.PI * 2), len = R(18, 45);
        const p = [[px, py]]; zig(px, py, px + Math.cos(an) * len, py + Math.sin(an) * len, 12, 3, p);
        return { p, life: 1 };
      });
      next = t + R(0.9, 1.8);
    }
    for (const s of sparks) {
      s.life -= dt * 2.2;
      if (s.life <= 0) continue;
      x.save(); x.globalAlpha = s.life * 0.8; x.lineJoin = x.lineCap = 'round';
      x.strokeStyle = 'rgba(160,255,170,.5)'; x.lineWidth = 3; x.shadowColor = '#9dffa8'; x.shadowBlur = 10;
      x.beginPath(); s.p.forEach(([a, b], i) => (i ? x.lineTo(a, b) : x.moveTo(a, b))); x.stroke();
      x.strokeStyle = '#f2fff2'; x.lineWidth = 1; x.shadowBlur = 4; x.stroke(); x.restore();
    }
    raf = requestAnimationFrame(frame);
  };
  if (!reduced()) raf = requestAnimationFrame(frame);
  return () => { cancelAnimationFrame(raf); removeEventListener('resize', size); };
}

function countUp(el, to, money, ms = 1200) {
  if (reduced()) { el.textContent = money(to); return; }
  const t0 = performance.now();
  const step = (t) => { const k = Math.min(1, (t - t0) / ms); el.textContent = money(to * (1 - (1 - k) ** 3)); if (k < 1) requestAnimationFrame(step); };
  requestAnimationFrame(step);
}

const BOLT = `<svg viewBox="0 0 200 300" aria-hidden="true"><defs>
  <linearGradient id="wfxFront" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f6fff4"/><stop offset=".35" stop-color="#c9ffc4"/><stop offset=".7" stop-color="#8dff7e"/><stop offset="1" stop-color="#55e650"/></linearGradient>
  <linearGradient id="wfxSide" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3cc13a"/><stop offset="1" stop-color="#1b6e20"/></linearGradient></defs>
  <polygon points="134,6 44,172 104,172 72,296 186,118 124,118 166,6" fill="url(#wfxSide)" transform="translate(9 9)"/>
  <polygon points="134,6 44,172 104,172 72,296 186,118 124,118 166,6" fill="url(#wfxFront)" stroke="#eaffea" stroke-width="3" stroke-linejoin="round"/>
  <polygon points="140,22 70,158 112,158" fill="rgba(255,255,255,.45)"/></svg>`;

/** Shows the won bets one after the other (the latest first); onClose(ids) when the player leaves. */
export function celebrate(wins, { money, esc, sportIcon = () => '🏆', onClose = () => {} }) {
  if (!wins.length || document.querySelector('.win-fx')) return;
  const el = document.createElement('div');
  el.className = 'win-fx';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-modal', 'true');
  el.setAttribute('aria-label', 'Aposta ganha');
  el.innerHTML = `<canvas class="wfx-stadium" aria-hidden="true"></canvas><div class="wfx-tint" aria-hidden="true"></div><canvas class="wfx-fx" aria-hidden="true"></canvas>
    <div class="wfx-ui"><div class="wfx-logo"><b>BET<span>62</span></b><small>APOSTAS · CASINO</small></div>
      <div class="wfx-hero"><div class="wfx-bolt">${BOLT}</div></div>
      <div class="wfx-title"></div><div class="wfx-sub">A SUA APOSTA FOI <em>GANHA!</em></div>
      <div class="wfx-card"></div>
      <div class="wfx-pay"><div><small>APOSTA</small><span class="wfx-stake"></span></div><div class="wfx-won"><small>GANHOS</small><strong></strong></div></div>
      <div class="wfx-acts"><a class="wfx-go" href="#/apostas" data-win="close">Ver bilhete</a><button type="button" class="wfx-next" data-win="next">Continuar</button></div>
    </div>`;
  document.body.append(el);
  drawStadium(el.querySelector('.wfx-stadium'));
  const redraw = () => drawStadium(el.querySelector('.wfx-stadium'));
  addEventListener('resize', redraw);
  const stopFx = effects(el.querySelector('.wfx-fx'), el.querySelector('.wfx-bolt'));
  let i = 0, timers = [];

  const show = () => {
    timers.forEach(clearTimeout); timers = [];
    const b = wins[i];
    const legs = b.legs || [];
    const won = (Number(b.payout) || 0) + (Number(b.boost) || 0);
    const word = tierOf(Number(b.totalOdds) || 1, won);
    const title = el.querySelector('.wfx-title');
    title.className = `wfx-title${word === 'LENDÁRIO!' ? ' gold' : ''}${word === 'BOA!' ? ' big' : ''}`;
    title.innerHTML = [...word].map((c) => `<span>${esc(c)}</span>`).join('');
    // the letters' wave, each a little after the other (set from here: inline styles are not allowed)
    title.querySelectorAll('span').forEach((s, k) => s.style.setProperty('--i', k));
    const kind = b.type === 'single' ? 'SIMPLES' : b.type === 'builder' ? 'CONSTRUTOR' : 'MÚLTIPLA';
    el.querySelector('.wfx-card').innerHTML = `<div class="wfx-head"><div><b>${kind}</b><small>${legs.length} ${legs.length === 1 ? 'EVENTO' : 'EVENTOS'}</small></div>
      <div class="wfx-odds"><small>ODDS TOTAIS</small><strong>${Number(b.totalOdds).toFixed(2)}</strong></div></div>
      <ul>${legs.slice(0, 4).map((l) => `<li><span class="wfx-sport">${sportIcon(l.sport)}</span><span class="wfx-leg"><b>${esc(l.match)}</b><small>${esc(l.label || '')}</small></span>
        <span class="wfx-res"><span class="wfx-o">${Number(l.odds).toFixed(2)}</span><small>VITÓRIA</small></span></li>`).join('')}
      ${legs.length > 4 ? `<li class="wfx-more">+ ${legs.length - 4} eventos</li>` : ''}</ul>`;
    el.querySelector('.wfx-stake').textContent = money(b.stake);
    const amt = el.querySelector('.wfx-won strong');
    amt.textContent = money(0);
    el.querySelector('.wfx-next').textContent = i < wins.length - 1 ? `Próximo bilhete (${i + 2}/${wins.length})` : 'Continuar';
    el.classList.remove('in');
    void el.offsetWidth;
    el.classList.add('in');
    el.querySelectorAll('.wfx-card li').forEach((li, k) => timers.push(setTimeout(() => li.classList.add('on'), 900 + k * 160)));
    timers.push(setTimeout(() => countUp(amt, won, money), 1000 + Math.min(4, legs.length) * 160));
  };
  const close = () => {
    timers.forEach(clearTimeout); stopFx(); removeEventListener('resize', redraw);
    el.classList.add('closing');
    setTimeout(() => el.remove(), 300);
    document.removeEventListener('keydown', onKey);
    onClose(wins.map((w) => w.id));
  };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', onKey);
  el.addEventListener('click', (e) => {
    const t = e.target.closest('[data-win]');
    if (!t) return;
    if (t.dataset.win === 'next' && i < wins.length - 1) { i += 1; show(); } else close();
  });
  show();
  // a short, gentle buzz (phones only allow it after a touch on the page)
  if (navigator.userActivation?.hasBeenActive) { try { navigator.vibrate?.([40, 40, 70]); } catch { /* not here */ } }
  setTimeout(() => el.querySelector('.wfx-next')?.focus(), 400);
}
