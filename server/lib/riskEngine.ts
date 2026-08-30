/**
 * Risk Engine — exposure/liability view (BET62 spec §25). Pure aggregator: given the currently
 * pending bets, it answers "how much would the house owe if every one of these bets won?" per
 * selection and per event, so a trader can see where exposure is concentrated before deciding to
 * suspend a market or tighten limits.
 *
 * Scope note: for a multi-leg (accumulator) bet, the *true* exposure per leg depends on the joint
 * probability of every other leg also winning, which this codebase doesn't model. Rather than
 * quietly under-report risk, this attributes the bet's full (potentialWin - stake) liability to
 * every event/selection it touches — a conservative worst-case upper bound, not an exact figure.
 * That tradeoff is deliberate and documented here rather than hidden in the numbers.
 */

export interface ExposureLeg {
  eventId: string;
  selection: string;
  teamMatch?: string;
  league?: string;
}

export interface ExposureBetInput {
  status: string;
  stake: number;
  potentialWin: number;
  legs: ExposureLeg[];
}

export interface SelectionExposure {
  selection: string;
  liability: number;
  betCount: number;
}

export interface EventExposure {
  eventId: string;
  teamMatch?: string;
  league?: string;
  liability: number;
  betCount: number;
  bySelection: SelectionExposure[];
}

export interface ExposureReport {
  totalLiability: number;
  totalPendingBets: number;
  byEvent: EventExposure[];
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function computeExposure(bets: ExposureBetInput[]): ExposureReport {
  const events = new Map<
    string,
    { teamMatch?: string; league?: string; liability: number; betIds: Set<number>; selections: Map<string, { liability: number; betIds: Set<number> }> }
  >();

  let totalLiability = 0;
  let totalPendingBets = 0;

  bets.forEach((bet, betIndex) => {
    if (bet.status !== 'pending') return;
    if (!Array.isArray(bet.legs) || bet.legs.length === 0) return;

    const liability = Math.max(0, bet.potentialWin - bet.stake);
    if (liability <= 0) return;

    totalLiability += liability;
    totalPendingBets += 1;

    for (const leg of bet.legs) {
      const eventId = String(leg.eventId);
      if (!eventId) continue;
      if (!events.has(eventId)) {
        events.set(eventId, { teamMatch: leg.teamMatch, league: leg.league, liability: 0, betIds: new Set(), selections: new Map() });
      }
      const eventEntry = events.get(eventId)!;
      eventEntry.liability += liability;
      eventEntry.betIds.add(betIndex);
      if (!eventEntry.teamMatch && leg.teamMatch) eventEntry.teamMatch = leg.teamMatch;
      if (!eventEntry.league && leg.league) eventEntry.league = leg.league;

      const selKey = String(leg.selection || '');
      if (!eventEntry.selections.has(selKey)) eventEntry.selections.set(selKey, { liability: 0, betIds: new Set() });
      const selEntry = eventEntry.selections.get(selKey)!;
      selEntry.liability += liability;
      selEntry.betIds.add(betIndex);
    }
  });

  const byEvent: EventExposure[] = Array.from(events.entries())
    .map(([eventId, e]) => ({
      eventId,
      teamMatch: e.teamMatch,
      league: e.league,
      liability: round2(e.liability),
      betCount: e.betIds.size,
      bySelection: Array.from(e.selections.entries())
        .map(([selection, s]) => ({ selection, liability: round2(s.liability), betCount: s.betIds.size }))
        .sort((a, b) => b.liability - a.liability),
    }))
    .sort((a, b) => b.liability - a.liability);

  return { totalLiability: round2(totalLiability), totalPendingBets, byEvent };
}
