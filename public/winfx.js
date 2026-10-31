// "Bilhete premiado": the full screen a player sees when one of their bets has won (app.js checkWins).
// Calm on purpose: soft lights rising behind, floodlight beams sweeping slowly, the paper ticket coming
// out of the slot with its picks printed one by one, the board turning to the amount won and the GANHO
// stamp. One won ticket at a time; it can be shared (its link) from here. A short vibration.

const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

// slow out-of-focus lights rising, like a stadium seen from far
function lights(canvas) {
  const g = canvas.getContext('2d');
  let W = 0, H = 0, dots = [], raf = 0, last = performance.now();
  const size = () => {
    const d = Math.min(3, devicePixelRatio || 1); W = innerWidth; H = innerHeight;
    canvas.width = W * d; canvas.height = H * d; g.setTransform(d, 0, 0, d, 0, 0);
    dots = Array.from({ length: 46 }, () => ({ x: Math.random() * W, y: Math.random() * H, r: 2 + Math.random() * 9, v: 6 + Math.random() * 16, a: 0.05 + Math.random() * 0.18, ph: Math.random() * 6 }));
  };
  const frame = (now) => {
    const dt = Math.min(0.05, (now - last) / 1000), t = now / 1000; last = now;
    const gr = g.createRadialGradient(W / 2, H * 0.25, 0, W / 2, H * 0.25, H * 0.9);
    gr.addColorStop(0, '#123526'); gr.addColorStop(0.6, '#071510'); gr.addColorStop(1, '#030806');
    g.fillStyle = gr; g.fillRect(0, 0, W, H);
    for (const p of dots) {
      p.y -= p.v * dt; p.x += Math.sin(t * 0.6 + p.ph) * 0.15;
      if (p.y < -20) { p.y = H + 20; p.x = Math.random() * W; }
      const k = g.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r);
      k.addColorStop(0, `rgba(170,255,185,${p.a})`); k.addColorStop(1, 'rgba(170,255,185,0)');
      g.fillStyle = k; g.beginPath(); g.arc(p.x, p.y, p.r, 0, Math.PI * 2); g.fill();
    }
    if (!reduced()) raf = requestAnimationFrame(frame);
  };
  size(); addEventListener('resize', size);
  raf = requestAnimationFrame(frame);
  return () => { cancelAnimationFrame(raf); removeEventListener('resize', size); };
}

// the board: each digit turns through a few others before showing its own
function board(el, text, done) {
  el.innerHTML = '';
  const cells = [...text].map((c) => {
    const s = document.createElement('span');
    const sep = c === ',' || c === '.' || c === ' ';
    s.className = `wfx-flap${sep ? ' sep' : ''}`;
    s.textContent = sep ? c.trim() : '0';
    el.append(s);
    return [s, c, sep];
  });
  const cur = document.createElement('span'); cur.className = 'wfx-flap cur'; cur.textContent = '€'; el.append(cur);
  if (reduced()) { cells.forEach(([s, c]) => { s.textContent = c.trim(); s.classList.add('done'); }); done(); return () => {}; }
  const timers = [];
  let left = cells.filter(([, , sep]) => !sep).length;
  if (!left) done();
  cells.forEach(([s, c, sep], i) => {
    if (sep) return;
    let n = 6 + i * 2;
    const tick = () => {
      s.classList.remove('turn'); void s.offsetWidth; s.classList.add('turn');
      if (n-- > 0) { s.textContent = String(Math.floor(Math.random() * 10)); timers.push(setTimeout(tick, 75)); } else { s.textContent = c; s.classList.add('done'); if (!--left) done(); }
    };
    timers.push(setTimeout(tick, i * 40));
  });
  return () => timers.forEach(clearTimeout);
}

const when = (iso) => {
  const d = iso ? new Date(iso) : new Date();
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

/** Shows the won bets one after the other (the latest first); onShare(bet) shares one; onClose(ids) when the player leaves. */
export function celebrate(wins, { money, esc, sportIcon = () => '🏆', onShare = null, onClose = () => {} }) {
  if (!wins.length || document.querySelector('.win-fx')) return;
  const el = document.createElement('div');
  el.className = 'win-fx';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-modal', 'true');
  el.setAttribute('aria-label', 'Bilhete premiado');
  el.innerHTML = `<canvas class="wfx-bg" aria-hidden="true"></canvas><div class="wfx-beam l" aria-hidden="true"></div><div class="wfx-beam r" aria-hidden="true"></div>
    <div class="wfx-ui"><div class="wfx-logo">BET<span>62</span></div>
      <div class="wfx-label">BILHETE PREMIADO</div>
      <div class="wfx-board" aria-hidden="true"></div><div class="wfx-sub">creditados no seu saldo</div>
      <div class="wfx-slot" aria-hidden="true"></div>
      <div class="wfx-paperwrap"><div class="wfx-paper">
        <div class="wfx-phead"><b>BET<span>62</span></b><small class="wfx-ref"></small></div>
        <div class="wfx-kind"><span class="wfx-type"></span><span>ODD <span class="wfx-odds"></span></span></div>
        <ul class="wfx-legs"></ul>
        <div class="wfx-sum"><div><span>Aposta</span><span class="wfx-stake"></span></div><div class="wfx-total"><span>Ganho</span><span class="wfx-won"></span></div></div>
        <div class="wfx-barcode" aria-hidden="true"></div>
        <div class="wfx-stamp" aria-hidden="true">GANHO<small>PAGO</small></div>
      </div></div>
      <div class="wfx-acts">${onShare ? '<button type="button" class="wfx-share" data-win="share">↗ Partilhar</button>' : ''}<a class="wfx-go" href="#/apostas" data-win="close">Ver bilhete</a>
        <button type="button" class="wfx-next" data-win="next">Continuar</button></div>
    </div>`;
  document.body.append(el);
  const stopBg = lights(el.querySelector('.wfx-bg'));
  const ui = el.querySelector('.wfx-ui');
  let i = 0, timers = [], stopBoard = () => {};

  const show = () => {
    timers.forEach(clearTimeout); timers = []; stopBoard();
    const b = wins[i];
    const legs = b.legs || [];
    const won = (Number(b.payout) || 0) + (Number(b.boost) || 0);
    ui.className = 'wfx-ui';
    el.querySelector('.wfx-board').innerHTML = '';
    const kind = b.type === 'single' ? 'SIMPLES' : b.type === 'builder' ? 'CONSTRUTOR' : 'MÚLTIPLA';
    el.querySelector('.wfx-ref').textContent = `${b.ref || `BT62-${String(b.id).padStart(6, '0')}`} · ${when(b.settledAt)}`;
    el.querySelector('.wfx-type').textContent = `${kind} · ${legs.length}`;
    el.querySelector('.wfx-odds').textContent = Number(b.totalOdds).toFixed(2);
    el.querySelector('.wfx-stake').textContent = money(b.stake);
    el.querySelector('.wfx-won').textContent = money(won);
    el.querySelector('.wfx-legs').innerHTML = legs.slice(0, 5).map((l) => `<li><span class="wfx-ic">${sportIcon(l.sport)}</span><span class="wfx-leg"><b>${esc(l.match)}</b><small>${esc(l.label || '')}</small></span>
        <span class="wfx-o">${Number(l.odds).toFixed(2)}</span><span class="wfx-ok">✓</span></li>`).join('')
      + (legs.length > 5 ? `<li class="wfx-more">+ ${legs.length - 5} eventos</li>` : '');
    el.querySelector('.wfx-next').textContent = i < wins.length - 1 ? `Próximo (${i + 2}/${wins.length})` : 'Continuar';
    const at = (ms, fn) => timers.push(setTimeout(fn, reduced() ? 0 : ms));
    const lines = [...el.querySelectorAll('.wfx-legs li')];
    at(60, () => ui.classList.add('on'));
    // the ticket comes out of the slot, its lines printed one by one
    at(500, () => ui.classList.add('print'));
    lines.forEach((li, k) => at(1100 + k * 260, () => li.classList.add('in')));
    const after = 1300 + lines.length * 260;
    // the board turns to the amount, then the stamp and a small buzz
    at(after, () => { stopBoard = board(el.querySelector('.wfx-board'), money(won).replace(/[^\d,.]/g, ''), () => ui.classList.add('sub-on')); });
    at(after + 1400, () => {
      ui.classList.add('stamped');
      if (navigator.userActivation?.hasBeenActive) { try { navigator.vibrate?.([30, 30, 50]); } catch { /* not here */ } }
    });
    at(after + 1900, () => { ui.classList.add('acts-on'); el.querySelector('.wfx-next')?.focus({ preventScroll: true }); });
  };
  const close = () => {
    timers.forEach(clearTimeout); stopBoard(); stopBg();
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
    if (t.dataset.win === 'share') { onShare?.(wins[i]); return; }
    if (t.dataset.win === 'next' && i < wins.length - 1) { i += 1; show(); } else close();
  });
  show();
}
