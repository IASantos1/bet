// "Ganhou!": the full screen a player sees when one of their bets has won (app.js checkWins). First
// the ticket, "toque para abrir" (a phone only vibrates after a touch on the page); the touch opens
// it: the phone vibrates, confetti bursts, the coin spins in 3D and the amount counts up.

const VIBRATE = [70, 40, 70, 40, 140, 90, 380];
const COLORS = ['#7cff6b', '#ffc83d', '#ffffff', '#6cc4ff', '#ff7ab6', '#b58cff'];
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

function confetti(canvas) {
  const ctx = canvas.getContext('2d');
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const size = () => { canvas.width = innerWidth * dpr; canvas.height = innerHeight * dpr; };
  size();
  window.addEventListener('resize', size);
  let parts = [];
  const burst = (n, x, y) => {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, v = 6 + Math.random() * 11;
      parts.push({ x: x * dpr, y: y * dpr, vx: Math.cos(a) * v * dpr, vy: (Math.sin(a) * v - 7) * dpr, w: (6 + Math.random() * 6) * dpr, h: (9 + Math.random() * 8) * dpr,
        r: Math.random() * 6, vr: (Math.random() - 0.5) * 0.35, c: COLORS[i % COLORS.length], life: 1 });
    }
  };
  let raf = 0;
  const frame = () => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (const p of parts) {
      p.vx *= 0.985; p.vy = p.vy * 0.985 + 0.32 * dpr; p.x += p.vx; p.y += p.vy; p.r += p.vr; p.life -= 0.004;
      ctx.save(); ctx.globalAlpha = Math.max(0, Math.min(1, p.life * 1.6)); ctx.translate(p.x, p.y); ctx.rotate(p.r);
      ctx.scale(1, Math.abs(Math.cos(p.r * 2)) * 0.8 + 0.2); ctx.fillStyle = p.c; ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h); ctx.restore();
    }
    parts = parts.filter((p) => p.life > 0 && p.y < canvas.height + 40 * dpr);
    raf = parts.length ? requestAnimationFrame(frame) : 0;
  };
  return {
    fire(n, x, y) { burst(n, x, y); if (!raf) raf = requestAnimationFrame(frame); },
    stop() { cancelAnimationFrame(raf); window.removeEventListener('resize', size); },
  };
}

function countUp(el, to, money, ms = 1300) {
  if (reduced()) { el.textContent = `+${money(to)}`; return; }
  const t0 = performance.now();
  const step = (t) => {
    const k = Math.min(1, (t - t0) / ms);
    el.textContent = `+${money(to * (1 - (1 - k) ** 3))}`;
    if (k < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

/** Shows the won bets (the latest first); onClose(ids) when the player leaves it. */
export function celebrate(wins, { money, esc, onClose = () => {} }) {
  if (!wins.length || document.querySelector('.win-fx')) return;
  const total = wins.reduce((t, w) => t + (Number(w.payout) || 0) + (Number(w.boost) || 0), 0);
  const b = wins[0];
  const legs = b.legs || [];
  const more = wins.length - 1;
  const legRows = legs.slice(0, 3).map((l) => `<li><span class="win-fx-leg"><b>${esc(l.match)}</b><small>${esc(l.label || '')}</small></span><span class="win-fx-odd">${Number(l.odds).toFixed(2)} ✓</span></li>`).join('')
    + (legs.length > 3 ? `<li class="win-fx-more">+ ${legs.length - 3} seleções</li>` : '');
  const el = document.createElement('div');
  el.className = 'win-fx';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-modal', 'true');
  el.setAttribute('aria-label', 'Aposta ganha');
  el.innerHTML = `<div class="win-fx-rays" aria-hidden="true"></div><canvas class="win-fx-confetti" aria-hidden="true"></canvas>
    <div class="win-fx-stage">
      <button type="button" class="win-fx-ticket" data-win="open">
        <span class="win-fx-ticket-top"><span class="brand-word small">BET<span>62</span></span><span>BILHETE ${esc(b.ref || '')}</span></span>
        <span class="win-fx-ticket-icon" aria-hidden="true">🏆</span>
        <b>${wins.length > 1 ? `Tem ${wins.length} bilhetes vencedores!` : 'Tem um bilhete vencedor!'}</b>
        <span class="win-fx-tap">Toque para abrir</span>
      </button>
      <div class="win-fx-reveal" aria-live="polite">
        <div class="win-fx-coin" aria-hidden="true"><div class="f">€</div><div class="f b">62</div></div>
        <div class="win-fx-title" data-text="GANHOU!">GANHOU!</div>
        <div class="win-fx-amt">+${money(0)}</div>
        <div class="win-fx-card">
          <div class="win-fx-card-head"><span>${b.type === 'single' ? 'Simples' : b.type === 'builder' ? 'Construtor' : `Múltipla · ${legs.length}`}</span><span>${esc(b.ref || '')}</span></div>
          <ul>${legRows}</ul>
          <div class="win-fx-card-foot"><span>Aposta <b>${money(b.stake)}</b></span><span>Odd <b>${Number(b.totalOdds).toFixed(2)}</b></span><span>Ganho <b>${money(Number(b.payout) + (Number(b.boost) || 0))}</b></span></div>
          ${more > 0 ? `<div class="win-fx-others">+ ${more} ${more === 1 ? 'outro bilhete ganho' : 'outros bilhetes ganhos'}</div>` : ''}
        </div>
        <div class="win-fx-acts"><a class="win-fx-go" href="#/apostas" data-win="close">Ver bilhete</a><button type="button" class="win-fx-ok" data-win="close">Continuar</button></div>
      </div>
    </div>`;
  document.body.append(el);
  const fx = confetti(el.querySelector('.win-fx-confetti'));
  let opened = false;
  const open = () => {
    if (opened) return;
    opened = true;
    try { navigator.vibrate?.(VIBRATE); } catch { /* not on this phone */ }
    el.classList.add('open');
    if (!reduced()) {
      fx.fire(170, innerWidth / 2, innerHeight * 0.36);
      setTimeout(() => fx.fire(90, innerWidth * 0.15, innerHeight * 0.5), 450);
      setTimeout(() => fx.fire(90, innerWidth * 0.85, innerHeight * 0.5), 650);
    }
    setTimeout(() => countUp(el.querySelector('.win-fx-amt'), total, money), 350);
    setTimeout(() => el.querySelector('.win-fx-ok')?.focus(), 400);
  };
  const close = () => {
    fx.stop();
    el.classList.add('closing');
    setTimeout(() => el.remove(), 260);
    document.removeEventListener('keydown', onKey);
    onClose(wins.map((w) => w.id));
  };
  const onKey = (e) => { if (e.key === 'Escape') (opened ? close() : open()); };
  document.addEventListener('keydown', onKey);
  el.addEventListener('click', (e) => {
    const t = e.target.closest('[data-win]');
    if (!t) return;
    if (t.dataset.win === 'open') open();
    else close();
  });
  // Already touched the page in this visit: the phone can vibrate, so it opens straight away.
  if (navigator.userActivation?.hasBeenActive) setTimeout(open, 250);
  else el.querySelector('.win-fx-ticket').focus();
}
