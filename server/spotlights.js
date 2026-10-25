// "Destaques" of the casino (Admin → Destaques do casino): one game shown big between the lobby rows,
// as the big operators do ("Esta avozinha é badass!" · "Joga agora!"). A line of text, the button
// (it opens the game), after which row it goes, the dates, who sees it and, optionally, a wide picture
// or short video (computer and phone). Without one, the site builds the card from the game's own art.

import { nowIso } from './db.js';
import { decode, BannerError } from './banners.js';

const AUDIENCES = new Set(['all', 'guest', 'user']);
// The lobby rows a destaque can follow (its key on the site); 'novos' = "Acabados de chegar".
export const AFTER = {
  destaques: 'Escolhas da semana', recent: 'Jogaste recentemente', novos: 'Acabados de chegar', top10: 'Top 10 em Portugal',
  jackpots: 'Jogos com Jackpot', exclusivos: 'Apenas na Bet62',
};

export class SpotlightError extends Error {}
const text = (v, max) => String(v ?? '').trim().slice(0, max);
function when(v) {
  if (!v) return null;
  const t = Date.parse(v);
  if (!Number.isFinite(t)) throw new SpotlightError('Data inválida.');
  return new Date(t).toISOString();
}
function media(v) {
  try { return decode(v); } catch (err) { throw err instanceof BannerError ? new SpotlightError(err.message) : err; }
}

export function createSpotlights(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS casino_spotlights (
    id INTEGER PRIMARY KEY, game_id INTEGER NOT NULL, tagline TEXT NOT NULL DEFAULT '', cta TEXT NOT NULL DEFAULT '',
    after TEXT NOT NULL DEFAULT 'novos', audience TEXT NOT NULL DEFAULT 'all', starts_at TEXT, ends_at TEXT,
    sort INTEGER NOT NULL DEFAULT 0, enabled INTEGER NOT NULL DEFAULT 1,
    image_d BLOB, mime_d TEXT, image_m BLOB, mime_m TEXT, updated_at TEXT NOT NULL)`);
  const COLS = `id, game_id, tagline, cta, after, audience, starts_at, ends_at, sort, enabled, updated_at, mime_d, mime_m,
    image_d IS NOT NULL AS has_d, image_m IS NOT NULL AS has_m`;
  const row = (r) => {
    const v = encodeURIComponent(r.updated_at);
    const d = r.has_d ? `/api/casino/spotlight/${r.id}/d?v=${v}` : null;
    const m = r.has_m ? `/api/casino/spotlight/${r.id}/m?v=${v}` : null;
    return {
      id: r.id, gameId: r.game_id, tagline: r.tagline, cta: r.cta, after: r.after, audience: r.audience,
      startsAt: r.starts_at, endsAt: r.ends_at, sort: r.sort, enabled: !!r.enabled, updatedAt: r.updated_at,
      img: d || m ? { d: d || m, m: m || d } : null,
      video: { d: /^video\//.test((d ? r.mime_d : r.mime_m) || ''), m: /^video\//.test((m ? r.mime_m : r.mime_d) || '') },
    };
  };
  const all = () => db.prepare(`SELECT ${COLS} FROM casino_spotlights ORDER BY sort, id`).all().map(row);
  const get = (id) => { const r = db.prepare(`SELECT ${COLS} FROM casino_spotlights WHERE id = ?`).get(Number(id)); return r ? row(r) : null; };

  /** The destaques running now for this visitor, in order. */
  const live = ({ signedIn = false, now = nowIso() } = {}) => db.prepare(`SELECT ${COLS} FROM casino_spotlights WHERE enabled = 1
      AND (starts_at IS NULL OR starts_at <= ?) AND (ends_at IS NULL OR ends_at > ?) ORDER BY sort, id`).all(now, now)
    .filter((r) => r.audience === 'all' || r.audience === (signedIn ? 'user' : 'guest')).map(row);

  function image(id, which) {
    const col = which === 'm' ? ['image_m', 'mime_m'] : ['image_d', 'mime_d'];
    const r = db.prepare(`SELECT ${col[0]} AS data, ${col[1]} AS mime FROM casino_spotlights WHERE id = ?`).get(Number(id));
    return r?.data ? { data: Buffer.from(r.data), mime: r.mime } : null;
  }

  function save(input) {
    const id = input.id ? Number(input.id) : null;
    if (id && !get(id)) throw new SpotlightError('Destaque não encontrado.');
    const gameId = Number(input.gameId);
    if (!Number.isInteger(gameId) || gameId <= 0) throw new SpotlightError('Escolha o jogo.');
    const fields = {
      game_id: gameId, tagline: text(input.tagline, 90), cta: text(input.cta, 30), after: AFTER[input.after] ? input.after : 'novos',
      audience: AUDIENCES.has(input.audience) ? input.audience : 'all', starts_at: when(input.startsAt), ends_at: when(input.endsAt),
      enabled: input.enabled === false ? 0 : 1, updated_at: nowIso(),
    };
    if (fields.starts_at && fields.ends_at && fields.ends_at <= fields.starts_at) throw new SpotlightError('O fim tem de ser depois do início.');
    if (input.imageD) { const f = media(input.imageD); Object.assign(fields, { image_d: f.buf, mime_d: f.mime }); }
    if (input.imageM) { const f = media(input.imageM); Object.assign(fields, { image_m: f.buf, mime_m: f.mime }); }
    if (input.removeD) Object.assign(fields, { image_d: null, mime_d: null });
    if (input.removeM) Object.assign(fields, { image_m: null, mime_m: null });
    const keys = Object.keys(fields);
    if (id) {
      db.prepare(`UPDATE casino_spotlights SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`).run(...keys.map((k) => fields[k]), id);
      return get(id);
    }
    const sort = (db.prepare('SELECT MAX(sort) AS s FROM casino_spotlights').get().s ?? -1) + 1;
    const { lastInsertRowid } = db.prepare(`INSERT INTO casino_spotlights (${keys.join(', ')}, sort) VALUES (${keys.map(() => '?').join(', ')}, ?)`)
      .run(...keys.map((k) => fields[k]), sort);
    return get(Number(lastInsertRowid));
  }

  const setEnabled = (id, on) => db.prepare('UPDATE casino_spotlights SET enabled = ?, updated_at = ? WHERE id = ?').run(on ? 1 : 0, nowIso(), Number(id)).changes > 0;
  const remove = (id) => db.prepare('DELETE FROM casino_spotlights WHERE id = ?').run(Number(id)).changes > 0;
  function reorder(ids) {
    const set = db.prepare('UPDATE casino_spotlights SET sort = ? WHERE id = ?');
    ids.map(Number).filter(Number.isInteger).forEach((id, i) => set.run(i, id));
    return all();
  }
  return { all, get, live, image, save, setEnabled, remove, reorder };
}
