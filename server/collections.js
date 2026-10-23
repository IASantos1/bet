// Game collections made in Admin → Coleções ("Especial Halloween", "Exclusivos Bet62"…): a title, the games
// in the order chosen, where the row goes in the casino lobby, the dates it runs and whether it is on.
//   place 'top':    before "Em destaque" (the first row of the lobby)
//   place 'middle': after "Top 10 da semana" and "Jackpots", before the providers

import { nowIso } from './db.js';

export class CollectionError extends Error {}
const PLACES = new Set(['top', 'middle']);
const MAX_GAMES = 60;

function when(v) {
  if (!v) return null;
  const t = Date.parse(v);
  if (!Number.isFinite(t)) throw new CollectionError('Data inválida.');
  return new Date(t).toISOString();
}

export function createCollections(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS casino_collections (
    id INTEGER PRIMARY KEY, title TEXT NOT NULL, games TEXT NOT NULL DEFAULT '[]', place TEXT NOT NULL DEFAULT 'middle',
    starts_at TEXT, ends_at TEXT, sort INTEGER NOT NULL DEFAULT 0, enabled INTEGER NOT NULL DEFAULT 1, updated_at TEXT NOT NULL)`);
  const row = (r) => ({
    id: r.id, title: r.title, games: JSON.parse(r.games), place: r.place, startsAt: r.starts_at, endsAt: r.ends_at,
    sort: r.sort, enabled: !!r.enabled, updatedAt: r.updated_at,
  });
  const all = () => db.prepare('SELECT * FROM casino_collections ORDER BY sort, id').all().map(row);
  const get = (id) => { const r = db.prepare('SELECT * FROM casino_collections WHERE id = ?').get(Number(id)); return r ? row(r) : null; };

  /** The collections running now, in order. */
  const live = (now = nowIso()) => db.prepare(`SELECT * FROM casino_collections WHERE enabled = 1
      AND (starts_at IS NULL OR starts_at <= ?) AND (ends_at IS NULL OR ends_at > ?) ORDER BY sort, id`).all(now, now).map(row);

  function save(input) {
    const id = input.id ? Number(input.id) : null;
    if (id && !get(id)) throw new CollectionError('Coleção não encontrada.');
    const title = String(input.title || '').trim().slice(0, 60);
    if (!title) throw new CollectionError('Dê um título à coleção.');
    const games = [...new Set((Array.isArray(input.games) ? input.games : []).map(Number).filter((n) => Number.isInteger(n) && n > 0))];
    if (!games.length) throw new CollectionError('Junte pelo menos um jogo.');
    if (games.length > MAX_GAMES) throw new CollectionError(`No máximo ${MAX_GAMES} jogos por coleção.`);
    const fields = {
      title, games: JSON.stringify(games), place: PLACES.has(input.place) ? input.place : 'middle',
      starts_at: when(input.startsAt), ends_at: when(input.endsAt), enabled: input.enabled === false ? 0 : 1, updated_at: nowIso(),
    };
    if (fields.starts_at && fields.ends_at && fields.ends_at <= fields.starts_at) throw new CollectionError('O fim tem de ser depois do início.');
    const keys = Object.keys(fields);
    if (id) {
      db.prepare(`UPDATE casino_collections SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`).run(...keys.map((k) => fields[k]), id);
      return get(id);
    }
    const sort = (db.prepare('SELECT MAX(sort) AS s FROM casino_collections').get().s ?? -1) + 1;
    const { lastInsertRowid } = db.prepare(`INSERT INTO casino_collections (${keys.join(', ')}, sort) VALUES (${keys.map(() => '?').join(', ')}, ?)`)
      .run(...keys.map((k) => fields[k]), sort);
    return get(Number(lastInsertRowid));
  }

  const setEnabled = (id, on) => db.prepare('UPDATE casino_collections SET enabled = ?, updated_at = ? WHERE id = ?').run(on ? 1 : 0, nowIso(), Number(id)).changes > 0;
  const remove = (id) => db.prepare('DELETE FROM casino_collections WHERE id = ?').run(Number(id)).changes > 0;
  function reorder(ids) {
    const set = db.prepare('UPDATE casino_collections SET sort = ? WHERE id = ?');
    ids.map(Number).filter(Number.isInteger).forEach((id, i) => set.run(i, id));
    return all();
  }

  /**
   * The lobby with the collections put in: each one a row of its games (the ones still in the catalogue,
   * in the order chosen); 'top' ones first, 'middle' ones after "Top 10" and "Jackpots".
   */
  async function intoLobby(lobby, gameById) {
    const live_ = live();
    if (!live_.length || !lobby?.rows) return lobby;
    const rowsOf = async (place) => (await Promise.all(live_.filter((c) => c.place === place).map(async (c) => {
      const games = (await Promise.all(c.games.map((id) => gameById(id)))).filter(Boolean);
      return games.length ? { key: 'collection', id: c.id, title: c.title, total: games.length, games } : null;
    }))).filter(Boolean);
    const top = await rowsOf('top');
    const middle = await rowsOf('middle');
    const rows = [...lobby.rows];
    let at = 0;
    for (let i = 0; i < rows.length; i += 1) if (['destaques', 'top10', 'jackpots'].includes(rows[i].key)) at = i + 1;
    rows.splice(at, 0, ...middle);
    return { ...lobby, rows: [...top, ...rows] };
  }

  return { all, get, live, save, setEnabled, remove, reorder, intoLobby };
}
