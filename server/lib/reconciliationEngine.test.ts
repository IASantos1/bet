import { describe, expect, it } from 'vitest';
import { reconcileWallet, checkLedgerBalance, computeGGR, debitNormalBalance, creditNormalBalance } from './reconciliationEngine';

describe('Reconciliation Engine — reconcileWallet', () => {
  const cleanLedger = { PLAYER_AVAILABLE: 100, PLAYER_RESERVED: 20, PLAYER_BONUS: 5, PLAYER_PENDING_WITHDRAWAL: 0 };

  it('finds no discrepancies when the wallet matches its own ledger entries', () => {
    const wallet = { userId: 'u1', available: 100, reserved: 20, bonus: 5, pendingWithdrawal: 0 };
    expect(reconcileWallet(wallet, cleanLedger)).toEqual([]);
  });

  it('tolerates sub-cent rounding noise', () => {
    const wallet = { userId: 'u1', available: 100.001, reserved: 20, bonus: 5, pendingWithdrawal: 0 };
    expect(reconcileWallet(wallet, cleanLedger)).toEqual([]);
  });

  it('flags a wallet balance drifted above the ledger truth', () => {
    const wallet = { userId: 'u1', available: 150, reserved: 20, bonus: 5, pendingWithdrawal: 0 };
    const result = reconcileWallet(wallet, cleanLedger);
    expect(result).toEqual([{ userId: 'u1', field: 'available', walletValue: 150, ledgerValue: 100, difference: 50 }]);
  });

  it('flags every field independently when several drift at once', () => {
    const wallet = { userId: 'u1', available: 150, reserved: 25, bonus: 5, pendingWithdrawal: 10 };
    const result = reconcileWallet(wallet, cleanLedger);
    expect(result.map((d) => d.field).sort()).toEqual(['available', 'pendingWithdrawal', 'reserved']);
  });

  it('a negative difference means the wallet undercounts what the ledger says it should hold', () => {
    const wallet = { userId: 'u1', available: 80, reserved: 20, bonus: 5, pendingWithdrawal: 0 };
    const result = reconcileWallet(wallet, cleanLedger);
    expect(result[0]).toMatchObject({ field: 'available', difference: -20 });
  });
});

describe('Reconciliation Engine — checkLedgerBalance', () => {
  it('reports balanced when total debits equal total credits', () => {
    expect(checkLedgerBalance({ debit: 10_000, credit: 10_000 })).toEqual({ balanced: true, difference: 0 });
  });

  it('tolerates sub-cent rounding noise', () => {
    expect(checkLedgerBalance({ debit: 10_000.001, credit: 10_000 }).balanced).toBe(true);
  });

  it('reports unbalanced and the exact gap when the ledger has drifted (should be impossible by construction)', () => {
    expect(checkLedgerBalance({ debit: 10_050, credit: 10_000 })).toEqual({ balanced: false, difference: 50 });
  });
});

describe('Reconciliation Engine — account balance helpers', () => {
  it('debitNormalBalance nets debits minus credits', () => {
    expect(debitNormalBalance({ debit: 500, credit: 120 })).toBe(380);
  });

  it('creditNormalBalance nets credits minus debits', () => {
    expect(creditNormalBalance({ debit: 120, credit: 500 })).toBe(380);
  });
});

describe('Reconciliation Engine — computeGGR', () => {
  it('computes GGR as stakes retained minus winnings paid beyond stake', () => {
    const report = computeGGR({ houseRevenue: 10_000, houseLiability: 6_000, bonusLiability: 0 });
    expect(report.ggr).toBe(4_000);
  });

  it('computes NGR as GGR minus the net cost of bonuses', () => {
    const report = computeGGR({ houseRevenue: 10_000, houseLiability: 6_000, bonusLiability: 800 });
    expect(report.ggr).toBe(4_000);
    expect(report.ngr).toBe(3_200);
  });

  it('can go negative when payouts and bonus cost exceed retained stakes (a bad month, not a bug)', () => {
    const report = computeGGR({ houseRevenue: 1_000, houseLiability: 1_500, bonusLiability: 200 });
    expect(report.ggr).toBe(-500);
    expect(report.ngr).toBe(-700);
  });
});
