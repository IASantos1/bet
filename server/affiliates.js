// Affiliate programme. Every player can get a referral code (bet62.plus/GAB052); a new player who
// signs up through it is attributed to that affiliate, once and for good. When that player's first
// eligible deposit is confirmed, the affiliate earns 10% of it (1000 basis points, in cents), once
// per referred player, if the affiliate is eligible at that moment:
//   · an own confirmed deposit of at least €10 (minDepositCents),
//   · at least €10 of eligible balance (minBalanceCents): the real wallet balance without promotional
//     money (kept apart in bonuses / free bets) and without affiliate commissions received,
//   · not suspended or blocked by the operator, not banned.
// A commission is 'approved' when nothing calls for a look, otherwise 'pending' with the reason
// (affiliate not eligible then, possible self-referral, shared address…); the operator reviews,
// approves, pays (a wallet ledger entry, never a bare balance change) and reverses after a
// chargeback. Everything is decided on the server, idempotently (UNIQUE referred player, UNIQUE
// deposit), and audited in affiliate_audit (append-only).
import { createHash, randomInt } from 'node:crypto';
import { getSetting, nowIso, setSetting, tx } from './db.js';
import { postTransaction } from './wallet.js';
import { HttpError } from './security.js';
import { config } from './config.js';

export const AFFILIATE_DEFAULTS = {
  // Off until the operator switches it on (legal review first: see the admin panel).
  enabled: false,
  rateBps: 1000, // 10%
  minDepositCents: 1000, // own confirmed deposit to qualify
  minBalanceCents: 1000, // eligible balance to keep earning
  autoPayout: false, // approved commissions wait for the operator's payout
  dualApprovalCents: 0, // payouts from this amount need a second administrator (0 = off)
  velocityPerDay: 20, // more sign-ups than this in 24 h through one code: commissions go to review
  countDemoDeposits: false, // demonstration-mode deposits never count unless switched on (test servers)
};
const LIMITS = {
  rateBps: [0, 5000], minDepositCents: [0, 1_000_000], minBalanceCents: [0, 1_000_000], dualApprovalCents: [0, 10_000_000], velocityPerDay: [1, 10_000],
};

export const affiliateConfig = (db) => ({ ...AFFILIATE_DEFAULTS, ...(getSetting(db, 'affiliate.config', {}) || {}) });

export function audit(db, { actor = null, action, entityType, entityId = null, result = 'ok', meta = null }) {
  db.prepare(`INSERT INTO affiliate_audit (actor_user_id, action, entity_type, entity_id, result, metadata, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)`).run(actor, action, entityType, entityId === null ? null : String(entityId), result, meta ? JSON.stringify(meta) : null, nowIso());
}

/** Changes the programme's parameters: an administrator, a reason, old and new values in the audit. */
export function saveAffiliateConfig(db, input, { actor, reason }) {
  const why = String(reason || '').trim();
  if (why.length < 5) throw new HttpError(400, 'Indique a justificação da alteração (mínimo 5 caracteres).');
  const before = affiliateConfig(db);
  const next = { ...before };
  for (const k of Object.keys(AFFILIATE_DEFAULTS)) {
    if (input?.[k] === undefined) continue;
    if (typeof AFFILIATE_DEFAULTS[k] === 'boolean') { next[k] = !!input[k]; continue; }
    const n = Math.round(Number(input[k]));
    const [lo, hi] = LIMITS[k];
    if (!Number.isFinite(n) || n < lo || n > hi) throw new HttpError(400, `Valor inválido para ${k} (${lo}–${hi}).`);
    next[k] = n;
  }
  const changed = Object.keys(next).filter((k) => next[k] !== before[k]);
  if (!changed.length) return before;
  tx(db, () => {
    setSetting(db, 'affiliate.config', next);
    audit(db, { actor, action: 'config.update', entityType: 'config', result: 'ok', meta: { reason: why, before: pick(before, changed), after: pick(next, changed) } });
  });
  return next;
}
const pick = (o, keys) => Object.fromEntries(keys.map((k) => [k, o[k]]));

export const ipHash = (ip) => (ip ? createHash('sha256').update(`bet62-aff|${ip}`).digest('hex').slice(0, 32) : null);

// ---------- codes ----------

// Three letters and three digits (GAB052): no personal data, no look-alike letters (I, O).
const LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
export const CODE_RE = /^[A-Z]{3}\d{3}$/;
const newCode = () => Array.from({ length: 3 }, () => LETTERS[randomInt(LETTERS.length)]).join('') + String(randomInt(1000)).padStart(3, '0');
export const normalizeCode = (c) => String(c || '').trim().toUpperCase();

/** The player's affiliate profile, created (with a fresh unique code) on first use. */
export function ensureProfile(db, userId) {
  const found = db.prepare('SELECT * FROM affiliate_profiles WHERE user_id = ?').get(userId);
  if (found) return found;
  for (let i = 0; i < 20; i++) {
    const code = newCode();
    try {
      const ts = nowIso();
      tx(db, () => {
        db.prepare('INSERT INTO affiliate_profiles (user_id, referral_code, created_at, updated_at) VALUES (?, ?, ?, ?)').run(userId, code, ts, ts);
        audit(db, { action: 'code.create', entityType: 'profile', entityId: userId, meta: { code } });
      });
      return db.prepare('SELECT * FROM affiliate_profiles WHERE user_id = ?').get(userId);
    } catch (err) {
      if (!/UNIQUE/.test(err.message)) throw err;
      const again = db.prepare('SELECT * FROM affiliate_profiles WHERE user_id = ?').get(userId);
      if (again) return again; // created meanwhile by a concurrent request
    }
  }
  throw new HttpError(500, 'Não foi possível gerar o código de afiliado.');
}

export const profileByCode = (db, code) => db.prepare('SELECT * FROM affiliate_profiles WHERE referral_code = ?').get(normalizeCode(code));

// ---------- eligibility ----------

/**
 * The player's confirmed own deposits: card / MB WAY / Multibanco payments Stripe confirmed and that
 * were not reversed (chargeback, refund). Bonuses, admin credits, commissions and pending payments
 * are other ledger types or have no paid payment; demonstration deposits only with countDemoDeposits.
 */
export function confirmedDeposits(db, userId, cfg = null) {
  const c = cfg || {};
  return db.prepare(`SELECT t.id, t.amount_cents, t.ref, t.created_at FROM transactions t
      LEFT JOIN stripe_payments p ON t.ref = 'stripe:' || p.session_id
     WHERE t.user_id = ? AND t.type = 'deposit' AND t.amount_cents > 0
       AND ((t.ref LIKE 'stripe:%' AND p.status = 'paid') OR (? = 1 AND t.ref IS NULL))
     ORDER BY t.id`).all(userId, c.countDemoDeposits ? 1 : 0);
}

/** Real money the player could use, without commissions received (bonus money is kept apart already). */
export function eligibleBalance(db, user) {
  const got = db.prepare(`SELECT COALESCE(SUM(commission_cents - reversed_cents), 0) AS s FROM affiliate_commissions
    WHERE affiliate_user_id = ? AND status IN ('paid', 'reversed') AND payout_tx_id IS NOT NULL`).get(user.id).s;
  return Math.max(0, user.balance_cents - Math.max(0, got));
}

/**
 * Where the affiliate stands now: { state, canEarn, hasQualifyingDeposit, eligibleBalance, reason }.
 * state: blocked | suspended (by the operator) | suspended_balance | pending (no qualifying deposit) | active.
 */
export function eligibility(db, userId, cfg = affiliateConfig(db)) {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  const profile = db.prepare('SELECT * FROM affiliate_profiles WHERE user_id = ?').get(userId);
  if (!user) return { state: 'blocked', canEarn: false, reason: 'conta inexistente' };
  const deposits = confirmedDeposits(db, userId, cfg);
  const qualifying = deposits.find((d) => d.amount_cents >= cfg.minDepositCents) || null;
  const balance = eligibleBalance(db, user);
  const base = { hasQualifyingDeposit: !!qualifying, qualifyingDepositAt: qualifying?.created_at || null, eligibleBalance: balance };
  if (user.banned_at) return { ...base, state: 'blocked', canEarn: false, reason: 'conta suspensa' };
  if (profile?.admin_status === 'blocked') return { ...base, state: 'blocked', canEarn: false, reason: profile.admin_reason || 'bloqueado pelo operador' };
  if (profile?.admin_status === 'suspended') return { ...base, state: 'suspended', canEarn: false, reason: profile.admin_reason || 'suspenso pelo operador' };
  if (user.excluded_until && user.excluded_until > nowIso()) return { ...base, state: 'suspended', canEarn: false, reason: 'autoexclusão ativa' };
  if (!qualifying) return { ...base, state: 'pending', canEarn: false, reason: `falta um depósito próprio confirmado de €${(cfg.minDepositCents / 100).toFixed(2)}` };
  if (balance < cfg.minBalanceCents) return { ...base, state: 'suspended_balance', canEarn: false, reason: `saldo elegível abaixo de €${(cfg.minBalanceCents / 100).toFixed(2)}` };
  return { ...base, state: 'active', canEarn: true, reason: null };
}

/** Saves the computed state on the profile (and the first qualifying deposit), auditing changes. */
export function refreshProfile(db, userId, { actor = null, cfg = affiliateConfig(db) } = {}) {
  const profile = ensureProfile(db, userId);
  const e = eligibility(db, userId, cfg);
  const status = e.state === 'active' ? 'active' : e.state === 'blocked' ? 'blocked' : e.state === 'pending' ? 'pending' : 'suspended';
  const firstAt = profile.first_qualifying_deposit_at || e.qualifyingDepositAt || null;
  if (status !== profile.status || firstAt !== profile.first_qualifying_deposit_at) {
    tx(db, () => {
      db.prepare('UPDATE affiliate_profiles SET status = ?, first_qualifying_deposit_at = ?, updated_at = ? WHERE id = ?').run(status, firstAt, nowIso(), profile.id);
      if (status !== profile.status) audit(db, { actor, action: 'profile.status', entityType: 'profile', entityId: userId, result: status, meta: { from: profile.status, reason: e.reason } });
    });
  }
  return { profile: { ...profile, status, first_qualifying_deposit_at: firstAt }, eligibility: e };
}

// ---------- attribution ----------

/**
 * A new player signed up through a code: attributes them to its affiliate, once. Returns the
 * attribution or null (no code, unknown code, programme off, the affiliate is blocked, self-referral).
 */
export function attribute(db, { referredUserId, code, ip = null, source = 'link' }) {
  const cfg = affiliateConfig(db);
  const c = normalizeCode(code);
  if (!cfg.enabled || !CODE_RE.test(c)) return null;
  const profile = profileByCode(db, c);
  const result = (r, meta = {}) => { audit(db, { action: 'attribution', entityType: 'user', entityId: referredUserId, result: r, meta: { code: c, ...meta } }); return null; };
  if (!profile) return result('unknown_code');
  if (profile.user_id === referredUserId) return result('self_referral');
  const affiliate = db.prepare('SELECT banned_at FROM users WHERE id = ?').get(profile.user_id);
  if (!affiliate || affiliate.banned_at || profile.admin_status === 'blocked') return result('affiliate_blocked', { affiliate: profile.user_id });
  return tx(db, () => {
    const exists = db.prepare('SELECT * FROM referral_attributions WHERE referred_user_id = ?').get(referredUserId);
    if (exists) return exists; // an attribution is never replaced
    db.prepare(`INSERT INTO referral_attributions (affiliate_user_id, referred_user_id, referral_code, source, ip_hash, attributed_at)
      VALUES (?, ?, ?, ?, ?, ?)`).run(profile.user_id, referredUserId, c, source, ipHash(ip), nowIso());
    audit(db, { action: 'attribution', entityType: 'user', entityId: referredUserId, result: 'ok', meta: { code: c, affiliate: profile.user_id, source } });
    return db.prepare('SELECT * FROM referral_attributions WHERE referred_user_id = ?').get(referredUserId);
  });
}

// ---------- commissions ----------

const digits = (v) => String(v || '').replace(/\D/g, '');
/** Reasons a commission must be looked at (empty: none), and a reason to refuse it outright. */
function fraudSignals(db, affiliateId, referred, attribution, cfg) {
  const affiliate = db.prepare('SELECT * FROM users WHERE id = ?').get(affiliateId);
  const same = (a, b, min = 6) => a && b && a.length >= min && a === b;
  // The same person on both sides: phone, tax number or bank account in common.
  if (same(digits(affiliate.phone).slice(-9), digits(referred.phone).slice(-9)) || same(digits(affiliate.nif), digits(referred.nif))
    || same(String(affiliate.iban || '').toUpperCase(), String(referred.iban || '').toUpperCase())) {
    return { reject: 'autorreferência (telemóvel, NIF ou IBAN em comum com o afiliado)', review: [] };
  }
  const review = [];
  // A shared address is only a signal (families, offices): review, never an automatic block.
  if (attribution.ip_hash && db.prepare('SELECT 1 FROM sessions WHERE user_id = ? AND ip_hash = ? LIMIT 1').get(affiliateId, attribution.ip_hash)) {
    review.push('registo a partir do mesmo endereço que o afiliado');
  }
  const since = new Date(Date.now() - 86_400_000).toISOString();
  const recent = db.prepare('SELECT COUNT(*) AS n FROM referral_attributions WHERE affiliate_user_id = ? AND attributed_at >= ?').get(affiliateId, since).n;
  if (recent > cfg.velocityPerDay) review.push(`${recent} registos pelo mesmo código em 24 h`);
  if (referred.banned_at) return { reject: 'conta do convidado suspensa', review };
  if (referred.promo_blocked) review.push('convidado com promoções bloqueadas');
  return { reject: null, review };
}

/**
 * A deposit was credited (inside the deposit's own transaction): when it is the referred player's
 * first eligible, confirmed deposit, the affiliate's commission is recorded. Idempotent: one per
 * referred player (UNIQUE) and per deposit (UNIQUE); a repeated webhook finds it and does nothing.
 * `demo`: a demonstration-mode deposit (counted only with countDemoDeposits).
 */
export function onReferredDeposit(db, { userId, amountCents, txId, ref, demo = false }) {
  const cfg = affiliateConfig(db);
  if (!cfg.enabled || amountCents <= 0 || !txId || !ref) return null;
  if (demo && !cfg.countDemoDeposits) return null;
  const att = db.prepare('SELECT * FROM referral_attributions WHERE referred_user_id = ?').get(userId);
  if (!att || att.status !== 'pending') return null;
  if (db.prepare('SELECT 1 FROM affiliate_commissions WHERE referred_user_id = ? OR deposit_tx_id = ? OR deposit_ref = ?').get(userId, txId, ref)) return null;
  // Only the first eligible deposit counts: an earlier confirmed one (made before the programme was on) closes it.
  const earlier = confirmedDeposits(db, userId, cfg).filter((d) => d.id < txId);
  const referred = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  const now = nowIso();
  const commission = Math.floor((amountCents * cfg.rateBps) / 10_000);
  let status = 'approved';
  let reason = null;
  if (earlier.length) { status = 'rejected'; reason = 'não é o primeiro depósito do convidado'; }
  else {
    const e = eligibility(db, att.affiliate_user_id, cfg);
    const f = fraudSignals(db, att.affiliate_user_id, referred, att, cfg);
    if (e.state === 'blocked') { status = 'rejected'; reason = `afiliado bloqueado (${e.reason})`; }
    else if (f.reject) { status = 'rejected'; reason = f.reject; }
    else if (!e.canEarn || f.review.length) { status = 'pending'; reason = [!e.canEarn ? `afiliado inelegível no momento do depósito: ${e.reason}` : null, ...f.review].filter(Boolean).join('; '); }
  }
  db.prepare(`INSERT INTO affiliate_commissions (affiliate_user_id, referred_user_id, deposit_tx_id, deposit_ref, deposit_cents, rate_bps, commission_cents,
      status, review_reason, approved_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(att.affiliate_user_id, userId, txId, ref, amountCents, cfg.rateBps, commission, status, reason, status === 'approved' ? now : null, now, now);
  const id = db.prepare('SELECT id FROM affiliate_commissions WHERE deposit_tx_id = ?').get(txId).id;
  db.prepare('UPDATE referral_attributions SET status = ?, reason = ? WHERE id = ?').run(status === 'rejected' ? 'rejected' : 'qualified', reason, att.id);
  audit(db, { action: 'commission.create', entityType: 'commission', entityId: id, result: status, meta: { affiliate: att.affiliate_user_id, referred: userId, deposit: amountCents, rateBps: cfg.rateBps, commission, reason } });
  if (status === 'approved' && cfg.autoPayout && !(cfg.dualApprovalCents && commission >= cfg.dualApprovalCents)) payCommission(db, id, { actor: null, inTx: true });
  return db.prepare('SELECT * FROM affiliate_commissions WHERE id = ?').get(id);
}

const commissionRow = (db, id) => {
  const c = db.prepare('SELECT * FROM affiliate_commissions WHERE id = ?').get(Number(id));
  if (!c) throw new HttpError(404, 'Comissão não encontrada.');
  return c;
};

/** Operator decision on a commission: approve, reject or send back to review (with the reason). */
export function reviewCommission(db, id, { actor, decision, reason }) {
  const why = String(reason || '').trim();
  if (!['approve', 'reject', 'review'].includes(decision)) throw new HttpError(400, 'Decisão inválida.');
  if (decision !== 'approve' && why.length < 3) throw new HttpError(400, 'Indique o motivo.');
  return tx(db, () => {
    const c = commissionRow(db, id);
    if (!['pending', 'approved'].includes(c.status)) throw new HttpError(409, `Comissão ${c.status}: já não pode ser revista.`);
    const status = decision === 'approve' ? 'approved' : decision === 'reject' ? 'rejected' : 'pending';
    db.prepare(`UPDATE affiliate_commissions SET status = ?, review_reason = ?, approved_by = ?, approved_at = ?, updated_at = ? WHERE id = ?`)
      .run(status, decision === 'approve' ? (why || null) : why, decision === 'approve' ? actor : null, decision === 'approve' ? nowIso() : null, nowIso(), c.id);
    if (status === 'rejected') db.prepare("UPDATE referral_attributions SET status = 'rejected', reason = ? WHERE referred_user_id = ?").run(why, c.referred_user_id);
    audit(db, { actor, action: `commission.${decision}`, entityType: 'commission', entityId: c.id, result: status, meta: { reason: why || null, from: c.status } });
    return commissionRow(db, c.id);
  });
}

/**
 * Pays an approved commission into the affiliate's wallet (an 'affiliate_commission' ledger entry,
 * reference affiliate:<id>, so it can only happen once). From dualApprovalCents up, the payer must
 * be another administrator than the one who approved it.
 */
export function payCommission(db, id, { actor, inTx = false }) {
  const run = () => {
    const c = commissionRow(db, id);
    if (c.status === 'paid') return c;
    if (c.status !== 'approved') throw new HttpError(409, 'Só comissões aprovadas podem ser pagas.');
    const cfg = affiliateConfig(db);
    if (actor && cfg.dualApprovalCents && c.commission_cents >= cfg.dualApprovalCents && c.approved_by === actor) {
      throw new HttpError(409, 'Dupla aprovação: o pagamento tem de ser feito por outro administrador.');
    }
    const p = db.prepare('SELECT admin_status FROM affiliate_profiles WHERE user_id = ?').get(c.affiliate_user_id);
    const u = db.prepare('SELECT banned_at FROM users WHERE id = ?').get(c.affiliate_user_id);
    if (p?.admin_status === 'blocked' || u?.banned_at) throw new HttpError(409, 'O afiliado está bloqueado.');
    if (c.commission_cents > 0) postTransaction(db, c.affiliate_user_id, c.commission_cents, 'affiliate_commission', 'Comissão de afiliado (primeiro depósito de um convidado)', `affiliate:${c.id}`);
    const txId = c.commission_cents > 0 ? db.prepare('SELECT last_insert_rowid() AS id').get().id : null;
    db.prepare("UPDATE affiliate_commissions SET status = 'paid', paid_by = ?, paid_at = ?, payout_tx_id = ?, updated_at = ? WHERE id = ?").run(actor, nowIso(), txId, nowIso(), c.id);
    audit(db, { actor, action: 'commission.pay', entityType: 'commission', entityId: c.id, result: 'paid', meta: { amount: c.commission_cents, tx: txId } });
    return commissionRow(db, c.id);
  };
  return inTx ? run() : tx(db, run);
}

/**
 * The referred player's deposit was charged back or refunded (stripe.js): a commission not yet paid
 * is reversed at once; a paid one goes to review (the operator reverses it, the history stays).
 */
export function onDepositReversed(db, { ref, reason }) {
  const c = db.prepare('SELECT * FROM affiliate_commissions WHERE deposit_ref = ?').get(String(ref));
  if (!c || c.status === 'reversed' || c.status === 'rejected') return null;
  const why = `depósito de origem revertido (${reason})`;
  if (c.status === 'paid') {
    if (c.review_reason === why) return c;
    db.prepare('UPDATE affiliate_commissions SET review_reason = ?, updated_at = ? WHERE id = ?').run(why, nowIso(), c.id);
    audit(db, { action: 'commission.flag', entityType: 'commission', entityId: c.id, result: 'review', meta: { reason: why } });
  } else {
    db.prepare("UPDATE affiliate_commissions SET status = 'reversed', review_reason = ?, updated_at = ? WHERE id = ?").run(why, nowIso(), c.id);
    audit(db, { action: 'commission.reverse', entityType: 'commission', entityId: c.id, result: 'reversed', meta: { reason: why, paid: false } });
  }
  return db.prepare('SELECT * FROM affiliate_commissions WHERE id = ?').get(c.id);
}

/** Operator reverses a paid commission: takes it back from the wallet (as much as there is), audited. */
export function reverseCommission(db, id, { actor, reason }) {
  const why = String(reason || '').trim();
  if (why.length < 3) throw new HttpError(400, 'Indique o motivo da reversão.');
  return tx(db, () => {
    const c = commissionRow(db, id);
    if (c.status !== 'paid') throw new HttpError(409, 'Só comissões pagas são revertidas assim (as outras rejeitam-se).');
    const bal = db.prepare('SELECT balance_cents FROM users WHERE id = ?').get(c.affiliate_user_id).balance_cents;
    const take = Math.min(bal, c.commission_cents);
    if (take > 0) postTransaction(db, c.affiliate_user_id, -take, 'affiliate_reversal', `Reversão de comissão de afiliado (${why})${take < c.commission_cents ? ` — em falta €${((c.commission_cents - take) / 100).toFixed(2)}` : ''}`, `affiliate-reversal:${c.id}`);
    db.prepare("UPDATE affiliate_commissions SET status = 'reversed', reversed_cents = ?, review_reason = ?, updated_at = ? WHERE id = ?").run(take, why, nowIso(), c.id);
    audit(db, { actor, action: 'commission.reverse', entityType: 'commission', entityId: c.id, result: 'reversed', meta: { reason: why, taken: take, missing: c.commission_cents - take } });
    return commissionRow(db, c.id);
  });
}

/** Operator suspends, blocks or reactivates an affiliate (with the reason). */
export function setAffiliateStatus(db, userId, { actor, status, reason }) {
  const why = String(reason || '').trim();
  if (!['suspended', 'blocked', 'active'].includes(status)) throw new HttpError(400, 'Estado inválido.');
  if (why.length < 3) throw new HttpError(400, 'Indique o motivo.');
  const p = ensureProfile(db, Number(userId));
  tx(db, () => {
    db.prepare('UPDATE affiliate_profiles SET admin_status = ?, admin_reason = ?, updated_at = ? WHERE id = ?').run(status === 'active' ? null : status, status === 'active' ? null : why, nowIso(), p.id);
    audit(db, { actor, action: 'profile.admin_status', entityType: 'profile', entityId: p.user_id, result: status, meta: { reason: why, from: p.admin_status || 'none' } });
  });
  return refreshProfile(db, p.user_id, { actor });
}

/**
 * Recovery: referred players whose first confirmed deposit has no commission yet (the hook failed,
 * the server stopped mid-way) get it now, through the same idempotent path. Returns how many.
 */
export function recover(db) {
  const cfg = affiliateConfig(db);
  if (!cfg.enabled) return { created: 0 };
  const open = db.prepare(`SELECT a.referred_user_id FROM referral_attributions a
    WHERE a.status = 'pending' AND NOT EXISTS (SELECT 1 FROM affiliate_commissions c WHERE c.referred_user_id = a.referred_user_id)`).all();
  let created = 0;
  for (const { referred_user_id: userId } of open) {
    const first = confirmedDeposits(db, userId, cfg)[0];
    if (!first) continue;
    const ref = first.ref || `demo:${first.id}`;
    if (tx(db, () => onReferredDeposit(db, { userId, amountCents: first.amount_cents, txId: first.id, ref, demo: !first.ref }))) created += 1;
  }
  if (created) audit(db, { action: 'recover', entityType: 'system', result: 'ok', meta: { created } });
  return { created };
}

// ---------- views ----------

const eur = (c) => (c / 100).toFixed(2);
/** "Ana Silva" → "Ana S." (the affiliate sees who signed up, not their personal data). */
export const maskName = (n) => { const [a = '', b = ''] = String(n || '').trim().split(/\s+/); return `${a.slice(0, 12)}${b ? ` ${b[0]}.` : ''}`; };

export function affiliateView(db, userId, { baseUrl }) {
  const cfg = affiliateConfig(db);
  const { profile, eligibility: e } = refreshProfile(db, userId, { cfg });
  return {
    enabled: cfg.enabled,
    referralCode: profile.referral_code,
    referralUrl: `${baseUrl}/${profile.referral_code}`,
    status: e.state,
    reason: e.reason,
    activation: {
      hasQualifyingDeposit: e.hasQualifyingDeposit, minimumDeposit: eur(cfg.minDepositCents),
      eligibleBalance: eur(e.eligibleBalance ?? 0), minimumBalance: eur(cfg.minBalanceCents), canEarnCommission: e.canEarn,
    },
    commission: { rate: cfg.rateBps / 100, basis: 'first_eligible_deposit', currency: 'EUR' },
  };
}

export function affiliateStats(db, userId) {
  const sum = (status) => db.prepare('SELECT COUNT(*) AS n, COALESCE(SUM(commission_cents), 0) AS s FROM affiliate_commissions WHERE affiliate_user_id = ? AND status = ?').get(userId, status);
  const by = Object.fromEntries(['pending', 'approved', 'paid', 'reversed', 'rejected'].map((s) => { const r = sum(s); return [s, { count: r.n, amount: eur(r.s) }]; }));
  const refs = db.prepare(`SELECT COUNT(*) AS n, SUM(status = 'qualified') AS q FROM referral_attributions WHERE affiliate_user_id = ?`).get(userId);
  const clicks = db.prepare('SELECT clicks FROM affiliate_profiles WHERE user_id = ?').get(userId)?.clicks || 0;
  return { clicks, referrals: refs.n, qualified: refs.q || 0, commissions: by };
}

export function affiliateReferrals(db, userId, { page = 1, size = 20 } = {}) {
  const limit = Math.min(50, Math.max(1, Number(size) || 20));
  const offset = (Math.max(1, Number(page) || 1) - 1) * limit;
  const rows = db.prepare(`SELECT a.attributed_at, a.status, u.name, c.status AS commission_status FROM referral_attributions a
      JOIN users u ON u.id = a.referred_user_id LEFT JOIN affiliate_commissions c ON c.referred_user_id = a.referred_user_id
     WHERE a.affiliate_user_id = ? ORDER BY a.id DESC LIMIT ? OFFSET ?`).all(userId, limit, offset);
  const total = db.prepare('SELECT COUNT(*) AS n FROM referral_attributions WHERE affiliate_user_id = ?').get(userId).n;
  return { total, page: Math.floor(offset / limit) + 1, size: limit, items: rows.map((r) => ({ name: maskName(r.name), registeredAt: r.attributed_at, status: r.status, commissionStatus: r.commission_status || null })) };
}

const commissionOut = (c) => ({
  id: c.id, createdAt: c.created_at, deposit: eur(c.deposit_cents), rate: c.rate_bps / 100, amount: eur(c.commission_cents),
  status: c.status, reason: c.review_reason || null, paidAt: c.paid_at, reversed: eur(c.reversed_cents),
});
export function affiliateCommissions(db, userId, { status = null } = {}) {
  const rows = db.prepare(`SELECT * FROM affiliate_commissions WHERE affiliate_user_id = ? ${status ? 'AND status = ?' : ''} ORDER BY id DESC LIMIT 200`)
    .all(...(status ? [userId, status] : [userId]));
  return rows.map(commissionOut);
}

// ---------- admin ----------

export function adminAffiliates(db, { q = '', limit = 100 } = {}) {
  const term = `%${String(q || '').trim()}%`;
  return db.prepare(`SELECT p.*, u.name, u.email, u.balance_cents,
      (SELECT COUNT(*) FROM referral_attributions a WHERE a.affiliate_user_id = p.user_id) AS referrals,
      (SELECT COUNT(*) FROM referral_attributions a WHERE a.affiliate_user_id = p.user_id AND a.status = 'qualified') AS qualified,
      (SELECT COALESCE(SUM(commission_cents), 0) FROM affiliate_commissions c WHERE c.affiliate_user_id = p.user_id AND c.status = 'paid') AS paid_cents,
      (SELECT COALESCE(SUM(commission_cents), 0) FROM affiliate_commissions c WHERE c.affiliate_user_id = p.user_id AND c.status IN ('pending', 'approved')) AS open_cents
    FROM affiliate_profiles p JOIN users u ON u.id = p.user_id
    WHERE (? = '%%' OR p.referral_code LIKE ? OR u.email LIKE ? OR u.name LIKE ?)
    ORDER BY referrals DESC, p.id DESC LIMIT ?`).all(term, term, term, term, Math.min(500, Number(limit) || 100))
    .map((r) => ({
      userId: r.user_id, name: r.name, email: r.email, code: r.referral_code, status: r.status, adminStatus: r.admin_status, adminReason: r.admin_reason,
      activatedAt: r.first_qualifying_deposit_at, clicks: r.clicks, referrals: r.referrals, qualified: r.qualified,
      eligibleBalance: eur(eligibleBalance(db, { id: r.user_id, balance_cents: r.balance_cents })), paid: eur(r.paid_cents), open: eur(r.open_cents),
    }));
}

export function adminCommissions(db, { status = '', limit = 200 } = {}) {
  return db.prepare(`SELECT c.*, a.name AS affiliate_name, a.email AS affiliate_email, r.name AS referred_name, r.email AS referred_email,
      p.status AS payment_status
    FROM affiliate_commissions c JOIN users a ON a.id = c.affiliate_user_id JOIN users r ON r.id = c.referred_user_id
    LEFT JOIN stripe_payments p ON c.deposit_ref = 'stripe:' || p.session_id
    WHERE (? = '' OR c.status = ?) ORDER BY c.id DESC LIMIT ?`).all(status, status, Math.min(1000, Number(limit) || 200))
    .map((c) => ({
      ...commissionOut(c), affiliate: { id: c.affiliate_user_id, name: c.affiliate_name, email: c.affiliate_email },
      referred: { id: c.referred_user_id, name: c.referred_name, email: c.referred_email }, depositRef: c.deposit_ref,
      depositPayment: c.payment_status || null, approvedBy: c.approved_by, paidBy: c.paid_by, payoutTx: c.payout_tx_id,
    }));
}

export function adminAudit(db, { limit = 100 } = {}) {
  return db.prepare('SELECT * FROM affiliate_audit ORDER BY id DESC LIMIT ?').all(Math.min(500, Number(limit) || 100))
    .map((a) => ({ ...a, metadata: a.metadata ? JSON.parse(a.metadata) : null }));
}

/** Reconciliation: paid commissions against their ledger entries (must match one to one). */
export function reconcile(db) {
  const paid = db.prepare("SELECT COALESCE(SUM(commission_cents), 0) AS s, COUNT(*) AS n FROM affiliate_commissions WHERE status IN ('paid', 'reversed') AND payout_tx_id IS NOT NULL").get();
  const ledger = db.prepare("SELECT COALESCE(SUM(amount_cents), 0) AS s, COUNT(*) AS n FROM transactions WHERE type = 'affiliate_commission'").get();
  const reversed = db.prepare("SELECT COALESCE(SUM(reversed_cents), 0) AS s FROM affiliate_commissions").get().s;
  const reversals = -db.prepare("SELECT COALESCE(SUM(amount_cents), 0) AS s FROM transactions WHERE type = 'affiliate_reversal'").get().s;
  return {
    commissionsPaid: eur(paid.s), ledgerCredits: eur(ledger.s), paidCount: paid.n, ledgerCount: ledger.n,
    reversed: eur(reversed), ledgerReversals: eur(reversals), ok: paid.s === ledger.s && paid.n === ledger.n && reversed === reversals,
  };
}

// The site's own address for referral links (PUBLIC_URL), else the request's.
export const siteUrl = (req) => (config.publicUrl || `${req.protocol}://${req.get('host')}`).replace(/\/+$/, '');
