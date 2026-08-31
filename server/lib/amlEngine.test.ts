import { describe, expect, it } from 'vitest';
import { evaluateAmlIndicators, DEFAULT_AML_THRESHOLDS, type AmlTransaction } from './amlEngine';

const NOW = new Date('2026-06-15T12:00:00Z');
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3_600_000);
const minsAgo = (m: number) => new Date(NOW.getTime() - m * 60_000);

describe('AML Engine — evaluateAmlIndicators', () => {
  it('flags nothing for a normal, low-volume user', () => {
    const txs: AmlTransaction[] = [
      { type: 'deposit', amount: 50, createdAt: hoursAgo(20) },
      { type: 'withdrawal', amount: 10, createdAt: hoursAgo(2) },
    ];
    expect(evaluateAmlIndicators(txs, NOW)).toEqual([]);
  });

  it('flags HIGH_DEPOSIT_VELOCITY when deposits exceed the window limit', () => {
    const txs: AmlTransaction[] = Array.from({ length: 6 }, (_, i) => ({
      type: 'deposit' as const,
      amount: 20,
      createdAt: hoursAgo(i),
    }));
    const indicators = evaluateAmlIndicators(txs, NOW);
    expect(indicators.map((i) => i.code)).toContain('HIGH_DEPOSIT_VELOCITY');
  });

  it('ignores deposits outside the velocity window', () => {
    const txs: AmlTransaction[] = Array.from({ length: 6 }, (_, i) => ({
      type: 'deposit' as const,
      amount: 20,
      createdAt: hoursAgo(48 + i), // all outside the default 24h window
    }));
    expect(evaluateAmlIndicators(txs, NOW)).toEqual([]);
  });

  it('flags HIGH_WITHDRAWAL_VELOCITY when withdrawals exceed the window limit', () => {
    const txs: AmlTransaction[] = Array.from({ length: 4 }, (_, i) => ({
      type: 'withdrawal' as const,
      amount: 15,
      createdAt: hoursAgo(i),
    }));
    const indicators = evaluateAmlIndicators(txs, NOW);
    expect(indicators.map((i) => i.code)).toContain('HIGH_WITHDRAWAL_VELOCITY');
  });

  it('flags HIGH_WITHDRAWAL_RATIO when almost everything deposited gets withdrawn back out', () => {
    const txs: AmlTransaction[] = [
      { type: 'deposit', amount: 200, createdAt: hoursAgo(10) },
      { type: 'withdrawal', amount: 190, createdAt: hoursAgo(1) },
    ];
    const indicators = evaluateAmlIndicators(txs, NOW);
    const hit = indicators.find((i) => i.code === 'HIGH_WITHDRAWAL_RATIO');
    expect(hit).toBeDefined();
    expect(hit?.details).toMatchObject({ totalDeposited: 200, totalWithdrawn: 190 });
  });

  it('does not flag the ratio on trivially small amounts (avoids noise)', () => {
    const txs: AmlTransaction[] = [
      { type: 'deposit', amount: 5, createdAt: hoursAgo(10) },
      { type: 'withdrawal', amount: 5, createdAt: hoursAgo(1) },
    ];
    expect(evaluateAmlIndicators(txs, NOW).map((i) => i.code)).not.toContain('HIGH_WITHDRAWAL_RATIO');
  });

  it('flags RAPID_DEPOSIT_WITHDRAWAL for a deposit-then-quick-withdrawal pass-through', () => {
    const txs: AmlTransaction[] = [
      { type: 'deposit', amount: 100, createdAt: minsAgo(30) },
      { type: 'withdrawal', amount: 95, createdAt: minsAgo(5) },
    ];
    const indicators = evaluateAmlIndicators(txs, NOW);
    expect(indicators.map((i) => i.code)).toContain('RAPID_DEPOSIT_WITHDRAWAL');
  });

  it('does not flag rapid cycling when the withdrawal is much smaller than the preceding deposit (implies real wagering happened)', () => {
    const txs: AmlTransaction[] = [
      { type: 'deposit', amount: 100, createdAt: minsAgo(30) },
      { type: 'withdrawal', amount: 25, createdAt: minsAgo(5) },
    ];
    expect(evaluateAmlIndicators(txs, NOW).map((i) => i.code)).not.toContain('RAPID_DEPOSIT_WITHDRAWAL');
  });

  it('does not flag rapid cycling when the deposit and withdrawal are far enough apart', () => {
    const txs: AmlTransaction[] = [
      { type: 'deposit', amount: 100, createdAt: hoursAgo(20) },
      { type: 'withdrawal', amount: 95, createdAt: hoursAgo(1) },
    ];
    expect(evaluateAmlIndicators(txs, NOW).map((i) => i.code)).not.toContain('RAPID_DEPOSIT_WITHDRAWAL');
  });

  it('respects custom thresholds', () => {
    const txs: AmlTransaction[] = [
      { type: 'deposit', amount: 20, createdAt: hoursAgo(1) },
      { type: 'deposit', amount: 20, createdAt: hoursAgo(2) },
    ];
    const strict = { ...DEFAULT_AML_THRESHOLDS, maxDepositsInWindow: 1 };
    expect(evaluateAmlIndicators(txs, NOW, strict).map((i) => i.code)).toContain('HIGH_DEPOSIT_VELOCITY');
    expect(evaluateAmlIndicators(txs, NOW, DEFAULT_AML_THRESHOLDS)).toEqual([]);
  });

  it('every indicator carries a human-readable message and machine-readable severity', () => {
    const txs: AmlTransaction[] = Array.from({ length: 6 }, (_, i) => ({
      type: 'deposit' as const,
      amount: 20,
      createdAt: hoursAgo(i),
    }));
    for (const ind of evaluateAmlIndicators(txs, NOW)) {
      expect(typeof ind.message).toBe('string');
      expect(ind.message.length).toBeGreaterThan(0);
      expect(['LOW', 'MEDIUM', 'HIGH']).toContain(ind.severity);
    }
  });
});
