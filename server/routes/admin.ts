import type http from 'http';
import type pg from 'pg';
import { readJsonBody, sendJson, badRequest, unauthorized, forbid } from '../lib/http';
import { requireUser, isAdmin } from '../lib/auth';
import type { EventsService } from './events';
import { WalletError, withTransaction, opCompleteWithdrawal, opCancelWithdrawal, opSettleBetWon, opSettleBetLost, opVoidBet } from '../lib/ledger';
import { resolveLegOutcome, resolveBetOutcome, type BetOutcome } from '../lib/settlementEngine';
import { computeExposure, type ExposureBetInput } from '../lib/riskEngine';
import { writeAuditLog, requestIp } from '../lib/audit';
import { evaluateAmlIndicators, type AmlTransaction } from '../lib/amlEngine';
import { computeFraudScore, type FraudSignals } from '../lib/fraudEngine';
import { sweepExpiredBonuses } from '../lib/bonusService';
import { reconcileWallet, checkLedgerBalance, computeGGR, debitNormalBalance, creditNormalBalance, type DirectionTotals } from '../lib/reconciliationEngine';
import { isCasinoConfigured, getCasinoAgentInfo, testCasinoCallback, getCasinoProviders, getCasinoGames } from '../lib/casinoAggregator';

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

type ToggleOperatorBody = { is_operator?: boolean; reason?: string };
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

  if (!path.startsWith('/api/admin/') && !path.startsWith('/api/metrics/') && !path.startsWith('/api/trading/')) return false;

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
    const reason = String(body.reason || '').trim();
    if (!reason) return badRequest(res, 'Motivo é obrigatório'), true;
    const val = toBool(body.is_operator);
    // users.role is the real authority (see isAdmin()) but profiles.is_operator is what the
    // frontend actually reads (GET /api/users/is-operator) to decide whether to show operator
    // UI at all — keep both in lockstep so a freshly promoted admin isn't locked out of their
    // own admin links until someone thinks to flip the other flag too.
    await pool.query(`UPDATE users SET role = $2, updated_at = NOW() WHERE id = $1`, [userId, val ? 'admin' : 'user']);
    await pool.query(`UPDATE profiles SET is_operator = $2, updated_at = NOW() WHERE user_id = $1`, [userId, val]);
    await writeAuditLog(pool, {
      operatorId: u.id,
      action: val ? 'operator_grant' : 'operator_revoke',
      resourceType: 'user',
      resourceId: userId,
      reason,
      ip: requestIp(req),
    });
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
      await writeAuditLog(pool, {
        operatorId: u.id,
        action: 'withdrawal_approve',
        resourceType: 'transaction',
        resourceId: withdrawalId,
        metadata: { userId: String(row.user_id), amount: toNumber(row.amount) },
        ip: requestIp(req),
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
      await writeAuditLog(pool, {
        operatorId: u.id,
        action: 'withdrawal_reject',
        resourceType: 'transaction',
        resourceId: withdrawalId,
        reason: body?.reason || null,
        metadata: { userId: String(row.user_id), amount: toNumber(row.amount) },
        ip: requestIp(req),
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
      if (!settled.replayed) {
        await writeAuditLog(pool, {
          operatorId: u.id,
          action: 'bet_settle',
          resourceType: 'bet',
          resourceId: betId,
          metadata: { status: settled.status, manual: manualOutcome != null },
          ip: requestIp(req),
        });
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

    if (results.length > 0) {
      await writeAuditLog(pool, {
        operatorId: u.id,
        action: 'settlement_run',
        resourceType: 'bet',
        metadata: { processed: (r.rows || []).length, settled: results.length, stillPending, errorCount: errors.length },
        ip: requestIp(req),
      });
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

  // GET /api/admin/kyc/pending — Identity/KYC Service review queue (spec §35).
  if (req.method === 'GET' && path === '/api/admin/kyc/pending') {
    const r = await pool.query(
      `SELECT u.id AS user_id, u.email, u.name, p.full_name, p.created_at AS registration_date, p.kyc_status,
              COALESCE(
                json_agg(
                  json_build_object(
                    'id', d.id, 'type', d.doc_type, 'created_at', d.created_at,
                    'ip_address', d.ip_address, 'status', d.status
                  ) ORDER BY d.created_at
                ) FILTER (WHERE d.id IS NOT NULL),
                '[]'
              ) AS documents
       FROM users u
       JOIN profiles p ON p.user_id = u.id
       LEFT JOIN user_documents d ON d.user_id = u.id
       WHERE p.kyc_status IN ('PENDING', 'IN_REVIEW')
       GROUP BY u.id, u.email, u.name, p.full_name, p.created_at, p.kyc_status
       ORDER BY p.created_at ASC
       LIMIT 200`,
    );
    const out = (r.rows || []).map((row: any) => ({
      kyc_id: String(row.user_id), // one review round per user; no separate KYC-request table yet
      user_id: String(row.user_id),
      email: String(row.email || ''),
      username: row.name ? String(row.name) : String(row.email || '').split('@')[0],
      full_name: String(row.full_name || ''),
      registration_date: row.registration_date,
      country: '',
      status: String(row.kyc_status || 'PENDING'),
      created_at: row.registration_date,
      documents: (Array.isArray(row.documents) ? row.documents : []).map((d: any) => ({
        id: String(d.id),
        type: String(d.type || ''),
        url: `/api/admin/documents/${d.id}`,
        created_at: d.created_at,
        ip_address: String(d.ip_address || ''),
        status: String(d.status || ''),
      })),
    }));
    sendJson(res, 200, out);
    return true;
  }

  // GET /api/admin/documents/:id — stream a submitted document's raw bytes for admin review.
  const docMatch = path.match(/^\/api\/admin\/documents\/([^/]+)$/);
  if (docMatch && req.method === 'GET') {
    const docId = decodeURIComponent(docMatch[1] || '');
    const r = await pool.query(`SELECT filename, mime_type, content_base64 FROM user_documents WHERE id = $1 LIMIT 1`, [docId]);
    const doc = r.rows?.[0];
    if (!doc) return badRequest(res, 'Document not found'), true;
    const buf = Buffer.from(String(doc.content_base64 || ''), 'base64');
    res.statusCode = 200;
    res.setHeader('content-type', String(doc.mime_type || 'application/octet-stream'));
    res.setHeader('content-disposition', `inline; filename="${String(doc.filename || docId).replace(/"/g, '')}"`);
    res.setHeader('cache-control', 'private, no-store');
    res.end(buf);
    return true;
  }

  // POST /api/admin/kyc/decision — verify or reject a user's KYC submission (spec §35, §41).
  if (req.method === 'POST' && path === '/api/admin/kyc/decision') {
    const body = await readJsonBody<{ kyc_id?: string; decision?: 'verified' | 'rejected'; reason?: string }>(req).catch(() => null);
    const userId = body?.kyc_id ? String(body.kyc_id) : '';
    const decision = body?.decision;
    const reason = String(body?.reason || '').trim();
    if (!userId) return badRequest(res, 'kyc_id em falta'), true;
    if (decision !== 'verified' && decision !== 'rejected') return badRequest(res, "decision deve ser 'verified' ou 'rejected'"), true;
    if (!reason) return badRequest(res, 'Motivo é obrigatório'), true;

    const check = await pool.query(`SELECT kyc_status FROM profiles WHERE user_id = $1 LIMIT 1`, [userId]);
    if (!check.rows?.[0]) return badRequest(res, 'Utilizador não encontrado'), true;

    const newStatus = decision === 'verified' ? 'VERIFIED' : 'REJECTED';
    const docStatus = decision === 'verified' ? 'VERIFIED' : 'REJECTED';

    await pool.query(
      `UPDATE profiles SET kyc_status = $2, kyc_verified = $3, updated_at = NOW() WHERE user_id = $1`,
      [userId, newStatus, decision === 'verified'],
    );
    await pool.query(
      `UPDATE user_documents SET status = $2, updated_at = NOW() WHERE user_id = $1 AND status = 'SUBMITTED'`,
      [userId, docStatus],
    );
    await writeAuditLog(pool, {
      operatorId: u.id,
      action: 'kyc_decision',
      resourceType: 'user',
      resourceId: userId,
      reason,
      metadata: { decision },
      ip: requestIp(req),
    });

    sendJson(res, 200, { success: true, status: newStatus });
    return true;
  }

  // POST /api/admin/users/:id/suspend — immediately locks the account out (spec §6, §39).
  const suspendMatch = path.match(/^\/api\/admin\/users\/([^/]+)\/suspend$/);
  if (suspendMatch && req.method === 'POST') {
    const userId = decodeURIComponent(suspendMatch[1] || '');
    const body = await readJsonBody<{ reason?: string }>(req).catch(() => null);
    const reason = String(body?.reason || '').trim();
    if (!reason) return badRequest(res, 'Motivo é obrigatório'), true;

    const check = await pool.query(`SELECT user_id FROM profiles WHERE user_id = $1 LIMIT 1`, [userId]);
    if (!check.rows?.[0]) return badRequest(res, 'Utilizador não encontrado'), true;

    await pool.query(`UPDATE profiles SET account_status = 'SUSPENDED', updated_at = NOW() WHERE user_id = $1`, [userId]);
    await pool.query(`DELETE FROM sessions WHERE user_id = $1`, [userId]); // ends any active session immediately
    await writeAuditLog(pool, {
      operatorId: u.id,
      action: 'account_suspend',
      resourceType: 'user',
      resourceId: userId,
      reason,
      ip: requestIp(req),
    });

    sendJson(res, 200, { success: true });
    return true;
  }

  // GET /api/admin/aml/alerts — AML monitoring (spec §36): behavioural indicators over the last
  // 30 days of deposits/withdrawals, grouped by user. Flags for review; never blocks anything by
  // itself — see server/lib/amlEngine.ts for exactly which indicators are computed and why.
  if (req.method === 'GET' && path === '/api/admin/aml/alerts') {
    const r = await pool.query(
      `SELECT t.user_id, u.email, t.type, t.amount, t.created_at
       FROM transactions t
       JOIN users u ON u.id = t.user_id
       WHERE t.type IN ('deposit', 'withdrawal') AND t.created_at > NOW() - INTERVAL '30 days'
       ORDER BY t.user_id, t.created_at`,
    );

    const byUser = new Map<string, { email: string; txs: AmlTransaction[] }>();
    for (const row of r.rows || []) {
      const userId = String(row.user_id);
      if (!byUser.has(userId)) byUser.set(userId, { email: String(row.email || ''), txs: [] });
      byUser.get(userId)!.txs.push({
        type: row.type === 'withdrawal' ? 'withdrawal' : 'deposit',
        amount: toNumber(row.amount),
        createdAt: new Date(row.created_at),
      });
    }

    const now = new Date();
    const flagged = Array.from(byUser.entries())
      .map(([userId, { email, txs }]) => ({ userId, email, indicators: evaluateAmlIndicators(txs, now) }))
      .filter((entry) => entry.indicators.length > 0)
      .sort((a, b) => b.indicators.length - a.indicators.length);

    sendJson(res, 200, { scannedUsers: byUser.size, flagged });
    return true;
  }

  // GET /api/admin/fraud/alerts — Fraud Engine risk_score (spec §37). See
  // server/lib/fraudEngine.ts for exactly which signals feed the score and why the others
  // (device fingerprinting, payment-method identity, betting-pattern correlation) are left out.
  if (req.method === 'GET' && path === '/api/admin/fraud/alerts') {
    const [sharedIpRows, loginVelocityRows, accountRows] = await Promise.all([
      pool.query(
        `SELECT ip, array_agg(DISTINCT user_id) AS user_ids
         FROM refresh_tokens
         WHERE ip IS NOT NULL AND ip <> '' AND created_at > NOW() - INTERVAL '30 days'
         GROUP BY ip
         HAVING COUNT(DISTINCT user_id) > 1`,
      ),
      pool.query(
        `SELECT user_id, COUNT(*)::int AS c
         FROM refresh_tokens
         WHERE created_at > NOW() - INTERVAL '1 hour'
         GROUP BY user_id`,
      ),
      pool.query(
        `SELECT u.id AS user_id, u.email, u.created_at,
                (SELECT MAX(t.amount) FROM transactions t WHERE t.user_id = u.id AND t.type = 'deposit' AND t.status = 'completed') AS max_deposit
         FROM users u`,
      ),
    ]);

    // Max other-accounts-on-the-same-IP, taken across every IP this user has ever signed in from.
    const sharedIpByUser = new Map<string, number>();
    for (const row of sharedIpRows.rows || []) {
      const ids: string[] = (row.user_ids || []).map((x: any) => String(x));
      for (const id of ids) {
        const others = ids.length - 1;
        sharedIpByUser.set(id, Math.max(sharedIpByUser.get(id) || 0, others));
      }
    }

    const loginVelocityByUser = new Map<string, number>();
    for (const row of loginVelocityRows.rows || []) {
      loginVelocityByUser.set(String(row.user_id), Number(row.c || 0));
    }

    const now = Date.now();
    const flagged: Array<{ userId: string; email: string; score: number; band: string; reasons: unknown[] }> = [];
    for (const row of accountRows.rows || []) {
      const userId = String(row.user_id);
      const accountAgeHours = Math.max(0, (now - new Date(row.created_at).getTime()) / 3_600_000);
      const signals: FraudSignals = {
        sharedIpAccountCount: sharedIpByUser.get(userId) || 0,
        loginCountLastHour: loginVelocityByUser.get(userId) || 0,
        accountAgeHours,
        largestDepositAmount: toNumber(row.max_deposit),
      };
      const result = computeFraudScore(signals);
      if (result.score > 0) {
        flagged.push({ userId, email: String(row.email || ''), score: result.score, band: result.band, reasons: result.reasons });
      }
    }
    flagged.sort((a, b) => b.score - a.score);

    sendJson(res, 200, { scannedUsers: (accountRows.rows || []).length, flagged });
    return true;
  }

  // ---- Bonus Engine admin surface (spec §34) ----

  if (req.method === 'GET' && path === '/api/admin/bonus/campaigns') {
    const r = await pool.query(`SELECT * FROM bonus_campaigns ORDER BY created_at DESC LIMIT 200`);
    sendJson(res, 200, { campaigns: r.rows || [] });
    return true;
  }

  if (req.method === 'POST' && path === '/api/admin/bonus/campaigns') {
    const body = await readJsonBody<{
      name?: string; type?: string; minimum_deposit?: number; bonus_percent?: number; maximum_bonus?: number;
      wagering_multiplier?: number; minimum_odds?: number; expiry_days?: number; max_conversion?: number | null;
    }>(req).catch(() => null);
    if (!body) return badRequest(res, 'Invalid JSON'), true;

    const name = String(body.name || '').trim();
    const type = String(body.type || '').trim();
    const validTypes = ['WELCOME', 'DEPOSIT_BONUS', 'FREE_BET', 'CASHBACK', 'ODDS_BOOST', 'VIP', 'PROMOTIONAL'];
    if (!name) return badRequest(res, 'Nome é obrigatório'), true;
    if (!validTypes.includes(type)) return badRequest(res, `type deve ser um de: ${validTypes.join(', ')}`), true;
    const maximumBonus = toNumber(body.maximum_bonus);
    if (!(maximumBonus > 0)) return badRequest(res, 'maximum_bonus deve ser positivo'), true;

    const id = `camp_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
    await pool.query(
      `INSERT INTO bonus_campaigns
         (id, name, type, active, minimum_deposit, bonus_percent, maximum_bonus, wagering_multiplier, minimum_odds, expiry_days, max_conversion, created_at)
       VALUES ($1,$2,$3,TRUE,$4,$5,$6,$7,$8,$9,$10,NOW())`,
      [
        id,
        name,
        type,
        toNumber(body.minimum_deposit) || 0,
        toNumber(body.bonus_percent) || 0,
        maximumBonus,
        toNumber(body.wagering_multiplier) || 1,
        toNumber(body.minimum_odds) || 1.0,
        Math.round(toNumber(body.expiry_days)) || 30,
        body.max_conversion != null ? toNumber(body.max_conversion) : null,
      ],
    );
    await writeAuditLog(pool, { operatorId: u.id, action: 'bonus_campaign_create', resourceType: 'bonus_campaign', resourceId: id, ip: requestIp(req) });
    sendJson(res, 200, { success: true, id });
    return true;
  }

  const campaignToggle = path.match(/^\/api\/admin\/bonus\/campaigns\/([^/]+)\/toggle$/);
  if (campaignToggle && req.method === 'POST') {
    const campaignId = decodeURIComponent(campaignToggle[1] || '');
    const body = await readJsonBody<{ active?: boolean }>(req).catch(() => null);
    if (!body || typeof body.active !== 'boolean') return badRequest(res, 'active (boolean) é obrigatório'), true;
    const r = await pool.query(`UPDATE bonus_campaigns SET active = $2 WHERE id = $1 RETURNING id`, [campaignId, body.active]);
    if (!r.rows[0]) return badRequest(res, 'Campanha não encontrada'), true;
    await writeAuditLog(pool, {
      operatorId: u.id,
      action: body.active ? 'bonus_campaign_activate' : 'bonus_campaign_deactivate',
      resourceType: 'bonus_campaign',
      resourceId: campaignId,
      ip: requestIp(req),
    });
    sendJson(res, 200, { success: true });
    return true;
  }

  // POST /api/admin/bonus/expire-sweep — forfeits every ACTIVE bonus past its expiry. Safe to
  // call repeatedly/on a schedule (there is no background job runner in this codebase yet).
  if (req.method === 'POST' && path === '/api/admin/bonus/expire-sweep') {
    const result = await sweepExpiredBonuses(pool);
    sendJson(res, 200, { ...result, operator_id: u.id });
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

  // GET /api/admin/alerts — lightweight alert feed for the AdminPanel overview: today, this is
  // the top-liability events from the Risk Engine (spec §25). AML/fraud have their own dedicated
  // endpoints (/api/admin/aml/alerts, /api/admin/fraud/alerts) with richer per-user detail.
  if (req.method === 'GET' && path === '/api/admin/alerts') {
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
    const exposure = computeExposure(inputs);
    const alerts = exposure.byEvent.slice(0, 10).map((e) => ({
      level: e.liability > 5000 ? 'high' : e.liability > 1000 ? 'medium' : 'low',
      message: `${e.teamMatch || e.eventId}: exposição de €${e.liability.toFixed(2)} em ${e.betCount} aposta(s) pendente(s)`,
    }));
    sendJson(res, 200, { alerts });
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
    await writeAuditLog(pool, {
      operatorId: u.id,
      action: 'odds_override',
      resourceType: 'event',
      resourceId: eventId,
      metadata: { home_odd: body.home_odd, draw_odd: body.draw_odd, away_odd: body.away_odd },
      ip: requestIp(req),
    });
    sendJson(res, 200, { success: true });
    return true;
  }

  // ---- Reconciliation / Accounting Engine (spec §7-9, §55) ----

  // GET /api/admin/reconciliation/wallets — compares every player's materialized wallet balance
  // against what their own ledger entries say it should be. Empty `discrepancies` is the healthy
  // state; any entry here means something wrote to `wallets` outside server/lib/ledger.ts.
  if (req.method === 'GET' && path === '/api/admin/reconciliation/wallets') {
    const [walletsRes, ledgerRes] = await Promise.all([
      pool.query(`SELECT user_id, available, reserved, bonus, pending_withdrawal FROM wallets`),
      pool.query(
        `SELECT user_id, account, SUM(CASE WHEN direction = 'credit' THEN amount ELSE -amount END) AS balance
         FROM ledger_entries
         WHERE user_id IS NOT NULL
           AND account IN ('PLAYER_AVAILABLE', 'PLAYER_RESERVED', 'PLAYER_BONUS', 'PLAYER_PENDING_WITHDRAWAL')
         GROUP BY user_id, account`,
      ),
    ]);

    const ledgerByUser = new Map<string, Record<string, number>>();
    for (const row of ledgerRes.rows || []) {
      const userId = String(row.user_id);
      if (!ledgerByUser.has(userId)) ledgerByUser.set(userId, {});
      ledgerByUser.get(userId)![String(row.account)] = toNumber(row.balance);
    }

    const discrepancies = (walletsRes.rows || []).flatMap((row: any) => {
      const userId = String(row.user_id);
      const ledger = ledgerByUser.get(userId) || {};
      return reconcileWallet(
        {
          userId,
          available: toNumber(row.available),
          reserved: toNumber(row.reserved),
          bonus: toNumber(row.bonus),
          pendingWithdrawal: toNumber(row.pending_withdrawal),
        },
        {
          PLAYER_AVAILABLE: ledger.PLAYER_AVAILABLE || 0,
          PLAYER_RESERVED: ledger.PLAYER_RESERVED || 0,
          PLAYER_BONUS: ledger.PLAYER_BONUS || 0,
          PLAYER_PENDING_WITHDRAWAL: ledger.PLAYER_PENDING_WITHDRAWAL || 0,
        },
      );
    });

    sendJson(res, 200, { scannedWallets: (walletsRes.rows || []).length, discrepancies });
    return true;
  }

  // GET /api/admin/reconciliation/summary — the books-balanced check plus GGR/NGR for an
  // optional [from, to) date range (defaults to all-time). GGR/NGR are derived straight from the
  // house-side ledger accounts, never tallied separately, so they can't drift from what actually
  // got posted.
  if (req.method === 'GET' && path === '/api/admin/reconciliation/summary') {
    const from = url.searchParams.get('from');
    const to = url.searchParams.get('to');
    const params: unknown[] = [];
    const where: string[] = [];
    if (from) { params.push(from); where.push(`created_at >= $${params.length}`); }
    if (to) { params.push(to); where.push(`created_at < $${params.length}`); }
    const whereSql = where.length ? `AND ${where.join(' AND ')}` : '';

    const r = await pool.query(
      `SELECT account, direction, SUM(amount) AS total
       FROM ledger_entries
       WHERE 1 = 1 ${whereSql}
       GROUP BY account, direction`,
      params,
    );

    const totalsByAccount = new Map<string, DirectionTotals>();
    let globalDebit = 0;
    let globalCredit = 0;
    for (const row of r.rows || []) {
      const account = String(row.account);
      const amount = toNumber(row.total);
      const t = totalsByAccount.get(account) || { debit: 0, credit: 0 };
      if (String(row.direction) === 'debit') { t.debit += amount; globalDebit += amount; }
      else { t.credit += amount; globalCredit += amount; }
      totalsByAccount.set(account, t);
    }
    const zero: DirectionTotals = { debit: 0, credit: 0 };

    const ledgerBalance = checkLedgerBalance({ debit: globalDebit, credit: globalCredit });
    const ggr = computeGGR({
      houseRevenue: creditNormalBalance(totalsByAccount.get('HOUSE_REVENUE') || zero),
      houseLiability: debitNormalBalance(totalsByAccount.get('HOUSE_LIABILITY') || zero),
      bonusLiability: debitNormalBalance(totalsByAccount.get('BONUS_LIABILITY') || zero),
    });

    sendJson(res, 200, {
      range: { from: from || null, to: to || null },
      ledgerBalance,
      ggr: ggr.ggr,
      ngr: ggr.ngr,
      paymentProviderClearing: debitNormalBalance(totalsByAccount.get('PAYMENT_PROVIDER_CLEARING') || zero),
    });
    return true;
  }

  // GET /api/admin/audit-log — Audit Log review queue (spec §41): every logged operator action,
  // newest first. Read-only by construction — see server/lib/audit.ts for why nothing here can
  // be edited or deleted through the API.
  if (req.method === 'GET' && path === '/api/admin/audit-log') {
    const action = url.searchParams.get('action') || '';
    const resourceType = url.searchParams.get('resource_type') || '';
    const params: unknown[] = [];
    const where: string[] = [];
    if (action) { params.push(action); where.push(`a.action = $${params.length}`); }
    if (resourceType) { params.push(resourceType); where.push(`a.resource_type = $${params.length}`); }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const r = await pool.query(
      `SELECT a.id, a.operator_id, u.email AS operator_email, a.action, a.resource_type, a.resource_id,
              a.reason, a.metadata, a.ip, a.created_at
       FROM audit_logs a
       JOIN users u ON u.id = a.operator_id
       ${whereSql}
       ORDER BY a.created_at DESC
       LIMIT 300`,
      params,
    );
    sendJson(res, 200, { entries: r.rows || [] });
    return true;
  }

  // ---- Trading Desk (spec: manual market control) ----

  // GET /api/trading/events — the trading queue: every live/upcoming event with its current
  // trading status and manual odds. Optional filters: status, sport, from, to (YYYY-MM-DD).
  if (req.method === 'GET' && path === '/api/trading/events') {
    const list = await events
      .listTradingEvents({
        status: url.searchParams.get('status') || undefined,
        sport: url.searchParams.get('sport') || undefined,
        from: url.searchParams.get('from') || undefined,
        to: url.searchParams.get('to') || undefined,
      })
      .catch(() => []);
    sendJson(res, 200, list);
    return true;
  }

  // POST /api/trading/decision — approve, suspend, or reprice a single event's market. A
  // suspension takes effect immediately: server/routes/bets.ts refuses any new bet on it, and
  // enrichEventOdds() zeroes its odds for every listing that reads through it.
  if (req.method === 'POST' && path === '/api/trading/decision') {
    const body = await readJsonBody<{
      eventId?: string;
      status?: 'pending' | 'approved' | 'suspended';
      manualOdds?: { home?: number; draw?: number; away?: number };
    }>(req).catch(() => null);
    if (!body) return badRequest(res, 'Invalid JSON'), true;
    const eventId = String(body.eventId || '').trim();
    if (!eventId) return badRequest(res, 'eventId em falta'), true;
    const status = body.status;
    if (status !== 'pending' && status !== 'approved' && status !== 'suspended') {
      return badRequest(res, "status deve ser 'pending', 'approved' ou 'suspended'"), true;
    }
    try {
      await events.setTradingDecision(eventId, status, body.manualOdds);
    } catch (e: any) {
      return badRequest(res, String(e?.message || 'Odds inválidas')), true;
    }
    await writeAuditLog(pool, {
      operatorId: u.id,
      action: `trading_${status}`,
      resourceType: 'event',
      resourceId: eventId,
      metadata: { manualOdds: body.manualOdds || null },
      ip: requestIp(req),
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

  // GET /api/admin/casino/connection — connectivity check for the casino game aggregator
  // (CASINO_API_KEY / CASINO_API_BASE_URL). Only agent/info exists so far; game-list and
  // launch-URL endpoints get wired in once the provider's full API docs are available.
  if (req.method === 'GET' && path === '/api/admin/casino/connection') {
    if (!isCasinoConfigured()) {
      sendJson(res, 200, { configured: false });
      return true;
    }
    try {
      const info = await getCasinoAgentInfo();
      sendJson(res, 200, { configured: true, connected: true, info });
    } catch (e: any) {
      sendJson(res, 200, { configured: true, connected: false, error: String(e?.message || e) });
    }
    return true;
  }

  // POST /api/admin/casino/callback-test — asks the aggregator to ping our configured callback
  // URL and report round-trip time, confirming our server is reachable from them.
  if (req.method === 'POST' && path === '/api/admin/casino/callback-test') {
    if (!isCasinoConfigured()) return badRequest(res, 'CASINO_API_KEY not configured'), true;
    try {
      const result = await testCasinoCallback();
      sendJson(res, 200, { success: true, ...result });
    } catch (e: any) {
      sendJson(res, 200, { success: false, error: String(e?.message || e) });
    }
    return true;
  }

  // GET /api/admin/casino/callback-log — every raw payload POST /callback has captured, newest
  // first. This is how the aggregator's real webhook contract gets learned (spec: see
  // server/routes/casinoCallback.ts) until real docs replace the guesswork.
  if (req.method === 'GET' && path === '/api/admin/casino/callback-log') {
    const r = await pool.query(
      `SELECT id, headers, body_raw, body_json, ip, created_at
       FROM casino_callback_log
       ORDER BY created_at DESC
       LIMIT 100`,
    );
    sendJson(res, 200, { entries: r.rows || [] });
    return true;
  }

  // GET /api/admin/casino/providers — the real, licensed provider catalog for this agent
  // account. Subject to the same IP whitelist as every other agent/* and game/* call from this
  // sandbox (confirmed: also 403s here) — works once called from a whitelisted server IP.
  if (req.method === 'GET' && path === '/api/admin/casino/providers') {
    if (!isCasinoConfigured()) return badRequest(res, 'CASINO_API_KEY not configured'), true;
    try {
      const providers = await getCasinoProviders();
      sendJson(res, 200, { success: true, providers });
    } catch (e: any) {
      sendJson(res, 200, { success: false, error: String(e?.message || e) });
    }
    return true;
  }

  // GET /api/admin/casino/games?provider_id=1 — the real, licensed game catalog for one provider.
  // Subject to the same IP whitelist as every other agent/* and game/* call from this sandbox —
  // works once called from a whitelisted server IP.
  if (req.method === 'GET' && path === '/api/admin/casino/games') {
    if (!isCasinoConfigured()) return badRequest(res, 'CASINO_API_KEY not configured'), true;
    const providerId = Number(url.searchParams.get('provider_id') || 0);
    if (!providerId) return badRequest(res, 'provider_id required'), true;
    try {
      const games = await getCasinoGames(providerId);
      sendJson(res, 200, { success: true, games });
    } catch (e: any) {
      sendJson(res, 200, { success: false, error: String(e?.message || e) });
    }
    return true;
  }

  return badRequest(res, 'Not supported'), true;
}

