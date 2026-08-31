import { describe, expect, it } from 'vitest';
import { validateBetRequest, BetRejectedError, normalizeH2HSelection, makeH2HOddsResolver, DEFAULT_STAKE_LIMITS } from './bettingEngine';

describe('Betting Engine — normalizeH2HSelection', () => {
  it('recognizes common aliases in any casing', () => {
    expect(normalizeH2HSelection('home')).toBe('home');
    expect(normalizeH2HSelection('Casa')).toBe('home');
    expect(normalizeH2HSelection('1')).toBe('home');
    expect(normalizeH2HSelection('DRAW')).toBe('draw');
    expect(normalizeH2HSelection('empate')).toBe('draw');
    expect(normalizeH2HSelection('away')).toBe('away');
    expect(normalizeH2HSelection('Fora')).toBe('away');
    expect(normalizeH2HSelection('over 2.5')).toBeNull();
  });
});

describe('Betting Engine — validateBetRequest', () => {
  const baseLeg = { eventId: 'evt1', selection: 'home', odd: 2.5 };

  it('accepts a normal bet within limits with no live resolver', async () => {
    await expect(validateBetRequest({ legs: [baseLeg], stake: 20, totalOdds: 2.5 })).resolves.toBeUndefined();
  });

  it('rejects an empty betslip', async () => {
    await expect(validateBetRequest({ legs: [], stake: 10, totalOdds: 1 })).rejects.toMatchObject({ code: 'INVALID_SELECTION' });
  });

  it('rejects a sub-1 odd (client tampering)', async () => {
    await expect(
      validateBetRequest({ legs: [{ ...baseLeg, odd: 0.9 }], stake: 10, totalOdds: 0.9 }),
    ).rejects.toMatchObject({ code: 'INVALID_SELECTION' });
  });

  it('rejects an absurd odd above the sanity ceiling', async () => {
    await expect(
      validateBetRequest({ legs: [{ ...baseLeg, odd: 999999 }], stake: 10, totalOdds: 999999 }),
    ).rejects.toMatchObject({ code: 'INVALID_SELECTION' });
  });

  it('enforces the minimum stake (spec §26)', async () => {
    await expect(validateBetRequest({ legs: [baseLeg], stake: 0.01, totalOdds: 2.5 })).rejects.toMatchObject({ code: 'LIMIT_EXCEEDED' });
  });

  it('enforces the maximum stake (spec §26)', async () => {
    await expect(
      validateBetRequest({ legs: [baseLeg], stake: DEFAULT_STAKE_LIMITS.maxStake + 1, totalOdds: 1.5 }),
    ).rejects.toMatchObject({ code: 'LIMIT_EXCEEDED' });
  });

  it('enforces the maximum payout even when stake alone is within limits', async () => {
    // A stake within maxStake, but odds high enough to blow past maxPayout.
    await expect(
      validateBetRequest({ legs: [{ ...baseLeg, odd: 900 }], stake: 100, totalOdds: 900 }),
    ).rejects.toMatchObject({ code: 'LIMIT_EXCEEDED' });
  });

  it('accepts a client odd within tolerance of the live server odd', async () => {
    const resolveOdds = async () => ({ price: 2.52, version: 1 }); // within 5% of 2.5
    await expect(validateBetRequest({ legs: [baseLeg], stake: 20, totalOdds: 2.5, resolveOdds })).resolves.toBeUndefined();
  });

  it('rejects a client odd that has drifted beyond tolerance from the live server odd (spec §17 PRICE_CHANGED)', async () => {
    const resolveOdds = async () => ({ price: 4.0, version: 2 }); // client still holds the stale 2.5
    await expect(validateBetRequest({ legs: [baseLeg], stake: 20, totalOdds: 2.5, resolveOdds })).rejects.toMatchObject({
      code: 'PRICE_CHANGED',
    });
  });

  it('does not block the bet when the live resolver cannot determine a price (feed down / unknown market)', async () => {
    const resolveOdds = async () => null;
    await expect(validateBetRequest({ legs: [baseLeg], stake: 20, totalOdds: 2.5, resolveOdds })).resolves.toBeUndefined();
  });

  it('accepts a bet whose odds_version matches the current server version, even if the price also drifted', async () => {
    const resolveOdds = async () => ({ price: 4.0, version: 7 }); // price moved a lot, but...
    const leg = { ...baseLeg, oddsVersion: 7 }; // ...client's version still matches the current one
    await expect(validateBetRequest({ legs: [leg], stake: 20, totalOdds: 2.5, resolveOdds })).resolves.toBeUndefined();
  });

  it('rejects a bet whose odds_version no longer matches, even if the price happens to be within tolerance (spec §17)', async () => {
    const resolveOdds = async () => ({ price: 2.51, version: 8 }); // price barely moved, but the version did
    const leg = { ...baseLeg, oddsVersion: 7 };
    await expect(validateBetRequest({ legs: [leg], stake: 20, totalOdds: 2.5, resolveOdds })).rejects.toMatchObject({
      code: 'PRICE_CHANGED',
      details: expect.objectContaining({ clientVersion: 7, serverVersion: 8 }),
    });
  });

  it('makeH2HOddsResolver only cross-checks recognized H2H selections, skipping others', async () => {
    const getEventOdds = async (eventId: string) =>
      eventId === 'evt1' ? { home: 2.5, draw: 3.2, away: 2.8, versions: { home: 3, draw: 1, away: 2 } } : null;
    const resolver = makeH2HOddsResolver(getEventOdds);
    await expect(resolver({ eventId: 'evt1', selection: 'home', odd: 2.5 })).resolves.toEqual({ price: 2.5, version: 3 });
    await expect(resolver({ eventId: 'evt1', selection: 'over 2.5 goals', odd: 1.9 })).resolves.toBeNull();
    await expect(resolver({ eventId: 'unknown', selection: 'home', odd: 2.5 })).resolves.toBeNull();
  });

  it('BetRejectedError carries a machine-readable code and human message', async () => {
    try {
      await validateBetRequest({ legs: [baseLeg], stake: 999999, totalOdds: 2.5 });
      throw new Error('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(BetRejectedError);
      expect((e as BetRejectedError).code).toBe('LIMIT_EXCEEDED');
      expect((e as BetRejectedError).message).toMatch(/máxima/);
    }
  });
});
