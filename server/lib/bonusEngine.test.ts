import { describe, expect, it } from 'vitest';
import {
  computeBonusGrant,
  grantExpiryDate,
  qualifiesForWagering,
  applyWagering,
  capConversion,
  isExpired,
  type BonusCampaign,
} from './bonusEngine';

const welcome: BonusCampaign = {
  id: 'c1',
  type: 'WELCOME',
  active: true,
  minimumDeposit: 20,
  bonusPercent: 1.0, // 100% match
  maximumBonus: 100,
  wageringMultiplier: 3,
  minimumOdds: 1.5,
  expiryDays: 30,
  maxConversion: 500,
};

describe('Bonus Engine — computeBonusGrant', () => {
  it('grants a 100% match capped at maximumBonus', () => {
    const r = computeBonusGrant(welcome, 50);
    expect(r).toMatchObject({ eligible: true, amount: 50, wageringRequired: 150 });
  });

  it('caps the grant at maximumBonus even for a much larger deposit', () => {
    const r = computeBonusGrant(welcome, 1000);
    expect(r.amount).toBe(100); // capped, not 1000
    expect(r.wageringRequired).toBe(300); // 100 * 3x
  });

  it('rejects a deposit below the campaign minimum', () => {
    const r = computeBonusGrant(welcome, 10);
    expect(r).toMatchObject({ eligible: false, amount: 0, reason: 'BELOW_MINIMUM_DEPOSIT' });
  });

  it('rejects an inactive campaign regardless of deposit size', () => {
    const r = computeBonusGrant({ ...welcome, active: false }, 500);
    expect(r).toMatchObject({ eligible: false, reason: 'CAMPAIGN_INACTIVE' });
  });

  it('rejects a zero-percent campaign that would grant nothing', () => {
    const r = computeBonusGrant({ ...welcome, bonusPercent: 0 }, 100);
    expect(r).toMatchObject({ eligible: false, reason: 'ZERO_AMOUNT' });
  });
});

describe('Bonus Engine — grantExpiryDate / isExpired', () => {
  it('expires exactly expiryDays after the grant', () => {
    const granted = new Date('2026-01-01T00:00:00Z');
    const expiry = grantExpiryDate(welcome, granted);
    expect(expiry.toISOString()).toBe('2026-01-31T00:00:00.000Z');
  });

  it('is not expired before the expiry date, is expired after it', () => {
    const expiry = new Date('2026-01-31T00:00:00Z');
    expect(isExpired(expiry, new Date('2026-01-30T23:59:59Z'))).toBe(false);
    expect(isExpired(expiry, new Date('2026-01-31T00:00:01Z'))).toBe(true);
  });
});

describe('Bonus Engine — qualifiesForWagering / applyWagering', () => {
  it('a bet below minimum_odds does not qualify', () => {
    expect(qualifiesForWagering(1.2, welcome)).toBe(false);
    expect(qualifiesForWagering(1.5, welcome)).toBe(true);
  });

  it('applyWagering ignores a non-qualifying bet entirely', () => {
    const state = { wageringProgress: 0, wageringRequired: 150 };
    const r = applyWagering(state, 50, 1.2, welcome);
    expect(r).toMatchObject({ newProgress: 0, delta: 0, completed: false });
  });

  it('applyWagering accumulates stake from qualifying bets', () => {
    const state = { wageringProgress: 40, wageringRequired: 150 };
    const r = applyWagering(state, 30, 2.0, welcome);
    expect(r).toMatchObject({ newProgress: 70, delta: 30, completed: false });
  });

  it('applyWagering caps progress at wageringRequired and reports completion', () => {
    const state = { wageringProgress: 140, wageringRequired: 150 };
    const r = applyWagering(state, 50, 2.0, welcome);
    expect(r).toMatchObject({ newProgress: 150, delta: 10, completed: true });
  });

  it('applyWagering reports already-completed state on a non-qualifying bet too', () => {
    const state = { wageringProgress: 150, wageringRequired: 150 };
    const r = applyWagering(state, 10, 1.1, welcome);
    expect(r.completed).toBe(true);
    expect(r.delta).toBe(0);
  });
});

describe('Bonus Engine — capConversion', () => {
  it('passes the amount through when there is no cap', () => {
    expect(capConversion(1000, null)).toBe(1000);
  });

  it('caps the amount at max_conversion', () => {
    expect(capConversion(1000, 500)).toBe(500);
    expect(capConversion(200, 500)).toBe(200);
  });
});
