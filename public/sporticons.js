// Full-colour sport icons for the filter tiles: the real look of each ball, glove or board, drawn on a
// 64 grid. Each icon takes an id prefix so its gradients stay unique when it appears more than once.

const r2 = (n) => Math.round(n * 100) / 100;
const pt = (cx, cy, r, deg) => [r2(cx + r * Math.cos((deg * Math.PI) / 180)), r2(cy + r * Math.sin((deg * Math.PI) / 180))];
const poly = (pts) => `M${pts.map((p) => p.join(' ')).join('L')}Z`;
const pentagon = (cx, cy, r, rot) => poly([0, 1, 2, 3, 4].map((k) => pt(cx, cy, r, rot + k * 72)));
const radial = (id, from, to, fx = '35%', fy = '30%') =>
  `<radialGradient id="${id}" cx="${fx}" cy="${fy}" r="75%"><stop offset="0" stop-color="${from}"/><stop offset="1" stop-color="${to}"/></radialGradient>`;
const linear = (id, from, to, x2 = '1', y2 = '1') =>
  `<linearGradient id="${id}" x1="0" y1="0" x2="${x2}" y2="${y2}"><stop offset="0" stop-color="${from}"/><stop offset="1" stop-color="${to}"/></linearGradient>`;
// A soft white shine on the top left of a round thing.
const shine = (cx, cy, rx, ry) => `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="#fff" opacity=".35"/>`;

/** Points on a cubic Bézier, with the direction at each: for the stitches on a seam. */
function along(p0, p1, p2, p3, n) {
  const out = [];
  for (let i = 1; i < n; i += 1) {
    const t = i / n; const u = 1 - t;
    const x = u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0];
    const y = u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1];
    const dx = 3 * u * u * (p1[0] - p0[0]) + 6 * u * t * (p2[0] - p1[0]) + 3 * t * t * (p3[0] - p2[0]);
    const dy = 3 * u * u * (p1[1] - p0[1]) + 6 * u * t * (p2[1] - p1[1]) + 3 * t * t * (p3[1] - p2[1]);
    const len = Math.hypot(dx, dy) || 1;
    out.push({ x, y, nx: -dy / len, ny: dx / len, tx: dx / len, ty: dy / len });
  }
  return out;
}
const curve = (a, b, c, d) => `M${a.join(' ')}C${b.join(' ')} ${c.join(' ')} ${d.join(' ')}`;
/** Little V stitches along a seam, as on a baseball. */
function stitches(a, b, c, d, n, len) {
  return along(a, b, c, d, n).map((s) => {
    const p = (k, m) => `${r2(s.x + s.nx * k + s.tx * m)} ${r2(s.y + s.ny * k + s.ty * m)}`;
    return `M${p(-len, -1.2)}L${p(0, 0.6)}L${p(len, -1.2)}`;
  }).join('');
}

/** The classic black-and-white football (also futsal and, in other colours, handball). */
function soccer(id, base, edge, patch) {
  const inner = pentagon(32, 32, 9.4, -90);
  const outer = [0, 1, 2, 3, 4].map((k) => { const [x, y] = pt(32, 32, 27, -90 + k * 72); return pentagon(x, y, 9.4, 90 + k * 72); });
  const seams = [0, 1, 2, 3, 4].map((k) => {
    const [x1, y1] = pt(32, 32, 9.4, -90 + k * 72); const [x2, y2] = pt(32, 32, 17.6, -90 + k * 72);
    const [x3, y3] = pt(32, 32, 20, -54 + k * 72); const [x4, y4] = pt(32, 32, 29, -54 + k * 72);
    return `M${x1} ${y1}L${x2} ${y2}M${x3} ${y3}L${x4} ${y4}`;
  }).join('');
  return `<defs>${radial(`${id}g`, base, edge)}<clipPath id="${id}c"><circle cx="32" cy="32" r="28.5"/></clipPath></defs>
<circle cx="32" cy="32" r="29" fill="url(#${id}g)"/>
<g clip-path="url(#${id}c)"><path d="${inner}${outer.join('')}" fill="${patch}"/><path d="${seams}" stroke="${patch}" stroke-width="1.6" opacity=".55" fill="none"/></g>
<circle cx="32" cy="32" r="29" fill="none" stroke="#1f2937" stroke-opacity=".35" stroke-width="1.4"/>${shine(22, 18, 7, 4)}`;
}

/** Ball split in six swirled panels, like a volleyball. */
function volley(id) {
  const arm = (deg) => { const rot = (p) => { const a = (deg * Math.PI) / 180; const x = p[0] - 32; const y = p[1] - 32; return [r2(32 + x * Math.cos(a) - y * Math.sin(a)), r2(32 + x * Math.sin(a) + y * Math.cos(a))]; }; return [[32, 32], [42, 28], [48, 16], [44, 3]].map(rot); };
  const arms = [0, 60, 120, 180, 240, 300].map(arm);
  const colours = ['#ffd21f', '#f8f8f4', '#1d58c4', '#ffd21f', '#f8f8f4', '#1d58c4'];
  const panels = arms.map((a, k) => {
    const b = arms[(k + 1) % 6];
    return `<path d="M${a[0].join(' ')}C${a[1].join(' ')} ${a[2].join(' ')} ${a[3].join(' ')}L${pt(32, 32, 40, -67.5 + k * 60 + 30).join(' ')}L${b[3].join(' ')}C${b[2].join(' ')} ${b[1].join(' ')} ${b[0].join(' ')}Z" fill="${colours[k]}"/>`;
  }).join('');
  const lines = arms.map((a) => curve(a[0], a[1], a[2], a[3])).join('');
  return `<defs><clipPath id="${id}c"><circle cx="32" cy="32" r="28.5"/></clipPath>${radial(`${id}s`, 'rgba(255,255,255,0)', 'rgba(0,0,0,.28)', '35%', '30%')}</defs>
<g clip-path="url(#${id}c)">${panels}<path d="${lines}" stroke="#1e293b" stroke-opacity=".55" stroke-width="1.5" fill="none"/><circle cx="32" cy="32" r="29" fill="url(#${id}s)"/></g>
<circle cx="32" cy="32" r="29" fill="none" stroke="#1f2937" stroke-opacity=".35" stroke-width="1.4"/>${shine(22, 18, 7, 4)}`;
}

/** Dartboard: twenty black and cream wedges, red and green doubles and trebles, the bull. */
function dartboard(id) {
  const wedge = (r0, r1, k) => {
    const a = -99 + k * 18; const b = a + 18;
    const [x0, y0] = pt(32, 32, r1, a); const [x1, y1] = pt(32, 32, r1, b); const [x2, y2] = pt(32, 32, r0, b); const [x3, y3] = pt(32, 32, r0, a);
    return `M${x0} ${y0}A${r1} ${r1} 0 0 1 ${x1} ${y1}L${x2} ${y2}A${r0} ${r0} 0 0 0 ${x3} ${y3}Z`;
  };
  const rings = [[3.6, 13, 'w'], [13, 15.5, 'r'], [15.5, 22, 'w'], [22, 24.5, 'r']];
  let dark = ''; let light = ''; let red = ''; let green = '';
  for (let k = 0; k < 20; k += 1) {
    for (const [r0, r1, kind] of rings) {
      const d = wedge(r0, r1, k);
      if (kind === 'w') { if (k % 2) light += d; else dark += d; } else if (k % 2) green += d; else red += d;
    }
  }
  return `<circle cx="32" cy="32" r="30" fill="#1b1b1b"/><circle cx="32" cy="32" r="30" fill="none" stroke="#4b5563" stroke-width="1"/>
<path d="${dark}" fill="#141414"/><path d="${light}" fill="#f1e6c8"/><path d="${red}" fill="#e3292e"/><path d="${green}" fill="#1f9d4c"/>
<circle cx="32" cy="32" r="3.6" fill="#1f9d4c"/><circle cx="32" cy="32" r="1.7" fill="#e3292e"/>
<circle cx="32" cy="32" r="24.5" fill="none" stroke="#9ca3af" stroke-width=".5"/>`;
}

const ICONS = {
  futebol: (id) => soccer(id, '#ffffff', '#cfd5dd', '#111827'),
  futsal: (id) => soccer(id, '#fff7d1', '#f2c94c', '#1e3a8a'),
  andebol: (id) => soccer(id, '#ffffff', '#cfd5dd', '#1d4ed8'),
  basquetebol: (id) => `<defs>${radial(`${id}g`, '#ffa04d', '#c4510f')}</defs>
<circle cx="32" cy="32" r="29" fill="url(#${id}g)"/>
<path d="M32 3v58M3 32h58M13 10c9 8 9 36 0 44M51 10c-9 8-9 36 0 44" stroke="#2b1306" stroke-width="2.2" fill="none" stroke-linecap="round"/>
<circle cx="32" cy="32" r="29" fill="none" stroke="#2b1306" stroke-width="2"/>${shine(21, 17, 7, 4)}`,
  tenis: (id) => `<defs>${radial(`${id}g`, '#eaff6b', '#9cc414')}<clipPath id="${id}c"><circle cx="32" cy="32" r="29"/></clipPath></defs>
<circle cx="32" cy="32" r="29" fill="url(#${id}g)"/>
<g clip-path="url(#${id}c)" fill="none" stroke="#fdfdf5" stroke-width="3.6" stroke-linecap="round"><path d="M8 10c14 10 14 34 0 44M56 10c-14 10-14 34 0 44"/></g>
<circle cx="32" cy="32" r="29" fill="none" stroke="#6b8a0e" stroke-opacity=".5" stroke-width="1.2"/>${shine(21, 17, 7, 4)}`,
  voleibol: volley,
  hoquei: (id) => `<defs>${linear(`${id}w`, '#e2a868', '#9c5c24')}</defs>
<path d="M45 3l6 3-23.5 44.5-6-3z" fill="url(#${id}w)" stroke="#6b3b12" stroke-width="1"/>
<path d="M21.5 47.5l6 3-3.6 7.3c-.9 1.8-2.6 2.9-4.6 2.9H6.6A3.6 3.6 0 0 1 3 57.1v-.5A3.6 3.6 0 0 1 6.6 53H19z" fill="#1f2937"/>
<path d="M9 53.2v7.4M13 53.2v7.4M17 53.2v7.4" stroke="#f8fafc" stroke-width="1.6"/>
<path d="M45 6l5 2.5M41.8 12l5 2.5" stroke="#1f2937" stroke-width="2"/>
<path d="M38 50v5a10.5 4 0 0 0 21 0v-5z" fill="#0b0b0b"/><ellipse cx="48.5" cy="50" rx="10.5" ry="4" fill="#3f4652"/>`,
  dardos: dartboard,
  esports: (id) => `<defs>${linear(`${id}b`, '#4b5163', '#1a1d24', '0')}</defs>
<path d="M19 17h26c8.5 0 13 6.5 15 15l2.6 12.4c1.3 6.2-2 10.6-6.5 10.6-3 0-5.3-2-7.2-5L45 44H19l-3.9 6c-1.9 3-4.2 5-7.2 5-4.5 0-7.8-4.4-6.5-10.6L4 32c2-8.5 6.5-15 15-15z" fill="url(#${id}b)" stroke="#0f1115" stroke-width="1.2"/>
<path d="M17.5 25.5h4v5h5v4h-5v5h-4v-5h-5v-4h5z" fill="#d1d5db"/>
<circle cx="45" cy="25.5" r="2.9" fill="#22c55e"/><circle cx="51" cy="31.5" r="2.9" fill="#ef4444"/><circle cx="39" cy="31.5" r="2.9" fill="#3b82f6"/><circle cx="45" cy="37.5" r="2.9" fill="#facc15"/>
<circle cx="26" cy="42" r="3.6" fill="#0b0d11"/><circle cx="38" cy="42" r="3.6" fill="#0b0d11"/><path d="M29.5 22h5" stroke="#9ca3af" stroke-width="1.6" stroke-linecap="round"/>`,
  tenismesa: (id) => `<defs>${radial(`${id}r`, '#ff5a52', '#a40f12')}${linear(`${id}w`, '#e8b47a', '#a8692c')}</defs>
<path d="M36 37l5-5 18 18a3.5 3.5 0 0 1 0 5l-0 0a3.5 3.5 0 0 1-5 0z" fill="url(#${id}w)" stroke="#6b3b12" stroke-width="1"/>
<circle cx="27" cy="27" r="21" fill="#1f2937"/><circle cx="27" cy="27" r="19.4" fill="url(#${id}r)"/>${shine(20, 18, 7, 4)}
<circle cx="53" cy="12" r="7" fill="#fff" stroke="#cbd5e1" stroke-width="1"/><circle cx="51" cy="10" r="2.2" fill="#fff" opacity=".9"/><path d="M48 15a7 7 0 0 0 11-5" stroke="#e2e8f0" stroke-width="1.4" fill="none"/>`,
  badminton: (id) => `<defs>${linear(`${id}f`, '#ffffff', '#d7dce3', '1', '0')}${radial(`${id}k`, '#fff8e8', '#d8c7a4', '40%', '20%')}</defs>
<path d="M10 9c3-3 6-3 8 0 2-3 5-3 7 0 2-3 5-3 7 0 2-3 5-3 7 0 2-3 5-3 7 0 2-3 5-3 8 0L41 42H23z" fill="url(#${id}f)" stroke="#94a3b8" stroke-width="1"/>
<path d="M18 9l7 33M25 9l3 33M32 9v33M39 9l-3 33M46 9l-7 33" stroke="#94a3b8" stroke-width="1" fill="none"/>
<path d="M14 25h36" stroke="#cbd5e1" stroke-width="1"/><rect x="22" y="40" width="20" height="5" rx="1.5" fill="#e11d48"/>
<path d="M23 45h18v3a9 9 0 0 1-18 0z" fill="url(#${id}k)" stroke="#a8977a" stroke-width="1"/>`,
  futamericano: (id) => `<defs>${radial(`${id}g`, '#b35a26', '#5a240b', '40%', '35%')}</defs>
<g transform="rotate(-40 32 32)"><ellipse cx="32" cy="32" rx="29" ry="17" fill="url(#${id}g)" stroke="#3b1606" stroke-width="1.4"/>
<path d="M13 21c2.6 6 2.6 16 0 22M51 21c-2.6 6-2.6 16 0 22" stroke="#fff" stroke-width="2.6" fill="none" stroke-linecap="round"/>
<path d="M22 32h20" stroke="#fff" stroke-width="2.2" stroke-linecap="round"/><path d="M24 28.8v6.4M28 28.8v6.4M32 28.8v6.4M36 28.8v6.4M40 28.8v6.4" stroke="#fff" stroke-width="1.8" stroke-linecap="round"/>
<ellipse cx="26" cy="22" rx="10" ry="3" fill="#fff" opacity=".18"/></g>`,
  basebol: (id) => `<defs>${radial(`${id}g`, '#ffffff', '#d6d3cc')}<clipPath id="${id}c"><circle cx="32" cy="32" r="29"/></clipPath></defs>
<circle cx="32" cy="32" r="29" fill="url(#${id}g)"/>
<g clip-path="url(#${id}c)" fill="none" stroke="#d62828" stroke-linecap="round"><path d="${curve([10, 8], [22, 20], [22, 44], [10, 56])}${curve([54, 8], [42, 20], [42, 44], [54, 56])}" stroke-width="1.6"/>
<path d="${stitches([10, 8], [22, 20], [22, 44], [10, 56], 9, 3)}${stitches([54, 8], [42, 20], [42, 44], [54, 56], 9, 3)}" stroke-width="1.5"/></g>
<circle cx="32" cy="32" r="29" fill="none" stroke="#9ca3af" stroke-width="1.2"/>${shine(24, 16, 7, 4)}`,
  raguebi: (id) => `<defs>${radial(`${id}g`, '#ffffff', '#d1d5db', '40%', '30%')}<clipPath id="${id}c"><ellipse cx="32" cy="32" rx="29" ry="17.5"/></clipPath></defs>
<g transform="rotate(-35 32 32)"><ellipse cx="32" cy="32" rx="29" ry="17.5" fill="url(#${id}g)"/>
<g clip-path="url(#${id}c)"><path d="M15 12c-4 6-4 34 0 40h5c-4-6-4-34 0-40zM49 12c4 6 4 34 0 40h-5c4-6 4-34 0-40z" fill="#1d4ed8"/><path d="M21 12c-4 6-4 34 0 40h2.5c-4-6-4-34 0-40zM43 12c4 6 4 34 0 40h-2.5c4-6 4-34 0-40z" fill="#dc2626"/></g>
<path d="M4 32c16-3 40-3 56 0" stroke="#94a3b8" stroke-width="1.2" fill="none"/>
<ellipse cx="32" cy="32" rx="29" ry="17.5" fill="none" stroke="#475569" stroke-opacity=".55" stroke-width="1.3"/><ellipse cx="28" cy="22" rx="11" ry="3" fill="#fff" opacity=".5"/></g>`,
  criquete: (id) => `<defs>${radial(`${id}g`, '#e8473f', '#7a0b0b')}<clipPath id="${id}c"><circle cx="32" cy="32" r="29"/></clipPath></defs>
<circle cx="32" cy="32" r="29" fill="url(#${id}g)"/>
<g clip-path="url(#${id}c)" fill="none" stroke-linecap="round"><path d="M0 22c20 12 44 12 64 0M0 28c20 12 44 12 64 0" stroke="#f6eddc" stroke-width="1.6"/>
<path d="${stitches([0, 22], [20, 34], [44, 34], [64, 22], 14, 2.2)}${stitches([0, 28], [20, 40], [44, 40], [64, 28], 14, 2.2)}" stroke="#f6eddc" stroke-width="1"/></g>
<circle cx="32" cy="32" r="29" fill="none" stroke="#4a0606" stroke-width="1.2"/>${shine(22, 17, 7, 4)}`,
  boxe: (id) => `<defs>${radial(`${id}g`, '#ff4d4d', '#a10d12', '35%', '25%')}${linear(`${id}c`, '#ffffff', '#d1d5db', '0')}</defs>
<path d="M19 46h24v11a3.5 3.5 0 0 1-3.5 3.5h-17A3.5 3.5 0 0 1 19 57z" fill="url(#${id}c)" stroke="#9ca3af" stroke-width="1"/>
<path d="M22 50.5h18M22 55h18" stroke="#9ca3af" stroke-width="1.2"/>
<path d="M17 31c-1-14 9-25 23-25 11 0 18 8.5 18 19 0 12-7 22-17 22H24c-5 0-8.2-4.5-8-9z" fill="url(#${id}g)" stroke="#6b0a0d" stroke-width="1.4"/>
<path d="M17 33c-6.5-.5-10-5.6-8.4-11.2 1.6-5.4 7.5-6.4 11.4-2.8 2.4 2.2 3 5.8 2.4 9" fill="url(#${id}g)" stroke="#6b0a0d" stroke-width="1.4"/>
<path d="M26 19c4-3 12-4 19-1M23 36c6 1.6 14 1.6 22-.6" stroke="#6b0a0d" stroke-opacity=".55" stroke-width="1.4" fill="none" stroke-linecap="round"/>
<ellipse cx="34" cy="13" rx="10" ry="3.6" fill="#fff" opacity=".35"/>`,
  mma: (id) => `<defs>${linear(`${id}g`, '#3f4450', '#0e1014', '0')}</defs>
<rect x="15" y="4" width="7.6" height="17" rx="3.8" fill="#e6b088" stroke="#a8714a" stroke-width="1"/><rect x="23.4" y="2" width="7.6" height="19" rx="3.8" fill="#e6b088" stroke="#a8714a" stroke-width="1"/>
<rect x="31.8" y="2.6" width="7.6" height="18.4" rx="3.8" fill="#e6b088" stroke="#a8714a" stroke-width="1"/><rect x="40.2" y="5" width="7.6" height="16" rx="3.8" fill="#e6b088" stroke="#a8714a" stroke-width="1"/>
<path d="M13 22a8 8 0 0 1 8-8h22a8 8 0 0 1 8 8v12a10 10 0 0 1-10 10H23a10 10 0 0 1-10-10z" fill="url(#${id}g)" stroke="#000" stroke-width="1.2"/>
<path d="M13 30c-5 0-8-3-7-8 1-4 5-5 8-3" fill="url(#${id}g)" stroke="#000" stroke-width="1.2"/>
<rect x="16" y="43" width="32" height="8" rx="2" fill="#1a1d24"/><rect x="14" y="50" width="36" height="9" rx="2.5" fill="#dc2626" stroke="#7f1d1d" stroke-width="1"/>
<path d="M18 21h28" stroke="#fff" stroke-opacity=".18" stroke-width="2.4" stroke-linecap="round"/>`,
};

let seq = 0;
/** The colour icon of a sport (an SVG string), or '' when it has none (Popular, Resultados…). */
export function colourSportIcon(sport, size = 30) {
  const draw = ICONS[sport];
  if (!draw) return '';
  seq += 1;
  return `<svg class="sport-ico" viewBox="0 0 64 64" width="${size}" height="${size}" aria-hidden="true">${draw(`si${seq}`)}</svg>`;
}
