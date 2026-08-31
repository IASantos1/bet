import type pg from 'pg';
import { randomId } from './crypto';

/**
 * Wallet + Double-Entry Ledger + Transaction Engine (BET62 spec §2, §7-9, §21, §47-48).
 *
 * Rules enforced here, not just documented:
 *  - No code path ever writes `wallets.available/reserved/bonus/pending_withdrawal` except
 *    the operations in this file, and every write happens in the same DB transaction as the
 *    ledger_entries that justify it (source of truth = ledger, wallet = locked materialized cache).
 *  - Every operation is wrapped by a caller-managed Postgres transaction and takes a row lock
 *    on the wallet (`SELECT ... FOR UPDATE`) before reading or mutating it, so concurrent
 *    requests for the same user serialize instead of racing (spec §47, §63).
 *  - Every operation is idempotent: it is claimed by a unique `idempotency_key` inside the same
 *    transaction as the mutation. A retried call with the same key is a no-op that replays the
 *    original result (spec §9, §48, §65).
 *  - Every mutation posts a balanced double-entry (sum(debit) === sum(credit)) into the
 *    append-only `ledger_entries` table. Nothing is ever UPDATEd or DELETEd there (spec §8, §55).
 */

export type LedgerTxType =
  | 'deposit'
  | 'withdrawal_request'
  | 'withdrawal_paid'
  | 'withdrawal_cancelled'
  | 'bet_reserve'
  | 'bet_win'
  | 'bet_loss'
  | 'bet_void'
  | 'cashout'
  | 'bonus_grant'
  | 'bonus_convert'
  | 'bonus_forfeit'
  | 'adjustment';

export const ACCOUNTS = {
  PLAYER_AVAILABLE: 'PLAYER_AVAILABLE',
  PLAYER_RESERVED: 'PLAYER_RESERVED',
  PLAYER_BONUS: 'PLAYER_BONUS',
  PLAYER_PENDING_WITHDRAWAL: 'PLAYER_PENDING_WITHDRAWAL',
  PAYMENT_PROVIDER_CLEARING: 'PAYMENT_PROVIDER_CLEARING',
  HOUSE_REVENUE: 'HOUSE_REVENUE',
  HOUSE_LIABILITY: 'HOUSE_LIABILITY',
  BONUS_LIABILITY: 'BONUS_LIABILITY',
} as const;

export type WalletErrorCode = 'INVALID_AMOUNT' | 'INSUFFICIENT_FUNDS' | 'NOT_FOUND' | 'INVALID_STATE';

export class WalletError extends Error {
  code: WalletErrorCode;
  constructor(code: WalletErrorCode, message: string) {
    super(message);
    this.code = code;
    this.name = 'WalletError';
  }
}

export interface WalletSnapshot {
  userId: string;
  available: number;
  reserved: number;
  bonus: number;
  pendingWithdrawal: number;
  currency: string;
  version: number;
}

interface Leg {
  account: string;
  direction: 'debit' | 'credit';
  amount: number;
  userId?: string | null;
}

interface OpResult<TExtra> {
  legs: Leg[];
  walletPatch: Partial<Pick<WalletSnapshot, 'available' | 'reserved' | 'bonus' | 'pendingWithdrawal'>>;
  extra?: TExtra;
}

interface ApplyResult<TExtra> {
  replayed: boolean;
  transactionId: string;
  wallet: WalletSnapshot;
  extra?: TExtra;
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function mapWalletRow(row: any): WalletSnapshot {
  return {
    userId: String(row.user_id),
    available: round2(Number(row.available)),
    reserved: round2(Number(row.reserved)),
    bonus: round2(Number(row.bonus)),
    pendingWithdrawal: round2(Number(row.pending_withdrawal)),
    currency: String(row.currency || 'EUR'),
    version: Number(row.version || 0),
  };
}

function assertBalanced(legs: Leg[]): void {
  let debit = 0;
  let credit = 0;
  for (const leg of legs) {
    if (!(leg.amount > 0) || !Number.isFinite(leg.amount)) {
      throw new Error(`[ledger] invalid leg amount for account ${leg.account}: ${leg.amount}`);
    }
    if (leg.direction === 'debit') debit = round2(debit + leg.amount);
    else credit = round2(credit + leg.amount);
  }
  if (debit !== credit) {
    throw new Error(`[ledger] unbalanced transaction: debit=${debit} credit=${credit}`);
  }
}

/** Run `fn` inside a single Postgres transaction on a dedicated client. */
export async function withTransaction<T>(pool: pg.Pool, fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (e) {
    await client.query('ROLLBACK').catch(() => void 0);
    throw e;
  } finally {
    client.release();
  }
}

/**
 * Locks (or lazily creates) the wallet row for `userId` within the caller's transaction.
 * Must be called after BEGIN and before reading/mutating wallet fields.
 */
async function lockWallet(client: pg.PoolClient, userId: string): Promise<WalletSnapshot> {
  await client.query(
    `INSERT INTO wallets (user_id, available, reserved, bonus, pending_withdrawal)
     SELECT $1, COALESCE(p.balance, 0), 0, COALESCE(p.free_bet_balance, 0), 0
     FROM profiles p WHERE p.user_id = $1
     ON CONFLICT (user_id) DO NOTHING`,
    [userId],
  );
  await client.query(`INSERT INTO wallets (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING`, [userId]);
  const r = await client.query(`SELECT * FROM wallets WHERE user_id = $1 FOR UPDATE`, [userId]);
  if (!r.rows[0]) throw new WalletError('NOT_FOUND', 'Wallet not found');
  return mapWalletRow(r.rows[0]);
}

interface ApplyOpts<TExtra> {
  idempotencyKey: string;
  type: LedgerTxType;
  userId: string;
  referenceId?: string | null;
  metadata?: Record<string, unknown>;
  compute: (wallet: WalletSnapshot) => OpResult<TExtra>;
}

/**
 * Core primitive: claim the idempotency key, lock the wallet, compute the balanced legs via
 * `compute`, persist entries + new wallet snapshot, and record a replayable result snapshot.
 * Must be called with a client that already has an open transaction (see `withTransaction`).
 */
async function applyLedgerOp<TExtra = unknown>(
  client: pg.PoolClient,
  opts: ApplyOpts<TExtra>,
): Promise<ApplyResult<TExtra>> {
  const txId = randomId(16);
  const claim = await client.query(
    `INSERT INTO ledger_transactions (id, idempotency_key, type, user_id, reference_id, metadata, status)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb, 'completed')
     ON CONFLICT (idempotency_key) DO NOTHING
     RETURNING id`,
    [txId, opts.idempotencyKey, opts.type, opts.userId, opts.referenceId ?? null, JSON.stringify(opts.metadata ?? {})],
  );

  if (claim.rowCount === 0) {
    const existing = await client.query(
      `SELECT id, result_snapshot FROM ledger_transactions WHERE idempotency_key = $1`,
      [opts.idempotencyKey],
    );
    const row = existing.rows[0];
    const snap = row?.result_snapshot || {};
    return {
      replayed: true,
      transactionId: String(row?.id ?? ''),
      wallet: snap.wallet,
      extra: snap.extra,
    };
  }

  const wallet = await lockWallet(client, opts.userId);
  const { legs, walletPatch, extra } = opts.compute(wallet);
  assertBalanced(legs);

  for (const leg of legs) {
    await client.query(
      `INSERT INTO ledger_entries (transaction_id, account, user_id, direction, amount, currency)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [txId, leg.account, leg.userId ?? null, leg.direction, leg.amount.toFixed(2), wallet.currency],
    );
  }

  const next: WalletSnapshot = {
    ...wallet,
    available: round2(walletPatch.available ?? wallet.available),
    reserved: round2(walletPatch.reserved ?? wallet.reserved),
    bonus: round2(walletPatch.bonus ?? wallet.bonus),
    pendingWithdrawal: round2(walletPatch.pendingWithdrawal ?? wallet.pendingWithdrawal),
    version: wallet.version + 1,
  };

  if (next.available < 0 || next.reserved < 0 || next.bonus < 0 || next.pendingWithdrawal < 0) {
    // compute() should have thrown WalletError before this point; this is a last-resort guard.
    throw new Error(`[ledger] operation would drive wallet negative for user ${opts.userId}`);
  }

  await client.query(
    `UPDATE wallets
     SET available = $2, reserved = $3, bonus = $4, pending_withdrawal = $5, version = $6, updated_at = NOW()
     WHERE user_id = $1`,
    [opts.userId, next.available, next.reserved, next.bonus, next.pendingWithdrawal, next.version],
  );
  // Legacy mirror: profiles.balance/free_bet_balance stay in lock-step so any code still
  // reading them directly sees a consistent value. wallets + ledger remain the source of truth.
  await client.query(`UPDATE profiles SET balance = $2, free_bet_balance = $3, updated_at = NOW() WHERE user_id = $1`, [
    opts.userId,
    next.available,
    next.bonus,
  ]);

  await client.query(`UPDATE ledger_transactions SET result_snapshot = $2::jsonb WHERE id = $1`, [
    txId,
    JSON.stringify({ wallet: next, extra }),
  ]);

  return { replayed: false, transactionId: txId, wallet: next, extra };
}

function requirePositiveAmount(amount: number): void {
  if (!Number.isFinite(amount) || amount <= 0) throw new WalletError('INVALID_AMOUNT', 'Amount must be a positive number');
}

// ---------------------------------------------------------------------------------
// High-level operations. Each takes an already-open transaction `client` so callers can
// compose them with other writes (e.g. inserting a `bets` row) atomically. Thin `pool`-level
// convenience wrappers are exported below for endpoints that only need a single operation.
// ---------------------------------------------------------------------------------

export async function opCreditDeposit(
  client: pg.PoolClient,
  params: { userId: string; amount: number; idempotencyKey: string; method?: string; referenceId?: string },
): Promise<ApplyResult<undefined>> {
  requirePositiveAmount(params.amount);
  const amount = round2(params.amount);
  return applyLedgerOp(client, {
    idempotencyKey: params.idempotencyKey,
    type: 'deposit',
    userId: params.userId,
    referenceId: params.referenceId,
    metadata: { method: params.method },
    compute: (wallet) => ({
      legs: [
        { account: ACCOUNTS.PAYMENT_PROVIDER_CLEARING, direction: 'debit', amount },
        { account: ACCOUNTS.PLAYER_AVAILABLE, userId: wallet.userId, direction: 'credit', amount },
      ],
      walletPatch: { available: wallet.available + amount },
    }),
  });
}

export async function opReserveForBet(
  client: pg.PoolClient,
  params: { userId: string; amount: number; idempotencyKey: string; betId: string; useBonus?: boolean },
): Promise<ApplyResult<undefined>> {
  requirePositiveAmount(params.amount);
  const amount = round2(params.amount);
  const useBonus = Boolean(params.useBonus);
  return applyLedgerOp(client, {
    idempotencyKey: params.idempotencyKey,
    type: 'bet_reserve',
    userId: params.userId,
    referenceId: params.betId,
    metadata: { useBonus },
    compute: (wallet) => {
      if (useBonus) {
        if (wallet.bonus < amount) throw new WalletError('INSUFFICIENT_FUNDS', 'Saldo de bónus insuficiente');
        return {
          legs: [
            { account: ACCOUNTS.PLAYER_BONUS, userId: wallet.userId, direction: 'debit', amount },
            { account: ACCOUNTS.PLAYER_RESERVED, userId: wallet.userId, direction: 'credit', amount },
          ],
          walletPatch: { bonus: wallet.bonus - amount, reserved: wallet.reserved + amount },
        };
      }
      if (wallet.available < amount) throw new WalletError('INSUFFICIENT_FUNDS', 'Saldo insuficiente');
      return {
        legs: [
          { account: ACCOUNTS.PLAYER_AVAILABLE, userId: wallet.userId, direction: 'debit', amount },
          { account: ACCOUNTS.PLAYER_RESERVED, userId: wallet.userId, direction: 'credit', amount },
        ],
        walletPatch: { available: wallet.available - amount, reserved: wallet.reserved + amount },
      };
    },
  });
}

export async function opSettleBetWon(
  client: pg.PoolClient,
  params: { userId: string; stake: number; payout: number; idempotencyKey: string; betId: string },
): Promise<ApplyResult<undefined>> {
  requirePositiveAmount(params.stake);
  requirePositiveAmount(params.payout);
  const stake = round2(params.stake);
  const payout = round2(params.payout);
  return applyLedgerOp(client, {
    idempotencyKey: params.idempotencyKey,
    type: 'bet_win',
    userId: params.userId,
    referenceId: params.betId,
    metadata: { stake, payout },
    compute: (wallet) => {
      if (wallet.reserved < stake) throw new WalletError('INVALID_STATE', 'Reserva insuficiente para liquidar aposta');
      const houseSideDiff = round2(payout - stake);
      const legs: Leg[] = [{ account: ACCOUNTS.PLAYER_RESERVED, userId: wallet.userId, direction: 'debit', amount: stake }];
      if (houseSideDiff > 0) legs.push({ account: ACCOUNTS.HOUSE_LIABILITY, direction: 'debit', amount: houseSideDiff });
      if (houseSideDiff < 0) legs.push({ account: ACCOUNTS.HOUSE_REVENUE, direction: 'credit', amount: -houseSideDiff });
      legs.push({ account: ACCOUNTS.PLAYER_AVAILABLE, userId: wallet.userId, direction: 'credit', amount: payout });
      return {
        legs,
        walletPatch: { reserved: wallet.reserved - stake, available: wallet.available + payout },
      };
    },
  });
}

export async function opSettleBetLost(
  client: pg.PoolClient,
  params: { userId: string; stake: number; idempotencyKey: string; betId: string },
): Promise<ApplyResult<undefined>> {
  requirePositiveAmount(params.stake);
  const stake = round2(params.stake);
  return applyLedgerOp(client, {
    idempotencyKey: params.idempotencyKey,
    type: 'bet_loss',
    userId: params.userId,
    referenceId: params.betId,
    metadata: { stake },
    compute: (wallet) => {
      if (wallet.reserved < stake) throw new WalletError('INVALID_STATE', 'Reserva insuficiente para liquidar aposta');
      return {
        legs: [
          { account: ACCOUNTS.PLAYER_RESERVED, userId: wallet.userId, direction: 'debit', amount: stake },
          { account: ACCOUNTS.HOUSE_REVENUE, direction: 'credit', amount: stake },
        ],
        walletPatch: { reserved: wallet.reserved - stake },
      };
    },
  });
}

export async function opVoidBet(
  client: pg.PoolClient,
  params: { userId: string; stake: number; idempotencyKey: string; betId: string; toBonus?: boolean },
): Promise<ApplyResult<undefined>> {
  requirePositiveAmount(params.stake);
  const stake = round2(params.stake);
  const toBonus = Boolean(params.toBonus);
  return applyLedgerOp(client, {
    idempotencyKey: params.idempotencyKey,
    type: 'bet_void',
    userId: params.userId,
    referenceId: params.betId,
    metadata: { toBonus },
    compute: (wallet) => {
      if (wallet.reserved < stake) throw new WalletError('INVALID_STATE', 'Reserva insuficiente para anular aposta');
      const target = toBonus ? ACCOUNTS.PLAYER_BONUS : ACCOUNTS.PLAYER_AVAILABLE;
      return {
        legs: [
          { account: ACCOUNTS.PLAYER_RESERVED, userId: wallet.userId, direction: 'debit', amount: stake },
          { account: target, userId: wallet.userId, direction: 'credit', amount: stake },
        ],
        walletPatch: toBonus
          ? { reserved: wallet.reserved - stake, bonus: wallet.bonus + stake }
          : { reserved: wallet.reserved - stake, available: wallet.available + stake },
      };
    },
  });
}

export async function opCashout(
  client: pg.PoolClient,
  params: { userId: string; stake: number; cashoutValue: number; idempotencyKey: string; betId: string },
): Promise<ApplyResult<undefined>> {
  requirePositiveAmount(params.stake);
  if (!Number.isFinite(params.cashoutValue) || params.cashoutValue < 0) {
    throw new WalletError('INVALID_AMOUNT', 'Valor de cashout inválido');
  }
  const stake = round2(params.stake);
  const cashoutValue = round2(params.cashoutValue);
  return applyLedgerOp(client, {
    idempotencyKey: params.idempotencyKey,
    type: 'cashout',
    userId: params.userId,
    referenceId: params.betId,
    metadata: { stake, cashoutValue },
    compute: (wallet) => {
      if (wallet.reserved < stake) throw new WalletError('INVALID_STATE', 'Reserva insuficiente para cashout');
      const legs: Leg[] = [{ account: ACCOUNTS.PLAYER_RESERVED, userId: wallet.userId, direction: 'debit', amount: stake }];
      const diff = round2(cashoutValue - stake);
      if (diff > 0) legs.push({ account: ACCOUNTS.HOUSE_LIABILITY, direction: 'debit', amount: diff });
      if (diff < 0) legs.push({ account: ACCOUNTS.HOUSE_REVENUE, direction: 'credit', amount: -diff });
      if (cashoutValue > 0) legs.push({ account: ACCOUNTS.PLAYER_AVAILABLE, userId: wallet.userId, direction: 'credit', amount: cashoutValue });
      return {
        legs,
        walletPatch: { reserved: wallet.reserved - stake, available: wallet.available + cashoutValue },
      };
    },
  });
}

export async function opRequestWithdrawal(
  client: pg.PoolClient,
  params: { userId: string; amount: number; idempotencyKey: string; withdrawalId: string },
): Promise<ApplyResult<undefined>> {
  requirePositiveAmount(params.amount);
  const amount = round2(params.amount);
  return applyLedgerOp(client, {
    idempotencyKey: params.idempotencyKey,
    type: 'withdrawal_request',
    userId: params.userId,
    referenceId: params.withdrawalId,
    compute: (wallet) => {
      if (wallet.available < amount) throw new WalletError('INSUFFICIENT_FUNDS', 'Saldo insuficiente');
      return {
        legs: [
          { account: ACCOUNTS.PLAYER_AVAILABLE, userId: wallet.userId, direction: 'debit', amount },
          { account: ACCOUNTS.PLAYER_PENDING_WITHDRAWAL, userId: wallet.userId, direction: 'credit', amount },
        ],
        walletPatch: { available: wallet.available - amount, pendingWithdrawal: wallet.pendingWithdrawal + amount },
      };
    },
  });
}

export async function opCompleteWithdrawal(
  client: pg.PoolClient,
  params: { userId: string; amount: number; idempotencyKey: string; withdrawalId: string },
): Promise<ApplyResult<undefined>> {
  requirePositiveAmount(params.amount);
  const amount = round2(params.amount);
  return applyLedgerOp(client, {
    idempotencyKey: params.idempotencyKey,
    type: 'withdrawal_paid',
    userId: params.userId,
    referenceId: params.withdrawalId,
    compute: (wallet) => {
      if (wallet.pendingWithdrawal < amount) throw new WalletError('INVALID_STATE', 'Levantamento não está pendente');
      return {
        legs: [
          { account: ACCOUNTS.PLAYER_PENDING_WITHDRAWAL, userId: wallet.userId, direction: 'debit', amount },
          { account: ACCOUNTS.PAYMENT_PROVIDER_CLEARING, direction: 'credit', amount },
        ],
        walletPatch: { pendingWithdrawal: wallet.pendingWithdrawal - amount },
      };
    },
  });
}

export async function opCancelWithdrawal(
  client: pg.PoolClient,
  params: { userId: string; amount: number; idempotencyKey: string; withdrawalId: string },
): Promise<ApplyResult<undefined>> {
  requirePositiveAmount(params.amount);
  const amount = round2(params.amount);
  return applyLedgerOp(client, {
    idempotencyKey: params.idempotencyKey,
    type: 'withdrawal_cancelled',
    userId: params.userId,
    referenceId: params.withdrawalId,
    compute: (wallet) => {
      if (wallet.pendingWithdrawal < amount) throw new WalletError('INVALID_STATE', 'Levantamento não está pendente');
      return {
        legs: [
          { account: ACCOUNTS.PLAYER_PENDING_WITHDRAWAL, userId: wallet.userId, direction: 'debit', amount },
          { account: ACCOUNTS.PLAYER_AVAILABLE, userId: wallet.userId, direction: 'credit', amount },
        ],
        walletPatch: { pendingWithdrawal: wallet.pendingWithdrawal - amount, available: wallet.available + amount },
      };
    },
  });
}

export async function opGrantBonus(
  client: pg.PoolClient,
  params: { userId: string; amount: number; idempotencyKey: string; campaignId?: string },
): Promise<ApplyResult<undefined>> {
  requirePositiveAmount(params.amount);
  const amount = round2(params.amount);
  return applyLedgerOp(client, {
    idempotencyKey: params.idempotencyKey,
    type: 'bonus_grant',
    userId: params.userId,
    referenceId: params.campaignId,
    compute: (wallet) => ({
      legs: [
        { account: ACCOUNTS.BONUS_LIABILITY, direction: 'debit', amount },
        { account: ACCOUNTS.PLAYER_BONUS, userId: wallet.userId, direction: 'credit', amount },
      ],
      walletPatch: { bonus: wallet.bonus + amount },
    }),
  });
}

/** Wagering requirement met: the remaining bonus balance for this grant becomes real, spendable/withdrawable money. */
export async function opConvertBonus(
  client: pg.PoolClient,
  params: { userId: string; amount: number; idempotencyKey: string; userBonusId: string },
): Promise<ApplyResult<undefined>> {
  requirePositiveAmount(params.amount);
  const amount = round2(params.amount);
  return applyLedgerOp(client, {
    idempotencyKey: params.idempotencyKey,
    type: 'bonus_convert',
    userId: params.userId,
    referenceId: params.userBonusId,
    compute: (wallet) => {
      if (wallet.bonus < amount) throw new WalletError('INVALID_STATE', 'Saldo de bónus insuficiente para converter');
      return {
        legs: [
          { account: ACCOUNTS.PLAYER_BONUS, userId: wallet.userId, direction: 'debit', amount },
          { account: ACCOUNTS.PLAYER_AVAILABLE, userId: wallet.userId, direction: 'credit', amount },
        ],
        walletPatch: { bonus: wallet.bonus - amount, available: wallet.available + amount },
      };
    },
  });
}

/** Bonus expired (or otherwise forfeited) before the wagering requirement was met: the house reclaims what's left. */
export async function opForfeitBonus(
  client: pg.PoolClient,
  params: { userId: string; amount: number; idempotencyKey: string; userBonusId: string },
): Promise<ApplyResult<undefined>> {
  requirePositiveAmount(params.amount);
  const amount = round2(params.amount);
  return applyLedgerOp(client, {
    idempotencyKey: params.idempotencyKey,
    type: 'bonus_forfeit',
    userId: params.userId,
    referenceId: params.userBonusId,
    compute: (wallet) => {
      const forfeited = Math.min(wallet.bonus, amount); // never claw back more than is actually left
      if (forfeited <= 0) throw new WalletError('INVALID_STATE', 'Sem saldo de bónus para reclamar');
      return {
        legs: [
          { account: ACCOUNTS.PLAYER_BONUS, userId: wallet.userId, direction: 'debit', amount: forfeited },
          { account: ACCOUNTS.BONUS_LIABILITY, direction: 'credit', amount: forfeited },
        ],
        walletPatch: { bonus: wallet.bonus - forfeited },
      };
    },
  });
}

/**
 * Direct house-initiated adjustment, used only when a credit/debit cannot be correlated to a
 * prior reservation (e.g. a legacy client call that never reserved a stake under this betId).
 * Still atomic, idempotent and non-negative-guarded — just not linked to a specific reservation.
 */
export async function opAdjustBalance(
  client: pg.PoolClient,
  params: { userId: string; amount: number; idempotencyKey: string; reason: string; referenceId?: string },
): Promise<ApplyResult<undefined>> {
  if (!Number.isFinite(params.amount) || params.amount === 0) {
    throw new WalletError('INVALID_AMOUNT', 'Amount must be a non-zero number');
  }
  const amount = round2(Math.abs(params.amount));
  const credit = params.amount > 0;
  return applyLedgerOp(client, {
    idempotencyKey: params.idempotencyKey,
    type: 'adjustment',
    userId: params.userId,
    referenceId: params.referenceId,
    metadata: { reason: params.reason, direction: credit ? 'credit' : 'debit' },
    compute: (wallet) => {
      if (!credit && wallet.available < amount) throw new WalletError('INSUFFICIENT_FUNDS', 'Saldo insuficiente');
      return {
        legs: credit
          ? [
              { account: ACCOUNTS.HOUSE_LIABILITY, direction: 'debit', amount },
              { account: ACCOUNTS.PLAYER_AVAILABLE, userId: wallet.userId, direction: 'credit', amount },
            ]
          : [
              { account: ACCOUNTS.PLAYER_AVAILABLE, userId: wallet.userId, direction: 'debit', amount },
              { account: ACCOUNTS.HOUSE_REVENUE, direction: 'credit', amount },
            ],
        walletPatch: { available: credit ? wallet.available + amount : wallet.available - amount },
      };
    },
  });
}

export async function getWallet(pool: pg.Pool, userId: string): Promise<WalletSnapshot> {
  return withTransaction(pool, (client) => lockWallet(client, userId));
}

// Pool-level convenience wrappers for endpoints that perform exactly one ledger operation.
export const walletService = {
  deposit: (pool: pg.Pool, params: Parameters<typeof opCreditDeposit>[1]) =>
    withTransaction(pool, (client) => opCreditDeposit(client, params)),
  requestWithdrawal: (pool: pg.Pool, params: Parameters<typeof opRequestWithdrawal>[1]) =>
    withTransaction(pool, (client) => opRequestWithdrawal(client, params)),
  completeWithdrawal: (pool: pg.Pool, params: Parameters<typeof opCompleteWithdrawal>[1]) =>
    withTransaction(pool, (client) => opCompleteWithdrawal(client, params)),
  cancelWithdrawal: (pool: pg.Pool, params: Parameters<typeof opCancelWithdrawal>[1]) =>
    withTransaction(pool, (client) => opCancelWithdrawal(client, params)),
  reserveForBet: (pool: pg.Pool, params: Parameters<typeof opReserveForBet>[1]) =>
    withTransaction(pool, (client) => opReserveForBet(client, params)),
  settleBetWon: (pool: pg.Pool, params: Parameters<typeof opSettleBetWon>[1]) =>
    withTransaction(pool, (client) => opSettleBetWon(client, params)),
  settleBetLost: (pool: pg.Pool, params: Parameters<typeof opSettleBetLost>[1]) =>
    withTransaction(pool, (client) => opSettleBetLost(client, params)),
  voidBet: (pool: pg.Pool, params: Parameters<typeof opVoidBet>[1]) =>
    withTransaction(pool, (client) => opVoidBet(client, params)),
  cashout: (pool: pg.Pool, params: Parameters<typeof opCashout>[1]) =>
    withTransaction(pool, (client) => opCashout(client, params)),
  grantBonus: (pool: pg.Pool, params: Parameters<typeof opGrantBonus>[1]) =>
    withTransaction(pool, (client) => opGrantBonus(client, params)),
  convertBonus: (pool: pg.Pool, params: Parameters<typeof opConvertBonus>[1]) =>
    withTransaction(pool, (client) => opConvertBonus(client, params)),
  forfeitBonus: (pool: pg.Pool, params: Parameters<typeof opForfeitBonus>[1]) =>
    withTransaction(pool, (client) => opForfeitBonus(client, params)),
  adjustBalance: (pool: pg.Pool, params: Parameters<typeof opAdjustBalance>[1]) =>
    withTransaction(pool, (client) => opAdjustBalance(client, params)),
  getWallet,
};
