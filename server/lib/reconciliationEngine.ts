/**
 * Reconciliation / Accounting Engine (BET62 spec §7-9, §55): the ledger in server/lib/ledger.ts
 * enforces a balanced double-entry at write time (assertBalanced) and never UPDATEs or DELETEs a
 * posted entry, so in principle the books can never drift. This module is the "trust but verify"
 * check that principle actually holds — reading the ledger back and confirming three invariants
 * a real-money operator has to be able to prove on demand:
 *
 *  1. Every player's wallet cache (wallets.available/reserved/bonus/pending_withdrawal) still
 *     matches what their own ledger entries say it should be (reconcileWallet).
 *  2. The ledger as a whole still balances — total debits === total credits (checkLedgerBalance).
 *  3. The house's own P&L — GGR/NGR — is derived, not guessed (computeGGR).
 *
 * Pure and dependency-injected like the other engines: given account balances, not a database
 * connection, so it's unit-testable without Postgres. See server/routes/admin.ts for the SQL
 * aggregation that feeds it.
 */

const EPSILON = 0.005; // half a cent — survives NUMERIC/float round-tripping, not a real discrepancy

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export interface WalletRow {
  userId: string;
  available: number;
  reserved: number;
  bonus: number;
  pendingWithdrawal: number;
}

/** Ledger-derived balance per PLAYER_* account (credit-normal: balance = credits - debits). */
export interface PlayerLedgerBalances {
  PLAYER_AVAILABLE: number;
  PLAYER_RESERVED: number;
  PLAYER_BONUS: number;
  PLAYER_PENDING_WITHDRAWAL: number;
}

export type WalletField = 'available' | 'reserved' | 'bonus' | 'pendingWithdrawal';

export interface WalletDiscrepancy {
  userId: string;
  field: WalletField;
  walletValue: number;
  ledgerValue: number;
  difference: number;
}

const FIELD_TO_ACCOUNT: Record<WalletField, keyof PlayerLedgerBalances> = {
  available: 'PLAYER_AVAILABLE',
  reserved: 'PLAYER_RESERVED',
  bonus: 'PLAYER_BONUS',
  pendingWithdrawal: 'PLAYER_PENDING_WITHDRAWAL',
};

/**
 * Compares a wallet's materialized balance against what its own ledger entries sum to. Returns
 * one entry per field that disagrees by more than half a cent — empty when the books are clean,
 * which should be the case unless something wrote to `wallets` outside server/lib/ledger.ts.
 */
export function reconcileWallet(wallet: WalletRow, ledger: PlayerLedgerBalances): WalletDiscrepancy[] {
  const out: WalletDiscrepancy[] = [];
  (Object.keys(FIELD_TO_ACCOUNT) as WalletField[]).forEach((field) => {
    const walletValue = round2(wallet[field]);
    const ledgerValue = round2(ledger[FIELD_TO_ACCOUNT[field]]);
    const difference = round2(walletValue - ledgerValue);
    if (Math.abs(difference) > EPSILON) {
      out.push({ userId: wallet.userId, field, walletValue, ledgerValue, difference });
    }
  });
  return out;
}

export interface DirectionTotals {
  debit: number;
  credit: number;
}

/**
 * The headline "are the books balanced" check: every ledger transaction is individually balanced
 * at write time (spec §8), so this summing the *entire* table and finding a mismatch means
 * something bypassed the ledger engine — a raw SQL edit, a bad migration, manual DB surgery.
 */
export function checkLedgerBalance(totals: DirectionTotals): { balanced: boolean; difference: number } {
  const difference = round2(totals.debit - totals.credit);
  return { balanced: Math.abs(difference) <= EPSILON, difference };
}

/** Net balance of a debit-normal account (HOUSE_LIABILITY, BONUS_LIABILITY, PAYMENT_PROVIDER_CLEARING). */
export function debitNormalBalance(totals: DirectionTotals): number {
  return round2(totals.debit - totals.credit);
}

/** Net balance of a credit-normal account (HOUSE_REVENUE, PLAYER_* accounts). */
export function creditNormalBalance(totals: DirectionTotals): number {
  return round2(totals.credit - totals.debit);
}

export interface HouseLedgerTotals {
  /** HOUSE_REVENUE balance (credit-normal): stakes the house has kept outright. */
  houseRevenue: number;
  /** HOUSE_LIABILITY balance (debit-normal): winnings paid out beyond the stake reserved. */
  houseLiability: number;
  /** BONUS_LIABILITY balance (debit-normal): net cost of bonuses granted, after forfeitures. */
  bonusLiability: number;
}

export interface GgrReport {
  /** Gross Gaming Revenue: stakes retained minus winnings paid out, before bonus cost. */
  ggr: number;
  /** Net Gaming Revenue: GGR minus the net cost of bonuses. */
  ngr: number;
}

/** Gross/Net Gaming Revenue, derived from the house-side ledger accounts (spec accounting terms). */
export function computeGGR(totals: HouseLedgerTotals): GgrReport {
  const ggr = round2(totals.houseRevenue - totals.houseLiability);
  const ngr = round2(ggr - totals.bonusLiability);
  return { ggr, ngr };
}
