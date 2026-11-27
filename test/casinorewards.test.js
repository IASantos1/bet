import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb, nowIso, tx } from '../server/db.js';
import { postTransaction } from '../server/wallet.js';
import { savePromoConfig } from '../server/promotions.js';
import {
  casinoRewardSummary, saveCasinoRewardsConfig, scratchWeekly, spinWeeklyWheel,
} from '../server/casinorewards.js';

function setup() {
  const db = openDb(':memory:');
  savePromoConfig(db, { casinoFs: { active: true, games: [500], spinValue: 0.1, tiers: [[20, 100]] } });
  const id = Number(db.prepare(`INSERT INTO users (email, name, birthdate, password_hash, created_at)
    VALUES ('reward@example.com', 'Jogador', '1990-01-01', 'x', ?)`).run(nowIso()).lastInsertRowid);
  return { db, id };
}
function deposit(db, userId, euros) {
  tx(db, () => postTransaction(db, userId, euros * 100, 'deposit', 'Depósito confirmado'));
}

test('casino rewards require weekly deposits, grant the scratch value as free spins, and audit the draw', () => {
  const { db, id } = setup();
  try {
    assert.equal(casinoRewardSummary(db, id).scratch.eligible, false);
    assert.throws(() => tx(db, () => scratchWeekly(db, id)), /Deposite pelo menos €10/);
    deposit(db, id, 10);
    const result = tx(db, () => scratchWeekly(db, id));
    assert.equal(result.type, 'free_spins');
    assert.ok([500, 1000, 1500, 2000].includes(result.amountCents));
    assert.ok(result.details.spins > 0);
    const row = db.prepare("SELECT * FROM casino_weekly_rewards WHERE user_id = ? AND kind = 'scratch'").get(id);
    assert.equal(row.status, 'revealed');
    assert.ok([1, 9, 20, 70].includes(row.weight));
    assert.ok(row.roll >= 0 && row.roll < 100);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM casino_spins WHERE user_id = ?").get(id).n, 1);
    assert.equal(casinoRewardSummary(db, id).scratch.used, true);
    assert.equal(tx(db, () => scratchWeekly(db, id)).id, result.id);
  } finally {
    db.close();
  }
});

test('wheel stays disabled until configured and enforces weights totalling 100', () => {
  const { db, id } = setup();
  try {
    deposit(db, id, 15);
    assert.equal(casinoRewardSummary(db, id).wheel.configured, false);
    assert.throws(() => tx(db, () => spinWeeklyWheel(db, id)), /ainda estão em configuração/);
    assert.throws(() => saveCasinoRewardsConfig(db, { wheel: { active: true, prizes: [
      { type: 'freebet', name: 'Free Bet', amountCents: 500, weight: 99 },
    ] } }), /somar 100%/);
    saveCasinoRewardsConfig(db, { wheel: { active: true, prizes: [
      { type: 'freebet', name: 'Free Bet de €5', amountCents: 500, weight: 100 },
    ] } });
    assert.equal(casinoRewardSummary(db, id).wheel.eligible, true);
    const result = tx(db, () => spinWeeklyWheel(db, id));
    assert.equal(result.type, 'freebet');
    assert.equal(result.details.name, 'Free Bet de €5');
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM freebets WHERE user_id = ? AND status = 'active'").get(id).n, 1);
    assert.equal(casinoRewardSummary(db, id).wheel.used, true);
  } finally {
    db.close();
  }
});
