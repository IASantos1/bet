/**
 * Settlement Engine (BET62 spec §27-29): deterministic market resolution given an official
 * result. Pure/dependency-free so it's fully unit-testable without a live feed or a database —
 * server/routes/admin.ts wires the official result (EventsService.getEventResult), GoalServe's
 * own per-odd Pregame Odds Settlements API (EventsService.getGoalServeSettlement, see
 * server/services/goalserve.ts's fetchGoalServeOddSettlement), and the ledger payout
 * (server/lib/ledger.ts) around it.
 *
 * Scope note, same honesty as the Betting Engine (server/lib/bettingEngine.ts): the score-based
 * path below only resolves the H2H (1x2) market — that's inherent to comparing two final scores,
 * not something more code fixes. A leg can still resolve beyond h2h via `externalOutcome`, when
 * the caller supplies GoalServe's own authoritative result for that specific odd (only possible
 * for a leg placed on a selection GoalServe itself priced — never for a market synthesized by
 * server/services/marketDerivation.ts, which GoalServe never priced and has no result for).
 */

import { normalizeH2HSelection } from './bettingEngine';

export type LegOutcome = 'won' | 'lost' | 'pending' | 'void';
export type BetOutcome = 'won' | 'lost' | 'pending' | 'void';

export interface OfficialResult {
  finished: boolean;
  homeScore: number | null;
  awayScore: number | null;
}

export interface SettlementLeg {
  selection: string;
  /** Market key for this leg, when known. Only 'h2h' (or omitted, treated as h2h) resolves
   *  against `result` below — see resolveLegOutcome. Ignored when `externalOutcome` is present. */
  market?: string;
  result: OfficialResult | null;
  /** GoalServe's own authoritative result for this exact odd (Win/Loose/Half win/Half
   *  loose/Stake refund, already normalized), when the leg carries the identifiers needed to look
   *  it up (see EventsService.getGoalServeSettlement). Takes priority over score-based resolution
   *  when present — it's the only thing that can settle a non-h2h leg at all. 'half_won'/
   *  'half_lost' aren't resolved to a plain won/lost here: this app's ledger has no partial-payout
   *  primitive (see server/lib/ledger.ts), so guessing which way to round would risk a wrong
   *  payout — they surface as 'pending' for a human to settle manually instead, same as any other
   *  undecidable leg. Never silently mis-paid. */
  externalOutcome?: 'won' | 'lost' | 'half_won' | 'half_lost' | 'void' | null;
}

/**
 * MATCH_WINNER resolution (spec §28):
 *   HOME -> WON when home > away
 *   DRAW -> WON when home = away
 *   AWAY -> WON when away > home
 * Returns 'pending' when the match isn't finished yet or the score is unavailable — never guesses.
 */
export function resolveLegOutcome(leg: SettlementLeg): LegOutcome {
  if (leg.externalOutcome) {
    if (leg.externalOutcome === 'won') return 'won';
    if (leg.externalOutcome === 'lost') return 'lost';
    if (leg.externalOutcome === 'void') return 'void';
    return 'pending'; // half_won / half_lost — no partial-payout primitive, never guess
  }

  if (leg.market && leg.market !== 'h2h') return 'pending'; // not resolvable from a final score alone
  const side = normalizeH2HSelection(leg.selection);
  if (!side) return 'pending';

  const r = leg.result;
  if (!r || !r.finished || r.homeScore == null || r.awayScore == null) return 'pending';

  const winner: 'home' | 'draw' | 'away' = r.homeScore > r.awayScore ? 'home' : r.homeScore < r.awayScore ? 'away' : 'draw';
  return side === winner ? 'won' : 'lost';
}

/**
 * Combines per-leg outcomes into a bet-level outcome (AND semantics, as any accumulator bet):
 *   - any leg LOST -> the whole bet is LOST (a loss can be determined even if other legs
 *     haven't kicked off yet — the payout is impossible regardless of their outcome).
 *   - a single-leg bet whose one leg is VOID (GoalServe "Stake refund") -> the whole bet is VOID
 *     (full stake refund) — no odds recomputation needed for a 1-leg bet.
 *   - no leg lost and every leg WON -> the whole bet is WON.
 *   - a multi-leg bet with a VOID leg needs that leg's odd removed from the accumulator's total
 *     odds product to price correctly — this engine doesn't do that math, so it stays PENDING for
 *     manual settlement rather than mis-price the payout.
 *   - no leg lost and at least one leg still PENDING -> the whole bet stays PENDING.
 */
export function resolveBetOutcome(legOutcomes: LegOutcome[]): BetOutcome {
  if (legOutcomes.length === 0) return 'pending';
  if (legOutcomes.some((o) => o === 'lost')) return 'lost';
  if (legOutcomes.length === 1 && legOutcomes[0] === 'void') return 'void';
  if (legOutcomes.every((o) => o === 'won')) return 'won';
  return 'pending';
}
