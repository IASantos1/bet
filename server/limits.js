// Responsible-gaming limits the player sets on their own account (users.limits, JSON):
//   depositDay / depositWeek / depositMonth — deposits in the last 1 / 7 / 30 days
//   betMax                                   — stake of one bet (free bets aside)
//   lossWeek                                 — real money staked minus real money won in the last 7 days
// Values in cents, null = no limit. A stricter limit applies at once; a looser one (or removing it)
// only after a cooling-off period, as responsible-gaming rules ask.
import { HttpError } from './security.js';

export const LIMIT_KEYS = ['depositDay', 'depositWeek', 'depositMonth', 'betMax', 'lossWeek'];
export const LIMIT_LABELS = { depositDay: 'depósito diário', depositWeek: 'depósito semanal', depositMonth: 'depósito mensal', betMax: 'aposta máxima', lossWeek: 'perda semanal' };
export const COOLING_MS = 24 * 3600_000;
const DAY = 86_400_000;

const parse = (raw) => { try { const v = JSON.parse(raw || 'null'); return v && typeof v === 'object' ? v : {}; } catch { return {}; } };

/** The limits in force now (looser changes whose waiting time is over are applied and saved). */
export function currentLimits(db, user, now = Date.now()) {
  const l = parse(user.limits);
  const pending = l.pending || {};
  let changed = false;
  for (const [k, p] of Object.entries(pending)) {
    if (Date.parse(p.at) <= now) { l[k] = p.value; delete pending[k]; changed = true; }
  }
  l.pending = pending;
  if (changed) db.prepare('UPDATE users SET limits = ? WHERE id = ?').run(JSON.stringify(l), user.id);
  return l;
}

/** Saves the limits sent (euros or null for each key sent); returns the limits as stored. */
export function setLimits(db, user, input, now = Date.now()) {
  const l = currentLimits(db, user, now);
  for (const k of LIMIT_KEYS) {
    if (input?.[k] === undefined) continue;
    let v = input[k];
    if (v === '' || v === null) v = null;
    else {
      const n = Math.round(Number(String(v).replace(',', '.')) * 100);
      if (!Number.isFinite(n) || n < 100 || n > 10_000_000) throw new HttpError(400, `Limite de ${LIMIT_LABELS[k]} inválido (mínimo €1).`);
      v = n;
    }
    const cur = l[k] ?? null;
    const stricter = v !== null && (cur === null || v < cur);
    if (stricter || v === cur) { l[k] = v; delete l.pending[k]; } else l.pending[k] = { value: v, at: new Date(now + COOLING_MS).toISOString() };
  }
  db.prepare('UPDATE users SET limits = ? WHERE id = ?').run(JSON.stringify(l), user.id);
  return l;
}

export function limitsView(l) {
  const eur = (c) => (c === null || c === undefined ? null : c / 100);
  const out = {};
  for (const k of LIMIT_KEYS) out[k] = eur(l[k]);
  out.pending = Object.fromEntries(Object.entries(l.pending || {}).map(([k, p]) => [k, { value: eur(p.value), at: p.at }]));
  return out;
}

const since = (days) => new Date(Date.now() - days * DAY).toISOString();
const fmt = (c) => `€${(c / 100).toFixed(2)}`;

/** Throws when a deposit of `amountCents` would go over a deposit limit (pending card / MB payments count). */
export function checkDeposit(db, user, amountCents) {
  const l = currentLimits(db, user);
  for (const [k, days] of [['depositDay', 1], ['depositWeek', 7], ['depositMonth', 30]]) {
    if (l[k] === null || l[k] === undefined) continue;
    const done = db.prepare("SELECT COALESCE(SUM(amount_cents), 0) AS s FROM transactions WHERE user_id = ? AND type = 'deposit' AND created_at >= ?").get(user.id, since(days)).s;
    const waiting = db.prepare("SELECT COALESCE(SUM(amount_cents), 0) AS s FROM stripe_payments WHERE user_id = ? AND status IN ('pending', 'processing') AND created_at >= ?").get(user.id, since(days)).s;
    if (done + waiting + amountCents > l[k]) {
      throw new HttpError(403, `Ultrapassa o seu limite de ${LIMIT_LABELS[k]} (${fmt(l[k])}). Disponível: ${fmt(Math.max(0, l[k] - done - waiting))}.`);
    }
  }
}

/** Throws when a bet goes over the stake limit or the weekly loss limit. `realCents` = real money it spends. */
export function checkBet(db, user, { stakeCents, realCents }) {
  const l = currentLimits(db, user);
  if (l.betMax !== null && l.betMax !== undefined && stakeCents > l.betMax) throw new HttpError(403, `Ultrapassa o seu limite de aposta máxima (${fmt(l.betMax)}).`);
  if (l.lossWeek !== null && l.lossWeek !== undefined && realCents > 0) {
    const from = since(7);
    const staked = db.prepare('SELECT COALESCE(SUM(COALESCE(real_stake_cents, stake_cents)), 0) AS s FROM bets WHERE user_id = ? AND freebet_stake_cents = 0 AND created_at >= ?').get(user.id, from).s;
    const won = db.prepare("SELECT COALESCE(SUM(COALESCE(real_payout_cents, payout_cents)), 0) AS s FROM bets WHERE user_id = ? AND status IN ('won', 'void') AND settled_at >= ?").get(user.id, from).s;
    const loss = staked - won;
    if (loss + realCents > l.lossWeek) {
      throw new HttpError(403, `Ultrapassa o seu limite de perda semanal (${fmt(l.lossWeek)}). Disponível: ${fmt(Math.max(0, l.lossWeek - loss))}.`);
    }
  }
}

