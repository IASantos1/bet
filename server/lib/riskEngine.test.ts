import { describe, expect, it } from 'vitest';
import { computeExposure, type ExposureBetInput } from './riskEngine';

describe('Risk Engine — computeExposure', () => {
  it('ignores non-pending bets entirely', () => {
    const bets: ExposureBetInput[] = [
      { status: 'won', stake: 10, potentialWin: 30, legs: [{ eventId: 'e1', selection: 'home' }] },
      { status: 'lost', stake: 10, potentialWin: 30, legs: [{ eventId: 'e1', selection: 'home' }] },
    ];
    const report = computeExposure(bets);
    expect(report.totalLiability).toBe(0);
    expect(report.byEvent).toHaveLength(0);
  });

  it('liability is potentialWin - stake, not the full potentialWin', () => {
    const bets: ExposureBetInput[] = [
      { status: 'pending', stake: 20, potentialWin: 50, legs: [{ eventId: 'e1', selection: 'home' }] },
    ];
    const report = computeExposure(bets);
    expect(report.totalLiability).toBe(30);
    expect(report.byEvent[0].liability).toBe(30);
    expect(report.byEvent[0].bySelection[0].liability).toBe(30);
  });

  it('sums liability across multiple bets on the same selection', () => {
    const bets: ExposureBetInput[] = [
      { status: 'pending', stake: 20, potentialWin: 50, legs: [{ eventId: 'e1', selection: 'home' }] },
      { status: 'pending', stake: 10, potentialWin: 25, legs: [{ eventId: 'e1', selection: 'home' }] },
    ];
    const report = computeExposure(bets);
    expect(report.totalLiability).toBe(45); // 30 + 15
    expect(report.byEvent[0].liability).toBe(45);
    expect(report.byEvent[0].bySelection[0]).toMatchObject({ selection: 'home', liability: 45, betCount: 2 });
  });

  it('separates exposure by selection within the same event', () => {
    const bets: ExposureBetInput[] = [
      { status: 'pending', stake: 20, potentialWin: 50, legs: [{ eventId: 'e1', selection: 'home' }] },
      { status: 'pending', stake: 20, potentialWin: 40, legs: [{ eventId: 'e1', selection: 'away' }] },
    ];
    const report = computeExposure(bets);
    expect(report.byEvent[0].liability).toBe(50); // 30 + 20 combined at the event level
    const bySel = Object.fromEntries(report.byEvent[0].bySelection.map((s) => [s.selection, s.liability]));
    expect(bySel).toEqual({ home: 30, away: 20 });
  });

  it('a multi-leg bet attributes its full liability to every event it touches (documented worst-case)', () => {
    const bets: ExposureBetInput[] = [
      {
        status: 'pending',
        stake: 10,
        potentialWin: 100,
        legs: [
          { eventId: 'e1', selection: 'home' },
          { eventId: 'e2', selection: 'away' },
        ],
      },
    ];
    const report = computeExposure(bets);
    expect(report.totalLiability).toBe(90); // counted once in the global total
    const liabilityByEvent = Object.fromEntries(report.byEvent.map((e) => [e.eventId, e.liability]));
    expect(liabilityByEvent).toEqual({ e1: 90, e2: 90 }); // but attributed in full to each event
  });

  it('sorts events and selections by descending liability', () => {
    const bets: ExposureBetInput[] = [
      { status: 'pending', stake: 10, potentialWin: 20, legs: [{ eventId: 'small', selection: 'home' }] },
      { status: 'pending', stake: 10, potentialWin: 1000, legs: [{ eventId: 'big', selection: 'home' }] },
    ];
    const report = computeExposure(bets);
    expect(report.byEvent.map((e) => e.eventId)).toEqual(['big', 'small']);
  });

  it('carries through team/league labels for display', () => {
    const bets: ExposureBetInput[] = [
      { status: 'pending', stake: 10, potentialWin: 30, legs: [{ eventId: 'e1', selection: 'home', teamMatch: 'Benfica vs Porto', league: 'Liga Portugal' }] },
    ];
    const report = computeExposure(bets);
    expect(report.byEvent[0]).toMatchObject({ teamMatch: 'Benfica vs Porto', league: 'Liga Portugal' });
  });
});
