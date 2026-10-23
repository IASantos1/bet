// Banners at the top of the casino (a carousel), made in Admin → Banners: a picture (or a short video,
// MP4/WEBM, played muted in a loop) for computers and one for phones, a title, a line of text, a button with a link, the terms (shown under the banner, as SRIJ
// asks for any offer), dates when it runs, who sees it and the order.

import { nowIso } from './db.js';

const IMAGE = /^data:(image\/(?:png|jpeg|webp)|video\/(?:mp4|webm));base64,([A-Za-z0-9+/=]+)$/;
const AUDIENCES = new Set(['all', 'guest', 'user']);

export class BannerError extends Error {}

function decode(dataUrl) {
  const m = IMAGE.exec(String(dataUrl || ''));
  if (!m) throw new BannerError('Ficheiro inválido (imagem PNG, JPG ou WEBP, ou vídeo MP4 ou WEBM).');
  const buf = Buffer.from(m[2], 'base64');
  const video = m[1].startsWith('video/');
  if (buf.length > (video ? 12_000_000 : 3_000_000)) throw new BannerError(video ? 'Vídeo demasiado grande (máximo 12 MB).' : 'Imagem demasiado grande (máximo 3 MB).');
  return { mime: m[1], buf };
}
const text = (v, max) => String(v ?? '').trim().slice(0, max);
/** Links: a page of the site (#/…) or an https address. */
function link(v) {
  const s = text(v, 300);
  if (!s) return '';
  if (s.startsWith('#/') || /^https:\/\/[^\s]+$/i.test(s)) return s;
  throw new BannerError('A ligação tem de ser uma página do site (#/casino/…) ou um endereço https://.');
}
function when(v) {
  if (!v) return null;
  const t = Date.parse(v);
  if (!Number.isFinite(t)) throw new BannerError('Data inválida.');
  return new Date(t).toISOString();
}

export function createBanners(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS casino_banners (
    id INTEGER PRIMARY KEY, title TEXT NOT NULL DEFAULT '', subtitle TEXT NOT NULL DEFAULT '', cta TEXT NOT NULL DEFAULT '',
    link TEXT NOT NULL DEFAULT '', terms TEXT NOT NULL DEFAULT '', audience TEXT NOT NULL DEFAULT 'all',
    starts_at TEXT, ends_at TEXT, sort INTEGER NOT NULL DEFAULT 0, enabled INTEGER NOT NULL DEFAULT 1,
    image_d BLOB, mime_d TEXT, image_m BLOB, mime_m TEXT, updated_at TEXT NOT NULL)`);
  const COLS = `id, title, subtitle, cta, link, terms, audience, starts_at, ends_at, sort, enabled, updated_at, mime_d, mime_m,
    image_d IS NOT NULL AS has_d, image_m IS NOT NULL AS has_m`;
  const row = (r) => {
    const v = encodeURIComponent(r.updated_at);
    const d = r.has_d ? `/api/casino/banner/${r.id}/d?v=${v}` : null;
    const m = r.has_m ? `/api/casino/banner/${r.id}/m?v=${v}` : null;
    return {
      id: r.id, title: r.title, subtitle: r.subtitle, cta: r.cta, link: r.link, terms: r.terms, audience: r.audience,
      startsAt: r.starts_at, endsAt: r.ends_at, sort: r.sort, enabled: !!r.enabled, updatedAt: r.updated_at,
      img: { d: d || m, m: m || d },
      // Which side is a video (played muted in a loop) rather than a picture.
      video: { d: /^video\//.test((d ? r.mime_d : r.mime_m) || ''), m: /^video\//.test((m ? r.mime_m : r.mime_d) || '') },
    };
  };

  const all = () => db.prepare(`SELECT ${COLS} FROM casino_banners ORDER BY sort, id`).all().map(row);

  /** The banners showing now for this visitor (signed in or not), in order. */
  function live({ signedIn = false, now = nowIso() } = {}) {
    return db.prepare(`SELECT ${COLS} FROM casino_banners WHERE enabled = 1
        AND (starts_at IS NULL OR starts_at <= ?) AND (ends_at IS NULL OR ends_at > ?)
        AND (image_d IS NOT NULL OR image_m IS NOT NULL) ORDER BY sort, id`).all(now, now)
      .filter((r) => r.audience === 'all' || r.audience === (signedIn ? 'user' : 'guest'))
      .map(row).map(({ id, title, subtitle, cta, link: href, terms, img, video }) => ({ id, title, subtitle, cta, link: href, terms, img, video }));
  }

  function image(id, which) {
    const col = which === 'm' ? ['image_m', 'mime_m'] : ['image_d', 'mime_d'];
    const r = db.prepare(`SELECT ${col[0]} AS data, ${col[1]} AS mime FROM casino_banners WHERE id = ?`).get(Number(id));
    return r?.data ? { data: Buffer.from(r.data), mime: r.mime } : null;
  }

  const get = (id) => { const r = db.prepare(`SELECT ${COLS} FROM casino_banners WHERE id = ?`).get(Number(id)); return r ? row(r) : null; };

  /** Creates (no id) or changes a banner. A new banner needs at least one picture. */
  function save(input) {
    const id = input.id ? Number(input.id) : null;
    if (id && !get(id)) throw new BannerError('Banner não encontrado.');
    const audience = AUDIENCES.has(input.audience) ? input.audience : 'all';
    const fields = {
      title: text(input.title, 80), subtitle: text(input.subtitle, 160), cta: text(input.cta, 30), link: link(input.link),
      terms: text(input.terms, 300), audience, starts_at: when(input.startsAt), ends_at: when(input.endsAt),
      enabled: input.enabled === false ? 0 : 1, updated_at: nowIso(),
    };
    if (fields.starts_at && fields.ends_at && fields.ends_at <= fields.starts_at) throw new BannerError('O fim tem de ser depois do início.');
    if (input.imageD) { const d = decode(input.imageD); Object.assign(fields, { image_d: d.buf, mime_d: d.mime }); }
    if (input.imageM) { const m = decode(input.imageM); Object.assign(fields, { image_m: m.buf, mime_m: m.mime }); }
    if (input.removeM) Object.assign(fields, { image_m: null, mime_m: null });
    if (!id && !input.imageD && !input.imageM) throw new BannerError('Carregue a imagem do banner.');
    const keys = Object.keys(fields);
    if (id) {
      db.prepare(`UPDATE casino_banners SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`).run(...keys.map((k) => fields[k]), id);
      return get(id);
    }
    const sort = (db.prepare('SELECT MAX(sort) AS s FROM casino_banners').get().s ?? -1) + 1;
    const { lastInsertRowid } = db.prepare(`INSERT INTO casino_banners (${keys.join(', ')}, sort) VALUES (${keys.map(() => '?').join(', ')}, ?)`)
      .run(...keys.map((k) => fields[k]), sort);
    return get(Number(lastInsertRowid));
  }

  /** Puts a new picture or video on one side of a banner ('d' computer, 'm' phone). */
  function setImage(id, which, dataUrl) {
    const f = decode(dataUrl);
    const col = which === 'm' ? ['image_m', 'mime_m'] : ['image_d', 'mime_d'];
    return db.prepare(`UPDATE casino_banners SET ${col[0]} = ?, ${col[1]} = ?, updated_at = ? WHERE id = ?`).run(f.buf, f.mime, nowIso(), Number(id)).changes > 0;
  }

  const setEnabled = (id, on) => db.prepare('UPDATE casino_banners SET enabled = ?, updated_at = ? WHERE id = ?').run(on ? 1 : 0, nowIso(), Number(id)).changes > 0;
  const remove = (id) => db.prepare('DELETE FROM casino_banners WHERE id = ?').run(Number(id)).changes > 0;
  /** New order: the ids from first to last. */
  function reorder(ids) {
    const set = db.prepare('UPDATE casino_banners SET sort = ? WHERE id = ?');
    ids.map(Number).filter(Number.isInteger).forEach((id, i) => set.run(i, id));
    return all();
  }

  return { all, live, image, get, save, setImage, setEnabled, remove, reorder };
}
