import { randomInt } from 'node:crypto';
import { getSetting, setSetting, nowIso } from './db.js';
import { HttpError } from './security.js';
import {
  activeSpins, casinoOffer, firstDeposit, fsAudit, grantFreebet, ineligible, ledger, log, promoConfig, weekOf,
} from './promotions.js';

const DAY = 86_400_000;
const SCRATCH_PRIZES = [
  { amountCents: 500, weight: 70 },
  { amountCents: 1000, weight: 20 },
  { amountCents: 1500, weight: 9 },
  { amountCents: 2000, weight: 1 },
];
const DEFAULT_REWARDS = {
  wheel: { active: false, prizes: [] },
};
const json = (value, fallback = {}) => {
  try { return JSON.parse(value) ?? fallback; } catch { return fallback; }
};
const cents = (euros) => Math.round(Number(euros) * 100);
const roundResult = (prizes) => {
  const roll = randomInt(100);
  let total = 0;
  for (const prize of prizes) {
    total += prize.weight;
    if (roll < total) return { prize, roll };
  }
  return { prize: prizes.at(-1), roll };
};

export function casinoRewardsConfig(db) {
  const saved = getSetting(db, 'casino.weeklyRewards', {}) || {};
  // testOnly: the weekly scratch and wheel are available only to administrators (preview before going live).
  return { wheel: { ...DEFAULT_REWARDS.wheel, ...(saved.wheel || {}) }, testOnly: saved.testOnly === true };
}

export function saveCasinoRewardsConfig(db, input) {
  const active = input?.wheel?.active === true;
  let prizes = input?.wheel?.prizes;
  if (typeof prizes === 'string') {
    try { prizes = JSON.parse(prizes); } catch { throw new HttpError(400, 'Os prémios da roleta têm de estar em JSON válido.'); }
  }
  if (!Array.isArray(prizes)) throw new HttpError(400, 'Indique a lista de prémios da roleta.');
  if (prizes.length > 12) throw new HttpError(400, 'A roleta pode ter no máximo 12 prémios.');
  const normalized = prizes.map((p) => {
    const type = String(p?.type || '');
    const name = String(p?.name || '').trim().slice(0, 80);
    const weight = Number(p?.weight);
    const amountCents = Number(p?.amountCents || 0);
    if (!['free_spins', 'freebet', 'scratch'].includes(type) || !name
      || !Number.isInteger(weight) || weight < 1 || weight > 100) {
      throw new HttpError(400, 'Cada prémio precisa de tipo, nome e peso inteiro entre 1 e 100.');
    }
    if (type !== 'scratch' && (!Number.isInteger(amountCents) || amountCents < 100 || amountCents > 100_000)) {
      throw new HttpError(400, 'Free Spins e Free Bets precisam de um valor entre €1 e €1.000.');
    }
    return { type, name, weight, amountCents: type === 'scratch' ? 0 : amountCents };
  });
  if (active && (!normalized.length || normalized.reduce((n, p) => n + p.weight, 0) !== 100)) {
    throw new HttpError(400, 'Para ativar a roleta, os pesos dos prémios têm de somar 100%.');
  }
  // A free-spins prize is paid in whole spins, so its value must be a multiple of the spin value (€0,10/€0,20),
  // or the player's spin would fail at claim time. Reject it here instead.
  const spinCents = cents(promoConfig(db).casinoFs?.spinValue || 0.1);
  for (const p of normalized) {
    if (p.type === 'free_spins' && (spinCents <= 0 || p.amountCents % spinCents !== 0)) {
      throw new HttpError(400, `Os prémios de Free Spins têm de ser múltiplos do valor da rodada (€${(spinCents / 100).toFixed(2)}).`);
    }
  }
  const prev = getSetting(db, 'casino.weeklyRewards', {}) || {};
  const testOnly = input?.testOnly !== undefined ? input.testOnly === true : prev.testOnly === true;
  const next = { wheel: { active: active && normalized.length > 0, prizes: normalized }, testOnly };
  setSetting(db, 'casino.weeklyRewards', next);
  return next;
}

/**
 * Once: turns the weekly "Giro da sorte" wheel on with a balanced prize table (weights total 100), unless an
 * admin has already configured prizes. Free-spins values are multiples of €0,10 so they always grant. The
 * admin may change the table or switch it off afterwards.
 */
export function seedWheelRewards2026(db) {
  if (getSetting(db, 'casino.wheelSeeded2026', null)) return false;
  const current = getSetting(db, 'casino.weeklyRewards', null);
  if (current?.wheel?.prizes?.length) { setSetting(db, 'casino.wheelSeeded2026', nowIso()); return false; }
  saveCasinoRewardsConfig(db, { wheel: { active: true, prizes: [
    { type: 'free_spins', name: '20 Free Spins', amountCents: 200, weight: 40 },
    { type: 'free_spins', name: '50 Free Spins', amountCents: 500, weight: 30 },
    { type: 'scratch', name: 'Raspadinha extra', weight: 20 },
    { type: 'freebet', name: 'Free Bet €10', amountCents: 1000, weight: 8 },
    { type: 'free_spins', name: '100 Free Spins', amountCents: 1000, weight: 2 },
  ] } });
  setSetting(db, 'casino.wheelSeeded2026', nowIso());
  return true;
}

/** Once: puts the weekly scratch and wheel in preview (administrators only) so they can be tried before launch. */
export function rewardsAdminOnly2026(db) {
  if (getSetting(db, 'casino.rewardsTestOnly2026', null)) return false;
  const saved = getSetting(db, 'casino.weeklyRewards', {}) || {};
  setSetting(db, 'casino.weeklyRewards', { ...saved, testOnly: true });
  setSetting(db, 'casino.rewardsTestOnly2026', nowIso());
  return true;
}

function currentWeek(now) {
  return weekOf(Date.parse(now));
}

function weeklyDeposits(db, userId, week) {
  return db.prepare(`SELECT COALESCE(SUM(amount_cents), 0) AS total FROM transactions
    WHERE user_id = ? AND type = 'deposit' AND amount_cents > 0 AND created_at >= ? AND created_at < ?`)
    .get(userId, week.start, week.end).total;
}

/**
 * Deposits that count towards the weekly scratch/wheel thresholds: the player's very first (welcome) deposit
 * is excluded, so the welcome offer alone never unlocks them — a top-up beyond it is needed. From the second
 * week on the first deposit is in a past week, so every deposit of the week counts.
 */
function qualifyingWeeklyDeposits(db, userId, week) {
  let total = weeklyDeposits(db, userId, week);
  const first = db.prepare(`SELECT amount_cents, created_at FROM transactions
    WHERE user_id = ? AND type = 'deposit' AND amount_cents > 0 ORDER BY created_at, id LIMIT 1`).get(userId);
  if (first && first.created_at >= week.start && first.created_at < week.end) total -= first.amount_cents;
  return Math.max(0, total);
}

function userEligibility(db, userId) {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  if (!user) return { user: null, reason: 'conta inexistente' };
  return { user, reason: ineligible(db, user) };
}

function freeSpinConfig(db) {
  const cfg = promoConfig(db).casinoFs;
  const value = cents(cfg.spinValue);
  return cfg.active && value > 0 && Array.isArray(cfg.games) && cfg.games.length
    ? { cfg, value } : null;
}

function issueFreeSpins(db, userId, rewardCents, ref, detail, now) {
  const setup = freeSpinConfig(db);
  if (!setup) throw new HttpError(409, 'As Free Spins estão indisponíveis enquanto os jogos elegíveis não estiverem configurados.');
  if (rewardCents % setup.value !== 0) throw new HttpError(409, 'O valor deste prémio não pode ser convertido em Free Spins.');
  const { cfg, value } = setup;
  const spins = rewardCents / value;
  const games = cfg.games.map(Number);
  const bets = Object.fromEntries(games.map((id) => [id, cents(cfg.gameBets?.[id] ?? cfg.spinValue)]));
  const expiresAt = new Date(Date.parse(now) + Math.max(1, Number(cfg.validityDays) || 7) * DAY).toISOString();
  const result = db.prepare(`INSERT INTO casino_spins
    (user_id, ref, spins, spins_left, spin_value_cents, value_cents, balance_cents, games, game_bets,
      won_cents, deposit_cents, expires_at, created_at, conversion)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, ?, ?, ?)`)
    .run(userId, ref, spins, spins, value, rewardCents, rewardCents, JSON.stringify(games), JSON.stringify(bets),
      expiresAt, now, JSON.stringify({ type: 'none' }));
  const spinsId = Number(result.lastInsertRowid);
  ledger(db, { userId, type: 'free_spin_credit', amount: rewardCents, balanceAfter: rewardCents,
    description: `${spins} Free Spins de ${detail}`, ref: `fs:${spinsId}` });
  fsAudit(db, { spinsId, userId, action: 'grant', cents: rewardCents, spinsLeft: spins, detail });
  return { spinsId, spins, spinValueCents: value, amountCents: rewardCents };
}

function rewardRow(db, userId, kind, weekKey) {
  const row = db.prepare('SELECT * FROM casino_weekly_rewards WHERE user_id = ? AND kind = ? AND period = ?')
    .get(userId, kind, weekKey);
  if (!row) return null;
  return { ...row, details: json(row.details_json) };
}

function saveReward(db, { userId, kind, weekKey, depositsCents, type, amountCents = 0, weight, roll, status = 'revealed', details = {} }) {
  const result = db.prepare(`INSERT OR IGNORE INTO casino_weekly_rewards
    (user_id, kind, period, deposits_cents, reward_type, reward_cents, weight, roll, status, details_json, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(userId, kind, weekKey, depositsCents, type, amountCents, weight, roll, status, JSON.stringify(details), nowIso());
  return result.changes ? rewardRow(db, userId, kind, weekKey) : rewardRow(db, userId, kind, weekKey);
}

function exposeReward(row) {
  if (!row) return null;
  return {
    id: row.id, kind: row.kind, status: row.status, type: row.reward_type,
    amountCents: row.reward_cents, details: row.details,
  };
}

function scratchPrize(db, userId, week, depositsCents, kind = 'scratch') {
  const existing = rewardRow(db, userId, kind, week.key);
  if (existing && existing.status !== 'issued') return exposeReward(existing);
  const { prize, roll } = roundResult(SCRATCH_PRIZES);
  const now = nowIso();
  const ref = `casino-${kind}:${userId}:${week.key}`;
  const spins = issueFreeSpins(db, userId, prize.amountCents, ref, `raspadinha semanal ${week.key}`, now);
  const details = {
    roll, weights: SCRATCH_PRIZES.map(({ amountCents, weight }) => ({ amountCents, weight })),
    spinsId: spins.spinsId, spins: spins.spins, spinValueCents: spins.spinValueCents,
  };
  if (existing?.status === 'issued') {
    db.prepare(`UPDATE casino_weekly_rewards SET deposits_cents = ?, reward_type = 'free_spins',
      reward_cents = ?, weight = ?, roll = ?, status = 'revealed', details_json = ?, created_at = ?
      WHERE id = ? AND status = 'issued'`)
      .run(depositsCents, prize.amountCents, prize.weight, roll, JSON.stringify(details), now, existing.id);
    return exposeReward(rewardRow(db, userId, kind, week.key));
  }
  const saved = saveReward(db, { userId, kind, weekKey: week.key, depositsCents, type: 'free_spins',
    amountCents: prize.amountCents, weight: prize.weight, roll, details });
  log(db, userId, kind === 'scratch' ? 'casinoScratch' : 'casinoWheelScratch', ref, 'granted', `€${(prize.amountCents / 100).toFixed(2)} em Free Spins; peso ${prize.weight}/100; sorteio ${roll}`);
  return exposeReward(saved);
}

export function casinoRewardSummary(db, userId, now = nowIso()) {
  const week = currentWeek(now);
  // The welcome deposit does not count towards the weekly scratch/wheel (see qualifyingWeeklyDeposits).
  const deposited = qualifyingWeeklyDeposits(db, userId, week);
  const { user, reason } = userEligibility(db, userId);
  if (!user) throw new HttpError(404, 'Conta inexistente.');
  const hasDeposit = !firstDeposit(db, userId);
  const prefs = json(user.prefs);
  const cfg = promoConfig(db).casinoFs;
  const canIssueSpins = !!freeSpinConfig(db);
  const firstOffer = casinoOffer(db, userId, 2000);
  const firstReason = reason || firstOffer.reason || (!cfg.active ? 'campanha indisponível' : !canIssueSpins ? 'jogos elegíveis em configuração' : null);
  const spinsInProgress = !!activeSpins(db, userId);
  const scratchRow = rewardRow(db, userId, 'scratch', week.key);
  const wheelRow = rewardRow(db, userId, 'wheel', week.key);
  const wheelScratch = rewardRow(db, userId, 'wheel_scratch', week.key);
  const rewards = casinoRewardsConfig(db);
  const wheelConfigured = rewards.wheel.active && rewards.wheel.prizes.reduce((n, p) => n + p.weight, 0) === 100;
  // While in preview, the scratch and wheel are available only to administrators.
  const testBlocked = rewards.testOnly && user.role !== 'admin' ? 'promoção em pré-lançamento (brevemente disponível)' : null;
  const wheelReason = reason || testBlocked || (!wheelConfigured ? 'prémios e probabilidades em configuração' : null);
  return {
    week: week.key,
    weeklyDepositCents: deposited,
    firstDeposit: {
      eligible: !hasDeposit && !firstReason,
      hasDeposited: hasDeposit,
      signupAccepted: prefs.welcomeBonusAcceptedAtSignup === true,
      reason: hasDeposit ? 'primeiro depósito já realizado' : firstReason,
    },
    scratch: {
      thresholdCents: 1000, used: !!scratchRow, eligible: deposited >= 1000 && !scratchRow && !reason && !testBlocked && canIssueSpins && !spinsInProgress,
      reason: scratchRow ? 'já utilizada esta semana' : testBlocked || (deposited < 1000 ? 'depósito semanal mínimo de €10' : reason || (!canIssueSpins ? 'jogos elegíveis em configuração' : spinsInProgress ? 'termine primeiro as Free Spins ativas' : null)),
      reward: exposeReward(scratchRow),
    },
    wheel: {
      thresholdCents: 1500, configured: wheelConfigured, used: !!wheelRow,
      eligible: deposited >= 1500 && !wheelRow && !wheelReason && !spinsInProgress,
      reason: wheelRow ? 'já utilizado esta semana' : deposited < 1500 ? 'depósito semanal mínimo de €15' : wheelReason || (spinsInProgress ? 'termine primeiro as Free Spins ativas' : null),
      reward: exposeReward(wheelRow),
      scratchAvailable: wheelScratch?.status === 'issued',
      scratchReward: exposeReward(wheelScratch),
    },
  };
}

export function scratchWeekly(db, userId, { now = nowIso(), source = 'weekly' } = {}) {
  const week = currentWeek(now);
  const { user, reason } = userEligibility(db, userId);
  if (!user) throw new HttpError(404, 'Conta inexistente.');
  if (reason) throw new HttpError(403, `Não elegível: ${reason}.`);
  if (casinoRewardsConfig(db).testOnly && user.role !== 'admin') throw new HttpError(403, 'Promoção em pré-lançamento. Brevemente disponível.');
  const kind = source === 'wheel' ? 'wheel_scratch' : 'scratch';
  const existing = rewardRow(db, userId, kind, week.key);
  if (existing?.status === 'revealed') return exposeReward(existing);
  if (activeSpins(db, userId)) throw new HttpError(409, 'Termine primeiro as Free Spins ativas.');
  const deposited = qualifyingWeeklyDeposits(db, userId, week);
  if (kind === 'wheel_scratch') {
    if (!existing || existing.status !== 'issued') throw new HttpError(409, 'Não há raspadinha da roleta disponível.');
  } else {
    if (deposited < 1000) throw new HttpError(409, 'Deposite pelo menos €10 nesta semana para desbloquear a raspadinha.');
    if (existing) return exposeReward(existing);
  }
  return scratchPrize(db, userId, week, deposited, kind);
}

export function spinWeeklyWheel(db, userId, now = nowIso()) {
  const week = currentWeek(now);
  const existing = rewardRow(db, userId, 'wheel', week.key);
  if (existing) return exposeReward(existing);
  const { user, reason } = userEligibility(db, userId);
  if (!user) throw new HttpError(404, 'Conta inexistente.');
  if (reason) throw new HttpError(403, `Não elegível: ${reason}.`);
  if (casinoRewardsConfig(db).testOnly && user.role !== 'admin') throw new HttpError(403, 'Promoção em pré-lançamento. Brevemente disponível.');
  if (activeSpins(db, userId)) throw new HttpError(409, 'Termine primeiro as Free Spins ativas.');
  const deposited = qualifyingWeeklyDeposits(db, userId, week);
  if (deposited < 1500) throw new HttpError(409, 'Deposite pelo menos €15 nesta semana para desbloquear o giro.');
  const config = casinoRewardsConfig(db).wheel;
  if (!config.active || !config.prizes.length || config.prizes.reduce((n, p) => n + p.weight, 0) !== 100) {
    throw new HttpError(409, 'Os prémios da roleta ainda estão em configuração.');
  }
  const { prize, roll } = roundResult(config.prizes);
  const details = { roll, prizes: config.prizes, name: prize.name };
  const saved = saveReward(db, { userId, kind: 'wheel', weekKey: week.key, depositsCents: deposited,
    type: prize.type, amountCents: prize.amountCents, weight: prize.weight, roll,
    status: 'revealed', details });
  if (prize.type === 'free_spins') {
    details.grant = issueFreeSpins(db, userId, prize.amountCents, `casino-wheel:${userId}:${week.key}`, prize.name, now);
  } else if (prize.type === 'freebet') {
    const fb = grantFreebet(db, userId, { amountCents: prize.amountCents, source: 'casino_wheel',
      ref: `casino-wheel:${userId}:${week.key}`, validityDays: 7, minOdds: 1.5, now, description: prize.name });
    details.grant = fb ? { freebetId: fb.id, amountCents: prize.amountCents } : null;
  } else {
    saveReward(db, { userId, kind: 'wheel_scratch', weekKey: week.key, depositsCents: deposited,
      type: 'scratch', weight: prize.weight, roll, status: 'issued', details: { source: 'wheel', name: prize.name } });
    details.scratchAvailable = true;
  }
  db.prepare('UPDATE casino_weekly_rewards SET details_json = ? WHERE id = ?').run(JSON.stringify(details), saved.id);
  log(db, userId, 'casinoWheel', `casino-wheel:${userId}:${week.key}`, 'granted', `${prize.type}:${prize.amountCents}; peso ${prize.weight}/100; sorteio ${roll}`);
  return exposeReward(rewardRow(db, userId, 'wheel', week.key));
}
