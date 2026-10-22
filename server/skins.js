// Covers ("películas") over parts of a casino game, made in Admin → Películas: a picture placed over
// the game frame at a box given in % of the frame. The frame keeps the proportion the cover was made
// for (ratio = width / height of the reference screenshot), so the cover always lands on the same spot.
// side: 'land' (computer, landscape) or 'port' (phone held upright).
//
// The reference screenshot and the clean picture are kept too, with the alignment, so a cover can be
// adjusted later in the editor.

import fs from 'node:fs';
import path from 'node:path';
import { nowIso, getSetting, setSetting } from './db.js';

const SIDES = new Set(['land', 'port']);
const IMAGE = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/;

export class SkinError extends Error {}

function decode(dataUrl, max) {
  const m = IMAGE.exec(String(dataUrl || ''));
  if (!m) throw new SkinError('Imagem inválida (PNG, JPG ou WEBP).');
  const buf = Buffer.from(m[2], 'base64');
  if (buf.length > max) throw new SkinError('Imagem demasiado grande.');
  return { mime: m[1], buf };
}

const num = (v, lo, hi) => {
  const n = Number(v);
  if (!Number.isFinite(n) || n < lo || n > hi) throw new SkinError('Valores de posição inválidos.');
  return n;
};

export function createSkins(db, { seedDir = null } = {}) {
  db.exec(`CREATE TABLE IF NOT EXISTS casino_skins (
    id INTEGER PRIMARY KEY, code TEXT NOT NULL, name TEXT, side TEXT NOT NULL, ratio REAL NOT NULL, box TEXT NOT NULL,
    image BLOB NOT NULL, mime TEXT NOT NULL, enabled INTEGER NOT NULL DEFAULT 1,
    ref_image BLOB, ref_mime TEXT, clean_image BLOB, clean_mime TEXT, align TEXT, updated_at TEXT NOT NULL)`);
  // When the cover shows (Pragmatic first shows its loading bar and an intro screen):
  //   touch on:  \`after\` seconds after the first touch inside the game (the one that starts it); if
  //              nobody touches, \`delay\` seconds after the page loaded (0 = never).
  //   touch off: \`delay\` seconds after the page loaded.
  const cols = new Set(db.prepare('PRAGMA table_info(casino_skins)').all().map((c) => c.name));
  if (!cols.has('delay')) db.exec('ALTER TABLE casino_skins ADD COLUMN delay REAL NOT NULL DEFAULT 8');
  if (!cols.has('touch')) db.exec('ALTER TABLE casino_skins ADD COLUMN touch INTEGER NOT NULL DEFAULT 1');
  if (!cols.has('after')) db.exec('ALTER TABLE casino_skins ADD COLUMN after REAL NOT NULL DEFAULT 0.5');

  const row = (r) => ({
    id: r.id, code: r.code, name: r.name || r.code, side: r.side, ratio: r.ratio, box: JSON.parse(r.box), enabled: !!r.enabled,
    delay: r.delay, touch: !!r.touch, after: r.after,
    align: r.align ? JSON.parse(r.align) : null, updatedAt: r.updated_at,
    img: `/api/casino/skin/${r.id}?v=${encodeURIComponent(r.updated_at)}`,
    ref: r.has_ref ? `/api/admin/skins/${r.id}/ref?v=${encodeURIComponent(r.updated_at)}` : null,
    clean: r.has_clean ? `/api/admin/skins/${r.id}/clean?v=${encodeURIComponent(r.updated_at)}` : null,
  });
  const COLS = 'id, code, name, side, ratio, box, enabled, delay, touch, after, align, updated_at, ref_image IS NOT NULL AS has_ref, clean_image IS NOT NULL AS has_clean';

  /** Every cover, for the editor. */
  const all = () => db.prepare(`SELECT ${COLS} FROM casino_skins ORDER BY name, side, id`).all().map(row);

  /** The covers switched on, as the site uses them: { code, side, ratio, box, img }. */
  const live = () => db.prepare(`SELECT ${COLS} FROM casino_skins WHERE enabled = 1 ORDER BY id`).all().map(row)
    .map(({ code, side, ratio, box, img, delay, touch, after }) => ({ code, side, ratio, box, img, delay, touch, after }));

  function image(id, which = 'image') {
    const col = { image: ['image', 'mime'], ref: ['ref_image', 'ref_mime'], clean: ['clean_image', 'clean_mime'] }[which];
    const r = db.prepare(`SELECT ${col[0]} AS data, ${col[1]} AS mime FROM casino_skins WHERE id = ?`).get(Number(id));
    return r?.data ? { data: Buffer.from(r.data), mime: r.mime } : null;
  }

  /** Creates (no id) or changes a cover. The picture is needed when creating; references are optional. */
  function save(input) {
    const id = input.id ? Number(input.id) : null;
    const old = id ? db.prepare('SELECT id FROM casino_skins WHERE id = ?').get(id) : null;
    if (id && !old) throw new SkinError('Película não encontrada.');
    const code = String(input.code || '').trim().slice(0, 80);
    if (!code) throw new SkinError('Escolha o jogo.');
    const side = String(input.side || '');
    if (!SIDES.has(side)) throw new SkinError('Escolha computador ou telemóvel.');
    const ratio = num(input.ratio, 0.2, 5);
    const box = (Array.isArray(input.box) ? input.box : []).map((v) => Math.round(num(v, -1, 101) * 1000) / 1000);
    if (box.length !== 4 || box[2] <= 0 || box[3] <= 0) throw new SkinError('Marque a zona a tapar.');
    const img = input.image ? decode(input.image, 4_000_000) : null;
    if (!id && !img) throw new SkinError('Falta a imagem da película.');
    const ref = input.refImage ? decode(input.refImage, 5_000_000) : null;
    const clean = input.cleanImage ? decode(input.cleanImage, 5_000_000) : null;
    const align = input.align ? JSON.stringify({ x: num(input.align.x, -1e5, 1e5), y: num(input.align.y, -1e5, 1e5), s: num(input.align.s, 0.01, 100) }) : null;
    const now = nowIso();
    const fields = { code, name: String(input.name || code).slice(0, 120), side, ratio, box: JSON.stringify(box), enabled: input.enabled === false ? 0 : 1, updated_at: now };
    if (input.delay !== undefined) fields.delay = Math.round(num(input.delay, 0, 60) * 10) / 10;
    if (input.touch !== undefined) fields.touch = input.touch ? 1 : 0;
    if (input.after !== undefined) fields.after = Math.round(num(input.after, 0, 30) * 10) / 10;
    if (img) Object.assign(fields, { image: img.buf, mime: img.mime });
    if (ref) Object.assign(fields, { ref_image: ref.buf, ref_mime: ref.mime });
    if (clean) Object.assign(fields, { clean_image: clean.buf, clean_mime: clean.mime });
    if (align) fields.align = align;
    const keys = Object.keys(fields);
    if (id) {
      db.prepare(`UPDATE casino_skins SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`).run(...keys.map((k) => fields[k]), id);
      return get(id);
    }
    const { lastInsertRowid } = db.prepare(`INSERT INTO casino_skins (${keys.join(', ')}) VALUES (${keys.map(() => '?').join(', ')})`).run(...keys.map((k) => fields[k]));
    return get(Number(lastInsertRowid));
  }

  const get = (id) => { const r = db.prepare(`SELECT ${COLS} FROM casino_skins WHERE id = ?`).get(Number(id)); return r ? row(r) : null; };
  const setEnabled = (id, on) => db.prepare('UPDATE casino_skins SET enabled = ?, updated_at = ? WHERE id = ?').run(on ? 1 : 0, nowIso(), Number(id)).changes > 0;
  const remove = (id) => db.prepare('DELETE FROM casino_skins WHERE id = ?').run(Number(id)).changes > 0;

  // The first covers (Gates of Olympus, computer and phone) come with the site: put them in the table once.
  if (seedDir && !getSetting(db, 'casino.skins.seeded', false)) {
    const file = (n) => { try { return fs.readFileSync(path.join(seedDir, n)); } catch { return null; } };
    const seeds = [
      { file: 'vs20olympgate-land.png', side: 'land', ratio: 1162 / 660, box: [1.549, 12.121, 14.802, 69.394] },
      { file: 'vs20olympgate-port.png', side: 'port', ratio: 1206 / 1884, box: [12.023, 58.652, 75.622, 11.465] },
    ];
    for (const s of seeds) {
      const buf = file(s.file);
      if (!buf) continue;
      db.prepare(`INSERT INTO casino_skins (code, name, side, ratio, box, image, mime, enabled, updated_at) VALUES ('vs20olympgate', 'Gates of Olympus', ?, ?, ?, ?, 'image/png', 1, ?)`)
        .run(s.side, s.ratio, JSON.stringify(s.box), buf, nowIso());
    }
    setSetting(db, 'casino.skins.seeded', true);
  }

  return { all, live, image, save, get, setEnabled, remove };
}
