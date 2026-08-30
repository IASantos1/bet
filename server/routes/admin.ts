import type http from 'http';
import type pg from 'pg';
import { readJsonBody, sendJson, badRequest, unauthorized, forbid } from '../lib/http';
import { requireUser, isAdmin } from '../lib/auth';
import type { EventsService } from './events';
import { WalletError, withTransaction, opCompleteWithdrawal, opCancelWithdrawal, opSettleBetWon, opSettleBetLost, opVoidBet } from '../lib/ledger';

function handleWalletError(res: http.ServerResponse, e: unknown): boolean {
  if (e instanceof WalletError) {
    const status = e.code === 'INSUFFICIENT_FUNDS' || e.code === 'INVALID_AMOUNT' ? 400 : e.code === 'NOT_FOUND' ? 404 : 409;
    sendJson(res, status, { error: e.message, code: e.code });
    return true;
  }
  return false;
}

function toNumber(v: any): number {
  const n = typeof v === 'string' ? Number(v.replace(',', '.')) : Number(v);
  return Number.isFinite(n) ? n : 0;
}

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

  // POST /api/admin/withdrawals/:id/approve — pay out a pending withdrawal (spec §12, §40)
  const approveWithdrawal = path.match(/^\/api\/admin\/withdrawals\/([^/]+)\/approve$/);
  if (approveWithdrawal && req.method === 'POST') {
    const withdrawalId = decodeURIComponent(approveWithdrawal[1] || '');
    const r = await pool.query(
      `SELECT id, user_id, amount FROM transactions WHERE id = $1 AND type = 'withdrawal' AND status = 'pending' LIMIT 1`,
      [withdrawalId],
    );
    const row = r.rows?.[0];
    if (!row) return badRequest(res, 'Levantamento não encontrado ou já processado'), true;

    try {
      await withTransaction(pool, async (client) => {
        await client.query(`UPDATE transactions SET status = 'completed', updated_at = NOW() WHERE id = $1 AND status = 'pending'`, [withdrawalId]);
        return opCompleteWithdrawal(client, {
          userId: String(row.user_id),
          amount: toNumber(row.amount),
          idempotencyKey: `withdraw_approve:${withdrawalId}`,
          withdrawalId,
        });
      });
      sendJson(res, 200, { success: true, operator_id: u.id });
    } catch (e) {
      if (!handleWalletError(res, e)) throw e;
    }
    return true;
  }

  // POST /api/admin/withdrawals/:id/reject — return the reserved funds to the player (spec §12)
  const rejectWithdrawal = path.match(/^\/api\/admin\/withdrawals\/([^/]+)\/reject$/);
  if (rejectWithdrawal && req.method === 'POST') {
    const withdrawalId = decodeURIComponent(rejectWithdrawal[1] || '');
    const body = await readJsonBody<{ reason?: string }>(req).catch(() => ({}) as any);
    const r = await pool.query(
      `SELECT id, user_id, amount FROM transactions WHERE id = $1 AND type = 'withdrawal' AND status = 'pending' LIMIT 1`,
      [withdrawalId],
    );
    const row = r.rows?.[0];
    if (!row) return badRequest(res, 'Levantamento não encontrado ou já processado'), true;

    try {
      await withTransaction(pool, async (client) => {
        await client.query(
          `UPDATE transactions SET status = 'rejected', description = COALESCE(description, '') || $2, updated_at = NOW() WHERE id = $1 AND status = 'pending'`,
          [withdrawalId, body?.reason ? ` | Rejeitado: ${String(body.reason)}` : ' | Rejeitado'],
        );
        return opCancelWithdrawal(client, {
          userId: String(row.user_id),
          amount: toNumber(row.amount),
          idempotencyKey: `withdraw_reject:${withdrawalId}`,
          withdrawalId,
        });
      });
      sendJson(res, 200, { success: true, operator_id: u.id });
    } catch (e) {
      if (!handleWalletError(res, e)) throw e;
    }
    return true;
  }

  // POST /api/admin/bets/:id/settle — Settlement Engine entry point (spec §27-29). Idempotent:
  // settling the same bet twice with the same result is a no-op replay (spec §64), never a
  // double payout.
  const settleBet = path.match(/^\/api\/admin\/bets\/([^/]+)\/settle$/);
  if (settleBet && req.method === 'POST') {
    const betId = decodeURIComponent(settleBet[1] || '');
    const body = await readJsonBody<{ result?: 'won' | 'lost' | 'void' }>(req).catch(() => null);
    const outcome = body?.result;
    if (outcome !== 'won' && outcome !== 'lost' && outcome !== 'void') {
      return badRequest(res, "result deve ser 'won', 'lost' ou 'void'"), true;
    }

    const r = await pool.query(
      `SELECT id, user_id, stake, potential_win, status, is_free_bet FROM bets WHERE id = $1 LIMIT 1`,
      [betId],
    );
    const bet = r.rows?.[0];
    if (!bet) return badRequest(res, 'Bet not found'), true;
    if (String(bet.status) !== 'pending') return badRequest(res, `Aposta já liquidada (status=${bet.status})`), true;

    const userId = String(bet.user_id);
    const stake = toNumber(bet.stake);
    const idempotencyKey = `settle:${betId}:${outcome}`;
    const newStatus = outcome === 'won' ? 'won' : outcome === 'lost' ? 'lost' : 'void';

    try {
      const result = await withTransaction(pool, async (client) => {
        let settled;
        if (outcome === 'won') {
          settled = await opSettleBetWon(client, { userId, stake, payout: toNumber(bet.potential_win), idempotencyKey, betId });
        } else if (outcome === 'lost') {
          settled = await opSettleBetLost(client, { userId, stake, idempotencyKey, betId });
        } else {
          settled = await opVoidBet(client, { userId, stake, idempotencyKey, betId, toBonus: Boolean(bet.is_free_bet) });
        }
        if (!settled.replayed) {
          await client.query(
            `UPDATE bets SET status = $2, winnings = $3, settled_at = NOW(), updated_at = NOW() WHERE id = $1 AND status = 'pending'`,
            [betId, newStatus, outcome === 'won' ? toNumber(bet.potential_win) : 0],
          );
        }
        return settled;
      });
      sendJson(res, 200, { success: true, status: newStatus, replayed: result.replayed, operator_id: u.id });
    } catch (e) {
      if (!handleWalletError(res, e)) throw e;
    }
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

