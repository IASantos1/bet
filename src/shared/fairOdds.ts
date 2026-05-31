// Fair odds (no-vig) calculations for 2-sided markets like Over/Under, BTTS, Handicap.
//
// Math reference (provided by user):
//   1) Implied probability:    P_i = 1 / odd_i
//   2) Market margin (vig):    M  = (Σ P_i) - 1   (positive = book has edge)
//   3) No-vig probability:     P'_i = P_i / Σ P_j
//   4) Fair odd:               odd'_i = 1 / P'_i
//   5) Value bet:              odd_offered > odd_fair  →  +EV for the bettor
//
// Example with Over 2.5 = 1.80 and Under 2.5 = 2.00:
//   P_over  = 0.5556, P_under = 0.5000  → Σ = 1.0556 → margin 5.56%
//   P'_over = 0.5265, P'_under = 0.4735
//   fair_over = 1.90, fair_under = 2.11
//   Casa oferece Under @ 2.20 → 2.20 > 2.11 → ✅ value bet

export interface FairOddsResult {
  /** Sum of implied probabilities — 1.0 means no margin, 1.07 means 7% vig. */
  total: number;
  /** Margin (vig) the bookmaker keeps. Decimal: 0.07 = 7%. */
  margin: number;
  /** No-vig probabilities aligned to input order. */
  fairProbs: number[];
  /** Fair odds aligned to input order. */
  fairOdds: number[];
  /** True for each leg if the bookmaker odd is > fair odd (positive EV). */
  isValue: boolean[];
  /** Edge per leg in %: (offered − fair) / fair. Positive = value for player. */
  edgePct: number[];
}

/** Implied probability of a single decimal odd. Returns 0 for invalid input. */
export function impliedProb(odd: number | null | undefined): number {
  const n = Number(odd);
  if (!Number.isFinite(n) || n <= 1) return 0;
  return 1 / n;
}

/**
 * Compute fair (no-vig) odds for a multi-outcome market.
 * Pass the full list of outcomes (e.g. [over, under] or [home, draw, away]).
 * Outcomes with non-positive odds are kept at index but contribute 0 to total.
 */
export function computeFairOdds(odds: Array<number | null | undefined>): FairOddsResult {
  const probs = odds.map(impliedProb);
  const total = probs.reduce((s, p) => s + p, 0);

  // If we don't have at least 2 valid probs, return passthrough
  if (total <= 0) {
    return {
      total: 0,
      margin: 0,
      fairProbs: probs.slice(),
      fairOdds: odds.map(o => Number(o) || 0),
      isValue: odds.map(() => false),
      edgePct: odds.map(() => 0),
    };
  }

  const margin = total - 1;
  const fairProbs = probs.map(p => (p > 0 ? p / total : 0));
  const fairOdds = fairProbs.map(p => (p > 0 ? 1 / p : 0));

  const isValue: boolean[] = [];
  const edgePct: number[] = [];
  for (let i = 0; i < odds.length; i++) {
    const offered = Number(odds[i]) || 0;
    const fair = fairOdds[i];
    if (offered > 0 && fair > 0) {
      const edge = (offered - fair) / fair;
      edgePct.push(edge);
      // Treat as "value" only if the edge is meaningful (>= 1%)
      isValue.push(edge >= 0.01);
    } else {
      edgePct.push(0);
      isValue.push(0 > 1); // false
    }
  }

  return { total, margin, fairProbs, fairOdds, isValue, edgePct };
}

/**
 * Convenience helper for two-sided markets (Over/Under, BTTS, Handicap).
 * Returns the fair odd + value flag for each side.
 */
export function fairOddsTwoWay(oddA: number, oddB: number) {
  const r = computeFairOdds([oddA, oddB]);
  return {
    margin: r.margin,
    a: { fair: r.fairOdds[0], prob: r.fairProbs[0], isValue: r.isValue[0], edge: r.edgePct[0] },
    b: { fair: r.fairOdds[1], prob: r.fairProbs[1], isValue: r.isValue[1], edge: r.edgePct[1] },
  };
}

/** Format a fair odd for display (PT locale). */
export function formatFairOdd(odd: number): string {
  if (!Number.isFinite(odd) || odd <= 1) return '—';
  return odd.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
