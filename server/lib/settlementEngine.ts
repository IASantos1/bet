/**
 * Settlement Engine (BET62 spec §27-29): deterministic market resolution given an official
 * result. Pure/dependency-free so it's fully unit-testable without a live feed or a database —
 * server/routes/admin.ts wires the official result (EventsService.getEventResult) and the
 * ledger payout (server/lib/ledger.ts) around it.
 *
 * Scope note, same honesty as the Betting Engine (server/lib/bettingEngine.ts): only the H2H
 * (1x2) market has a real, structured official result to resolve against today. Bets on other
 * market types remain PENDING here (never auto-settled, never guessed) until this codebase
 * tracks a market key per leg — see resolveLegOutcome's default branch.
 */

import { normalizeH2HSelection } from './bettingEngine';

export type LegOutcome = 'won' | 'lost' | 'pending';
export type BetOutcome = 'won' | 'lost' | 'pending';

export interface OfficialResult {
  finished: boolean;
  homeScore: number | null;
  awayScore: number | null;
}

export interface SettlementLeg {
  selection: string;
  /** Market key for this leg, when known. Only 'h2h' (or omitted, treated as h2h) resolves today. */
  market?: string;
  result: OfficialResult | null;
}

/**
 * MATCH_WINNER resolution (spec §28):
 *   HOME -> WON when home > away
 *   DRAW -> WON when home = away
 *   AWAY -> WON when away > home
 * Returns 'pending' when the match isn't finished yet or the score is unavailable — never guesses.
 */
export function resolveLegOutcome(leg: SettlementLeg): LegOutcome {
  if (leg.market && leg.market !== 'h2h') return 'pending'; // not yet supported — see module docstring
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
 *   - no leg lost and every leg WON -> the whole bet is WON.
 *   - no leg lost and at least one leg still PENDING -> the whole bet stays PENDING.
 */
export function resolveBetOutcome(legOutcomes: LegOutcome[]): BetOutcome {
  if (legOutcomes.length === 0) return 'pending';
  if (legOutcomes.some((o) => o === 'lost')) return 'lost';
  if (legOutcomes.every((o) => o === 'won')) return 'won';
  return 'pending';
}
