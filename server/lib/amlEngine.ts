/**
 * AML monitoring (BET62 spec §36): behavioural indicators computed from a user's recent
 * deposit/withdrawal history. Pure/dependency-free — server/routes/admin.ts supplies the
 * transaction history and exposes the result via GET /api/admin/aml/alerts.
 *
 * This flags for human review; it never blocks a transaction on its own (spec §36: "casos
 * suspeitos deverão ser encaminhados para revisão conforme os procedimentos internos e
 * obrigações legais aplicáveis" — routed to review, not auto-rejected).
 *
 * Scope note: spec §36 also lists "multiple accounts" and "payment method mismatch" as
 * indicators. Both need data this codebase doesn't reliably capture yet (a shared-device/IP
 * graph across accounts; the payer name behind a card/MB WAY deposit vs. the withdrawal IBAN
 * holder) — implementing them against absent data would mean guessing, so they're left out
 * rather than faked. The four indicators below (deposit velocity, withdrawal velocity,
 * deposit/withdrawal ratio, rapid deposit-then-withdrawal cycling) are exactly what the
 * available transaction history can support.
 */

export type AmlTxType = 'deposit' | 'withdrawal';

export interface AmlTransaction {
  type: AmlTxType;
  amount: number;
  createdAt: Date;
}

export type AmlIndicatorCode = 'HIGH_DEPOSIT_VELOCITY' | 'HIGH_WITHDRAWAL_VELOCITY' | 'HIGH_WITHDRAWAL_RATIO' | 'RAPID_DEPOSIT_WITHDRAWAL';

export interface AmlIndicator {
  code: AmlIndicatorCode;
  severity: 'LOW' | 'MEDIUM' | 'HIGH';
  message: string;
  details: Record<string, unknown>;
}

export interface AmlThresholds {
  velocityWindowMs: number;
  maxDepositsInWindow: number;
  maxWithdrawalsInWindow: number;
  /** Ignore the ratio check below this much deposited in the window — avoids noise on trivial amounts. */
  minRatioAmount: number;
  highWithdrawalRatio: number;
  rapidCycleWindowMs: number;
  rapidCycleMinAmount: number;
}

export const DEFAULT_AML_THRESHOLDS: AmlThresholds = {
  velocityWindowMs: 24 * 60 * 60 * 1000,
  maxDepositsInWindow: 5,
  maxWithdrawalsInWindow: 3,
  minRatioAmount: 50,
  highWithdrawalRatio: 0.85,
  rapidCycleWindowMs: 60 * 60 * 1000,
  rapidCycleMinAmount: 20,
};

function hoursOf(ms: number): number {
  return Math.round(ms / 3_600_000);
}

export function evaluateAmlIndicators(
  transactions: AmlTransaction[],
  now: Date,
  thresholds: AmlThresholds = DEFAULT_AML_THRESHOLDS,
): AmlIndicator[] {
  const indicators: AmlIndicator[] = [];
  const windowStart = new Date(now.getTime() - thresholds.velocityWindowMs);
  const inWindow = transactions.filter((t) => t.createdAt >= windowStart && t.createdAt <= now);

  const deposits = inWindow.filter((t) => t.type === 'deposit').sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  const withdrawals = inWindow.filter((t) => t.type === 'withdrawal').sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

  if (deposits.length > thresholds.maxDepositsInWindow) {
    indicators.push({
      code: 'HIGH_DEPOSIT_VELOCITY',
      severity: deposits.length > thresholds.maxDepositsInWindow * 2 ? 'HIGH' : 'MEDIUM',
      message: `${deposits.length} depósitos nas últimas ${hoursOf(thresholds.velocityWindowMs)}h (limite ${thresholds.maxDepositsInWindow})`,
      details: { count: deposits.length, windowHours: hoursOf(thresholds.velocityWindowMs) },
    });
  }

  if (withdrawals.length > thresholds.maxWithdrawalsInWindow) {
    indicators.push({
      code: 'HIGH_WITHDRAWAL_VELOCITY',
      severity: withdrawals.length > thresholds.maxWithdrawalsInWindow * 2 ? 'HIGH' : 'MEDIUM',
      message: `${withdrawals.length} levantamentos nas últimas ${hoursOf(thresholds.velocityWindowMs)}h (limite ${thresholds.maxWithdrawalsInWindow})`,
      details: { count: withdrawals.length, windowHours: hoursOf(thresholds.velocityWindowMs) },
    });
  }

  const totalDeposited = deposits.reduce((s, t) => s + t.amount, 0);
  const totalWithdrawn = withdrawals.reduce((s, t) => s + t.amount, 0);
  if (totalDeposited >= thresholds.minRatioAmount) {
    const ratio = totalWithdrawn / totalDeposited;
    if (ratio >= thresholds.highWithdrawalRatio) {
      indicators.push({
        code: 'HIGH_WITHDRAWAL_RATIO',
        severity: ratio >= 0.98 ? 'HIGH' : 'MEDIUM',
        message: `Levantou ${Math.round(ratio * 100)}% do valor depositado nas últimas ${hoursOf(thresholds.velocityWindowMs)}h`,
        details: { totalDeposited, totalWithdrawn, ratio },
      });
    }
  }

  // A withdrawal that lands shortly after a deposit of comparable size, with essentially no
  // wagering activity in between, is the classic pass-through/layering pattern.
  for (const w of withdrawals) {
    if (w.amount < thresholds.rapidCycleMinAmount) continue;
    const precedingDeposit = deposits.find(
      (d) =>
        d.createdAt <= w.createdAt &&
        w.createdAt.getTime() - d.createdAt.getTime() <= thresholds.rapidCycleWindowMs &&
        w.amount >= d.amount * 0.8, // withdrawal is comparable to (not much smaller than) the deposit
    );
    if (precedingDeposit) {
      indicators.push({
        code: 'RAPID_DEPOSIT_WITHDRAWAL',
        severity: 'HIGH',
        message: `Levantamento de €${w.amount.toFixed(2)} menos de ${Math.round(thresholds.rapidCycleWindowMs / 60_000)} min após um depósito semelhante`,
        details: {
          withdrawalAmount: w.amount,
          depositAmount: precedingDeposit.amount,
          minutesBetween: Math.round((w.createdAt.getTime() - precedingDeposit.createdAt.getTime()) / 60_000),
        },
      });
      break; // one flag is enough signal for this user; avoid flooding with a duplicate per matching withdrawal
    }
  }

  return indicators;
}
