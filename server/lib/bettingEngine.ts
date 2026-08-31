/**
 * Betting Engine (BET62 spec §20, §21, §26): the checks a bet must clear *server-side*,
 * before a single euro is reserved, because the client can never be trusted with money math
 * (spec principle §82.1). This module is deliberately pure/dependency-injected so it can be
 * unit-tested without a live odds feed or a database.
 *
 * Scope note: the current odds feed (SportsApiPro) is only cross-checked for the 1x2 / H2H
 * market, because that is the one market whose selection keys ('home'/'draw'/'away' and their
 * common aliases) are consistent across this codebase's several betslip implementations. Other
 * market types (totals, handicaps, correct score, ...) still get the limit/sanity checks below,
 * but not a live price cross-check yet — see server/routes/bets.ts for how this is wired in.
 */

export type BetRejectionCode = 'INVALID_SELECTION' | 'PRICE_CHANGED' | 'LIMIT_EXCEEDED' | 'MARKET_UNAVAILABLE';

export class BetRejectedError extends Error {
  code: BetRejectionCode;
  details?: Record<string, unknown>;
  constructor(code: BetRejectionCode, message: string, details?: Record<string, unknown>) {
    super(message);
    this.code = code;
    this.name = 'BetRejectedError';
    this.details = details;
  }
}

export interface StakeLimits {
  /** Spec §26 "minimum stake" */
  minStake: number;
  /** Spec §26 "maximum stake" */
  maxStake: number;
  /** Spec §26 "maximum payout" */
  maxPayout: number;
  /** Sanity ceiling on any single selection's odds; guards against feed/derivation bugs, not a business limit. */
  maxOddPerLeg: number;
}

export const DEFAULT_STAKE_LIMITS: StakeLimits = {
  minStake: 0.5,
  maxStake: 5000,
  maxPayout: 50000,
  maxOddPerLeg: 1000,
};

/** Fraction the client-submitted odd may deviate from the server's current odd before being rejected (spec §17). */
export const DEFAULT_PRICE_TOLERANCE = 0.05;

export interface BetLegInput {
  eventId: string;
  /** Free-form selection label as submitted by the client (e.g. 'home', 'Casa', '1', 'draw', ...). */
  selection: string;
  odd: number;
  /** Odds version (spec §17) the client last saw for this selection, if it sent one. Optional — see validateBetRequest. */
  oddsVersion?: number;
}

export interface ResolvedOdds {
  price: number;
  /** Odds version (spec §17): bumped by server/lib/oddsVersioning.ts whenever the price actually changes. */
  version: number;
}

/** Resolves the current server-side H2H price+version for a leg, or null when it cannot be determined (feed down, unknown market). */
export type OddsResolver = (leg: BetLegInput) => Promise<ResolvedOdds | null>;

const H2H_ALIASES: Record<string, 'home' | 'draw' | 'away'> = {
  home: 'home', casa: 'home', '1': 'home', mandante: 'home',
  draw: 'draw', empate: 'draw', x: 'draw',
  away: 'away', fora: 'away', '2': 'away', visitante: 'away',
};

/** Normalizes a free-form H2H selection label into 'home'/'draw'/'away', or null if it isn't one. */
export function normalizeH2HSelection(raw: string): 'home' | 'draw' | 'away' | null {
  const key = String(raw || '').trim().toLowerCase();
  return H2H_ALIASES[key] ?? null;
}

export interface ValidateBetParams {
  legs: BetLegInput[];
  stake: number;
  totalOdds: number;
  limits?: Partial<StakeLimits>;
  priceTolerance?: number;
  resolveOdds?: OddsResolver;
}

/**
 * Throws BetRejectedError on the first failing check; resolves with nothing on success.
 * Order matches spec §20's flow: ODDS CHECK -> ... -> LIMIT CHECK.
 */
export async function validateBetRequest(params: ValidateBetParams): Promise<void> {
  const limits: StakeLimits = { ...DEFAULT_STAKE_LIMITS, ...(params.limits ?? {}) };
  const tolerance = params.priceTolerance ?? DEFAULT_PRICE_TOLERANCE;

  if (!Array.isArray(params.legs) || params.legs.length === 0) {
    throw new BetRejectedError('INVALID_SELECTION', 'Nenhuma seleção no boletim');
  }

  for (const leg of params.legs) {
    if (!leg.eventId) throw new BetRejectedError('INVALID_SELECTION', 'Seleção sem evento associado');
    if (!Number.isFinite(leg.odd) || leg.odd <= 1.0) {
      throw new BetRejectedError('INVALID_SELECTION', `Odd inválida para a seleção "${leg.selection}"`, { odd: leg.odd });
    }
    if (leg.odd > limits.maxOddPerLeg) {
      throw new BetRejectedError('INVALID_SELECTION', `Odd fora dos limites aceites para a seleção "${leg.selection}"`, { odd: leg.odd });
    }

    if (params.resolveOdds) {
      const resolved = await params.resolveOdds(leg);
      if (resolved != null && Number.isFinite(resolved.price) && resolved.price > 1.0) {
        // A client-supplied odds_version (spec §17) is checked exactly — any mismatch means the
        // price has moved since the client last saw it, full stop, regardless of by how much.
        // Without one (today's frontend doesn't send it yet), fall back to a price tolerance.
        if (leg.oddsVersion != null) {
          if (leg.oddsVersion !== resolved.version) {
            throw new BetRejectedError(
              'PRICE_CHANGED',
              `A odd mudou para "${leg.selection}" (versão ${leg.oddsVersion} já não é a atual)`,
              { eventId: leg.eventId, selection: leg.selection, clientVersion: leg.oddsVersion, serverVersion: resolved.version, serverOdd: resolved.price },
            );
          }
        } else {
          const deviation = Math.abs(leg.odd - resolved.price) / resolved.price;
          if (deviation > tolerance) {
            throw new BetRejectedError(
              'PRICE_CHANGED',
              `A odd mudou para "${leg.selection}" (era ${leg.odd}, é agora ${resolved.price})`,
              { eventId: leg.eventId, selection: leg.selection, clientOdd: leg.odd, serverOdd: resolved.price },
            );
          }
        }
      }
    }
  }

  if (!Number.isFinite(params.stake) || params.stake < limits.minStake) {
    throw new BetRejectedError('LIMIT_EXCEEDED', `Aposta mínima é €${limits.minStake.toFixed(2)}`, { stake: params.stake, limit: limits.minStake });
  }
  if (params.stake > limits.maxStake) {
    throw new BetRejectedError('LIMIT_EXCEEDED', `Aposta máxima é €${limits.maxStake.toFixed(2)}`, { stake: params.stake, limit: limits.maxStake });
  }

  const potentialPayout = params.stake * params.totalOdds;
  if (potentialPayout > limits.maxPayout) {
    throw new BetRejectedError(
      'LIMIT_EXCEEDED',
      `Retorno potencial (€${potentialPayout.toFixed(2)}) excede o máximo permitido de €${limits.maxPayout.toFixed(2)}`,
      { potentialPayout, limit: limits.maxPayout },
    );
  }
}

/** Wires an EventsService.getEventOdds-shaped lookup into an OddsResolver, covering only the H2H market (see module docstring). */
export function makeH2HOddsResolver(
  getEventOdds: (
    eventId: string,
  ) => Promise<{ home: number; draw: number; away: number; versions?: { home: number; draw: number; away: number } } | null>,
): OddsResolver {
  return async (leg) => {
    const side = normalizeH2HSelection(leg.selection);
    if (!side) return null; // Not an H2H selection we know how to cross-check — skip live validation for it.
    const odds = await getEventOdds(leg.eventId).catch(() => null);
    if (!odds) return null;
    const price = odds[side];
    if (!(price > 0)) return null;
    return { price, version: odds.versions?.[side] ?? 0 };
  };
}
