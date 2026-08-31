import type pg from 'pg';
import { randomId } from './crypto';
import { withTransaction, opGrantBonus, opConvertBonus, opForfeitBonus } from './ledger';
import { computeBonusGrant, grantExpiryDate, applyWagering, capConversion, type BonusCampaign } from './bonusEngine';

function mapCampaignRow(row: any): BonusCampaign {
  return {
    id: String(row.id),
    type: row.type,
    active: Boolean(row.active),
    minimumDeposit: Number(row.minimum_deposit),
    bonusPercent: Number(row.bonus_percent),
    maximumBonus: Number(row.maximum_bonus),
    wageringMultiplier: Number(row.wagering_multiplier),
    minimumOdds: Number(row.minimum_odds),
    expiryDays: Number(row.expiry_days),
    maxConversion: row.max_conversion == null ? null : Number(row.max_conversion),
  };
}

/**
 * Grants the active WELCOME campaign on a user's first-ever qualifying deposit. A no-op when
 * there's no active WELCOME campaign, the deposit doesn't meet it, or the user already has one
 * (one-time, and the DB's partial unique index backs that up against races).
 */
export async function maybeGrantWelcomeBonus(pool: pg.Pool, userId: string, depositAmount: number): Promise<string | null> {
  return withTransaction(pool, async (client) => {
    const already = await client.query(
      `SELECT 1 FROM user_bonuses ub JOIN bonus_campaigns c ON c.id = ub.campaign_id WHERE ub.user_id = $1 AND c.type = 'WELCOME' LIMIT 1`,
      [userId],
    );
    if (already.rows[0]) return null;

    const campaignRow = await client.query(
      `SELECT * FROM bonus_campaigns WHERE type = 'WELCOME' AND active = TRUE ORDER BY created_at DESC LIMIT 1`,
    );
    if (!campaignRow.rows[0]) return null;
    const campaign = mapCampaignRow(campaignRow.rows[0]);

    const grant = computeBonusGrant(campaign, depositAmount);
    if (!grant.eligible) return null;

    const userBonusId = randomId(16);
    const now = new Date();
    const expiresAt = grantExpiryDate(campaign, now);

    const inserted = await client.query(
      `INSERT INTO user_bonuses (id, user_id, campaign_id, amount, wagering_required, wagering_progress, status, granted_at, expires_at)
       VALUES ($1, $2, $3, $4, $5, 0, 'ACTIVE', NOW(), $6)
       ON CONFLICT (user_id) WHERE status = 'ACTIVE' DO NOTHING
       RETURNING id`,
      [userBonusId, userId, campaign.id, grant.amount, grant.wageringRequired, expiresAt.toISOString()],
    );
    if (inserted.rowCount === 0) return null; // another active bonus appeared concurrently

    await opGrantBonus(client, { userId, amount: grant.amount, idempotencyKey: `bonus_grant:${userBonusId}`, campaignId: campaign.id });
    return userBonusId;
  });
}

/**
 * Applies one bet's stake toward the user's active bonus wagering requirement, if they have one
 * and the bet's odds clear the campaign's minimum_odds. Converts to real balance on completion.
 * A no-op (nothing queried beyond the initial lookup) when the user has no active bonus.
 */
export async function applyBonusWagering(pool: pg.Pool, userId: string, stake: number, odds: number): Promise<void> {
  await withTransaction(pool, async (client) => {
    const row = await client.query(
      `SELECT ub.id, ub.amount, ub.wagering_progress, ub.wagering_required, c.minimum_odds, c.max_conversion
       FROM user_bonuses ub
       JOIN bonus_campaigns c ON c.id = ub.campaign_id
       WHERE ub.user_id = $1 AND ub.status = 'ACTIVE'
       FOR UPDATE`,
      [userId],
    );
    const ub = row.rows[0];
    if (!ub) return;

    const update = applyWagering(
      { wageringProgress: Number(ub.wagering_progress), wageringRequired: Number(ub.wagering_required) },
      stake,
      odds,
      { minimumOdds: Number(ub.minimum_odds) },
    );
    if (update.delta === 0 && !update.completed) return;

    if (update.completed) {
      const walletRow = await client.query(`SELECT bonus FROM wallets WHERE user_id = $1`, [userId]);
      const remainingBonus = walletRow.rows[0] ? Number(walletRow.rows[0].bonus) : 0;
      const maxConversion = ub.max_conversion == null ? null : Number(ub.max_conversion);
      const convertAmount = Math.min(remainingBonus, capConversion(Number(ub.amount), maxConversion));

      await client.query(`UPDATE user_bonuses SET wagering_progress = $2, status = 'COMPLETED', settled_at = NOW() WHERE id = $1`, [
        ub.id,
        update.newProgress,
      ]);
      if (convertAmount > 0) {
        await opConvertBonus(client, { userId, amount: convertAmount, idempotencyKey: `bonus_convert:${ub.id}`, userBonusId: String(ub.id) });
      }
    } else {
      await client.query(`UPDATE user_bonuses SET wagering_progress = $2 WHERE id = $1`, [ub.id, update.newProgress]);
    }
  });
}

/** Sweeps every ACTIVE bonus past its expiry, forfeiting whatever bonus balance remains. Safe to call repeatedly/on a schedule. */
export async function sweepExpiredBonuses(pool: pg.Pool): Promise<{ expired: number }> {
  const rows = await pool.query(`SELECT id, user_id FROM user_bonuses WHERE status = 'ACTIVE' AND expires_at < NOW()`);
  let expired = 0;
  for (const row of rows.rows || []) {
    const userBonusId = String(row.id);
    const userId = String(row.user_id);
    await withTransaction(pool, async (client) => {
      const walletRow = await client.query(`SELECT bonus FROM wallets WHERE user_id = $1`, [userId]);
      const remaining = walletRow.rows[0] ? Number(walletRow.rows[0].bonus) : 0;
      await client.query(`UPDATE user_bonuses SET status = 'EXPIRED', settled_at = NOW() WHERE id = $1 AND status = 'ACTIVE'`, [userBonusId]);
      if (remaining > 0) {
        await opForfeitBonus(client, { userId, amount: remaining, idempotencyKey: `bonus_forfeit:${userBonusId}`, userBonusId });
      }
    });
    expired += 1;
  }
  return { expired };
}
