import { describe, expect, it } from 'vitest';
import { computeFraudScore, bandForScore, DEFAULT_FRAUD_THRESHOLDS, type FraudSignals } from './fraudEngine';

const baseline: FraudSignals = {
  sharedIpAccountCount: 0,
  loginCountLastHour: 1,
  accountAgeHours: 500,
  largestDepositAmount: 20,
};

describe('Fraud Engine — bandForScore (spec §37 bands)', () => {
  it('maps scores to the exact spec bands', () => {
    expect(bandForScore(0)).toBe('LOW');
    expect(bandForScore(20)).toBe('LOW');
    expect(bandForScore(21)).toBe('MEDIUM');
    expect(bandForScore(50)).toBe('MEDIUM');
    expect(bandForScore(51)).toBe('HIGH');
    expect(bandForScore(80)).toBe('HIGH');
    expect(bandForScore(81)).toBe('CRITICAL');
    expect(bandForScore(100)).toBe('CRITICAL');
  });
});

describe('Fraud Engine — computeFraudScore', () => {
  it('scores a clean account as LOW with no reasons', () => {
    const result = computeFraudScore(baseline);
    expect(result.score).toBe(0);
    expect(result.band).toBe('LOW');
    expect(result.reasons).toEqual([]);
  });

  it('flags an account sharing an IP with another account', () => {
    const result = computeFraudScore({ ...baseline, sharedIpAccountCount: 1 });
    expect(result.reasons.map((r) => r.code)).toContain('SHARED_IP_MULTIPLE_ACCOUNTS');
    expect(result.score).toBeGreaterThan(0);
  });

  it('caps the shared-IP contribution instead of scaling unbounded with account count', () => {
    const result = computeFraudScore({ ...baseline, sharedIpAccountCount: 20 });
    const reason = result.reasons.find((r) => r.code === 'SHARED_IP_MULTIPLE_ACCOUNTS');
    expect(reason?.points).toBe(DEFAULT_FRAUD_THRESHOLDS.sharedIpMaxPoints);
  });

  it('flags high login velocity', () => {
    const result = computeFraudScore({ ...baseline, loginCountLastHour: 10 });
    expect(result.reasons.map((r) => r.code)).toContain('HIGH_LOGIN_VELOCITY');
  });

  it('does not flag login velocity below the threshold', () => {
    const result = computeFraudScore({ ...baseline, loginCountLastHour: 3 });
    expect(result.reasons.map((r) => r.code)).not.toContain('HIGH_LOGIN_VELOCITY');
  });

  it('flags a brand-new account making a large deposit', () => {
    const result = computeFraudScore({ ...baseline, accountAgeHours: 2, largestDepositAmount: 1000 });
    expect(result.reasons.map((r) => r.code)).toContain('NEW_ACCOUNT_LARGE_DEPOSIT');
  });

  it('does not flag a large deposit from a well-established account', () => {
    const result = computeFraudScore({ ...baseline, accountAgeHours: 5000, largestDepositAmount: 1000 });
    expect(result.reasons.map((r) => r.code)).not.toContain('NEW_ACCOUNT_LARGE_DEPOSIT');
  });

  it('does not flag a new account making only a small deposit', () => {
    const result = computeFraudScore({ ...baseline, accountAgeHours: 2, largestDepositAmount: 10 });
    expect(result.reasons.map((r) => r.code)).not.toContain('NEW_ACCOUNT_LARGE_DEPOSIT');
  });

  it('combines multiple signals and caps the total score at 100', () => {
    const result = computeFraudScore({
      sharedIpAccountCount: 20,
      loginCountLastHour: 50,
      accountAgeHours: 1,
      largestDepositAmount: 5000,
    });
    expect(result.reasons).toHaveLength(3);
    expect(result.score).toBeLessThanOrEqual(100);
    expect(result.band).toBe('CRITICAL');
  });
});
