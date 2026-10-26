// Full-colour sport icons for the filter tiles: the real look of each ball, glove or board, drawn on a
// 64 grid. Table tennis and badminton are Twemoji graphics (Copyright Twitter, Inc. and other
// contributors, CC-BY 4.0, https://creativecommons.org/licenses/by/4.0/), shading added.
// Each icon takes an id prefix so its gradients stay unique when it appears more than once.

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

// A real football is a truncated icosahedron: 12 pentagons and 20 hexagons. Built once in 3D, turned
// so a pentagon faces us (a little tilted, like the emoji) and drawn face by face with light on it.
const BALL_FACES = (() => {
  const f = (1 + Math.sqrt(5)) / 2;
  const ico = [[0, 1, f], [0, 1, -f], [0, -1, f], [0, -1, -f], [1, f, 0], [1, -f, 0], [-1, f, 0], [-1, -f, 0], [f, 0, 1], [f, 0, -1], [-f, 0, 1], [-f, 0, -1]];
  const sub = (p, q) => [p[0] - q[0], p[1] - q[1], p[2] - q[2]];
  const dot = (p, q) => p[0] * q[0] + p[1] * q[1] + p[2] * q[2];
  const cross = (p, q) => [p[1] * q[2] - p[2] * q[1], p[2] * q[0] - p[0] * q[2], p[0] * q[1] - p[1] * q[0]];
  const unit = (p) => { const l = Math.hypot(...p); return p.map((v) => v / l); };
  const lerp = (p, q, t) => p.map((v, i) => v + (q[i] - v) * t);
  const near = (i, j) => Math.abs(Math.hypot(...sub(ico[i], ico[j])) - 2) < 1e-6;
  const faces = [];
  ico.forEach((v, i) => {
    const ring = ico.map((_, j) => j).filter((j) => j !== i && near(i, j)).map((j) => lerp(v, ico[j], 1 / 3));
    const n = unit(v); const u = unit(sub(ring[0], v)); const w = cross(n, u);
    ring.sort((p, q) => Math.atan2(dot(sub(p, v), w), dot(sub(p, v), u)) - Math.atan2(dot(sub(q, v), w), dot(sub(q, v), u)));
    faces.push({ pent: true, pts: ring });
  });
  for (let i = 0; i < 12; i += 1) for (let j = i + 1; j < 12; j += 1) for (let k = j + 1; k < 12; k += 1) {
    if (near(i, j) && near(j, k) && near(i, k)) {
      const [A, B, C] = [ico[i], ico[j], ico[k]];
      faces.push({ pent: false, pts: [lerp(A, B, 1 / 3), lerp(A, B, 2 / 3), lerp(B, C, 1 / 3), lerp(B, C, 2 / 3), lerp(C, A, 1 / 3), lerp(C, A, 2 / 3)] });
    }
  }
  // The view: pentagon 0 towards us with a point up, then tipped back a little.
  const z = unit(ico[0]); const up = unit(sub(ico[4], ico[0])); const y0 = unit(sub(up, z.map((v) => v * dot(up, z)))); const x0 = cross(y0, z);
  const tilt = (-14 * Math.PI) / 180; const side = (10 * Math.PI) / 180;
  const view = (p) => {
    const q = unit(p); let [x, y, d] = [dot(q, x0), dot(q, y0), dot(q, z)];
    [y, d] = [y * Math.cos(tilt) - d * Math.sin(tilt), y * Math.sin(tilt) + d * Math.cos(tilt)];
    [x, d] = [x * Math.cos(side) + d * Math.sin(side), -x * Math.sin(side) + d * Math.cos(side)];
    return [x, -y, d];
  };
  const light = unit([-0.45, -0.55, 0.7]);
  return faces.map((fc) => {
    // Each edge bulges out a little, as on a pumped ball: points along it pushed onto the sphere.
    const ring = fc.pts;
    const pts = [];
    ring.forEach((p, i) => { const q = ring[(i + 1) % ring.length]; for (let t = 0; t < 1; t += 0.25) pts.push(view(lerp(p, q, t))); });
    const c = view(ring.reduce((s2, p) => s2.map((v, i) => v + p[i] / ring.length), [0, 0, 0]));
    return { pent: fc.pent, pts, z: c[2], lit: Math.max(0, dot(unit(c), light)) };
  }).filter((fc) => fc.z > -0.15).sort((p, q) => p.z - q.z);
})();
const hex2rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const mixHex = (a, b, t) => `rgb(${hex2rgb(a).map((v, i) => Math.round(v + (hex2rgb(b)[i] - v) * t)).join(',')})`;

/** The football (also futsal and, in other colours, handball): the real panels, lit from the top left. */
function soccer(id, base, edge, patch) {
  const faces = BALL_FACES.map((fc) => {
    const d = `M${fc.pts.map(([x, y]) => `${r2(32 + x * 29)} ${r2(32 + y * 29)}`).join('L')}Z`;
    const fill = fc.pent ? mixHex(patch, '#4b515c', fc.lit * 0.4) : mixHex(edge, base, Math.min(1, 0.25 + fc.lit));
    return `<path d="${d}" fill="${fill}"/>`;
  }).join('');
  const seams = BALL_FACES.filter((fc) => !fc.pent).map((fc) => `M${fc.pts.map(([x, y]) => `${r2(32 + x * 29)} ${r2(32 + y * 29)}`).join('L')}Z`).join('');
  return `<defs><clipPath id="${id}c"><circle cx="32" cy="32" r="29"/></clipPath>
<radialGradient id="${id}s" cx="40%" cy="36%" r="68%"><stop offset=".55" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".38"/></radialGradient></defs>
<g clip-path="url(#${id}c)"><circle cx="32" cy="32" r="29" fill="${edge}"/>${faces}<path d="${seams}" fill="none" stroke="#3b4250" stroke-opacity=".55" stroke-width=".7" stroke-linejoin="round"/>
<circle cx="32" cy="32" r="29" fill="url(#${id}s)"/></g>
<circle cx="32" cy="32" r="29" fill="none" stroke="#1f2937" stroke-opacity=".45" stroke-width="1.2"/><ellipse cx="22" cy="16" rx="8" ry="4.5" fill="#fff" opacity=".45" transform="rotate(-30 22 16)"/>`;
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
  // Table tennis and badminton: the Twemoji drawings (36 grid), with shading added.
  tenismesa: (id) => `<defs>${radial(`${id}r`, '#ff5f6d', '#b81d33', '30%', '25%')}${linear(`${id}w`, '#e8b896', '#b97a5c')}${radial(`${id}b`, '#ffffff', '#b8c4cc', '35%', '30%')}</defs>
<g transform="scale(1.7778)"><path fill="url(#${id}r)" d="M23.106 5.971C17.615.48 8.384-.521 3.307 4.557-1.77 9.634-.77 18.865 4.721 24.356c3.554 3.554 7.785 4.323 11.707 3.058l-.015.013.13-.052c.264-.088.527-.179.788-.284a24.449 24.449 0 0 1 2.942-.806c1.848-.38 3.541 1.606 4.955 3.021 1.414 1.414 4.242 5.657 4.949 6.364.707.707 1.414 0 2.122-.707l.707-.707.707-.707c.707-.708 1.414-1.415.707-2.122-.707-.707-4.95-3.535-6.364-4.949-1.414-1.414-3.4-3.107-3.021-4.955a24.32 24.32 0 0 1 .653-2.481c1.974-4.222 1.537-8.952-2.582-13.071z"/><path fill="url(#${id}w)" d="M15.564 27.655c.289-.07.578-.149.864-.241l-.015.013.13-.052c.264-.088.527-.179.788-.284a24.449 24.449 0 0 1 2.942-.806c1.848-.38 3.541 1.606 4.955 3.021 1.414 1.414 4.242 5.657 4.949 6.364.707.707 1.414 0 2.122-.707l.707-.707.707-.707c.707-.708 1.414-1.415.707-2.122-.707-.707-4.95-3.535-6.364-4.949-1.414-1.414-3.4-3.107-3.021-4.955a24.32 24.32 0 0 1 .653-2.481c.357-.764.633-1.543.824-2.334L15.564 27.655z"/><path fill="#FFCC4D" d="m20.277 22.942 1.414-1.414 12.022 12.021-1.414 1.414z"/><circle cx="31.5" cy="6.5" r="3.5" fill="url(#${id}b)"/><ellipse cx="9" cy="8" rx="5" ry="2.6" transform="rotate(-45 9 8)" fill="#fff" opacity=".28"/></g>`,
  badminton: (id) => `<g transform="scale(1.7778)"><path fill="#55ACEE" d="M30.385 29A.98.98 0 0 1 29 30.385L15.5 16.884a.979.979 0 0 1 1.384-1.384L30.385 29z"/><path fill="#292F33" d="M35.561 33.439a1.5 1.5 0 1 1-2.121 2.121l-5.656-5.656a1.5 1.5 0 1 1 2.121-2.121l5.656 5.656z"/><g fill="#99AAB5"><path d="m2.447 5.2.707-.707L15.178 16.51l-.707.707zm1.417-2.83.707-.707 12.728 12.728-.708.707z"/><path d="M1.035 9.441 9.52.956l.707.707-8.485 8.485zm.707 3.535L12.35 2.37l.707.707L2.449 13.684zm2.122 2.122L15.177 3.785l.707.707L4.571 15.805zm2.828 1.415 9.899-9.9.707.707-9.9 9.9zm2.828 1.413 8.485-8.485.707.707-8.485 8.486z"/><path d="m1.035 8.027.707-.707L12.35 17.926l-.707.707zM7.4 1.663l.706-.707 10.607 10.606-.707.708z"/></g><path fill="#55ACEE" d="M2.468 2.468c-3.471 3.472-3.119 9.452.786 13.357 3.906 3.906 9.885 4.257 13.356.786 3.472-3.472 3.121-9.45-.786-13.356C11.919-.651 5.94-1.003 2.468 2.468zm12.846 12.846c-2.733 2.733-7.535 2.364-10.725-.825C1.4 11.3 1.032 6.499 3.765 3.765c2.734-2.734 7.535-2.364 10.724.825s3.559 7.991.825 10.724z"/><g fill="#269"><path d="M17.298 14.391a1 1 0 0 1 0 1.414l-1.415 1.415a1 1 0 1 1-1.414-1.415l1.414-1.414a1 1 0 0 1 1.415 0z"/><path d="M18.005 16.512a1 1 0 1 1-1.414 1.415l-.707-.707a1.001 1.001 0 0 1 1.415-1.415l.706.707z"/></g><path fill="#269" d="M29.56 27.44c.586.585-.122.828-.707 1.414-.586.585-.829 1.292-1.414.707a1.5 1.5 0 1 1 2.121-2.121z"/><path fill="#BE1931" d="M21.81 3.182a2 2 0 0 0 0 2.828l.707.707.707-.707 1.414-1.414.709-.707-.709-.707a2 2 0 0 0-2.828 0z"/><path fill="#99AAB5" d="m22.52 6.716 2.83-2.828.707.707-2.83 2.829z"/><path fill="#E1E8ED" d="m23.225 7.424 2.83-2.828c1.473.488 9.125 5.069 8.861 5.334-.758.759-1.912.201-1.912.201s.844.806.117 1.532-1.531-.118-1.531-.118.969.741.149 1.564c-.826.826-1.562-.149-1.562-.149s.729.981.098 1.613c-.633.631-1.514-.199-1.514-.199s.418.998-.342 1.756c-.362.364-4.609-7.33-5.194-8.706z"/><path fill="#CCD6DD" d="M26.414 7.823c.578-.683 5.432 3.727 4.58 4.579-.853.851-5.275-3.759-4.58-4.579zm1.705 7.448c.68-.443-3.072-5.816-3.535-5.427-.031.026-.045.072-.053.126.883 1.626 2.006 3.594 2.824 4.867.336.342.616.53.764.434zm.272-9.233c-.391.462 4.984 4.214 5.427 3.535.115-.178-.17-.541-.656-.97a91.171 91.171 0 0 0-4.285-2.571c-.24-.065-.418-.074-.486.006zm-2.989 2.859c.426-.429 4.641 4.589 4.002 5.093-.638.5-4.515-4.576-4.002-5.093zm2.041-2.041c-.428.426 4.59 4.64 5.092 4.002.502-.639-4.574-4.516-5.092-4.002z"/></g>`,
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
