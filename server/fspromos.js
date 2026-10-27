// Free Spins promotions (Admin → Promoções → Free Spins): each one says how many spins, the fixed
// bet of each spin, the eligible games, when it can be given, for how long a grant lasts, how many
// times it can be used, who can get it and what happens to the winnings. One promotional point is
// one spin (casino_spins.spins_left); what the spins win never gives spins back (promotions.js).
//
// A promotion starts as a draft; it is given only while AVAILABLE (and inside its dates); it can be
// SUSPENDED (its grants refuse bets until it is resumed), CANCELLED (its grants end: what they won
// follows their rule) or ENDED. Every grant keeps a copy of the terms it was given with, so a later
// edit never changes a grant already given. Every change is written with the administrator who made
// it (fs_promotion_history); every spin, refusal, win and conversion step in fs_audit.
//
// Winnings: by default they are paid as real money when the grant ends. A wagering rule (winnings ×
// N in real-money casino bets, within D days) can be set only when marked as approved; it never asks
// for a deposit, and when its time runs out the winnings are forfeited as its terms say.
import { nowIso } from './db.js';
import { HttpError } from './security.js';
import {
  SPIN_BETS, activeSpins, closeSpins, conversionOf, fsAudit, ineligible, ledger, log, spinsState, bonusBalanceCents, freebetCents,
} from './promotions.js';

const DAY = 86_400_000;
const STATUSES = ['draft', 'available', 'suspended', 'cancelled', 'ended'];
const json = (v, d) => { try { return JSON.parse(v); } catch { return d; } };
const text = (v, max) => String(v ?? '').trim().slice(0, max);
const intIn = (v, min, max, label) => {
  const n = Number(v);
  if (!Number.isInteger(n) || n < min || n > max) throw new HttpError(400, `${label}: valor inválido (${min} a ${max}).`);
  return n;
};
const dateOrNull = (v, label) => {
  if (v === null || v === undefined || v === '') return null;
  const t = Date.parse(v);
  if (!Number.isFinite(t)) throw new HttpError(400, `${label}: data inválida.`);
  return new Date(t).toISOString();
};

/** The promotion as stored, read. */
export const promoRow = (db, id) => db.prepare('SELECT * FROM fs_promotions WHERE id = ?').get(Number(id));

/**
 * The fields of a promotion from the admin form, checked. `games` are game ids already checked as
 * compatible (a fixed bet can be refused there before it is taken) by the caller.
 */
export function promoFields(input, prev = null) {
  const v = { ...(prev ? fromRow(prev) : {}), ...input };
  const name = text(v.name, 80);
  if (name.length < 2) throw new HttpError(400, 'Indique o nome da promoção.');
  const spinValueCents = Math.round(Number(v.spinValue) * 100);
  if (!SPIN_BETS.includes(spinValueCents)) throw new HttpError(400, 'Valor por rodada: €0,10 ou €0,20.');
  const games = [...new Set((Array.isArray(v.games) ? v.games : String(v.games || '').split(/[\s,;]+/)).map(Number).filter((n) => Number.isInteger(n) && n > 0))];
  const startsAt = dateOrNull(v.startsAt, 'Data de início');
  const endsAt = dateOrNull(v.endsAt, 'Data de fim');
  if (startsAt && endsAt && endsAt <= startsAt) throw new HttpError(400, 'A data de fim tem de ser depois da de início.');
  const elig = v.eligibility || {};
  const conv = v.conversion || { type: 'none' };
  let conversion = { type: 'none' };
  if (conv.type === 'wagering') {
    // Only a rule marked as approved (legal review); never a new deposit as a condition.
    if (!conv.approved) throw new HttpError(400, 'Requisito de aposta: só pode ser usado depois de aprovado (marque "aprovado").');
    conversion = {
      type: 'wagering', multiplier: intIn(conv.multiplier, 1, 50, 'Multiplicador'), days: intIn(conv.days, 1, 60, 'Prazo do requisito (dias)'),
      games: conv.games === 'all' ? 'all' : 'eligible',
      maxCountCents: conv.maxCount === null || conv.maxCount === undefined || conv.maxCount === '' ? null : Math.round(Number(conv.maxCount) * 100) || null,
      approved: true, approvedAt: conv.approvedAt || nowIso(), approvedBy: conv.approvedBy ?? null,
    };
  }
  return {
    name, description: text(v.description, 500), terms: text(v.terms, 4000),
    spins: intIn(v.spins, 1, 500, 'Número de Free Spins'), spinValueCents, games,
    startsAt, endsAt, validityDays: intIn(v.validityDays ?? 7, 1, 365, 'Validade após atribuição (dias)'),
    maxUses: v.maxUses === null || v.maxUses === undefined || v.maxUses === '' ? null : intIn(v.maxUses, 1, 1_000_000, 'Utilizações máximas'),
    maxPerUser: intIn(v.maxPerUser ?? 1, 1, 100, 'Utilizações por jogador'),
    eligibility: { kyc: !!elig.kyc, newOnly: !!elig.newOnly, minDeposits: elig.minDeposits ? intIn(elig.minDeposits, 0, 1000, 'Depósitos mínimos') : 0 },
    conversion,
  };
}

/** A row as the admin form and the API see it. */
export function fromRow(r) {
  return {
    id: r.id, name: r.name, description: r.description || '', terms: r.terms || '', spins: r.spins, spinValue: r.spin_value_cents / 100,
    budget: (r.spins * r.spin_value_cents) / 100, games: json(r.games, []), startsAt: r.starts_at, endsAt: r.ends_at, validityDays: r.validity_days,
    maxUses: r.max_uses, maxPerUser: r.max_per_user, eligibility: json(r.eligibility, {}), conversion: json(r.conversion, { type: 'none' }),
    status: r.status, createdBy: r.created_by, createdAt: r.created_at, updatedBy: r.updated_by, updatedAt: r.updated_at,
  };
}

function history(db, id, adminId, action, changes = null) {
  db.prepare('INSERT INTO fs_promotion_history (promotion_id, admin_id, action, changes, created_at) VALUES (?, ?, ?, ?, ?)')
    .run(id, adminId, action, changes ? JSON.stringify(changes) : null, nowIso());
}

/** A new promotion, as a draft. */
export function createPromo(db, input, adminId) {
  const f = promoFields(input);
  if (f.conversion.type === 'wagering') f.conversion.approvedBy = adminId;
  const now = nowIso();
  const id = Number(db.prepare(`INSERT INTO fs_promotions (name, description, terms, spins, spin_value_cents, games, starts_at, ends_at, validity_days, max_uses, max_per_user,
      eligibility, conversion, status, created_by, created_at, updated_by, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?, ?, ?)`)
    .run(f.name, f.description, f.terms, f.spins, f.spinValueCents, JSON.stringify(f.games), f.startsAt, f.endsAt, f.validityDays, f.maxUses, f.maxPerUser,
      JSON.stringify(f.eligibility), JSON.stringify(f.conversion), adminId, now, adminId, now).lastInsertRowid);
  history(db, id, adminId, 'criada', f);
  return promoRow(db, id);
}

/**
 * Edits a promotion. Only future grants follow (each grant keeps its own copy). A cancelled or
 * ended promotion is not edited.
 */
export function updatePromo(db, id, input, adminId) {
  const prev = promoRow(db, id);
  if (!prev) throw new HttpError(404, 'Promoção não encontrada.');
  if (['cancelled', 'ended'].includes(prev.status)) throw new HttpError(409, 'Uma promoção cancelada ou terminada já não se altera.');
  const before = fromRow(prev);
  const f = promoFields(input, prev);
  if (f.conversion.type === 'wagering' && JSON.stringify(f.conversion) !== JSON.stringify(before.conversion)) f.conversion.approvedBy = adminId;
  if (prev.status === 'available' && !f.games.length) throw new HttpError(400, 'Uma promoção disponível precisa de jogos elegíveis.');
  db.prepare(`UPDATE fs_promotions SET name = ?, description = ?, terms = ?, spins = ?, spin_value_cents = ?, games = ?, starts_at = ?, ends_at = ?, validity_days = ?,
      max_uses = ?, max_per_user = ?, eligibility = ?, conversion = ?, updated_by = ?, updated_at = ? WHERE id = ?`)
    .run(f.name, f.description, f.terms, f.spins, f.spinValueCents, JSON.stringify(f.games), f.startsAt, f.endsAt, f.validityDays, f.maxUses, f.maxPerUser,
      JSON.stringify(f.eligibility), JSON.stringify(f.conversion), adminId, nowIso(), prev.id);
  const after = fromRow(promoRow(db, prev.id));
  const changes = {};
  for (const k of Object.keys(after)) {
    if (['updatedAt', 'updatedBy'].includes(k)) continue;
    if (JSON.stringify(before[k]) !== JSON.stringify(after[k])) changes[k] = { de: before[k], para: after[k] };
  }
  if (Object.keys(changes).length) history(db, prev.id, adminId, 'alterada', changes);
  return promoRow(db, prev.id);
}

/**
 * Changes a promotion's state: available (it can be given), suspended (its grants refuse bets),
 * cancelled (its active grants end; what they won follows their rule), ended (no new grants).
 */
export function setPromoStatus(db, id, status, adminId, reason = null) {
  const p = promoRow(db, id);
  if (!p) throw new HttpError(404, 'Promoção não encontrada.');
  if (!STATUSES.includes(status) || status === 'draft') throw new HttpError(400, 'Estado inválido.');
  if (['cancelled', 'ended'].includes(p.status)) throw new HttpError(409, 'Esta promoção já terminou.');
  if (status === 'available' && !json(p.games, []).length) throw new HttpError(400, 'Escolha pelo menos um jogo elegível antes de a disponibilizar.');
  const now = nowIso();
  db.prepare('UPDATE fs_promotions SET status = ?, updated_by = ?, updated_at = ? WHERE id = ?').run(status, adminId, now, p.id);
  const grants = db.prepare("SELECT * FROM casino_spins WHERE promotion_id = ? AND status = 'active'").all(p.id);
  if (status === 'suspended') {
    for (const s of grants) {
      db.prepare('UPDATE casino_spins SET suspended_at = ? WHERE id = ? AND suspended_at IS NULL').run(now, s.id);
      fsAudit(db, { spinsId: s.id, userId: s.user_id, action: 'suspended', spinsLeft: s.spins_left, detail: reason || 'promoção suspensa' });
    }
  } else if (status === 'available' && p.status === 'suspended') {
    for (const s of grants) {
      db.prepare('UPDATE casino_spins SET suspended_at = NULL WHERE id = ?').run(s.id);
      fsAudit(db, { spinsId: s.id, userId: s.user_id, action: 'resumed', spinsLeft: s.spins_left, detail: 'promoção retomada' });
    }
  } else if (status === 'cancelled') {
    for (const s of grants) closeSpins(db, { ...s, suspended_at: null }, 'cancelled', reason || 'promoção cancelada pelo operador');
  }
  history(db, p.id, adminId, { available: p.status === 'suspended' ? 'retomada' : 'disponibilizada', suspended: 'suspensa', cancelled: 'cancelada', ended: 'terminada' }[status],
    reason ? { motivo: reason } : null);
  return promoRow(db, p.id);
}

/** Why this player cannot get this promotion now (null: they can). */
export function grantRefusal(db, p, user, now = nowIso()) {
  if (p.status !== 'available') return 'promoção não disponível';
  if (p.starts_at && now < p.starts_at) return 'promoção ainda não começou';
  if (p.ends_at && now >= p.ends_at) return 'promoção terminada';
  if (p.max_uses && db.prepare('SELECT COUNT(*) AS n FROM casino_spins WHERE promotion_id = ?').get(p.id).n >= p.max_uses) return 'limite de utilizações da promoção atingido';
  if (db.prepare('SELECT COUNT(*) AS n FROM casino_spins WHERE promotion_id = ? AND user_id = ?').get(p.id, user.id).n >= p.max_per_user) return 'o jogador já usou esta promoção';
  const why = ineligible(db, user);
  if (why) return why;
  const e = json(p.eligibility, {});
  if (e.kyc && user.kyc_status !== 'approved') return 'identidade não verificada';
  if (e.newOnly && db.prepare('SELECT 1 FROM casino_spins WHERE user_id = ?').get(user.id)) return 'só para quem nunca recebeu Free Spins';
  if (e.minDeposits && db.prepare("SELECT COUNT(*) AS n FROM transactions WHERE user_id = ? AND type = 'deposit'").get(user.id).n < e.minDeposits) return `precisa de ${e.minDeposits} depósito(s)`;
  if (activeSpins(db, user.id)) return 'o jogador já tem Free Spins ativas';
  return null;
}

/**
 * Gives a promotion to a player: `spins` points, one per spin, at the fixed bet, in its games, for
 * `validity_days`, with a copy of its terms (later edits never change it). `ref` keeps it once.
 */
export function grantPromo(db, promoId, userId, { adminId = null, ref = null } = {}) {
  const p = promoRow(db, promoId);
  if (!p) throw new HttpError(404, 'Promoção não encontrada.');
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(Number(userId));
  if (!user) throw new HttpError(404, 'Jogador não encontrado.');
  const why = grantRefusal(db, p, user);
  if (why) throw new HttpError(409, `Não atribuída: ${why}.`);
  const now = nowIso();
  const games = json(p.games, []);
  const value = p.spins * p.spin_value_cents;
  const key = ref || `fsp:${p.id}:${user.id}:${Date.now()}`;
  const r = db.prepare(`INSERT OR IGNORE INTO casino_spins (user_id, ref, spins, spins_left, spin_value_cents, value_cents, balance_cents, games, game_bets, won_cents, deposit_cents,
      expires_at, created_at, promotion_id, conversion) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, ?, ?, ?, ?)`)
    .run(user.id, key, p.spins, p.spins, p.spin_value_cents, value, value, JSON.stringify(games), JSON.stringify(Object.fromEntries(games.map((g) => [g, p.spin_value_cents]))),
      new Date(Date.parse(now) + p.validity_days * DAY).toISOString(), now, p.id, p.conversion);
  if (!r.changes) throw new HttpError(409, 'Esta atribuição já foi feita.');
  const id = Number(r.lastInsertRowid);
  ledger(db, { userId: user.id, type: 'free_spin_credit', amount: value, balanceAfter: value, description: `${p.name}: ${p.spins} Free Spins de €${(p.spin_value_cents / 100).toFixed(2)}`, ref: `fs:${id}` });
  fsAudit(db, { spinsId: id, userId: user.id, action: 'grant', cents: value, spinsLeft: p.spins, detail: `promoção #${p.id}${adminId ? ` por admin #${adminId}` : ''}` });
  log(db, user.id, 'casinoFs', key, 'granted', p.name);
  return db.prepare('SELECT * FROM casino_spins WHERE id = ?').get(id);
}

/** Admin list: each promotion with its use (grants, spins played, winnings paid / pending). */
export function promoList(db) {
  return db.prepare('SELECT * FROM fs_promotions ORDER BY id DESC').all().map((r) => {
    const u = db.prepare(`SELECT COUNT(*) AS grants, COALESCE(SUM(status = 'active'), 0) AS active, COALESCE(SUM(spins - COALESCE(spins_left, 0)), 0) AS played,
      COALESCE(SUM(paid_cents), 0) AS paid, COALESCE(SUM(pending_cents), 0) AS pending FROM casino_spins WHERE promotion_id = ?`).get(r.id);
    return { ...fromRow(r), use: { grants: u.grants, active: u.active, spinsPlayed: u.played, paid: u.paid / 100, pending: u.pending / 100 } };
  });
}

/** A promotion's change history (who, when, what). */
export const promoHistory = (db, id) => db.prepare(`SELECT h.*, u.name AS admin_name FROM fs_promotion_history h LEFT JOIN users u ON u.id = h.admin_id
  WHERE h.promotion_id = ? ORDER BY h.id DESC LIMIT 100`).all(Number(id)).map((h) => ({ action: h.action, changes: json(h.changes, null), admin: h.admin_name || (h.admin_id ? `#${h.admin_id}` : null), at: h.created_at }));

/** A grant's technical history (spins, refusals, wins, conversion steps). */
export const spinsAudit = (db, spinsId) => db.prepare('SELECT * FROM fs_audit WHERE spins_id = ? ORDER BY id DESC LIMIT 300').all(Number(spinsId))
  .map((a) => ({ action: a.action, txId: a.tx_id, round: a.round_id, amount: a.cents / 100, spinsLeft: a.spins_left, detail: a.detail, at: a.created_at }));

/**
 * The player's money by kind, never mixed: real (deposits and winnings paid), promotional (free
 * spins not played, bonus money, free bets), promotional winnings pending (won by free spins still
 * running, or waiting on a wagering rule) and withdrawable (the real balance; a withdrawal still
 * passes its own checks).
 */
export function walletBreakdown(db, userId) {
  const u = db.prepare('SELECT balance_cents FROM users WHERE id = ?').get(userId);
  const spins = db.prepare("SELECT COALESCE(SUM(balance_cents), 0) AS v, COALESCE(SUM(won_cents), 0) AS w FROM casino_spins WHERE user_id = ? AND status = 'active'").get(userId);
  const pending = db.prepare("SELECT COALESCE(SUM(pending_cents), 0) AS p FROM casino_spins WHERE user_id = ? AND wager_status = 'pending'").get(userId).p;
  return {
    real: (u?.balance_cents || 0) / 100,
    promotional: (spins.v + bonusBalanceCents(db, userId) + freebetCents(db, userId)) / 100,
    pendingPromo: (spins.w + pending) / 100,
    withdrawable: (u?.balance_cents || 0) / 100,
  };
}

export { spinsState, conversionOf };
