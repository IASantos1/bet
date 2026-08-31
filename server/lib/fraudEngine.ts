/**
 * Fraud Engine (BET62 spec §37): combines IP/session and account signals into a single
 * risk_score (0-100) with the exact bands the spec names. Pure/dependency-free — the SQL that
 * gathers signals lives in server/routes/admin.ts.
 *
 * Scope note: spec §37 lists IP, device, session, account relationships, payment methods, login
 * behaviour, betting behaviour and transaction behaviour as inputs. This implements what the
 * schema actually supports data-wise today:
 *   - IP-linked multiple accounts (refresh_tokens.ip, captured at every sign-in/refresh) — the
 *     one "multiple accounts" signal the AML engine explicitly couldn't do for lack of data.
 *   - Login velocity (refresh_tokens rows in the last hour) — a best-effort proxy, since this
 *     codebase has no dedicated login_attempts table yet; a refresh_tokens row is issued on
 *     sign-in and on token refresh, so this over-counts pure refresh traffic somewhat.
 *   - New-account-large-deposit (account age vs. largest deposit so far).
 * Device fingerprinting, payment-method identity matching and betting-pattern correlation
 * (arbitrage between linked accounts) need infrastructure this codebase doesn't have yet —
 * left out rather than faked, same as the Betting/Settlement/AML engines' scope notes.
 */

export type FraudBand = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export interface FraudSignals {
  /** Other distinct accounts observed on the same IP as this user, in the lookback window. */
  sharedIpAccountCount: number;
  /** Sign-in/refresh events for this user in the last hour. */
  loginCountLastHour: number;
  /** Hours since the account was created. */
  accountAgeHours: number;
  /** Largest single completed deposit this account has ever made. */
  largestDepositAmount: number;
}

export interface FraudReason {
  code: string;
  points: number;
  message: string;
}

export interface FraudScoreResult {
  score: number;
  band: FraudBand;
  reasons: FraudReason[];
}

export interface FraudThresholds {
  sharedIpMinAccounts: number;
  sharedIpPointsPerExtraAccount: number;
  sharedIpMaxPoints: number;
  loginVelocityThreshold: number;
  loginVelocityPoints: number;
  newAccountMaxAgeHours: number;
  newAccountLargeDepositAmount: number;
  newAccountLargeDepositPoints: number;
}

export const DEFAULT_FRAUD_THRESHOLDS: FraudThresholds = {
  sharedIpMinAccounts: 1, // 1 other account already counts as a signal
  sharedIpPointsPerExtraAccount: 15,
  sharedIpMaxPoints: 50,
  loginVelocityThreshold: 8,
  loginVelocityPoints: 20,
  newAccountMaxAgeHours: 24,
  newAccountLargeDepositAmount: 500,
  newAccountLargeDepositPoints: 25,
};

export function bandForScore(score: number): FraudBand {
  if (score <= 20) return 'LOW';
  if (score <= 50) return 'MEDIUM';
  if (score <= 80) return 'HIGH';
  return 'CRITICAL';
}

export function computeFraudScore(signals: FraudSignals, thresholds: FraudThresholds = DEFAULT_FRAUD_THRESHOLDS): FraudScoreResult {
  const reasons: FraudReason[] = [];

  if (signals.sharedIpAccountCount >= thresholds.sharedIpMinAccounts) {
    const points = Math.min(
      thresholds.sharedIpMaxPoints,
      signals.sharedIpAccountCount * thresholds.sharedIpPointsPerExtraAccount,
    );
    reasons.push({
      code: 'SHARED_IP_MULTIPLE_ACCOUNTS',
      points,
      message: `Partilha IP com ${signals.sharedIpAccountCount} outra(s) conta(s)`,
    });
  }

  if (signals.loginCountLastHour >= thresholds.loginVelocityThreshold) {
    reasons.push({
      code: 'HIGH_LOGIN_VELOCITY',
      points: thresholds.loginVelocityPoints,
      message: `${signals.loginCountLastHour} eventos de login/sessão na última hora`,
    });
  }

  if (
    signals.accountAgeHours <= thresholds.newAccountMaxAgeHours &&
    signals.largestDepositAmount >= thresholds.newAccountLargeDepositAmount
  ) {
    reasons.push({
      code: 'NEW_ACCOUNT_LARGE_DEPOSIT',
      points: thresholds.newAccountLargeDepositPoints,
      message: `Conta com ${signals.accountAgeHours.toFixed(1)}h e depósito de €${signals.largestDepositAmount.toFixed(2)}`,
    });
  }

  const score = Math.min(100, reasons.reduce((s, r) => s + r.points, 0));
  return { score, band: bandForScore(score), reasons };
}
