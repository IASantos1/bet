import { describe, expect, it } from 'vitest';
import { resolveLegOutcome, resolveBetOutcome } from './settlementEngine';

const finished = (homeScore: number, awayScore: number) => ({ finished: true, homeScore, awayScore });
const notFinished = { finished: false, homeScore: null, awayScore: null };

describe('Settlement Engine — resolveLegOutcome (MATCH_WINNER, spec §28)', () => {
  it('HOME wins when home > away', () => {
    expect(resolveLegOutcome({ selection: 'home', result: finished(2, 1) })).toBe('won');
    expect(resolveLegOutcome({ selection: 'away', result: finished(2, 1) })).toBe('lost');
    expect(resolveLegOutcome({ selection: 'draw', result: finished(2, 1) })).toBe('lost');
  });

  it('AWAY wins when away > home', () => {
    expect(resolveLegOutcome({ selection: 'away', result: finished(0, 3) })).toBe('won');
    expect(resolveLegOutcome({ selection: 'home', result: finished(0, 3) })).toBe('lost');
  });

  it('DRAW wins when home = away', () => {
    expect(resolveLegOutcome({ selection: 'draw', result: finished(1, 1) })).toBe('won');
    expect(resolveLegOutcome({ selection: 'home', result: finished(1, 1) })).toBe('lost');
    expect(resolveLegOutcome({ selection: 'away', result: finished(1, 1) })).toBe('lost');
  });

  it('accepts aliases (Casa/Empate/Fora, 1/X/2) the same way as the Betting Engine', () => {
    expect(resolveLegOutcome({ selection: 'Casa', result: finished(2, 0) })).toBe('won');
    expect(resolveLegOutcome({ selection: '1', result: finished(2, 0) })).toBe('won');
    expect(resolveLegOutcome({ selection: 'Fora', result: finished(2, 0) })).toBe('lost');
  });

  it('stays pending — never guesses — when the match has not finished', () => {
    expect(resolveLegOutcome({ selection: 'home', result: notFinished })).toBe('pending');
  });

  it('stays pending when no result could be resolved at all (feed down)', () => {
    expect(resolveLegOutcome({ selection: 'home', result: null })).toBe('pending');
  });

  it('stays pending for a market other than h2h (not yet supported)', () => {
    expect(resolveLegOutcome({ selection: 'over 2.5', market: 'totals', result: finished(2, 1) })).toBe('pending');
  });

  it('stays pending for a selection label it does not recognize as h2h', () => {
    expect(resolveLegOutcome({ selection: 'over 2.5 goals', result: finished(2, 1) })).toBe('pending');
  });
});

describe('Settlement Engine — resolveBetOutcome (accumulator AND semantics)', () => {
  it('a single winning leg settles the bet as won', () => {
    expect(resolveBetOutcome(['won'])).toBe('won');
  });

  it('a single losing leg settles the bet as lost', () => {
    expect(resolveBetOutcome(['lost'])).toBe('lost');
  });

  it('all legs won -> the accumulator is won', () => {
    expect(resolveBetOutcome(['won', 'won', 'won'])).toBe('won');
  });

  it('any leg lost settles the whole accumulator as lost, even if other legs have not finished', () => {
    expect(resolveBetOutcome(['won', 'lost', 'pending'])).toBe('lost');
  });

  it('no leg lost but at least one still pending -> the accumulator stays pending', () => {
    expect(resolveBetOutcome(['won', 'pending'])).toBe('pending');
    expect(resolveBetOutcome(['pending'])).toBe('pending');
  });

  it('an empty leg list is pending, not a silent win', () => {
    expect(resolveBetOutcome([])).toBe('pending');
  });
});
