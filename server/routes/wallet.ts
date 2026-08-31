import type http from 'http';
import type pg from 'pg';
import { randomId } from '../lib/crypto';
import { readJsonBody, sendJson, badRequest, unauthorized, resolveIdempotencyKey } from '../lib/http';
import { requireUser } from '../lib/auth';
import {
  walletService,
  WalletError,
  withTransaction,
  opRequestWithdrawal,
  opCancelWithdrawal,
  opReserveForBet,
  opSettleBetWon,
  opCashout,
  opAdjustBalance,
} from '../lib/ledger';
import { validateBetRequest, BetRejectedError } from '../lib/bettingEngine';
import { maybeGrantWelcomeBonus, applyBonusWagering } from '../lib/bonusService';
import {
  isStripeConfigured,
  stripePublishableKey,
  createDepositPaymentIntent,
  getDepositIntentStatus,
  DEPOSIT_METHODS,
  type DepositMethod,
} from '../lib/stripePayments';

function toNumber(v: any): number {
  const n = typeof v === 'string' ? Number(v.replace(',', '.')) : Number(v);
  return Number.isFinite(n) ? n : 0;
}

function walletJson(w: { available: number; reserved: number; bonus: number; pendingWithdrawal: number }) {
  return {
    // `balance` kept as an alias of `available` for existing frontend callers.
    balance: w.available,
    available: w.available,
    reserved: w.reserved,
    bonus: w.bonus,
    pending_withdrawal: w.pendingWithdrawal,
    currency: 'EUR',
  };
}

function handleWalletError(res: http.ServerResponse, e: unknown): boolean {
  if (e instanceof WalletError) {
    const status = e.code === 'INSUFFICIENT_FUNDS' || e.code === 'INVALID_AMOUNT' ? 400 : e.code === 'NOT_FOUND' ? 404 : 409;
    sendJson(res, status, { error: e.message, code: e.code });
    return true;
  }
  if (e instanceof BetRejectedError) {
    sendJson(res, 400, { error: e.message, code: e.code, details: e.details });
    return true;
  }
  return false;
}

async function getTransactions(pool: pg.Pool, userId: string) {
  const r = await pool.query(
    `SELECT id, type, status, amount, created_at, payment_method, description, external_id
     FROM transactions
     WHERE user_id = $1
     ORDER BY created_at DESC
     LIMIT 200`,
    [userId],
  );
  return (r.rows || []).map((x: any) => ({
    id: String(x.id),
    type: String(x.type || ''),
    status: String(x.status || ''),
    amount: Number(x.amount || 0),
    currency: 'EUR',
    created_at: x.created_at ? new Date(x.created_at).toISOString() : new Date().toISOString(),
    method: x.payment_method ? String(x.payment_method) : undefined,
    metadata: x.description ? String(x.description) : undefined,
    external_id: x.external_id ? String(x.external_id) : undefined,
  }));
}

/** Records a human-readable transaction row for history/backoffice display. Never the source of truth for balance. */
async function recordTransaction(
  pool: pg.Pool,
  params: { id: string; userId: string; type: string; amount: number; status: string; method: string; description: string; externalId?: string | null },
) {
  await pool.query(
    `INSERT INTO transactions (id, user_id, type, amount, status, payment_method, description, external_id, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())
     ON CONFLICT (id) DO NOTHING`,
    [params.id, params.userId, params.type, params.amount, params.status, params.method, params.description, params.externalId ?? null],
  );
}

export async function handleWalletRoutes(
  pool: pg.Pool,
  req: http.IncomingMessage,
  res: http.ServerResponse,
  url: URL,
): Promise<boolean> {
  const path = url.pathname;

  // GET /api/wallet — return balance
  if (req.method === 'GET' && path === '/api/wallet') {
    const u = await requireUser(pool, req);
    if (!u) return unauthorized(res), true;
    const wallet = await walletService.getWallet(pool, u.id);
    sendJson(res, 200, walletJson(wallet));
    return true;
  }

  // GET /api/wallet/balances — array format (used by Header)
  if (req.method === 'GET' && path === '/api/wallet/balances') {
    const u = await requireUser(pool, req);
    if (!u) return unauthorized(res), true;
    const wallet = await walletService.getWallet(pool, u.id);
    sendJson(res, 200, [{ currency: 'EUR', balance: wallet.available }]);
    return true;
  }

  // GET /api/wallet/transactions — list transactions
  if (req.method === 'GET' && path === '/api/wallet/transactions') {
    const u = await requireUser(pool, req);
    if (!u) return unauthorized(res), true;
    sendJson(res, 200, await getTransactions(pool, u.id));
    return true;
  }

  // GET /api/transactions — alias used by many frontend hooks
  if (req.method === 'GET' && path === '/api/transactions') {
    const u = await requireUser(pool, req);
    if (!u) return unauthorized(res), true;
    const txs = await getTransactions(pool, u.id);
    sendJson(res, 200, { transactions: txs });
    return true;
  }

  // POST /api/transactions — create a pending transaction record (informational only, no money movement)
  if (req.method === 'POST' && path === '/api/transactions') {
    const u = await requireUser(pool, req);
    if (!u) return unauthorized(res), true;

    const body = await readJsonBody<any>(req).catch(() => null);
    if (!body) return badRequest(res, 'Invalid JSON'), true;

    const amount = toNumber(body.amount);
    if (!amount || amount <= 0) return badRequest(res, 'Valor inválido'), true;

    const txId = randomId(16);
    const externalId = body.external_id ? String(body.external_id) : null;

    await recordTransaction(pool, {
      id: txId,
      userId: u.id,
      type: String(body.type || 'deposit'),
      amount,
      status: String(body.status || 'pending'),
      method: String(body.payment_method || 'manual'),
      description: String(body.description || ''),
      externalId,
    });

    sendJson(res, 200, { ok: true, id: txId });
    return true;
  }

  // GET /api/pricing/config
  if (req.method === 'GET' && path === '/api/pricing/config') {
    sendJson(res, 200, { betDefault: 10, minDeposit: 10, maxDeposit: 10000, minWithdrawal: 20 });
    return true;
  }

  // ---- Deposits: every deposit is a confirmed-payment credit into the ledger. ----
  // `external_id` (PSP transaction/session id) is the natural idempotency key: replaying the
  // same PSP webhook or client confirmation twice never credits the wallet twice (spec §9, §65).
  //
  // There is deliberately no client-callable endpoint that credits the wallet directly off a
  // client-supplied amount — that would let anyone with a valid session mint their own balance.
  // Real money only ever enters the ledger from a payment provider's own server-to-server
  // confirmation: the Stripe webhook below (walletService.deposit() is otherwise unreachable
  // from an HTTP route in this file).

  // GET /api/wallet/stripe/config — the publishable key, safe to expose (it's what Stripe.js
  // needs client-side; the secret key never leaves the server). No auth needed.
  if (req.method === 'GET' && path === '/api/wallet/stripe/config') {
    sendJson(res, 200, { configured: isStripeConfigured(), publishableKey: stripePublishableKey() });
    return true;
  }

  // POST /api/wallet/deposit/stripe/intent — creates a PaymentIntent for an embedded deposit (the
  // frontend confirms it in place with Stripe Elements — card fields, an MB WAY phone number, or
  // a Multibanco voucher — never leaving /deposit). No wallet credit happens here; that only
  // happens once Stripe's webhook confirms the payment (POST /webhooks/stripe).
  if (req.method === 'POST' && path === '/api/wallet/deposit/stripe/intent') {
    const u = await requireUser(pool, req);
    if (!u) return unauthorized(res), true;
    if (!isStripeConfigured()) return badRequest(res, 'Depósitos indisponíveis de momento'), true;

    const body = await readJsonBody<any>(req).catch(() => null);
    if (!body) return badRequest(res, 'Invalid JSON'), true;
    const amount = toNumber(body.amount);
    if (!amount || amount < 10) return badRequest(res, 'Valor mínimo €10'), true;
    const methodRaw = String(body.method || 'card');
    if (!DEPOSIT_METHODS.includes(methodRaw as DepositMethod)) return badRequest(res, 'Método de pagamento inválido'), true;
    const method = methodRaw as DepositMethod;

    const methodLabel = method === 'card' ? 'Cartão' : method === 'mb_way' ? 'MB WAY' : 'Multibanco';

    try {
      const intent = await createDepositPaymentIntent({ userId: u.id, amount, method, email: u.email });
      const txId = randomId(16);
      await recordTransaction(pool, {
        id: txId,
        userId: u.id,
        type: 'deposit',
        amount,
        status: 'pending',
        method: `stripe_${method}`,
        description: `Depósito via ${methodLabel} (Stripe) - €${amount.toFixed(2)}`,
      });
      // Tag the row with the PaymentIntent id so the webhook can find it later. recordTransaction()
      // doesn't take stripe_session_id (kept out of its generic signature) — same column, now
      // holding a PaymentIntent id rather than a Checkout Session id.
      await pool.query(`UPDATE transactions SET stripe_session_id = $2 WHERE id = $1`, [txId, intent.paymentIntentId]);
      sendJson(res, 200, { ok: true, client_secret: intent.clientSecret, payment_intent_id: intent.paymentIntentId, email: u.email });
    } catch (e: any) {
      sendJson(res, 502, { error: 'Não foi possível iniciar o pagamento', details: String(e?.message || e) });
    }
    return true;
  }

  // GET /api/wallet/deposit/stripe/status?payment_intent_id= — lets the frontend show a live
  // "confirmado" state for MB WAY/Multibanco (both wait on the customer outside our page) without
  // waiting on the wallet webhook. Scoped to the caller's own pending transaction row — never
  // returns another user's payment status, and never itself credits the wallet.
  if (req.method === 'GET' && path === '/api/wallet/deposit/stripe/status') {
    const u = await requireUser(pool, req);
    if (!u) return unauthorized(res), true;
    const paymentIntentId = String(url.searchParams.get('payment_intent_id') || '');
    if (!paymentIntentId) return badRequest(res, 'payment_intent_id required'), true;

    const owns = await pool.query(`SELECT 1 FROM transactions WHERE stripe_session_id = $1 AND user_id = $2 LIMIT 1`, [paymentIntentId, u.id]);
    if (!owns.rows[0]) return badRequest(res, 'Depósito não encontrado'), true;

    try {
      const status = await getDepositIntentStatus(paymentIntentId);
      sendJson(res, 200, { ok: true, status });
    } catch (e: any) {
      sendJson(res, 502, { error: 'Não foi possível consultar o pagamento', details: String(e?.message || e) });
    }
    return true;
  }

  // POST /api/wallet/deposit/mbway — MB WAY deposit (stays pending until the provider confirms; no wallet credit yet)
  if (req.method === 'POST' && path === '/api/wallet/deposit/mbway') {
    const u = await requireUser(pool, req);
    if (!u) return unauthorized(res), true;

    const body = await readJsonBody<any>(req).catch(() => null);
    if (!body) return badRequest(res, 'Invalid JSON'), true;
    const amount = toNumber(body.amount);
    if (!amount || amount < 10) return badRequest(res, 'Valor mínimo €10'), true;

    const txId = randomId(16);
    await recordTransaction(pool, {
      id: txId,
      userId: u.id,
      type: 'deposit',
      amount,
      status: 'pending',
      method: 'mbway',
      description: `Depósito via MB WAY - €${amount.toFixed(2)}`,
    });

    sendJson(res, 200, { ok: true, id: txId, message: 'Pedido MB WAY enviado. Confirme no telemóvel.' });
    return true;
  }

  // ---- Withdrawals ----

  const doWithdraw = async () => {
    const u = await requireUser(pool, req);
    if (!u) return unauthorized(res), true;

    const body = await readJsonBody<any>(req).catch(() => null);
    if (!body) return badRequest(res, 'Invalid JSON'), true;

    const amount = toNumber(body.amount ?? body.amount_eur);
    if (!amount || amount < 20) return badRequest(res, 'Valor mínimo de levantamento é €20'), true;

    const withdrawalId = randomId(16);
    const idempotencyKey = resolveIdempotencyKey(req, body, null);
    const meta = JSON.stringify({
      iban: String(body.iban || body.accountDetails?.iban || ''),
      holder_name: String(body.holder_name || body.accountDetails?.accountHolder || ''),
      nif: String(body.nif || ''),
    });

    try {
      const result = await opWithdrawTx(pool, { userId: u.id, amount, idempotencyKey, withdrawalId });
      if (!result.replayed) {
        await recordTransaction(pool, {
          id: withdrawalId,
          userId: u.id,
          type: 'withdrawal',
          amount,
          status: 'pending',
          method: 'iban',
          description: meta,
        });
      }
      sendJson(res, 200, {
        success: true,
        id: withdrawalId,
        transactionId: withdrawalId,
        message: `Levantamento de €${amount.toFixed(2)} solicitado com sucesso!`,
        processingTime: '1-3 dias úteis',
        newBalance: result.wallet.available,
      });
    } catch (e) {
      if (!handleWalletError(res, e)) throw e;
    }
    return true;
  };

  if (req.method === 'POST' && (path === '/api/wallet/withdraw' || path === '/api/wallet/withdrawals')) {
    return doWithdraw();
  }

  // POST /api/wallet/withdraw/cancel — cancel a pending withdrawal, return funds to available
  if (req.method === 'POST' && path === '/api/wallet/withdraw/cancel') {
    const u = await requireUser(pool, req);
    if (!u) return unauthorized(res), true;

    const body = await readJsonBody<any>(req).catch(() => null);
    if (!body?.id) return badRequest(res, 'ID em falta'), true;
    const withdrawalId = String(body.id);

    const r = await pool.query(
      `SELECT id, amount FROM transactions WHERE id = $1 AND user_id = $2 AND type = 'withdrawal' AND status = 'pending' LIMIT 1`,
      [withdrawalId, u.id],
    );
    if (!r.rows[0]) return badRequest(res, 'Transação não encontrada ou já processada'), true;
    const amount = Number(r.rows[0].amount);

    try {
      const result = await withTransaction(pool, async (client) => {
        await client.query(`UPDATE transactions SET status = 'cancelled', updated_at = NOW() WHERE id = $1 AND status = 'pending'`, [withdrawalId]);
        return opCancelWithdrawal(client, {
          userId: u.id,
          amount,
          idempotencyKey: `withdraw_cancel:${withdrawalId}`,
          withdrawalId,
        });
      });
      sendJson(res, 200, { ok: true, newBalance: result.wallet.available });
    } catch (e) {
      if (!handleWalletError(res, e)) throw e;
    }
    return true;
  }

  // ---- Bet stake / settlement bridge ----
  // The betting-slip UI moves money through these endpoints directly rather than always going
  // through POST /api/bets. When a `betId` is supplied we correlate the reservation and its
  // settlement so the funds are traceable end-to-end; without one we still guarantee atomicity,
  // idempotency and a non-negative balance via a direct house adjustment.

  // POST /api/wallet/bet — reserve a stake
  if (req.method === 'POST' && path === '/api/wallet/bet') {
    const u = await requireUser(pool, req);
    if (!u) return unauthorized(res), true;

    const body = await readJsonBody<any>(req).catch(() => null);
    if (!body) return badRequest(res, 'Invalid JSON'), true;

    const amount = toNumber(body.amount ?? body.stake);
    if (!amount || amount <= 0) return badRequest(res, 'Valor inválido'), true;
    const betId = body.betId ? String(body.betId) : `adhoc:${randomId(12)}`;
    const idempotencyKey = resolveIdempotencyKey(req, body, `bet_reserve:${betId}`);
    // This entry point doesn't carry per-selection event/odd detail (see server/lib/bettingEngine.ts
    // module docstring), so only the stake/payout limit checks apply here — no live price cross-check.
    const totalOdds = toNumber(body.totalOdds) || 1.01;

    try {
      await validateBetRequest({
        legs: [{ eventId: betId, selection: 'combined', odd: totalOdds }],
        stake: amount,
        totalOdds,
      });
      const result = await withTransaction(pool, (client) =>
        opReserveForBet(client, { userId: u.id, amount, idempotencyKey, betId, useBonus: Boolean(body.isFreeBet ?? body.use_freebet) }),
      );
      if (!result.replayed) {
        await applyBonusWagering(pool, u.id, amount, totalOdds).catch(() => null);
      }
      sendJson(res, 200, { ok: true, balance: result.wallet.available, betId });
    } catch (e) {
      if (!handleWalletError(res, e)) throw e;
    }
    return true;
  }

  // POST /api/wallet/win — credit winnings (releases the matching reservation when betId is known)
  if (req.method === 'POST' && path === '/api/wallet/win') {
    const u = await requireUser(pool, req);
    if (!u) return unauthorized(res), true;

    const body = await readJsonBody<any>(req).catch(() => null);
    if (!body) return badRequest(res, 'Invalid JSON'), true;

    const amount = toNumber(body.amount);
    if (!amount || amount <= 0) return badRequest(res, 'Valor inválido'), true;
    const betId = body.betId ? String(body.betId) : null;
    const idempotencyKey = resolveIdempotencyKey(req, body, betId ? `bet_win:${betId}` : null);

    try {
      const stake = toNumber(body.stake);
      const result = await withTransaction(pool, async (client) => {
        if (betId && stake > 0) {
          const settled = await tryWithSavepoint(client, () => opSettleBetWon(client, { userId: u.id, stake, payout: amount, idempotencyKey, betId }));
          // No matching reservation for this betId (legacy caller never reserved it here) — fall through to a direct credit.
          if (settled) return settled;
        }
        return opAdjustBalance(client, { userId: u.id, amount, idempotencyKey, reason: 'bet_win', referenceId: betId ?? undefined });
      });
      sendJson(res, 200, { ok: true, balance: result.wallet.available });
    } catch (e) {
      if (!handleWalletError(res, e)) throw e;
    }
    return true;
  }

  // POST /api/wallet/cashout — cashout a bet (releases the matching reservation when betId+stake are known)
  if (req.method === 'POST' && path === '/api/wallet/cashout') {
    const u = await requireUser(pool, req);
    if (!u) return unauthorized(res), true;

    const body = await readJsonBody<any>(req).catch(() => null);
    if (!body) return badRequest(res, 'Invalid JSON'), true;

    const amount = toNumber(body.amount);
    if (!amount || amount <= 0) return badRequest(res, 'Valor inválido'), true;
    const betId = body.betId ? String(body.betId) : null;
    const idempotencyKey = resolveIdempotencyKey(req, body, betId ? `cashout:${betId}` : null);

    try {
      const stake = toNumber(body.stake);
      const result = await withTransaction(pool, async (client) => {
        if (betId && stake > 0) {
          const cashedOut = await tryWithSavepoint(client, () => opCashout(client, { userId: u.id, stake, cashoutValue: amount, idempotencyKey, betId }));
          if (cashedOut) return cashedOut;
        }
        return opAdjustBalance(client, { userId: u.id, amount, idempotencyKey, reason: 'cashout', referenceId: betId ?? undefined });
      });
      sendJson(res, 200, { ok: true, balance: result.wallet.available });
    } catch (e) {
      if (!handleWalletError(res, e)) throw e;
    }
    return true;
  }

  // POST /api/payments/mbway — initiate MB WAY payment (pending only)
  if (req.method === 'POST' && path === '/api/payments/mbway') {
    const u = await requireUser(pool, req);
    if (!u) return unauthorized(res), true;

    const body = await readJsonBody<any>(req).catch(() => null);
    if (!body) return badRequest(res, 'Invalid JSON'), true;

    const amount = toNumber(body.amount);
    if (!amount || amount < 10) return badRequest(res, 'Valor mínimo €10'), true;

    const txId = randomId(16);
    await recordTransaction(pool, {
      id: txId,
      userId: u.id,
      type: 'deposit',
      amount,
      status: 'pending',
      method: 'mbway',
      description: `Depósito MB WAY - €${amount.toFixed(2)}`,
    });

    sendJson(res, 200, { ok: true, id: txId, status: 'pending', message: 'Pagamento MB WAY iniciado. Confirme no telemóvel.' });
    return true;
  }

  // POST /api/payments/multibanco/generate — generate Multibanco reference (pending only)
  if (req.method === 'POST' && path === '/api/payments/multibanco/generate') {
    const u = await requireUser(pool, req);
    if (!u) return unauthorized(res), true;

    const body = await readJsonBody<any>(req).catch(() => null);
    if (!body) return badRequest(res, 'Invalid JSON'), true;

    const amount = toNumber(body.amount);
    if (!amount || amount < 10) return badRequest(res, 'Valor mínimo €10'), true;

    const entity = '11249';
    const reference = `${Math.floor(Math.random() * 900000000 + 100000000)}`;

    const txId = randomId(16);
    await recordTransaction(pool, {
      id: txId,
      userId: u.id,
      type: 'deposit',
      amount,
      status: 'pending',
      method: 'multibanco',
      description: `Referência Multibanco: ${entity} / ${reference}`,
    });

    sendJson(res, 200, { ok: true, entity, reference, amount, expires_at: new Date(Date.now() + 72 * 3600 * 1000).toISOString() });
    return true;
  }

  return false;
}

function opWithdrawTx(pool: pg.Pool, params: Parameters<typeof opRequestWithdrawal>[1]) {
  return withTransaction(pool, (client) => opRequestWithdrawal(client, params));
}

let savepointCounter = 0;

/**
 * Runs `fn` under a SAVEPOINT so a business-rule failure (WalletError INVALID_STATE — e.g. no
 * matching reservation) can be undone without losing the outer transaction, leaving no orphaned
 * ledger_transactions/entries behind. Returns `null` on that specific failure so the caller can
 * fall back to a different operation in the same transaction; any other error propagates.
 */
async function tryWithSavepoint<T>(client: pg.PoolClient, fn: () => Promise<T>): Promise<T | null> {
  const sp = `sp_${++savepointCounter}_${Date.now()}`;
  await client.query(`SAVEPOINT ${sp}`);
  try {
    const result = await fn();
    await client.query(`RELEASE SAVEPOINT ${sp}`);
    return result;
  } catch (e) {
    if (e instanceof WalletError && e.code === 'INVALID_STATE') {
      await client.query(`ROLLBACK TO SAVEPOINT ${sp}`);
      return null;
    }
    throw e;
  }
}
