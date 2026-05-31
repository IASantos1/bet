import type http from 'http';
import type pg from 'pg';
import { readJsonBody, sendJson, badRequest, unauthorized, forbid } from '../lib/http';
import { requireUser, isAdmin } from '../lib/auth';
import type { EventsService } from './events';

interface TestKeyBody { key: string; sport?: string; matchId?: string }

function toSub(sport: string): string {
  const s = String(sport || '').toLowerCase().replace(/[_\s]+/g, '-').replace(/[^a-z0-9-]/g, '');
  if (s === 'football' || s === 'futebol' || s === 'soccer') return 'football';
  if (s === 'ice-hockey' || s === 'hockey' || s === 'icehockey') return 'hockey';
  return s || 'football';
}

async function probeUrl(url: string, key: string): Promise<{ url: string; status: number; ok: boolean; ms: number; keys: string[]; sample: string; error?: string }> {
  const t0 = Date.now();
  try {
    const r = await fetch(url, { headers: { 'x-api-key': key, accept: 'application/json' }, signal: AbortSignal.timeout(10000) });
    const text = await r.text().catch(() => '');
    const ms = Date.now() - t0;
    let keys: string[] = [];
    try {
      const j = JSON.parse(text);
      if (j && typeof j === 'object') keys = Object.keys(j).slice(0, 20);
    } catch { /* not json */ }
    return { url, status: r.status, ok: r.ok, ms, keys, sample: text.slice(0, 400) };
  } catch (e: any) {
    return { url, status: 0, ok: false, ms: Date.now() - t0, keys: [], sample: '', error: String(e?.message || e) };
  }
}

type ToggleOperatorBody = { is_operator?: boolean };
type EditOddsBody = { home_odd?: number; draw_odd?: number; away_odd?: number };

function toBool(v: any): boolean {
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return v === 1;
  const s = String(v ?? '').toLowerCase();
  if (s === '1' || s === 'true' || s === 'yes') return true;
  return false;
}

export async function handleAdminRoutes(
  pool: pg.Pool,
  events: EventsService,
  req: http.IncomingMessage,
  res: http.ServerResponse,
  url: URL,
): Promise<boolean> {
  const path = url.pathname;

  if (!path.startsWith('/api/admin/') && !path.startsWith('/api/metrics/')) return false;

  const u = await requireUser(pool, req);
  if (!u) return unauthorized(res), true;
  if (!isAdmin(u)) return forbid(res), true;

  if (req.method === 'GET' && path === '/api/admin/users') {
    const r = await pool.query(`SELECT id, email, role FROM users ORDER BY created_at DESC LIMIT 500`);
    sendJson(
      res,
      200,
      (r.rows || []).map((x: any) => ({
        id: String(x.id),
        email: String(x.email),
        is_operator: String(x.role) === 'admin' ? 1 : 0,
      })),
    );
    return true;
  }

  const toggle = path.match(/^\/api\/admin\/users\/([^/]+)\/toggle-operator$/);
  if (toggle && req.method === 'POST') {
    const userId = decodeURIComponent(toggle[1] || '');
    const body = await readJsonBody<ToggleOperatorBody>(req).catch(() => null);
    if (!body) return badRequest(res, 'Invalid JSON'), true;
    const val = toBool(body.is_operator);
    await pool.query(`UPDATE users SET role = $2, updated_at = NOW() WHERE id = $1`, [userId, val ? 'admin' : 'user']);
    sendJson(res, 200, { success: true });
    return true;
  }

  if (req.method === 'GET' && path === '/api/admin/withdrawals') {
    const r = await pool.query(
      `SELECT id, user_id, amount, status, payment_method, created_at
       FROM transactions
       WHERE type = 'withdrawal'
       ORDER BY created_at DESC
       LIMIT 500`,
    );
    sendJson(res, 200, { withdrawals: r.rows || [] });
    return true;
  }

  if (req.method === 'GET' && path === '/api/admin/bets') {
    const r = await pool.query(
      `SELECT id, user_id, stake AS amount, potential_win, status, created_at
       FROM bets
       ORDER BY created_at DESC
       LIMIT 500`,
    );
    sendJson(res, 200, { bets: r.rows || [] });
    return true;
  }

  if (req.method === 'GET' && path === '/api/admin/alerts') {
    sendJson(res, 200, { alerts: [] });
    return true;
  }

  if (req.method === 'GET' && path === '/api/admin/odds') {
    const list = await events.getAdminOddsEvents().catch(() => []);
    sendJson(res, 200, { events: list });
    return true;
  }

  const edit = path.match(/^\/api\/admin\/odds\/([^/]+)$/);
  if (edit && req.method === 'POST') {
    const eventId = decodeURIComponent(edit[1] || '');
    const body = await readJsonBody<EditOddsBody>(req).catch(() => null);
    if (!body) return badRequest(res, 'Invalid JSON'), true;
    await events.setOddsOverride(eventId, {
      home_odd: body.home_odd,
      draw_odd: body.draw_odd,
      away_odd: body.away_odd,
    });
    sendJson(res, 200, { success: true });
    return true;
  }

  if (req.method === 'GET' && path === '/api/metrics/users') {
    const r = await pool.query(`SELECT COUNT(*)::int AS users FROM users`);
    sendJson(res, 200, { users: r.rows?.[0]?.users ?? 0 });
    return true;
  }

  if (req.method === 'GET' && path === '/api/metrics/odds') {
    const eventsList = await events.getAdminOddsEvents().catch(() => []);
    const eventsCount = eventsList.length;
    const withH2h = eventsList.filter((e: any) => Number(e.home_odd || 0) > 1 && Number(e.away_odd || 0) > 1).length;
    sendJson(res, 200, { events: eventsCount, imported_odds: withH2h, live: eventsList.filter((e: any) => Number(e.is_live || 0) === 1).length, bets: 0 });
    return true;
  }

  if (req.method === 'POST' && path === '/api/admin/test-sports-key') {
    const body = await readJsonBody<TestKeyBody>(req).catch(() => null);
    if (!body?.key) return badRequest(res, 'Missing key'), true;
    const key = String(body.key).trim();
    const sport = String(body.sport || 'soccer').trim() || 'soccer';
    const matchId = String(body.matchId || '').trim();
    const sub = toSub(sport);
    const today = new Date().toISOString().slice(0, 10);
    const probes: Array<{ label: string; url: string }> = [
      { label: `Schedule (${sport} - hoje)`,    url: `https://v2.${sub}.sportsapipro.com/api/events/schedule?date=${today}` },
      { label: `Live events (${sport})`,         url: `https://v2.${sub}.sportsapipro.com/api/events/live` },
    ];
    if (matchId) {
      probes.push({ label: `Odds All   (id=${matchId})`,       url: `https://v2.${sub}.sportsapipro.com/api/match/${encodeURIComponent(matchId)}/odds/all` });
      probes.push({ label: `Odds Live  (id=${matchId})`,       url: `https://v2.${sub}.sportsapipro.com/api/match/${encodeURIComponent(matchId)}/odds/live` });
      probes.push({ label: `Odds PreMatch (id=${matchId})`,    url: `https://v2.${sub}.sportsapipro.com/api/match/${encodeURIComponent(matchId)}/odds/pre-match` });
      probes.push({ label: `Match Stats (id=${matchId})`,      url: `https://v2.${sub}.sportsapipro.com/api/match/${encodeURIComponent(matchId)}/statistics` });
    }
    const results = await Promise.all(probes.map(async (p) => ({ label: p.label, ...(await probeUrl(p.url, key)) })));
    sendJson(res, 200, { results });
    return true;
  }

  return badRequest(res, 'Not supported'), true;
}

