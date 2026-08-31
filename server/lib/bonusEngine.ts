/**
 * Bonus Engine (BET62 spec §34): campaign eligibility, grant sizing, wagering-requirement
 * tracking and expiry. Pure/dependency-free — server/routes handles persistence and wires the
 * ledger ops (opGrantBonus / opConvertBonus / opForfeitBonus in server/lib/ledger.ts) around it.
 *
 * Model: one active bonus per user at a time (enforced by a partial unique index on
 * user_bonuses, not just convention). Wagering requirement progress counts the stake of every
 * qualifying bet placed while the bonus is active — not only bets funded by the bonus balance
 * itself — which is the common real-world "turnover requirement" model spec §34 describes
 * ("wagering_requirement"). A bet only counts if its odds clear the campaign's minimum_odds
 * (spec §34's "minimum_odds"), exactly like a real promo's terms would require.
 */

export type BonusCampaignType = 'WELCOME' | 'DEPOSIT_BONUS' | 'FREE_BET' | 'CASHBACK' | 'ODDS_BOOST' | 'VIP' | 'PROMOTIONAL';

export interface BonusCampaign {
  id: string;
  type: BonusCampaignType;
  active: boolean;
  minimumDeposit: number;
  bonusPercent: number; // e.g. 1.0 = 100% match
  maximumBonus: number;
  wageringMultiplier: number; // e.g. 3 = must wager 3x the bonus amount
  minimumOdds: number;
  expiryDays: number;
  maxConversion: number | null; // null = uncapped
}

export interface BonusGrantResult {
  eligible: boolean;
  amount: number;
  wageringRequired: number;
  reason?: string;
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** Sizes a deposit-matched bonus grant against a campaign's terms. Never guesses eligibility. */
export function computeBonusGrant(campaign: BonusCampaign, depositAmount: number): BonusGrantResult {
  if (!campaign.active) return { eligible: false, amount: 0, wageringRequired: 0, reason: 'CAMPAIGN_INACTIVE' };
  if (depositAmount < campaign.minimumDeposit) return { eligible: false, amount: 0, wageringRequired: 0, reason: 'BELOW_MINIMUM_DEPOSIT' };

  const rawAmount = depositAmount * campaign.bonusPercent;
  const cappedAmount = round2(Math.min(rawAmount, campaign.maximumBonus));
  if (cappedAmount <= 0) return { eligible: false, amount: 0, wageringRequired: 0, reason: 'ZERO_AMOUNT' };

  return { eligible: true, amount: cappedAmount, wageringRequired: round2(cappedAmount * campaign.wageringMultiplier) };
}

export function grantExpiryDate(campaign: BonusCampaign, grantedAt: Date): Date {
  return new Date(grantedAt.getTime() + campaign.expiryDays * 24 * 60 * 60 * 1000);
}

export function qualifiesForWagering(betOdds: number, campaign: Pick<BonusCampaign, 'minimumOdds'>): boolean {
  return Number.isFinite(betOdds) && betOdds >= campaign.minimumOdds;
}

export interface WageringState {
  wageringProgress: number;
  wageringRequired: number;
}

export interface WageringUpdate {
  newProgress: number;
  delta: number;
  completed: boolean;
}

/** Applies one bet's stake toward the active bonus's wagering requirement, if its odds qualify. */
export function applyWagering(
  state: WageringState,
  stake: number,
  betOdds: number,
  campaign: Pick<BonusCampaign, 'minimumOdds'>,
): WageringUpdate {
  if (!qualifiesForWagering(betOdds, campaign) || !(stake > 0)) {
    return { newProgress: state.wageringProgress, delta: 0, completed: state.wageringProgress >= state.wageringRequired };
  }
  const newProgress = round2(Math.min(state.wageringRequired, state.wageringProgress + stake));
  return { newProgress, delta: round2(newProgress - state.wageringProgress), completed: newProgress >= state.wageringRequired };
}

/** Caps a bonus-derived conversion at the campaign's max_conversion, when one is set. */
export function capConversion(amount: number, maxConversion: number | null): number {
  if (maxConversion == null) return amount;
  return round2(Math.min(amount, maxConversion));
}

export function isExpired(expiresAt: Date, now: Date): boolean {
  return now.getTime() > expiresAt.getTime();
}
