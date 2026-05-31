import type http from 'http';
import type pg from 'pg';
import { readJsonBody, sendJson, badRequest, unauthorized } from '../lib/http';
import { requireUser } from '../lib/auth';

type FavoriteBody = { event_id?: string | number };

export async function handleFavoriteRoutes(
  pool: pg.Pool,
  req: http.IncomingMessage,
  res: http.ServerResponse,
  url: URL,
): Promise<boolean> {
  const path = url.pathname;

  if (req.method === 'GET' && path === '/api/favorites') {
    const u = await requireUser(pool, req);
    if (!u) return unauthorized(res), true;
    const r = await pool.query(`SELECT event_id FROM favorites WHERE user_id = $1 ORDER BY created_at DESC LIMIT 500`, [u.id]);
    sendJson(
      res,
      200,
      (r.rows || []).map((x: any) => ({ event_id: Number(String(x.event_id)) || String(x.event_id) })),
    );
    return true;
  }

  if (req.method === 'POST' && path === '/api/favorites') {
    const u = await requireUser(pool, req);
    if (!u) return unauthorized(res), true;
    const body = await readJsonBody<FavoriteBody>(req).catch(() => null);
    if (!body) return badRequest(res, 'Invalid JSON'), true;
    const eventId = String(body.event_id ?? '').trim();
    if (!eventId) return badRequest(res, 'Invalid event_id'), true;
    await pool.query(
      `INSERT INTO favorites (user_id, event_id) VALUES ($1, $2) ON CONFLICT (user_id, event_id) DO NOTHING`,
      [u.id, eventId],
    );
    sendJson(res, 200, { success: true });
    return true;
  }

  const del = path.match(/^\/api\/favorites\/([^/]+)$/);
  if (del && req.method === 'DELETE') {
    const u = await requireUser(pool, req);
    if (!u) return unauthorized(res), true;
    const eventId = String(decodeURIComponent(del[1] || '')).trim();
    if (!eventId) return badRequest(res, 'Invalid event_id'), true;
    await pool.query(`DELETE FROM favorites WHERE user_id = $1 AND event_id = $2`, [u.id, eventId]);
    sendJson(res, 200, { success: true });
    return true;
  }

  return false;
}

