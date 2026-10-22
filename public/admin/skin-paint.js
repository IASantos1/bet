// Image editor for a cover ("película"): paint, clone, smudge, blur, erase/restore, select-copy-cut-paste,
// fill, and whole-picture adjustments (exposure, brightness, contrast, highlights, shadows, saturation,
// temperature, hue, blur, sharpness, soft edges), with undo/redo and zoom.
//
// createPaint(host, base, { onChange }) → { output(), destroy() }
//   base: a canvas with the cover at its own resolution (it is copied; the copy stays as "original" for
//   the restore brush and "Recomeçar"). output(): a new canvas with the adjustments and soft edges applied.

const TOOLS = [
  ['brush', '🖌️', 'Pincel'], ['clone', '🧬', 'Carimbo (copiar de outro sítio)'], ['smudge', '👆', 'Esfumar'],
  ['blur', '💧', 'Desfocar'], ['eraser', '🧽', 'Borracha (deixa ver o jogo)'], ['restore', '↩️', 'Restaurar o original'],
  ['picker', '💉', 'Conta-gotas'], ['select', '⬚', 'Selecionar (copiar, cortar, preencher)'], ['move', '✥', 'Mover o que colou'],
];
const ADJUST = [
  ['exposure', 'Luz (exposição)'], ['brightness', 'Brilho'], ['contrast', 'Contraste'], ['highlights', 'Realces'],
  ['shadows', 'Sombras'], ['saturation', 'Saturação'], ['temperature', 'Temperatura'], ['hue', 'Matiz'],
  ['gblur', 'Desfoque'], ['sharpen', 'Nitidez'],
];
const MAX_HISTORY = 30;

const el = (tag, cls, html) => { const n = document.createElement(tag); if (cls) n.className = cls; if (html !== undefined) n.innerHTML = html; return n; };
const canvasOf = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
const clone = (src) => { const c = canvasOf(src.width, src.height); c.getContext('2d').drawImage(src, 0, 0); return c; };

/** Separable box blur on RGBA data (in place), radius r, a few passes ≈ gaussian. */
function boxBlur(data, w, h, r, passes = 2) {
  if (r < 1) return;
  const tmp = new Float32Array(data.length);
  for (let p = 0; p < passes; p += 1) {
    for (let y = 0; y < h; y += 1) {
      for (let c = 0; c < 4; c += 1) {
        let acc = 0;
        for (let k = -r; k <= r; k += 1) acc += data[(y * w + Math.min(w - 1, Math.max(0, k))) * 4 + c];
        for (let x = 0; x < w; x += 1) {
          tmp[(y * w + x) * 4 + c] = acc / (2 * r + 1);
          acc += data[(y * w + Math.min(w - 1, x + r + 1)) * 4 + c] - data[(y * w + Math.max(0, x - r)) * 4 + c];
        }
      }
    }
    for (let x = 0; x < w; x += 1) {
      for (let c = 0; c < 4; c += 1) {
        let acc = 0;
        for (let k = -r; k <= r; k += 1) acc += tmp[(Math.min(h - 1, Math.max(0, k)) * w + x) * 4 + c];
        for (let y = 0; y < h; y += 1) {
          data[(y * w + x) * 4 + c] = acc / (2 * r + 1);
          acc += tmp[(Math.min(h - 1, y + r + 1) * w + x) * 4 + c] - tmp[(Math.max(0, y - r) * w + x) * 4 + c];
        }
      }
    }
  }
}

/** Hue rotation matrix (degrees), luminance preserving. */
function hueMatrix(deg) {
  const a = (deg * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
  return [
    0.213 + c * 0.787 - s * 0.213, 0.715 - c * 0.715 - s * 0.715, 0.072 - c * 0.072 + s * 0.928,
    0.213 - c * 0.213 + s * 0.143, 0.715 + c * 0.285 + s * 0.140, 0.072 - c * 0.072 - s * 0.283,
    0.213 - c * 0.213 - s * 0.787, 0.715 - c * 0.715 + s * 0.715, 0.072 + c * 0.928 + s * 0.072,
  ];
}

/** The whole-picture adjustments and soft edges applied to a copy of `src`. */
function adjusted(src, a) {
  const w = src.width, h = src.height, out = clone(src), ctx = out.getContext('2d');
  const img = ctx.getImageData(0, 0, w, h), d = img.data;
  const neutral = ADJUST.every(([k]) => !a[k]);
  if (!neutral) {
    if (a.gblur) boxBlur(d, w, h, Math.round(a.gblur / 12) || 1);
    let sharpSrc = null;
    if (a.sharpen) { sharpSrc = new Float32Array(d); boxBlur(sharpSrc, w, h, 1, 1); }
    const exp = 2 ** (a.exposure / 50), bri = a.brightness * 1.28;
    const cv = a.contrast * 2.55, con = (259 * (cv + 255)) / (255 * (259 - cv));
    const sat = 1 + a.saturation / 100, temp = a.temperature * 0.6;
    const hm = a.hue ? hueMatrix(a.hue * 1.8) : null;
    const sh = a.shadows / 100, hl = a.highlights / 100, shp = a.sharpen / 50;
    for (let i = 0; i < d.length; i += 4) {
      let r = d[i], g = d[i + 1], b = d[i + 2];
      if (sharpSrc) { r += shp * (r - sharpSrc[i]); g += shp * (g - sharpSrc[i + 1]); b += shp * (b - sharpSrc[i + 2]); }
      r *= exp; g *= exp; b *= exp;
      if (sh || hl) {
        const l = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
        const lift = sh * 90 * (1 - l) ** 2 + hl * 90 * l ** 2;
        r += lift; g += lift; b += lift;
      }
      r += bri; g += bri; b += bri;
      r = con * (r - 128) + 128; g = con * (g - 128) + 128; b = con * (b - 128) + 128;
      if (sat !== 1) { const y = 0.299 * r + 0.587 * g + 0.114 * b; r = y + (r - y) * sat; g = y + (g - y) * sat; b = y + (b - y) * sat; }
      if (temp) { r += temp; b -= temp; }
      if (hm) { const R = r, G = g, B = b; r = hm[0] * R + hm[1] * G + hm[2] * B; g = hm[3] * R + hm[4] * G + hm[5] * B; b = hm[6] * R + hm[7] * G + hm[8] * B; }
      d[i] = r; d[i + 1] = g; d[i + 2] = b; // Uint8ClampedArray clamps
    }
  }
  if (a.feather > 0) {
    const f = a.feather * Math.max(1, w / 400);
    for (let y = 0; y < h; y += 1) {
      for (let x = 0; x < w; x += 1) {
        const k = Math.min(1, (x + 0.5) / f, (w - x - 0.5) / f, (y + 0.5) / f, (h - y - 0.5) / f);
        if (k < 1) d[(y * w + x) * 4 + 3] *= k;
      }
    }
  }
  ctx.putImageData(img, 0, 0);
  return out;
}

export function createPaint(host, base, { onChange = () => {} } = {}) {
  const W = base.width, H = base.height;
  const original = clone(base);
  const paint = clone(base);
  const pctx = paint.getContext('2d');
  const st = {
    tool: 'brush', color: '#f2b766', size: Math.max(6, Math.round(Math.min(W, H) / 12)), strength: 60, hardness: 40,
    zoom: 1, adj: { ...Object.fromEntries(ADJUST.map(([k]) => [k, 0])), feather: 4 },
    sel: null, clip: null, floating: null, cloneFrom: null, cloneOffset: null,
  };
  const undo = [], redo = [];
  const snapshot = () => pctx.getImageData(0, 0, W, H);
  const push = () => { undo.push(snapshot()); if (undo.length > MAX_HISTORY) undo.shift(); redo.length = 0; syncButtons(); };

  host.innerHTML = '';
  const bar = el('div', 'sp-bar');
  bar.innerHTML = `<div class="sp-tools">${TOOLS.map(([k, i, t]) => `<button type="button" data-sp-tool="${k}" title="${t}">${i}<span>${t.split(' (')[0]}</span></button>`).join('')}</div>
    <div class="sp-opts">
      <label>Cor <input type="color" data-sp="color" value="${st.color}"></label>
      <label>Tamanho <input type="range" data-sp="size" min="1" max="${Math.max(40, Math.round(Math.max(W, H) / 2))}" value="${st.size}"></label>
      <label>Força <input type="range" data-sp="strength" min="1" max="100" value="${st.strength}"></label>
      <label>Dureza <input type="range" data-sp="hardness" min="0" max="100" value="${st.hardness}"></label>
      <label>Zoom <input type="range" data-sp="zoom" min="25" max="400" value="100"></label>
    </div>
    <div class="sp-acts">
      <button type="button" data-sp-act="undo">↶ Desfazer</button><button type="button" data-sp-act="redo">↷ Refazer</button>
      <button type="button" data-sp-act="copy">Copiar</button><button type="button" data-sp-act="cut">Cortar</button>
      <button type="button" data-sp-act="paste">Colar</button><button type="button" data-sp-act="fill">Preencher com a cor</button>
      <button type="button" data-sp-act="flipH">Espelhar ↔</button><button type="button" data-sp-act="flipV">Espelhar ↕</button>
      <button type="button" data-sp-act="apply">✔ Fixar o colado</button>
      <label class="sp-file">Colar imagem… <input type="file" accept="image/*" data-sp="file"></label>
      <button type="button" data-sp-act="reset">Recomeçar</button>
    </div>
    <div class="sp-hint"></div>`;
  const adj = el('div', 'sp-adj');
  adj.innerHTML = `${ADJUST.map(([k, t]) => `<label>${t} <input type="range" data-adj="${k}" min="${k === 'gblur' || k === 'sharpen' ? 0 : -100}" max="100" value="0"><output>0</output></label>`).join('')}
    <label>Bordas suaves <input type="range" data-adj="feather" min="0" max="30" value="${st.adj.feather}"><output>${st.adj.feather}</output></label>
    <button type="button" data-sp-act="adjReset">Repor ajustes</button>`;
  const viewWrap = el('div', 'sp-view');
  const view = canvasOf(W, H);
  const over = canvasOf(W, H);
  over.className = 'sp-over';
  viewWrap.append(view, over);
  host.append(bar, adj, viewWrap);
  const vctx = view.getContext('2d'), octx = over.getContext('2d');

  const HINTS = {
    brush: 'Pinte com a cor escolhida. Dureza baixa = bordas suaves.',
    clone: 'Primeiro toque (ou Alt+clique): escolhe de onde copiar. Depois pinte: copia desse sítio, como um carimbo.',
    smudge: 'Arraste para esfumar e espalhar as cores.', blur: 'Pinte por cima para desfocar só essa parte.',
    eraser: 'Apaga a película: nessa parte vê-se o jogo por baixo.', restore: 'Pinte para voltar ao original nessa parte.',
    picker: 'Toque numa cor da imagem para a usar no pincel.',
    select: 'Arraste para selecionar. Depois: Copiar, Cortar ou Preencher. Colar põe a cópia por cima (mova com ✥ e fixe).',
    move: 'Arraste o que colou para o sítio certo e carregue em "Fixar o colado".',
  };
  let pending = 0;
  const render = () => {
    cancelAnimationFrame(pending);
    pending = requestAnimationFrame(() => {
      const shown = adjusted(paint, st.adj);
      vctx.clearRect(0, 0, W, H);
      vctx.drawImage(shown, 0, 0);
      drawOver();
    });
  };
  let changeTimer = 0;
  const changed = () => { render(); clearTimeout(changeTimer); changeTimer = setTimeout(() => onChange(), 250); };
  function drawOver() {
    octx.clearRect(0, 0, W, H);
    const lw = Math.max(1, W / 300);
    if (st.floating) {
      const f = st.floating;
      octx.globalAlpha = 0.95; octx.drawImage(f.canvas, f.x, f.y); octx.globalAlpha = 1;
      octx.lineWidth = lw; octx.setLineDash([lw * 4, lw * 3]); octx.strokeStyle = '#3ad1ff'; octx.strokeRect(f.x, f.y, f.canvas.width, f.canvas.height);
    }
    if (st.sel) { octx.lineWidth = lw; octx.setLineDash([lw * 4, lw * 3]); octx.strokeStyle = '#ffc400'; octx.strokeRect(st.sel.x, st.sel.y, st.sel.w, st.sel.h); }
    if (st.cloneFrom && st.tool === 'clone') {
      octx.setLineDash([]); octx.strokeStyle = '#ff4d6d'; octx.lineWidth = lw * 1.5;
      octx.beginPath(); octx.arc(st.cloneFrom.x, st.cloneFrom.y, st.size / 2, 0, Math.PI * 2); octx.stroke();
    }
    octx.setLineDash([]);
  }
  function syncButtons() {
    bar.querySelectorAll('[data-sp-tool]').forEach((b) => b.classList.toggle('on', b.dataset.spTool === st.tool));
    bar.querySelector('[data-sp-act="undo"]').disabled = !undo.length;
    bar.querySelector('[data-sp-act="redo"]').disabled = !redo.length;
    bar.querySelector('[data-sp-act="apply"]').disabled = !st.floating;
    bar.querySelector('.sp-hint').textContent = HINTS[st.tool];
  }
  const setZoom = () => { const w = `${W * st.zoom}px`; view.style.width = w; over.style.width = w; viewWrap.style.setProperty('--sp-h', `${H * st.zoom}px`); };

  // ---------- brushes ----------
  const dabMask = (size) => {
    const c = canvasOf(size, size), x = c.getContext('2d'), r = size / 2;
    const g = x.createRadialGradient(r, r, 0, r, r, r);
    g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(Math.min(0.99, st.hardness / 100), 'rgba(0,0,0,1)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = g; x.fillRect(0, 0, size, size);
    return c;
  };
  let stroke = null;
  function dab(p) {
    const size = Math.max(1, Math.round(st.size)), half = size / 2, a = st.strength / 100;
    const x0 = Math.round(p.x - half), y0 = Math.round(p.y - half);
    const mask = stroke.mask;
    const tmp = canvasOf(size, size), t = tmp.getContext('2d');
    if (st.tool === 'brush') {
      t.drawImage(mask, 0, 0); t.globalCompositeOperation = 'source-in'; t.fillStyle = st.color; t.fillRect(0, 0, size, size);
      pctx.globalAlpha = a; pctx.drawImage(tmp, x0, y0); pctx.globalAlpha = 1;
    } else if (st.tool === 'eraser') {
      pctx.globalAlpha = a; pctx.globalCompositeOperation = 'destination-out'; pctx.drawImage(mask, x0, y0);
      pctx.globalCompositeOperation = 'source-over'; pctx.globalAlpha = 1;
    } else if (st.tool === 'restore' || st.tool === 'clone') {
      const src = st.tool === 'restore' ? original : stroke.snap;
      const ox = st.tool === 'clone' ? st.cloneOffset.x : 0, oy = st.tool === 'clone' ? st.cloneOffset.y : 0;
      t.drawImage(src, x0 + ox, y0 + oy, size, size, 0, 0, size, size);
      t.globalCompositeOperation = 'destination-in'; t.drawImage(mask, 0, 0);
      pctx.globalAlpha = a; pctx.drawImage(tmp, x0, y0); pctx.globalAlpha = 1;
    } else if (st.tool === 'blur') {
      const pad = Math.ceil(size / 4) + 2;
      const rx = Math.max(0, x0 - pad), ry = Math.max(0, y0 - pad);
      const rw = Math.min(W, x0 + size + pad) - rx, rh = Math.min(H, y0 + size + pad) - ry;
      if (rw <= 0 || rh <= 0) return;
      const img = pctx.getImageData(rx, ry, rw, rh);
      boxBlur(img.data, rw, rh, Math.max(1, Math.round(size / 10)), 1);
      const b = canvasOf(rw, rh); b.getContext('2d').putImageData(img, 0, 0);
      t.drawImage(b, rx - x0, ry - y0); t.globalCompositeOperation = 'destination-in'; t.drawImage(mask, 0, 0);
      pctx.globalAlpha = a; pctx.drawImage(tmp, x0, y0); pctx.globalAlpha = 1;
    } else if (st.tool === 'smudge') {
      const carry = stroke.carry;
      t.drawImage(carry, 0, 0); t.globalCompositeOperation = 'destination-in'; t.drawImage(mask, 0, 0);
      pctx.globalAlpha = a; pctx.drawImage(tmp, x0, y0); pctx.globalAlpha = 1;
      const cx = carry.getContext('2d');
      cx.globalAlpha = 1 - a * 0.85; cx.drawImage(paint, x0, y0, size, size, 0, 0, size, size); cx.globalAlpha = 1;
    }
  }
  const at = (ev) => {
    const r = view.getBoundingClientRect();
    return { x: (ev.clientX - r.left) * (W / r.width), y: (ev.clientY - r.top) * (H / r.height) };
  };
  const BRUSHES = new Set(['brush', 'eraser', 'restore', 'clone', 'blur', 'smudge']);
  over.addEventListener('pointerdown', (ev) => {
    ev.preventDefault();
    over.setPointerCapture(ev.pointerId);
    const p = at(ev);
    if (st.tool === 'picker') {
      const px = vctx.getImageData(Math.min(W - 1, Math.max(0, Math.floor(p.x))), Math.min(H - 1, Math.max(0, Math.floor(p.y))), 1, 1).data;
      st.color = `#${[px[0], px[1], px[2]].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
      bar.querySelector('[data-sp="color"]').value = st.color;
      st.tool = 'brush'; syncButtons(); drawOver();
      return;
    }
    if (st.tool === 'clone' && (ev.altKey || !st.cloneFrom)) { st.cloneFrom = p; st.cloneOffset = null; drawOver(); return; }
    if (st.tool === 'select') { stroke = { start: p }; st.sel = null; return; }
    if (st.tool === 'move') {
      if (st.floating) stroke = { start: p, fx: st.floating.x, fy: st.floating.y };
      return;
    }
    if (!BRUSHES.has(st.tool)) return;
    push();
    const size = Math.max(1, Math.round(st.size));
    stroke = { last: p, mask: dabMask(size) };
    if (st.tool === 'clone') { stroke.snap = clone(paint); st.cloneOffset ??= { x: st.cloneFrom.x - p.x, y: st.cloneFrom.y - p.y }; }
    if (st.tool === 'smudge') { stroke.carry = canvasOf(size, size); stroke.carry.getContext('2d').drawImage(paint, Math.round(p.x - size / 2), Math.round(p.y - size / 2), size, size, 0, 0, size, size); }
    dab(p); changed();
  });
  over.addEventListener('pointermove', (ev) => {
    if (!stroke) return;
    const p = at(ev);
    if (st.tool === 'select') {
      const s = stroke.start;
      const x = Math.max(0, Math.min(s.x, p.x)), y = Math.max(0, Math.min(s.y, p.y));
      st.sel = { x: Math.round(x), y: Math.round(y), w: Math.round(Math.min(W, Math.max(s.x, p.x)) - x), h: Math.round(Math.min(H, Math.max(s.y, p.y)) - y) };
      drawOver(); return;
    }
    if (st.tool === 'move' && st.floating) {
      st.floating.x = Math.round(stroke.fx + p.x - stroke.start.x); st.floating.y = Math.round(stroke.fy + p.y - stroke.start.y);
      drawOver(); return;
    }
    if (!stroke.last) return;
    const dx = p.x - stroke.last.x, dy = p.y - stroke.last.y, dist = Math.hypot(dx, dy);
    const step = Math.max(1, st.size * 0.2);
    for (let s = step; s <= dist; s += step) dab({ x: stroke.last.x + (dx * s) / dist, y: stroke.last.y + (dy * s) / dist });
    if (dist >= step) stroke.last = p;
    changed();
  });
  const end = () => { if (st.sel && (st.sel.w < 2 || st.sel.h < 2)) st.sel = null; stroke = null; drawOver(); };
  over.addEventListener('pointerup', end); over.addEventListener('pointercancel', end);

  // ---------- selection, clipboard, paste ----------
  const region = () => st.sel || { x: 0, y: 0, w: W, h: H };
  const copy = () => { const r = region(); const c = canvasOf(r.w, r.h); c.getContext('2d').drawImage(paint, r.x, r.y, r.w, r.h, 0, 0, r.w, r.h); st.clip = { canvas: c, x: r.x, y: r.y }; };
  function floatImage(canvas, x, y) {
    st.floating = { canvas, x: Math.round(x ?? (W - canvas.width) / 2), y: Math.round(y ?? (H - canvas.height) / 2) };
    st.tool = 'move'; syncButtons(); drawOver();
  }
  function applyFloating() {
    if (!st.floating) return;
    push(); pctx.drawImage(st.floating.canvas, st.floating.x, st.floating.y); st.floating = null;
    syncButtons(); changed();
  }
  const fromImage = (img) => {
    // A picture bigger than the cover comes in fitted to it.
    const k = Math.min(1, W / img.naturalWidth, H / img.naturalHeight);
    const c = canvasOf(Math.max(1, Math.round(img.naturalWidth * k)), Math.max(1, Math.round(img.naturalHeight * k)));
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    floatImage(c);
  };
  const loadUrl = (url) => new Promise((ok, fail) => { const i = new Image(); i.onload = () => ok(i); i.onerror = fail; i.src = url; });
  const onPaste = async (ev) => {
    const item = [...(ev.clipboardData?.items || [])].find((i) => i.type.startsWith('image/'));
    if (!item || !host.isConnected) return;
    ev.preventDefault();
    const url = URL.createObjectURL(item.getAsFile());
    try { fromImage(await loadUrl(url)); } finally { URL.revokeObjectURL(url); }
  };
  document.addEventListener('paste', onPaste);

  const ACTS = {
    undo() { if (!undo.length) return; redo.push(snapshot()); pctx.putImageData(undo.pop(), 0, 0); syncButtons(); changed(); },
    redo() { if (!redo.length) return; undo.push(snapshot()); pctx.putImageData(redo.pop(), 0, 0); syncButtons(); changed(); },
    copy() { copy(); },
    cut() { if (!st.sel) return; copy(); push(); pctx.clearRect(st.sel.x, st.sel.y, st.sel.w, st.sel.h); changed(); },
    paste() { if (st.clip) floatImage(clone(st.clip.canvas), st.clip.x + 10, st.clip.y + 10); },
    fill() { const r = region(); push(); pctx.fillStyle = st.color; pctx.globalAlpha = st.strength / 100; pctx.fillRect(r.x, r.y, r.w, r.h); pctx.globalAlpha = 1; changed(); },
    flipH() { flip(true); }, flipV() { flip(false); },
    apply() { applyFloating(); },
    reset() { if (!confirm('Voltar à imagem original (perde as pinturas)?')) return; push(); pctx.clearRect(0, 0, W, H); pctx.drawImage(original, 0, 0); changed(); },
    adjReset() {
      for (const [k] of ADJUST) st.adj[k] = 0;
      adj.querySelectorAll('[data-adj]').forEach((i) => { if (i.dataset.adj !== 'feather') { i.value = 0; i.nextElementSibling.textContent = '0'; } });
      changed();
    },
  };
  function flip(h) {
    // The pasted piece when there is one, else the selection, else the whole picture.
    if (st.floating) {
      const c = canvasOf(st.floating.canvas.width, st.floating.canvas.height), x = c.getContext('2d');
      x.translate(h ? c.width : 0, h ? 0 : c.height); x.scale(h ? -1 : 1, h ? 1 : -1); x.drawImage(st.floating.canvas, 0, 0);
      st.floating.canvas = c; drawOver(); return;
    }
    const r = region(); push();
    const c = canvasOf(r.w, r.h), x = c.getContext('2d');
    x.translate(h ? r.w : 0, h ? 0 : r.h); x.scale(h ? -1 : 1, h ? 1 : -1); x.drawImage(paint, r.x, r.y, r.w, r.h, 0, 0, r.w, r.h);
    pctx.clearRect(r.x, r.y, r.w, r.h); pctx.drawImage(c, r.x, r.y); changed();
  }

  host.addEventListener('click', (ev) => {
    const t = ev.target.closest('[data-sp-tool]');
    if (t) { if (st.floating && t.dataset.spTool !== 'move') applyFloating(); st.tool = t.dataset.spTool; syncButtons(); drawOver(); return; }
    const a = ev.target.closest('[data-sp-act]');
    if (a && ACTS[a.dataset.spAct]) ACTS[a.dataset.spAct]();
  });
  host.addEventListener('input', (ev) => {
    const t = ev.target;
    if (t.dataset.adj) { st.adj[t.dataset.adj] = Number(t.value); t.nextElementSibling.textContent = t.value; changed(); return; }
    const k = t.dataset.sp;
    if (k === 'color') st.color = t.value;
    else if (k === 'zoom') { st.zoom = Number(t.value) / 100; setZoom(); }
    else if (k === 'size' || k === 'strength' || k === 'hardness') { st[k] = Number(t.value); drawOver(); }
  });
  host.addEventListener('change', async (ev) => {
    const t = ev.target;
    if (t.dataset.sp !== 'file' || !t.files?.[0]) return;
    const url = URL.createObjectURL(t.files[0]);
    try { fromImage(await loadUrl(url)); } finally { URL.revokeObjectURL(url); t.value = ''; }
  });

  // Starts at a zoom where the whole picture fits the panel.
  st.zoom = Math.min(4, Math.max(0.25, Math.min((host.clientWidth || 900) / W, 520 / H)));
  bar.querySelector('[data-sp="zoom"]').value = Math.round(st.zoom * 100);
  setZoom(); syncButtons(); render();

  return {
    output() { if (st.floating) applyFloating(); return adjusted(paint, st.adj); },
    destroy() { document.removeEventListener('paste', onPaste); host.innerHTML = ''; },
  };
}
