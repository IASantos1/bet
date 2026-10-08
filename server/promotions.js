// Sportsbook promotions: welcome bonus, weekly reload, weekly cashback and first-bet protection.
//
// Money model. A bonus is promotional money kept apart from the real balance (bonuses.balance_cents):
// it cannot be withdrawn and only becomes real money (ledger: bonus_convert) once its rollover is
// met. A bet is paid for with real money first and with bonus money for what is missing; its winnings
// go back in the same proportions. A free bet is a stake the player does not pay: only the net
// winnings are paid, in real money.
//
// Everything is decided here, on the server: amounts, eligibility, rollover, expiry and status. The
// player's page only shows what these functions return. Each grant has a unique reference (the
// deposit, the week, the bet), so processing the same thing twice never pays twice. All functions
// run inside the caller's transaction (db.tx).
import { getSetting, setSetting, nowIso } from './db.js';
import { HttpError } from './security.js';
import { postTransaction } from './wallet.js';

export const PROMO_DEFAULTS = {
  general: { requireKyc: false, methods: ['mbway', 'multibanco', 'cartao', 'demo'] },
  welcome: {
    active: true, startAt: null, endAt: null, percent: 100, minDeposit: 10, maxBonus: 100,
    rolloverMult: 5, rolloverBase: 'deposit_bonus', minOdds: 1.5, validityDays: 30, maxCountStake: 5, maxCountPct: 10,
  },
  reload: {
    active: true, startAt: null, endAt: null, percent: 25, minDeposit: 20, maxBonus: 25,
    rolloverMult: 5, rolloverBase: 'deposit_bonus', minOdds: 1.5, validityDays: 14, maxCountStake: null, maxCountPct: null,
  },
  firstBet: { active: true, startAt: null, endAt: null, minStake: 5, minOdds: 1.5, maxRefund: 10, validityDays: 7 },
  cashback: { active: true, startAt: null, endAt: null, percent: 5, minLoss: 20, max: 25, rolloverMult: 3, minOdds: 1.5, validityDays: 7 },
  // Casino free spins on a deposit: [deposit from €, spins], each spin worth spinValue €; only in `games` (BigBang ids).
  casinoFs: {
    active: true, startAt: null, endAt: null, tiers: [[10, 5], [20, 10], [50, 25], [100, 50]], spinValue: 0.2,
    validityDays: 7, maxDeposit: 100, maxClaims: null, games: [],
  },
};

export const CAMPAIGN_NAMES = { welcome: 'Bónus de boas-vindas', reload: 'Reload semanal', cashback: 'Cashback semanal', firstBet: 'Primeira aposta protegida', casinoFs: 'Free Spins casino' };
const DEPOSIT_KINDS = ['welcome', 'reload'];
const DAY = 86_400_000;
const c100 = (euros) => Math.round(Number(euros) * 100);

// ---------- configuration (Admin → Promoções) ----------

/** The saved configuration over the defaults. */
export function promoConfig(db) {
  const saved = getSetting(db, 'promo.config', {}) || {};
  const out = {};
  for (const [k, def] of Object.entries(PROMO_DEFAULTS)) out[k] = { ...def, ...(saved[k] || {}) };
  return out;
}

// Field rules for the admin form: [min, max] for numbers, null allowed where it means "no limit".
const NUM = {
  percent: [1, 500], minDeposit: [0, 100_000], maxBonus: [0, 100_000], rolloverMult: [0, 100], minOdds: [1, 100],
  validityDays: [1, 365], maxCountStake: [0, 100_000, true], maxCountPct: [0, 100, true], minStake: [0, 100_000],
  maxRefund: [0, 100_000], minLoss: [0, 100_000], max: [0, 100_000], spinValue: [0.01, 100], maxDeposit: [1, 100_000], maxClaims: [1, 1000, true],
};
/** "10:5, 20:10" or [[10, 5], …] → sorted [[deposit €, spins], …]. */
function parseTiers(v) {
  const pairs = Array.isArray(v) ? v : String(v || '').split(/[,;\n]/).map((x) => x.trim()).filter(Boolean).map((x) => x.split(/[:=→>-]+/).map((n) => n.trim()));
  const out = pairs.map(([d, n]) => [Number(d), Math.round(Number(n))]);
  if (!out.length || out.some(([d, n]) => !Number.isFinite(d) || d <= 0 || !Number.isInteger(n) || n <= 0 || n > 1000)) {
    throw new HttpError(400, 'Free Spins: escalões inválidos (ex.: 10:5, 20:10, 50:25, 100:50).');
  }
  return out.sort((a, b) => a[0] - b[0]);
}
const parseGames = (v) => [...new Set((Array.isArray(v) ? v : String(v || '').split(/[\s,;]+/)).map(Number).filter((n) => Number.isInteger(n) && n > 0))];
const isoOrNull = (v) => {
  if (v === null || v === undefined || v === '') return null;
  const t = new Date(v);
  if (Number.isNaN(t.getTime())) throw new HttpError(400, `Data inválida: ${v}`);
  return t.toISOString();
};

/** Validates and saves the configuration sent by the admin (unknown fields are ignored). */
export function savePromoConfig(db, input) {
  const cur = promoConfig(db);
  const next = {};
  for (const [k, def] of Object.entries(PROMO_DEFAULTS)) {
    const src = input?.[k] || {};
    const c = { ...cur[k] };
    for (const f of Object.keys(def)) {
      if (src[f] === undefined) continue;
      const v = src[f];
      if (f === 'active' || f === 'requireKyc') c[f] = !!v;
      else if (f === 'startAt' || f === 'endAt') c[f] = isoOrNull(v);
      else if (f === 'rolloverBase') c[f] = v === 'bonus' ? 'bonus' : 'deposit_bonus';
      else if (f === 'methods') c[f] = (Array.isArray(v) ? v : []).filter((m) => ['mbway', 'multibanco', 'cartao', 'demo'].includes(m));
      else if (f === 'tiers') c[f] = parseTiers(v);
      else if (f === 'games') c[f] = parseGames(v);
      else if (NUM[f]) {
        const [min, max, nullable] = NUM[f];
        if ((v === null || v === '') && nullable) { c[f] = null; continue; }
        const n = Number(v);
        if (!Number.isFinite(n) || n < min || n > max) throw new HttpError(400, `${CAMPAIGN_NAMES[k] || 'Geral'}: valor inválido em ${f}.`);
        c[f] = n;
      }
    }
    if (c.startAt && c.endAt && c.endAt <= c.startAt) throw new HttpError(400, `${CAMPAIGN_NAMES[k]}: o fim tem de ser depois do início.`);
    next[k] = c;
  }
  setSetting(db, 'promo.config', next);
  return next;
}

/** ACTIVE and inside its period. */
export const campaignOpen = (c, now = nowIso()) => !!c?.active && (!c.startAt || now >= c.startAt) && (!c.endAt || now < c.endAt);

// ---------- weeks (Europe/Lisbon, Monday to Sunday) ----------

const lisbonDate = (ms) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Lisbon' }).format(new Date(ms));
/** The UTC instant of 00:00 in Lisbon on a local date (YYYY-MM-DD). */
function lisbonMidnight(date) {
  const [y, m, d] = date.split('-').map(Number);
  const guess = Date.UTC(y, m - 1, d);
  const off = new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/Lisbon', timeZoneName: 'longOffset' }).formatToParts(new Date(guess))
    .find((p) => p.type === 'timeZoneName')?.value || 'GMT';
  const mm = /GMT([+-])(\d{2}):?(\d{2})?/.exec(off);
  const offset = mm ? (mm[1] === '-' ? -1 : 1) * (Number(mm[2]) * 60 + Number(mm[3] || 0)) : 0;
  return guess - offset * 60_000;
}
/** The week holding `ms`: { key: '2026-W41', start, end } (start/end as ISO instants). */
export function weekOf(ms) {
  const date = lisbonDate(ms);
  const [y, m, d] = date.split('-').map(Number);
  const day = new Date(Date.UTC(y, m - 1, d));
  const dow = (day.getUTCDay() + 6) % 7; // Monday = 0
  const monday = new Date(day.getTime() - dow * DAY);
  const mondayStr = monday.toISOString().slice(0, 10);
  const nextStr = new Date(monday.getTime() + 7 * DAY).toISOString().slice(0, 10);
  // ISO week number: the week's Thursday decides the year.
  const thu = new Date(monday.getTime() + 3 * DAY);
  const jan1 = new Date(Date.UTC(thu.getUTCFullYear(), 0, 1));
  const week = Math.floor((thu - jan1) / DAY / 7) + 1;
  return {
    key: `${thu.getUTCFullYear()}-W${String(week).padStart(2, '0')}`,
    start: new Date(lisbonMidnight(mondayStr)).toISOString(), end: new Date(lisbonMidnight(nextStr)).toISOString(),
  };
}

// ---------- ledger / log ----------

/** One promotional ledger line; returns false when (type, ref) was already recorded. */
function ledger(db, { userId, bonusId = null, freebetId = null, type, amount, balanceAfter = null, description, ref = null }) {
  const r = db.prepare(`INSERT OR IGNORE INTO promo_ledger (user_id, bonus_id, freebet_id, type, amount_cents, balance_after_cents, description, ref, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(userId, bonusId, freebetId, type, amount, balanceAfter, description, ref, nowIso());
  return r.changes > 0;
}
function log(db, userId, campaign, ref, outcome, reason = null) {
  db.prepare('INSERT INTO promo_log (user_id, campaign, ref, outcome, reason, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(userId, campaign, ref, outcome, reason, nowIso());
}

// ---------- eligibility ----------

const digits = (v) => String(v || '').replace(/\D/g, '');
/** Another account with the same phone, tax number or IBAN (duplicate accounts get no promotions). */
export function duplicateOf(db, user) {
  const checks = [
    ['phone', digits(user.phone).slice(-9), "substr(replace(replace(replace(phone, ' ', ''), '+', ''), '-', ''), -9)"],
    ['nif', digits(user.nif), 'nif'],
    ['iban', String(user.iban || '').toUpperCase(), 'iban'],
  ];
  for (const [field, value, expr] of checks) {
    if (!value || value.length < 6) continue;
    const other = db.prepare(`SELECT id FROM users WHERE id <> ? AND ${expr} = ? LIMIT 1`).get(user.id, value);
    if (other) return field;
  }
  return null;
}

/** Why the player cannot receive a promotion now (null = eligible). */
export function ineligible(db, user, { method = null } = {}) {
  const cfg = promoConfig(db);
  if (!user) return 'conta inexistente';
  if (user.banned_at) return 'conta suspensa';
  if (user.excluded_until && user.excluded_until > nowIso()) return 'autoexclusão ativa';
  if (user.promo_blocked) return 'promoções bloqueadas pelo operador';
  if (cfg.general.requireKyc && user.kyc_status !== 'approved') return 'identidade não verificada';
  if (method && !cfg.general.methods.includes(method)) return 'método de pagamento não elegível';
  const dup = duplicateOf(db, user);
  if (dup) return `possível conta duplicada (${{ phone: 'telemóvel', nif: 'NIF', iban: 'IBAN' }[dup]})`;
  return null;
}

const userRow = (db, id) => db.prepare('SELECT * FROM users WHERE id = ?').get(id);
const activeDepositBonus = (db, userId) => db.prepare(`SELECT * FROM bonuses WHERE user_id = ? AND status = 'active' AND kind IN ('welcome', 'reload') ORDER BY id LIMIT 1`).get(userId);

/** The campaign a deposit of `amountCents` would get now, and the bonus (for the deposit form and onDeposit). */
export function depositOffer(db, userId, amountCents, { now = nowIso(), method = null, credited = false } = {}) {
  const cfg = promoConfig(db);
  const user = userRow(db, userId);
  // The welcome bonus is for the first eligible deposit only (players who already made one get the reload).
  // `credited`: this deposit is already in the ledger, so it is not an earlier one.
  const min = c100(cfg.welcome.minDeposit);
  const eligibleBefore = db.prepare("SELECT COUNT(*) AS n FROM transactions WHERE user_id = ? AND type = 'deposit' AND amount_cents >= ?").get(userId, min).n
    - (credited && amountCents >= min ? 1 : 0);
  const hasWelcome = eligibleBefore > 0 || !!db.prepare("SELECT 1 FROM bonuses WHERE user_id = ? AND kind = 'welcome'").get(userId);
  const kind = hasWelcome ? 'reload' : 'welcome';
  const c = cfg[kind];
  const out = { campaign: kind, name: CAMPAIGN_NAMES[kind] };
  if (!campaignOpen(c, now)) return { ...out, reason: 'campanha inativa' };
  if (activeDepositBonus(db, userId)) return { ...out, reason: 'já tem uma promoção de depósito ativa' };
  if (kind === 'reload' && db.prepare("SELECT 1 FROM bonuses WHERE user_id = ? AND kind = 'reload' AND period = ?").get(userId, weekOf(Date.parse(now)).key)) {
    return { ...out, reason: 'reload desta semana já utilizado' };
  }
  const why = ineligible(db, user, { method });
  if (why) return { ...out, reason: why };
  if (amountCents < c100(c.minDeposit)) return { ...out, reason: `depósito mínimo €${c.minDeposit}`, minDeposit: c.minDeposit };
  const bonus = Math.min(Math.floor((amountCents * c.percent) / 100), c100(c.maxBonus));
  if (bonus <= 0) return { ...out, reason: 'sem bónus para este valor' };
  return { ...out, bonusCents: bonus, minDeposit: c.minDeposit };
}

/** Rollover cap per bet for a bonus: the lower of a fixed amount and a share of the bonus (null = none). */
function countCap(c, bonusCents) {
  const caps = [];
  if (c.maxCountStake !== null && c.maxCountStake !== undefined) caps.push(c100(c.maxCountStake));
  if (c.maxCountPct !== null && c.maxCountPct !== undefined) caps.push(Math.floor((bonusCents * c.maxCountPct) / 100));
  return caps.length ? Math.min(...caps) : null;
}

function grantBonus(db, user, { kind, ref, depositCents = 0, bonusCents, c, period = null, now = nowIso() }) {
  const base = kind === 'cashback' || c.rolloverBase === 'bonus' ? bonusCents : depositCents + bonusCents;
  const r = db.prepare(`INSERT OR IGNORE INTO bonuses (user_id, kind, ref, deposit_cents, amount_cents, balance_cents, rollover_target_cents,
      min_odds_x100, max_count_cents, period, expires_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(user.id, kind, ref, depositCents, bonusCents, bonusCents, Math.round(base * c.rolloverMult), Math.round(c.minOdds * 100),
      kind === 'cashback' ? null : countCap(c, bonusCents), period, new Date(Date.parse(now) + c.validityDays * DAY).toISOString(), now);
  if (!r.changes) return null;
  const id = Number(r.lastInsertRowid);
  ledger(db, { userId: user.id, bonusId: id, type: kind === 'cashback' ? 'cashback_credit' : 'bonus_credit', amount: bonusCents, balanceAfter: bonusCents,
    description: `${CAMPAIGN_NAMES[kind]} creditado`, ref });
  log(db, user.id, kind, ref, 'granted');
  return db.prepare('SELECT * FROM bonuses WHERE id = ?').get(id);
}

/**
 * A confirmed deposit (already credited to the wallet): the welcome bonus on the first eligible
 * deposit, the weekly reload after it. `ref` identifies the deposit (one bonus per deposit, ever).
 */
export function onDeposit(db, { userId, amountCents, ref, method = null, optIn = true, choice = null, now = nowIso() }) {
  const bonusRef = `deposit:${ref}`;
  // One promotion per deposit, ever: the player picks the sports bonus or the casino free spins.
  if (db.prepare('SELECT 1 FROM bonuses WHERE ref = ?').get(bonusRef) || db.prepare('SELECT 1 FROM casino_spins WHERE ref = ?').get(bonusRef)) return null;
  if (db.prepare("SELECT 1 FROM promo_log WHERE ref = ? AND campaign IN ('welcome', 'reload', 'casinoFs')").get(bonusRef)) return null;
  const pick = choice || (optIn ? 'sport' : 'none');
  if (pick === 'casino') return grantSpinsFor(db, { userId, amountCents, ref: bonusRef, method, now });
  const offer = depositOffer(db, userId, amountCents, { now, method, credited: true });
  if (pick === 'none') { log(db, userId, offer.campaign, bonusRef, 'refused', 'recusado pelo jogador'); return null; }
  if (!offer.bonusCents) { log(db, userId, offer.campaign, bonusRef, 'refused', offer.reason); return null; }
  return grantBonus(db, userRow(db, userId), {
    kind: offer.campaign, ref: bonusRef, depositCents: amountCents, bonusCents: offer.bonusCents, c: promoConfig(db)[offer.campaign],
    period: offer.campaign === 'reload' ? weekOf(Date.parse(now)).key : null, now,
  });
}

// ---------- casino free spins ----------

export const spinsRow = (db, id, userId) => db.prepare('SELECT * FROM casino_spins WHERE id = ? AND user_id = ?').get(id, userId);
const activeSpins = (db, userId) => db.prepare("SELECT * FROM casino_spins WHERE user_id = ? AND status = 'active' ORDER BY id LIMIT 1").get(userId);

/** The free spins a deposit of `amountCents` would get now (the highest tier it reaches, up to maxDeposit). */
export function casinoOffer(db, userId, amountCents, { now = nowIso(), method = null } = {}) {
  const c = promoConfig(db).casinoFs;
  const out = { campaign: 'casinoFs', name: CAMPAIGN_NAMES.casinoFs, spinValue: c.spinValue };
  if (!campaignOpen(c, now)) return { ...out, reason: 'campanha inativa' };
  if (!c.games.length) return { ...out, reason: 'sem jogos elegíveis configurados' };
  if (activeSpins(db, userId)) return { ...out, reason: 'já tem uma campanha de casino ativa' };
  if (c.maxClaims && db.prepare('SELECT COUNT(*) AS n FROM casino_spins WHERE user_id = ?').get(userId).n >= c.maxClaims) return { ...out, reason: 'limite de utilizações atingido' };
  const why = ineligible(db, userRow(db, userId), { method });
  if (why) return { ...out, reason: why };
  const counted = Math.min(amountCents, c100(c.maxDeposit));
  const tier = [...c.tiers].reverse().find(([min]) => counted >= c100(min));
  if (!tier) return { ...out, reason: `depósito mínimo €${c.tiers[0][0]}`, minDeposit: c.tiers[0][0] };
  return { ...out, spins: tier[1], valueCents: Math.round(tier[1] * c100(c.spinValue)), minDeposit: c.tiers[0][0] };
}

function grantSpinsFor(db, { userId, amountCents, ref, method, now }) {
  const offer = casinoOffer(db, userId, amountCents, { now, method });
  if (!offer.spins) { log(db, userId, 'casinoFs', ref, 'refused', offer.reason); return null; }
  const c = promoConfig(db).casinoFs;
  const r = db.prepare(`INSERT OR IGNORE INTO casino_spins (user_id, ref, spins, spin_value_cents, value_cents, balance_cents, games, deposit_cents, expires_at, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(userId, ref, offer.spins, c100(c.spinValue), offer.valueCents, offer.valueCents, JSON.stringify(c.games), amountCents,
    new Date(Date.parse(now) + c.validityDays * DAY).toISOString(), now);
  if (!r.changes) return null;
  const id = Number(r.lastInsertRowid);
  ledger(db, { userId, type: 'free_spin_credit', amount: offer.valueCents, balanceAfter: offer.valueCents, description: `${offer.spins} Free Spins de €${c.spinValue.toFixed(2)} creditadas`, ref: `fs:${id}` });
  log(db, userId, 'casinoFs', ref, 'granted');
  return { kind: 'casinoFs', ...db.prepare('SELECT * FROM casino_spins WHERE id = ?').get(id) };
}

const spinGames = (s) => { try { return JSON.parse(s.games) || []; } catch { return []; } };

/**
 * Ends a free-spins grant: what its balance holds above the value given is the player's winnings
 * and is paid as real money (the free spins themselves are never paid). status: closed / expired.
 */
export function closeSpins(db, s, status = 'closed', reason = null) {
  if (s.status !== 'active') return 0;
  const win = Math.max(0, s.balance_cents - s.value_cents);
  db.prepare('UPDATE casino_spins SET status = ?, balance_cents = 0, paid_cents = ?, ended_at = ?, cancel_reason = ? WHERE id = ? AND status = ?')
    .run(status, win, nowIso(), reason, s.id, 'active');
  if (win > 0) {
    postTransaction(db, s.user_id, win, 'free_spin_win', 'Ganhos das Free Spins', `fs:${s.id}`);
    ledger(db, { userId: s.user_id, type: 'free_spin_win', amount: win, description: 'Ganhos das Free Spins pagos em saldo real', ref: `fswin:${s.id}` });
  }
  const unused = s.balance_cents - win;
  if (unused > 0 || status === 'expired') {
    ledger(db, { userId: s.user_id, type: status === 'expired' ? 'free_spin_expiry' : 'free_spin_used', amount: -unused, balanceAfter: 0,
      description: status === 'expired' ? 'Free Spins expiradas' : 'Free Spins terminadas', ref: `fsend:${s.id}` });
  }
  log(db, s.user_id, 'casinoFs', s.ref, status, reason);
  return win;
}

/**
 * One wallet move on a free-spins token (from the casino): a bet / win on the free-spins balance,
 * only in the eligible games. Returns { balance } or { error, balance }.
 */
export function spinsMove(db, user, spinsId, move) {
  let s = spinsRow(db, spinsId, user.id);
  if (!s) return { error: 'unknown user', balance: 0 };
  if (s.status === 'active' && s.expires_at <= nowIso()) { closeSpins(db, s, 'expired', 'prazo terminado'); s = spinsRow(db, spinsId, user.id); }
  if (s.status !== 'active') {
    // A win of a round that was open when the free spins ended: paid as winnings (real money).
    if (move.cents > 0) {
      postTransaction(db, user.id, move.cents, 'free_spin_win', 'Ganhos das Free Spins', `casino:${move.txId}`);
      ledger(db, { userId: user.id, type: 'free_spin_win', amount: move.cents, description: 'Ganho de Free Spins depois de terminadas', ref: move.txId });
    }
    return move.cents < 0 ? { error: 'free spins ended', balance: 0 } : { balance: 0 };
  }
  if (move.cents < 0) {
    if (move.gameId && !spinGames(s).includes(move.gameId)) return { error: 'game not eligible for free spins', balance: s.balance_cents };
    if (user.banned_at || (user.excluded_until && user.excluded_until > nowIso())) return { error: 'account not allowed', balance: s.balance_cents };
    if (s.balance_cents + move.cents < 0) return { error: 'insufficient balance', balance: s.balance_cents };
  }
  const balance = s.balance_cents + move.cents;
  db.prepare('UPDATE casino_spins SET balance_cents = ? WHERE id = ?').run(balance, s.id);
  if (move.cents !== 0) {
    ledger(db, { userId: user.id, type: move.cents < 0 ? 'free_spin_used' : 'free_spin_win', amount: move.cents, balanceAfter: balance,
      description: `Free Spins · ${move.game}`, ref: move.txId });
  }
  // Nothing left and the round over: the grant ends.
  if (balance === 0 && move.roundEnd !== 0) closeSpins(db, { ...s, balance_cents: 0 }, 'closed', 'saldo de Free Spins esgotado');
  return { balance };
}

/** The player ends the free spins now (winnings above the value given are paid). */
export function claimSpins(db, userId, spinsId) {
  const s = spinsRow(db, Number(spinsId), userId);
  if (!s) throw new HttpError(404, 'Free Spins não encontradas.');
  if (s.status !== 'active') throw new HttpError(409, 'Estas Free Spins já terminaram.');
  return closeSpins(db, s, 'closed', 'terminadas pelo jogador');
}

export const spinsView = (s, gameName = () => null) => ({
  id: s.id, status: s.status, spins: s.spins, spinValue: s.spin_value_cents / 100, value: s.value_cents / 100, balance: s.balance_cents / 100,
  winnings: Math.max(0, s.balance_cents - s.value_cents) / 100, paid: s.paid_cents / 100, expiresAt: s.expires_at, createdAt: s.created_at,
  endedAt: s.ended_at, reason: s.cancel_reason, games: spinGames(s).map((id) => ({ id, name: gameName(id) })),
});

// ---------- bonus money ----------

const bonusRow = (db, id) => db.prepare('SELECT * FROM bonuses WHERE id = ?').get(id);
export const bonusBalanceCents = (db, userId) => db.prepare("SELECT COALESCE(SUM(balance_cents), 0) AS s FROM bonuses WHERE user_id = ? AND status = 'active'").get(userId).s;
export const freebetCents = (db, userId) => db.prepare("SELECT COALESCE(SUM(amount_cents), 0) AS s FROM freebets WHERE user_id = ? AND status = 'active' AND expires_at > ?").get(userId, nowIso()).s;

function moveBonus(db, b, amount, type, description, ref) {
  const balance = b.balance_cents + amount;
  if (balance < 0) throw new HttpError(400, 'Saldo de bónus insuficiente.');
  if (!ledger(db, { userId: b.user_id, bonusId: b.id, type, amount, balanceAfter: balance, description, ref })) return false;
  db.prepare('UPDATE bonuses SET balance_cents = ? WHERE id = ?').run(balance, b.id);
  return true;
}

/**
 * Money owed back to a bonus (winnings or a refund of its stake): to the bonus while it is active,
 * as real money once it was completed, lost when it expired or was cancelled. Returns the real cents paid.
 */
function creditBonusShare(db, bonusId, amount, type, description, ref) {
  if (amount <= 0) return 0;
  const b = bonusRow(db, bonusId);
  if (!b) return 0;
  if (b.status === 'active') { moveBonus(db, b, amount, type, description, ref); return 0; }
  if (b.status === 'completed') {
    if (!ledger(db, { userId: b.user_id, bonusId: b.id, type: 'bonus_convert', amount, description: `${description} (bónus já convertido)`, ref })) return 0;
    postTransaction(db, b.user_id, amount, 'bonus_convert', `${description} — bónus cumprido`, ref);
    return amount;
  }
  ledger(db, { userId: b.user_id, bonusId: b.id, type: 'bonus_forfeit', amount: 0, description: `${description}: €${(amount / 100).toFixed(2)} perdidos (bónus ${b.status === 'expired' ? 'expirado' : 'cancelado'})`, ref });
  return 0;
}

/** Rollover met: what is left of the bonus becomes real money. */
function completeBonus(db, b) {
  const now = nowIso();
  db.prepare("UPDATE bonuses SET status = 'completed', ended_at = ? WHERE id = ? AND status = 'active'").run(now, b.id);
  if (b.balance_cents > 0) {
    ledger(db, { userId: b.user_id, bonusId: b.id, type: 'bonus_debit', amount: -b.balance_cents, balanceAfter: 0, description: 'Rollover cumprido: bónus convertido em saldo real', ref: `complete:${b.id}` });
    db.prepare('UPDATE bonuses SET balance_cents = 0 WHERE id = ?').run(b.id);
    postTransaction(db, b.user_id, b.balance_cents, 'bonus_convert', `${CAMPAIGN_NAMES[b.kind]}: rollover cumprido`, `bonus:${b.id}`);
  }
  log(db, b.user_id, b.kind, b.ref, 'completed');
}

function endBonus(db, b, status, reason) {
  const type = status === 'expired' ? 'bonus_expiry' : 'bonus_cancel';
  ledger(db, { userId: b.user_id, bonusId: b.id, type, amount: -b.balance_cents, balanceAfter: 0,
    description: status === 'expired' ? `${CAMPAIGN_NAMES[b.kind]} expirado` : `${CAMPAIGN_NAMES[b.kind]} cancelado: ${reason}`, ref: `${type}:${b.id}` });
  db.prepare('UPDATE bonuses SET status = ?, balance_cents = 0, ended_at = ?, cancel_reason = ? WHERE id = ?').run(status, nowIso(), reason, b.id);
  log(db, b.user_id, b.kind, b.ref, status, reason);
}

/** Cancels one bonus (never touches the real balance). */
export function cancelBonus(db, bonusId, reason) {
  const b = bonusRow(db, bonusId);
  if (!b) throw new HttpError(404, 'Bónus não encontrado.');
  if (b.status !== 'active') throw new HttpError(409, 'Este bónus já não está ativo.');
  endBonus(db, b, 'cancelled', String(reason || 'cancelado pelo operador').slice(0, 200));
}

/** Cancels every active bonus and free bet of a player (self-exclusion, suspension, fraud). */
export function cancelUserPromos(db, userId, reason) {
  for (const b of db.prepare("SELECT * FROM bonuses WHERE user_id = ? AND status = 'active'").all(userId)) endBonus(db, b, 'cancelled', reason);
  // Free spins: removed without paying anything.
  for (const s of db.prepare("SELECT * FROM casino_spins WHERE user_id = ? AND status = 'active'").all(userId)) {
    db.prepare("UPDATE casino_spins SET status = 'cancelled', balance_cents = 0, ended_at = ?, cancel_reason = ? WHERE id = ?").run(nowIso(), reason, s.id);
    ledger(db, { userId, type: 'bonus_cancel', amount: -s.balance_cents, balanceAfter: 0, description: `Free Spins canceladas: ${reason}`, ref: `fscancel:${s.id}` });
    log(db, userId, 'casinoFs', s.ref, 'cancelled', reason);
  }
  for (const f of db.prepare("SELECT * FROM freebets WHERE user_id = ? AND status = 'active'").all(userId)) {
    db.prepare("UPDATE freebets SET status = 'cancelled' WHERE id = ?").run(f.id);
    ledger(db, { userId, freebetId: f.id, type: 'bonus_cancel', amount: -f.amount_cents, description: `Free bet cancelada: ${reason}`, ref: `fbcancel:${f.id}` });
  }
}

/** Expired bonuses and free bets: removed (only promotional money). */
export function expireDue(db, now = nowIso()) {
  let n = 0;
  for (const b of db.prepare("SELECT * FROM bonuses WHERE status = 'active' AND expires_at <= ?").all(now)) { endBonus(db, b, 'expired', 'prazo terminado'); n += 1; }
  for (const s of db.prepare("SELECT * FROM casino_spins WHERE status = 'active' AND expires_at <= ?").all(now)) { closeSpins(db, s, 'expired', 'prazo terminado'); n += 1; }
  for (const f of db.prepare("SELECT * FROM freebets WHERE status = 'active' AND expires_at <= ?").all(now)) {
    db.prepare("UPDATE freebets SET status = 'expired' WHERE id = ?").run(f.id);
    ledger(db, { userId: f.user_id, freebetId: f.id, type: 'freebet_expiry', amount: -f.amount_cents, description: 'Free bet expirada', ref: `fbexpiry:${f.id}` });
    n += 1;
  }
  return n;
}

// ---------- free bets ----------

export function grantFreebet(db, userId, { amountCents, source, ref, validityDays = 7, minOdds = 1, now = nowIso(), description = 'Free bet creditada' }) {
  const r = db.prepare(`INSERT OR IGNORE INTO freebets (user_id, amount_cents, source, ref, min_odds_x100, expires_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .run(userId, amountCents, source, ref, Math.round(minOdds * 100), new Date(Date.parse(now) + validityDays * DAY).toISOString(), now);
  if (!r.changes) return null;
  const id = Number(r.lastInsertRowid);
  ledger(db, { userId, freebetId: id, type: 'freebet_credit', amount: amountCents, description, ref: `fb:${ref}` });
  return db.prepare('SELECT * FROM freebets WHERE id = ?').get(id);
}

// ---------- bets: paying for them, settling them ----------

/**
 * How a new bet is paid for (debits included): a free bet (its whole amount is the stake), or real
 * money first and the bonus for what is missing. Returns the columns to store on the bet.
 * Must be called after the bet row exists (betId) and inside the transaction.
 */
export function fundBet(db, user, { betId, stakeCents, totalOdds, freebetId = null, label }) {
  if (freebetId) {
    const f = db.prepare('SELECT * FROM freebets WHERE id = ? AND user_id = ?').get(Number(freebetId), user.id);
    if (!f || f.status !== 'active' || f.expires_at <= nowIso()) throw new HttpError(400, 'Esta free bet já não está disponível.');
    if (f.amount_cents !== stakeCents) throw new HttpError(400, 'O valor da aposta tem de ser o da free bet.');
    if (Math.round(totalOdds * 100) < f.min_odds_x100) throw new HttpError(400, `A free bet exige odd mínima de ${(f.min_odds_x100 / 100).toFixed(2)}.`);
    db.prepare("UPDATE freebets SET status = 'used', used_at = ?, bet_id = ? WHERE id = ?").run(nowIso(), betId, f.id);
    ledger(db, { userId: user.id, freebetId: f.id, type: 'freebet_stake', amount: -f.amount_cents, description: `Free bet usada na aposta #${betId}`, ref: `bet:${betId}` });
    return { real: 0, bonus: 0, bonusId: null, freebetId: f.id, freebet: f.amount_cents };
  }
  const balance = db.prepare('SELECT balance_cents FROM users WHERE id = ?').get(user.id).balance_cents;
  const real = Math.min(balance, stakeCents);
  const bonus = stakeCents - real;
  let bonusId = null;
  if (bonus > 0) {
    const b = db.prepare("SELECT * FROM bonuses WHERE user_id = ? AND status = 'active' AND balance_cents >= ? AND expires_at > ? ORDER BY expires_at LIMIT 1").get(user.id, bonus, nowIso());
    if (!b) throw new HttpError(400, 'Saldo insuficiente.');
    moveBonus(db, b, -bonus, 'bet_stake', `Aposta #${betId} (parte paga com bónus)`, `bet:${betId}`);
    bonusId = b.id;
  }
  if (real > 0) postTransaction(db, user.id, -real, 'bet', label, `bet:${betId}`);
  return { real, bonus, bonusId, freebetId: null, freebet: 0 };
}

/** First-bet protection: is this (real-money) bet the player's first eligible one? */
export function protects(db, user, { realCents, stakeCents, totalOdds, now = nowIso() }) {
  const c = promoConfig(db).firstBet;
  if (!campaignOpen(c, now) || realCents !== stakeCents) return false;
  if (stakeCents < c100(c.minStake) || totalOdds < c.minOdds) return false;
  if (db.prepare('SELECT 1 FROM bets WHERE user_id = ? AND protected = 1').get(user.id)) return false;
  if (db.prepare("SELECT 1 FROM promo_log WHERE user_id = ? AND campaign = 'firstBet'").get(user.id)) return false;
  const why = ineligible(db, user);
  if (why) { log(db, user.id, 'firstBet', null, 'refused', why); return false; }
  return true;
}

/** Rollover from a settled (won / lost) bet, for every bonus active when it was placed. */
function addRollover(db, bet) {
  const countable = (bet.real_stake_cents ?? bet.stake_cents) + (bet.bonus_stake_cents || 0);
  if (countable <= 0) return;
  const bonuses = db.prepare("SELECT * FROM bonuses WHERE user_id = ? AND status = 'active' AND created_at <= ?").all(bet.user_id, bet.created_at);
  for (const b of bonuses) {
    if (Math.round(bet.total_odds * 100) < b.min_odds_x100) continue;
    const add = b.max_count_cents === null ? countable : Math.min(countable, b.max_count_cents);
    if (!ledger(db, { userId: b.user_id, bonusId: b.id, type: 'rollover_progress', amount: add, balanceAfter: b.rollover_progress_cents + add,
      description: `Aposta #${bet.id} conta €${(add / 100).toFixed(2)} para o rollover`, ref: `bet:${bet.id}:${b.id}` })) continue;
    db.prepare('UPDATE bonuses SET rollover_progress_cents = rollover_progress_cents + ? WHERE id = ?').run(add, b.id);
    const now = bonusRow(db, b.id);
    if (now.rollover_progress_cents >= now.rollover_target_cents) completeBonus(db, now);
  }
}

/**
 * A bet just decided: pays it from the right sources and updates the promotions.
 * outcome 'won' (payoutCents = gross payout), 'lost' or 'void' (stake back). Returns the real cents paid.
 */
export function settleFunds(db, bet, outcome, payoutCents = 0) {
  const real = bet.real_stake_cents ?? bet.stake_cents;
  const bonus = bet.bonus_stake_cents || 0;
  const free = bet.freebet_stake_cents || 0;
  const ref = `bet:${bet.id}`;
  let realPaid = 0;
  if (outcome === 'void') {
    if (real > 0) { postTransaction(db, bet.user_id, real, 'refund', `Aposta #${bet.id} anulada — reembolso`, ref); realPaid += real; }
    if (bonus > 0) realPaid += creditBonusShare(db, bet.bonus_id, bonus, 'bet_refund', `Aposta #${bet.id} anulada — reembolso`, ref);
    if (free > 0) {
      const f = db.prepare('SELECT * FROM freebets WHERE id = ?').get(bet.freebet_id);
      if (f && ledger(db, { userId: bet.user_id, freebetId: f.id, type: 'bet_refund', amount: free, description: `Aposta #${bet.id} anulada — free bet devolvida`, ref })) {
        db.prepare("UPDATE freebets SET status = CASE WHEN expires_at > ? THEN 'active' ELSE 'expired' END, bet_id = NULL, used_at = NULL WHERE id = ?").run(nowIso(), f.id);
      }
    }
  } else if (outcome === 'won') {
    if (free > 0) {
      // A free bet's stake is not paid back: only the winnings.
      const net = Math.max(0, payoutCents - free);
      if (net > 0) postTransaction(db, bet.user_id, net, 'payout', `Aposta #${bet.id} ganha (free bet)`, ref);
      ledger(db, { userId: bet.user_id, freebetId: bet.freebet_id, type: 'bet_win', amount: net, description: `Ganho da free bet (aposta #${bet.id})`, ref });
      realPaid = net;
    } else {
      const realShare = bonus > 0 ? Math.floor((payoutCents * real) / (real + bonus)) : payoutCents;
      if (realShare > 0) { postTransaction(db, bet.user_id, realShare, 'payout', `Aposta #${bet.id} ganha`, ref); realPaid += realShare; }
      realPaid += creditBonusShare(db, bet.bonus_id, payoutCents - realShare, 'bet_win', `Aposta #${bet.id} ganha (parte do bónus)`, ref);
    }
  }
  db.prepare('UPDATE bets SET real_payout_cents = ? WHERE id = ?').run(realPaid, bet.id);
  if (outcome !== 'void' && free === 0) addRollover(db, bet);
  if (outcome === 'lost' && bet.protected) firstBetRefund(db, bet);
  return realPaid;
}

function firstBetRefund(db, bet) {
  const c = promoConfig(db).firstBet;
  const amount = Math.min(bet.real_stake_cents ?? bet.stake_cents, c100(c.maxRefund));
  const user = userRow(db, bet.user_id);
  const why = user.banned_at ? 'conta suspensa' : user.promo_blocked ? 'promoções bloqueadas pelo operador' : null;
  if (why || amount <= 0) { log(db, bet.user_id, 'firstBet', `bet:${bet.id}`, 'refused', why || 'sem valor'); return; }
  if (grantFreebet(db, bet.user_id, { amountCents: amount, source: 'first_bet', ref: `firstbet:${bet.id}`, validityDays: c.validityDays,
    description: `Primeira aposta protegida (aposta #${bet.id})` })) log(db, bet.user_id, 'firstBet', `bet:${bet.id}`, 'granted');
}

// ---------- weekly cashback ----------

/**
 * Cashback for the week before `now` (once per player and week): a share of the real money lost on
 * settled bets (free bets, bonus money and void bets left out), credited as a bonus with its rollover.
 */
export function runCashback(db, now = nowIso()) {
  const c = promoConfig(db).cashback;
  if (!campaignOpen(c, now)) return 0;
  const week = weekOf(Date.parse(weekOf(Date.parse(now)).start) - 1);
  const rows = db.prepare(`SELECT user_id, SUM(COALESCE(real_stake_cents, stake_cents)) AS staked, SUM(COALESCE(real_payout_cents, payout_cents)) AS paid
      FROM bets WHERE status IN ('won', 'lost') AND freebet_stake_cents = 0 AND settled_at >= ? AND settled_at < ? GROUP BY user_id`).all(week.start, week.end);
  let n = 0;
  for (const r of rows) {
    const ref = `cashback:${week.key}:${r.user_id}`;
    if (db.prepare('SELECT 1 FROM bonuses WHERE ref = ?').get(ref) || db.prepare("SELECT 1 FROM promo_log WHERE ref = ? AND campaign = 'cashback'").get(ref)) continue;
    const loss = r.staked - r.paid;
    if (loss < c100(c.minLoss)) continue;
    const user = userRow(db, r.user_id);
    const why = ineligible(db, user);
    if (why) { log(db, r.user_id, 'cashback', ref, 'refused', why); continue; }
    const amount = Math.min(Math.floor((loss * c.percent) / 100), c100(c.max));
    if (amount <= 0) continue;
    if (grantBonus(db, user, { kind: 'cashback', ref, bonusCents: amount, c, period: week.key, now })) n += 1;
  }
  return n;
}

// ---------- chargebacks / reversed deposits ----------

/**
 * A deposit reversed (chargeback, refund): its money is taken back from the real balance (what is
 * there), the player's promotions are cancelled and further ones blocked.
 */
export function onChargeback(db, { userId, amountCents, ref, reason = 'chargeback' }) {
  const user = userRow(db, userId);
  if (!user) return false;
  if (!ledger(db, { userId, type: 'chargeback', amount: -amountCents, description: `Depósito revertido (${reason})`, ref: `chargeback:${ref}` })) return false;
  const take = Math.min(user.balance_cents, amountCents);
  if (take > 0) postTransaction(db, userId, -take, 'chargeback', `Depósito revertido (${reason})${take < amountCents ? ` — faltam €${((amountCents - take) / 100).toFixed(2)}` : ''}`, `chargeback:${ref}`);
  cancelUserPromos(db, userId, reason);
  db.prepare('UPDATE users SET promo_blocked = 1 WHERE id = ?').run(userId);
  log(db, userId, 'all', `chargeback:${ref}`, 'cancelled', reason);
  return true;
}

// ---------- what the player sees ----------

const eur = (cents) => Math.round(cents) / 100;
export function bonusView(b) {
  return {
    id: b.id, kind: b.kind, name: CAMPAIGN_NAMES[b.kind], status: b.status, amount: eur(b.amount_cents), balance: eur(b.balance_cents),
    deposit: eur(b.deposit_cents), rolloverTarget: eur(b.rollover_target_cents), rolloverProgress: eur(Math.min(b.rollover_progress_cents, b.rollover_target_cents)),
    remaining: eur(Math.max(0, b.rollover_target_cents - b.rollover_progress_cents)), minOdds: b.min_odds_x100 / 100,
    maxCountStake: b.max_count_cents === null ? null : eur(b.max_count_cents), expiresAt: b.expires_at, createdAt: b.created_at,
    endedAt: b.ended_at, cancelReason: b.cancel_reason,
  };
}
export const freebetView = (f) => ({ id: f.id, amount: eur(f.amount_cents), source: f.source, status: f.status, minOdds: f.min_odds_x100 / 100, expiresAt: f.expires_at, createdAt: f.created_at, betId: f.bet_id });

/** The campaigns as the promotions page shows them (only what the player may read). */
export function publicCampaigns(db, now = nowIso()) {
  const cfg = promoConfig(db);
  const w = cfg.welcome; const r = cfg.reload; const f = cfg.firstBet; const cb = cfg.cashback;
  return [
    { id: 'welcome', name: CAMPAIGN_NAMES.welcome, open: campaignOpen(w, now), percent: w.percent, minDeposit: w.minDeposit, maxBonus: w.maxBonus,
      rolloverMult: w.rolloverMult, rolloverBase: w.rolloverBase, minOdds: w.minOdds, validityDays: w.validityDays, maxCountStake: w.maxCountStake, maxCountPct: w.maxCountPct, endAt: w.endAt },
    { id: 'firstBet', name: CAMPAIGN_NAMES.firstBet, open: campaignOpen(f, now), minStake: f.minStake, minOdds: f.minOdds, maxRefund: f.maxRefund, validityDays: f.validityDays, endAt: f.endAt },
    { id: 'reload', name: CAMPAIGN_NAMES.reload, open: campaignOpen(r, now), percent: r.percent, minDeposit: r.minDeposit, maxBonus: r.maxBonus,
      rolloverMult: r.rolloverMult, rolloverBase: r.rolloverBase, minOdds: r.minOdds, validityDays: r.validityDays, endAt: r.endAt },
    { id: 'cashback', name: CAMPAIGN_NAMES.cashback, open: campaignOpen(cb, now), percent: cb.percent, minLoss: cb.minLoss, max: cb.max,
      rolloverMult: cb.rolloverMult, minOdds: cb.minOdds, validityDays: cb.validityDays, endAt: cb.endAt },
    { id: 'casinoFs', name: CAMPAIGN_NAMES.casinoFs, open: campaignOpen(cfg.casinoFs, now) && cfg.casinoFs.games.length > 0, tiers: cfg.casinoFs.tiers,
      spinValue: cfg.casinoFs.spinValue, validityDays: cfg.casinoFs.validityDays, maxDeposit: cfg.casinoFs.maxDeposit, games: cfg.casinoFs.games.length, endAt: cfg.casinoFs.endAt },
  ];
}

export function playerPromos(db, userId, { gameName } = {}) {
  const spins = db.prepare('SELECT * FROM casino_spins WHERE user_id = ? ORDER BY id DESC LIMIT 10').all(userId).map((s) => spinsView(s, gameName));
  const bonuses = db.prepare('SELECT * FROM bonuses WHERE user_id = ? ORDER BY id DESC LIMIT 20').all(userId).map(bonusView);
  const freebets = db.prepare("SELECT * FROM freebets WHERE user_id = ? ORDER BY CASE status WHEN 'active' THEN 0 ELSE 1 END, id DESC LIMIT 20").all(userId).map(freebetView);
  const ledgerRows = db.prepare('SELECT type, amount_cents, balance_after_cents, description, created_at FROM promo_ledger WHERE user_id = ? ORDER BY id DESC LIMIT 40').all(userId)
    .map((l) => ({ type: l.type, amount: eur(l.amount_cents), balanceAfter: l.balance_after_cents === null ? null : eur(l.balance_after_cents), description: l.description, createdAt: l.created_at }));
  const firstBetUsed = !!db.prepare('SELECT 1 FROM bets WHERE user_id = ? AND protected = 1').get(userId);
  return {
    bonusBalance: eur(bonusBalanceCents(db, userId)), freebetBalance: eur(freebetCents(db, userId)),
    active: bonuses.filter((b) => b.status === 'active'), bonuses, freebets, ledger: ledgerRows, firstBetUsed,
    spins, activeSpins: spins.find((s) => s.status === 'active') || null,
  };
}

export { DEPOSIT_KINDS, activeDepositBonus };
