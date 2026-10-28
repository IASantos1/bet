// Risk management (admin → Risco): what the house can lose, and on whom.
//
// - Profile per player: a factor on the maximum stake (VIP ×2, normal ×1, limited ×0.25,
//   restricted ×0.05, blocked: no bets), set by the operator with a note, every change logged.
// - Liability: what the open bets would cost if they won (payout less stake), per selection and
//   per game. A bet that would take either over its ceiling is refused with the most that can
//   still be staked there.
// - Alerts: players worth a look — winning a lot (profit and return over 30 days), withdrawing
//   money they barely played (turnover under the deposits), often hitting the limits.
// Every refusal is kept (risk_events) for the alerts and the operator.

import { getSetting, setSetting, nowIso } from './db.js';
import { HttpError } from './security.js';
import { config } from './config.js';

export const PROFILES = {
  vip: { label: 'VIP', factor: 2 },
  normal: { label: 'Normal', factor: 1 },
  limited: { label: 'Limitado', factor: 0.25 },
  restricted: { label: 'Restrito', factor: 0.05 },
  blocked: { label: 'Bloqueado', factor: 0 },
};

const DEFAULTS = {
  enabled: true,
  selectionLiabilityCents: 500_000, // €5 000 at most to lose on one selection
  eventLiabilityCents: 1_500_000, // €15 000 on one game (all its markets)
  alertProfitCents: 50_000, // a player up €500 or more over 30 days…
  alertRoiPct: 25, // …with a return of 25 % or more…
  alertMinBets: 20, // …on 20 settled bets or more
  alertTurnoverPct: 100, // a withdrawal with bets under 100 % of what was deposited (30 days)
  alertRefusals: 3, // limits hit 3 times or more in 7 days
};

export function riskConfig(db) {
  return { ...DEFAULTS, ...(getSetting(db, 'risk.config', {}) || {}) };
}

export function saveRiskConfig(db, input = {}) {
  const cur = riskConfig(db);
  const euros = (v, min, max) => {
    const n = Math.round(Number(v) * 100);
    if (!Number.isFinite(n) || n < min * 100 || n > max * 100) throw new HttpError(400, `Valor fora do intervalo (${min}–${max} €).`);
    return n;
  };
  const int = (v, min, max) => {
    const n = Number(v);
    if (!Number.isInteger(n) || n < min || n > max) throw new HttpError(400, `Valor fora do intervalo (${min}–${max}).`);
    return n;
  };
  const next = {
    enabled: input.enabled === undefined ? cur.enabled : !!input.enabled,
    selectionLiabilityCents: input.selectionLiability === undefined ? cur.selectionLiabilityCents : euros(input.selectionLiability, 50, 1_000_000),
    eventLiabilityCents: input.eventLiability === undefined ? cur.eventLiabilityCents : euros(input.eventLiability, 50, 5_000_000),
    alertProfitCents: input.alertProfit === undefined ? cur.alertProfitCents : euros(input.alertProfit, 10, 1_000_000),
    alertRoiPct: input.alertRoiPct === undefined ? cur.alertRoiPct : int(input.alertRoiPct, 1, 1000),
    alertMinBets: input.alertMinBets === undefined ? cur.alertMinBets : int(input.alertMinBets, 1, 10_000),
    alertTurnoverPct: input.alertTurnoverPct === undefined ? cur.alertTurnoverPct : int(input.alertTurnoverPct, 1, 1000),
    alertRefusals: input.alertRefusals === undefined ? cur.alertRefusals : int(input.alertRefusals, 1, 1000),
  };
  setSetting(db, 'risk.config', next);
  return next;
}

const profileOf = (user) => (PROFILES[user?.risk_profile] ? user.risk_profile : 'normal');

/** The operator sets a player's profile (with a note); the change is logged. */
export function setRiskProfile(db, userId, profile, { note = null, adminId = null } = {}) {
  if (!PROFILES[profile]) throw new HttpError(400, 'Perfil de risco inválido.');
  const u = db.prepare('SELECT id, risk_profile FROM users WHERE id = ?').get(Number(userId));
  if (!u) throw new HttpError(404, 'Utilizador não encontrado.');
  db.prepare('UPDATE users SET risk_profile = ?, risk_note = ? WHERE id = ?').run(profile, note ? String(note).slice(0, 300) : null, u.id);
  logRisk(db, u.id, 'profile', `${PROFILES[profileOf(u)].label} → ${PROFILES[profile].label}${note ? ` · ${String(note).slice(0, 200)}` : ''}`, { adminId });
  return { userId: u.id, profile };
}

export function logRisk(db, userId, kind, detail, { eventId = null, adminId = null } = {}) {
  db.prepare('INSERT INTO risk_events (user_id, kind, detail, event_id, admin_id, created_at) VALUES (?, ?, ?, ?, ?, ?)')
    .run(userId, kind, String(detail).slice(0, 400), eventId, adminId, nowIso());
}

/** After a refused bet (its transaction rolled back): the refusal kept for the alerts. */
export function logRefusal(db, userId, err) {
  if (err?.risk) logRisk(db, userId, err.risk.kind, err.message, { eventId: err.risk.eventId });
}

/** What the open bets on a selection / a game would cost if they won (payout less stake, cents). */
function selectionLiability(db, selectionId) {
  return db.prepare(`SELECT COALESCE(SUM(b.potential_cents - b.stake_cents), 0) AS n FROM bets b
    WHERE b.status = 'open' AND b.id IN (SELECT bet_id FROM bet_legs WHERE selection_id = ?)`).get(selectionId).n;
}
function eventLiability(db, eventId) {
  return db.prepare(`SELECT COALESCE(SUM(b.potential_cents - b.stake_cents), 0) AS n FROM bets b
    WHERE b.status = 'open' AND b.id IN (SELECT bet_id FROM bet_legs WHERE event_id = ?)`).get(eventId).n;
}

const eur = (c) => `€${(c / 100).toFixed(2).replace('.', ',')}`;

/** The most a player may stake on one bet: the house maximum times the player's profile. */
export function stakeCeiling(db, user) {
  if (!riskConfig(db).enabled) return config.limits.maxStakeCents;
  const u = db.prepare('SELECT risk_profile FROM users WHERE id = ?').get(user.id);
  return Math.floor(config.limits.maxStakeCents * PROFILES[profileOf(u)].factor);
}

/**
 * Before a bet is taken: the player's profile and the liability ceilings. Refuses (400) with the
 * most that can still be staked when a ceiling would be passed. `legs`: the bet's selections
 * (id, event_id, home, away); `payoutCents`: what it would pay.
 */
export function checkRisk(db, user, { stakeCents, payoutCents, legs }) {
  const cfg = riskConfig(db);
  if (!cfg.enabled) return;
  const profile = profileOf(db.prepare('SELECT risk_profile FROM users WHERE id = ?').get(user.id));
  const factor = PROFILES[profile].factor;
  // The refusal is logged by the caller (logRefusal), outside the bet's transaction that rolls back.
  const refuse = (kind, msg, eventId = null) => {
    const err = new HttpError(400, msg);
    err.risk = { kind, eventId };
    throw err;
  };
  if (factor === 0) refuse('refused', 'De momento não é possível aceitar apostas nesta conta. Contacte o apoio ao cliente.');
  const maxStake = stakeCeiling(db, user);
  if (stakeCents > maxStake) refuse('max_stake', `Aposta máxima aceite: ${eur(maxStake)}.`);
  const win = Math.max(0, payoutCents - stakeCents);
  if (!win) return;
  const odds = payoutCents / stakeCents;
  // The most that can still be staked so that `room` (cents of liability left) is not passed.
  const most = (room) => Math.max(0, Math.floor(room / Math.max(odds - 1, 0.01)));
  for (const l of legs) {
    const room = cfg.selectionLiabilityCents - selectionLiability(db, l.id);
    if (win > room) {
      const m = most(room);
      refuse('liability', m >= config.limits.minStakeCents
        ? `Limite atingido em ${l.home} vs ${l.away}: aposta máxima aceite ${eur(m)}.`
        : `Esta seleção atingiu o limite de apostas (${l.home} vs ${l.away}).`, l.event_id);
    }
  }
  for (const eventId of new Set(legs.map((l) => l.event_id))) {
    const room = cfg.eventLiabilityCents - eventLiability(db, eventId);
    if (win > room) {
      const l = legs.find((x) => x.event_id === eventId);
      const m = most(room);
      refuse('liability', m >= config.limits.minStakeCents
        ? `Limite atingido em ${l.home} vs ${l.away}: aposta máxima aceite ${eur(m)}.`
        : `Este jogo atingiu o limite de apostas (${l.home} vs ${l.away}).`, eventId);
    }
  }
}

/** The games with the most at stake (open bets), with each one's share of its ceiling. */
export function exposure(db, limit = 20) {
  const cfg = riskConfig(db);
  return db.prepare(`SELECT e.id, e.home, e.away, e.competition, e.start_time, e.status,
      COUNT(DISTINCT b.id) AS bets, COALESCE(SUM(b.stake_cents), 0) AS stake, COALESCE(SUM(b.potential_cents - b.stake_cents), 0) AS liability
      FROM events e JOIN bet_legs l ON l.event_id = e.id JOIN bets b ON b.id = l.bet_id AND b.status = 'open'
     GROUP BY e.id ORDER BY liability DESC LIMIT ?`).all(limit).map((e) => ({
    id: e.id, match: `${e.home} vs ${e.away}`, competition: e.competition, startTime: e.start_time, status: e.status,
    bets: e.bets, stake: e.stake / 100, liability: e.liability / 100, pct: Math.round((e.liability / cfg.eventLiabilityCents) * 100),
  }));
}

/** Players worth a look, each with the reasons. */
export function riskAlerts(db, now = Date.now()) {
  const cfg = riskConfig(db);
  const since30 = new Date(now - 30 * 86_400_000).toISOString();
  const since7 = new Date(now - 7 * 86_400_000).toISOString();
  const out = new Map();
  const add = (userId, reason) => {
    if (!out.has(userId)) out.set(userId, []);
    out.get(userId).push(reason);
  };
  // Winning a lot: profit and return on the bets settled in 30 days (free bets aside).
  for (const r of db.prepare(`SELECT user_id, COUNT(*) AS n, SUM(stake_cents) AS stake, SUM(payout_cents) AS paid FROM bets
      WHERE status IN ('won', 'lost', 'cashout') AND settled_at >= ? AND freebet_stake_cents = 0 GROUP BY user_id`).all(since30)) {
    const profit = r.paid - r.stake;
    const roi = r.stake ? (profit / r.stake) * 100 : 0;
    if (r.n >= cfg.alertMinBets && profit >= cfg.alertProfitCents && roi >= cfg.alertRoiPct) {
      add(r.user_id, `Lucro ${eur(profit)} em ${r.n} apostas (retorno ${Math.round(roi)} %) nos últimos 30 dias`);
    }
  }
  // Withdrawing money barely played: bets (sports and casino) under the deposits of 30 days.
  for (const r of db.prepare(`SELECT w.user_id,
        (SELECT COALESCE(SUM(amount_cents), 0) FROM transactions t WHERE t.user_id = w.user_id AND t.type = 'deposit' AND t.created_at >= ?) AS dep,
        (SELECT COALESCE(SUM(-amount_cents), 0) FROM transactions t WHERE t.user_id = w.user_id AND t.type IN ('bet', 'casino_bet') AND t.created_at >= ?) AS played,
        SUM(w.amount_cents) AS asked
      FROM withdrawals w WHERE w.status = 'pending' GROUP BY w.user_id`).all(since30, since30)) {
    if (r.dep > 0 && r.played * 100 < r.dep * cfg.alertTurnoverPct) {
      add(r.user_id, `Levantamento de ${eur(r.asked)} com apostas de ${eur(r.played)} para depósitos de ${eur(r.dep)} (30 dias)`);
    }
  }
  // Often at the limits.
  for (const r of db.prepare(`SELECT user_id, COUNT(*) AS n FROM risk_events WHERE kind IN ('max_stake', 'liability') AND created_at >= ? GROUP BY user_id`).all(since7)) {
    if (r.n >= cfg.alertRefusals) add(r.user_id, `${r.n} apostas recusadas por limite nos últimos 7 dias`);
  }
  const user = db.prepare('SELECT id, name, email, risk_profile, risk_note, balance_cents FROM users WHERE id = ?');
  return [...out].map(([id, reasons]) => {
    const u = user.get(id);
    return u && { userId: u.id, name: u.name, email: u.email, profile: profileOf(u), note: u.risk_note, balance: u.balance_cents / 100, reasons };
  }).filter(Boolean);
}

/** Players with a profile other than normal, and the latest risk events. */
export function riskOverview(db) {
  const profiled = db.prepare("SELECT id, name, email, risk_profile, risk_note FROM users WHERE risk_profile IS NOT NULL AND risk_profile <> 'normal' ORDER BY name").all()
    .map((u) => ({ userId: u.id, name: u.name, email: u.email, profile: u.risk_profile, note: u.risk_note }));
  const events = db.prepare(`SELECT r.*, u.name FROM risk_events r JOIN users u ON u.id = r.user_id ORDER BY r.id DESC LIMIT 100`).all()
    .map((r) => ({ id: r.id, userId: r.user_id, name: r.name, kind: r.kind, detail: r.detail, eventId: r.event_id, at: r.created_at }));
  return { profiled, events };
}
