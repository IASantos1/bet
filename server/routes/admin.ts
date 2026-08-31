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

