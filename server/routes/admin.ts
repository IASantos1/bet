import type http from 'http';
import type pg from 'pg';
import { readJsonBody, sendJson, badRequest, unauthorized, forbid } from '../lib/http';
import { requireUser, isAdmin } from '../lib/auth';
import type { EventsService } from './events';
import { WalletError, withTransaction, opCompleteWithdrawal, opCancelWithdrawal, opSettleBetWon, opSettleBetLost, opVoidBet } from '../lib/ledger';
import { resolveLegOutcome, resolveBetOutcome, type BetOutcome } from '../lib/settlementEngine';
import { computeExposure, type ExposureBetInput } from '../lib/riskEngine';

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

function parseSelections(raw: any): Array<{ event_id: any; selection: string; team_match?: string; league?: string }> {
  const s = raw && typeof raw === 'object' ? raw : (() => { try { return JSON.parse(raw); } catch { return []; } })();
  return Array.isArray(s) ? s : [];
}

type BetRow = { id: string; user_id: string; stake: any; potential_win: any; status: string; is_free_bet: any; selections: any };

/**
 * Settlement Engine core (spec §27-29): resolve `bet` against live results via `events`, or
 * against an explicit `manualOutcome` override, then post the ledger settlement. Idempotent —
 * settling the same bet twice is a no-op replay (spec §64), never a double payout. Returns
 * `null` (no side effects at all) when the outcome can't be determined and no override was given.
 */
async function settleBet(
  pool: pg.Pool,
  events: EventsService,
  bet: BetRow,
  manualOutcome?: 'won' | 'lost' | 'void',
): Promise<{ status: BetOutcome | 'void'; replayed: boolean } | null> {
  const betId = String(bet.id);
  const userId = String(bet.user_id);
  const stake = toNumber(bet.stake);

  let outcome: BetOutcome | 'void';
  if (manualOutcome) {
    outcome = manualOutcome;
  } else {
    const legs = parseSelections(bet.selections);
    if (legs.length === 0) return null;
    const results = await Promise.all(
      legs.map((leg) => events.getEventResult(String(leg.event_id ?? '')).catch(() => null)),
    );
    const legOutcomes = legs.map((leg, i) => resolveLegOutcome({ selection: leg.selection, result: results[i] }));
    outcome = resolveBetOutcome(legOutcomes);
    if (outcome === 'pending') return null; // not determinable yet — leave it pending, never guess
  }

  const idempotencyKey = `settle:${betId}:${outcome}`;
  const newStatus = outcome === 'won' ? 'won' : outcome === 'lost' ? 'lost' : 'void';

  const settled = await withTransaction(pool, async (client) => {
    let result;
    if (outcome === 'won') {
      result = await opSettleBetWon(client, { userId, stake, payout: toNumber(bet.potential_win), idempotencyKey, betId });
    } else if (outcome === 'lost') {
      result = await opSettleBetLost(client, { userId, stake, idempotencyKey, betId });
    } else {
      result = await opVoidBet(client, { userId, stake, idempotencyKey, betId, toBonus: Boolean(bet.is_free_bet) });
    }
    if (!result.replayed) {
      await client.query(
        `UPDATE bets SET status = $2, winnings = $3, settled_at = NOW(), updated_at = NOW() WHERE id = $1 AND status = 'pending'`,
        [betId, newStatus, outcome === 'won' ? toNumber(bet.potential_win) : 0],
      );
    }
    return result;
  });

  return { status: newStatus, replayed: settled.replayed };
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
      `SELECT t.id, t.user_id, t.amount, t.status, t.payment_method, t.description, t.created_at,
              u.email, u.name
       FROM transactions t
       JOIN users u ON u.id = t.user_id
       WHERE t.type = 'withdrawal'
       ORDER BY t.created_at DESC
       LIMIT 500`,
    );
    const STATUS_MAP: Record<string, string> = {
      pending: 'REQUESTED',
      completed: 'PAID',
      rejected: 'REJECTED',
      cancelled: 'CANCELLED',
    };
    const withdrawals = (r.rows || []).map((row: any) => {
      let meta: { iban?: string; holder_name?: string; nif?: string } = {};
      try {
        meta = JSON.parse(row.description || '{}');
      } catch {
        meta = {};
      }
      return {
        id: String(row.id),
        created_at: row.created_at,
        username: row.name ? String(row.name) : String(row.email || '').split('@')[0],
        email: String(row.email || ''),
        amount_eur: toNumber(row.amount),
        iban: String(meta.iban || ''),
        holder_name: String(meta.holder_name || ''),
        bank_name: '',
        status: STATUS_MAP[String(row.status)] || String(row.status).toUpperCase(),
      };
    });
    sendJson(res, 200, { success: true, withdrawals });
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
  // double payout. `result` is optional: omit it to let the engine resolve the bet
  // deterministically from the event's official result (spec §28); pass it to override/correct.
  const settleMatch = path.match(/^\/api\/admin\/bets\/([^/]+)\/settle$/);
  if (settleMatch && req.method === 'POST') {
    const betId = decodeURIComponent(settleMatch[1] || '');
    const body = await readJsonBody<{ result?: 'won' | 'lost' | 'void' }>(req).catch(() => ({}) as any);
    const manualOutcome = body?.result;
    if (manualOutcome != null && manualOutcome !== 'won' && manualOutcome !== 'lost' && manualOutcome !== 'void') {
      return badRequest(res, "result deve ser 'won', 'lost' ou 'void'"), true;
    }

    const r = await pool.query(
      `SELECT id, user_id, stake, potential_win, status, is_free_bet, selections FROM bets WHERE id = $1 LIMIT 1`,
      [betId],
    );
    const bet = r.rows?.[0];
    if (!bet) return badRequest(res, 'Bet not found'), true;
    if (String(bet.status) !== 'pending') return badRequest(res, `Aposta já liquidada (status=${bet.status})`), true;

    try {
      const settled = await settleBet(pool, events, bet, manualOutcome);
      if (!settled) {
        sendJson(res, 200, { success: false, status: 'pending', message: 'Resultado ainda não determinável — forneça "result" para forçar' });
        return true;
      }
      sendJson(res, 200, { success: true, status: settled.status, replayed: settled.replayed, operator_id: u.id });
    } catch (e) {
      if (!handleWalletError(res, e)) throw e;
    }
    return true;
  }

  // POST /api/admin/settlement/run — batch Settlement Engine sweep: resolves every pending bet
  // it can against official results, leaves the rest pending. Safe to call repeatedly/on a
  // schedule — already-settled bets are simply skipped, and each settlement is itself idempotent.
  if (req.method === 'POST' && path === '/api/admin/settlement/run') {
    const r = await pool.query(
      `SELECT id, user_id, stake, potential_win, status, is_free_bet, selections FROM bets WHERE status = 'pending' ORDER BY created_at ASC LIMIT 500`,
    );
    const results: Array<{ id: string; status: string }> = [];
    const errors: Array<{ id: string; error: string }> = [];
    let stillPending = 0;

    for (const bet of r.rows || []) {
      try {
        const settled = await settleBet(pool, events, bet as BetRow);
        if (settled) results.push({ id: String(bet.id), status: settled.status });
        else stillPending += 1;
      } catch (e: any) {
        errors.push({ id: String(bet.id), error: String(e?.message || e) });
      }
    }

    sendJson(res, 200, { processed: (r.rows || []).length, settled: results.length, stillPending, errors, results, operator_id: u.id });
    return true;
  }

  // GET /api/admin/risk/exposure — Risk Engine exposure view (spec §25).
  if (req.method === 'GET' && path === '/api/admin/risk/exposure') {
    const r = await pool.query(`SELECT stake, potential_win, status, selections FROM bets WHERE status = 'pending' LIMIT 2000`);
    const inputs: ExposureBetInput[] = (r.rows || []).map((row: any) => ({
      status: String(row.status || ''),
      stake: toNumber(row.stake),
      potentialWin: toNumber(row.potential_win),
      legs: parseSelections(row.selections).map((leg) => ({
        eventId: String(leg.event_id ?? ''),
        selection: String(leg.selection ?? ''),
        teamMatch: leg.team_match,
        league: leg.league,
      })),
    }));
    sendJson(res, 200, computeExposure(inputs));
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

