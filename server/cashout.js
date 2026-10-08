// Cash out: the player closes an open bet now, for what it is worth at the current prices.
//
//   fair  = stake × (odds taken on every leg) / (current odds of the legs still open)
//   value = fair × factor (the house margin), never above the bet's potential return nor the cap
//
// A leg already won counts at its odds (no current price needed), a void leg at 1.00.
//
// Rules (Admin → Apostas → Cash out; saved in the settings table):
//   · on/off for everything, and separately before the start and in play;
//   · only real-money singles and multiples (not free bets, bonus money or bet builders);
//   · never in the first `minAgeSeconds` after the bet is placed (no cash out on a stale price);
//   · every open leg needs an open price: before the start, or in play with a live price newer than
//     the last score change and at least `goalLockSeconds` after it (no cash out around a goal);
//   · in play the request waits `liveDelaySeconds` and the value is worked out again (as bets in
//     play are delayed): if it went down, the player confirms the new value; if not, the value the
//     player accepted is paid;
//   · between `minValue` and `maxValue` (null = no cap other than the potential return);
//   · one request per bet at a time; paid once (the bet row changes from open to cashout in the
//     same transaction as the payment), audited in the cashouts table; no rollover, no promotions.
import { config } from './config.js';
import { nowIso, getSetting, setSetting } from './db.js';
import { HttpError } from './security.js';
import { postTransaction } from './wallet.js';

export const CASHOUT_DEFAULTS = {
  enabled: config.cashout.enabled, prematch: true, live: true, factor: config.cashout.factor,
  minAgeSeconds: 30, liveDelaySeconds: 5, goalLockSeconds: 30, minValue: 0.1, maxValue: null,
};

export const cashoutConfig = (db) => ({ ...CASHOUT_DEFAULTS, ...(getSetting(db, 'cashout.config', {}) || {}) });

const LIMITS = { factor: [0.5, 1], minAgeSeconds: [0, 3600], liveDelaySeconds: [0, 30], goalLockSeconds: [0, 600], minValue: [0, 10_000], maxValue: [1, 1_000_000, true] };
export function saveCashoutConfig(db, input) {
  const c = cashoutConfig(db);
  for (const k of ['enabled', 'prematch', 'live']) if (input?.[k] !== undefined) c[k] = !!input[k];
  for (const [k, [min, max, nullable]] of Object.entries(LIMITS)) {
    const v = input?.[k];
    if (v === undefined) continue;
    if ((v === null || v === '') && nullable) { c[k] = null; continue; }
    const n = Number(v);
    if (!Number.isFinite(n) || n < min || n > max) throw new HttpError(400, `Cash out: valor inválido em ${k}.`);
    c[k] = n;
  }
  setSetting(db, 'cashout.config', c);
  return c;
}

const legsOf = (db, betId) => db.prepare(
  `SELECT l.status AS leg_status, l.odds_x100 AS taken, s.odds_x100 AS now, s.active, s.src,
          e.status AS ev_status, e.start_time, e.source, e.live_odds_at, e.pl_live_at, e.score_at
     FROM bet_legs l JOIN selections s ON s.id = l.selection_id JOIN events e ON e.id = l.event_id WHERE l.bet_id = ?`
).all(betId);

/** { status: 'available' | 'suspended' | 'unavailable', valueCents?, fairCents?, live?, reason? } for one bet. */
export function cashoutOffer(db, bet, { now = Date.now(), cfg = cashoutConfig(db) } = {}) {
  if (!cfg.enabled) return { status: 'unavailable', reason: 'Cash out desligado' };
  if (bet.status !== 'open') return { status: 'unavailable', reason: 'Aposta resolvida' };
  if (bet.type === 'builder') return { status: 'unavailable', reason: 'Indisponível no criador de apostas' };
  if (bet.freebet_stake_cents || bet.bonus_stake_cents) return { status: 'unavailable', reason: 'Indisponível em free bets e saldo de bónus' };
  const legs = legsOf(db, bet.id);
  if (!legs.length || legs.some((l) => l.leg_status === 'lost')) return { status: 'unavailable', reason: 'Seleção perdida' };
  const age = (now - new Date(bet.created_at).getTime()) / 1000;
  if (age < cfg.minAgeSeconds) return { status: 'suspended', reason: `Disponível ${Math.ceil(cfg.minAgeSeconds - age)} s depois de apostar` };
  let taken = 1;
  let current = 1;
  let live = false;
  for (const l of legs) {
    if (l.leg_status === 'void') continue;
    taken *= l.taken / 100;
    if (l.leg_status === 'won') continue;
    if (!l.active || !(l.now > 100)) return { status: 'suspended', reason: 'Mercado suspenso' };
    if (l.ev_status === 'scheduled' && new Date(l.start_time).getTime() > now) {
      if (!cfg.prematch) return { status: 'unavailable', reason: 'Cash out só ao vivo' };
    } else if (l.ev_status === 'live') {
      if (!cfg.live) return { status: 'unavailable', reason: 'Cash out indisponível ao vivo' };
      live = true;
      if (l.source !== 'manual') {
        const liveAt = new Date((l.src === 'pl' ? l.pl_live_at : l.live_odds_at) || 0).getTime();
        const scoreAt = l.score_at ? new Date(l.score_at).getTime() : 0;
        if (now - liveAt > config.liveOddsMaxAgeSeconds * 1000) return { status: 'suspended', reason: 'Mercado suspenso' };
        // Around a goal / point: suspended until a price newer than the score arrives and the lock passes.
        if (scoreAt && (liveAt <= scoreAt || now - scoreAt < cfg.goalLockSeconds * 1000)) return { status: 'suspended', reason: 'Lance em revisão' };
      }
    } else {
      // Started but not in play yet, finished or cancelled and not settled: the result is near or known.
      return { status: 'suspended', reason: l.ev_status === 'scheduled' ? 'Jogo a começar' : 'A aguardar resultado' };
    }
    current *= l.now / 100;
  }
  const fair = Math.floor(bet.stake_cents * (taken / current));
  let value = Math.min(bet.potential_cents, Math.floor(fair * cfg.factor));
  if (cfg.maxValue) value = Math.min(value, Math.round(cfg.maxValue * 100));
  if (value < Math.round(cfg.minValue * 100)) return { status: 'unavailable', reason: 'Valor demasiado baixo' };
  return { status: 'available', valueCents: value, fairCents: fair, live };
}

export const offerView = (o) => ({ status: o.status, value: o.valueCents ? o.valueCents / 100 : null, reason: o.reason || null, live: !!o.live });

/** Bets with a cash-out request in progress (one at a time per bet, while the live delay runs). */
export const pending = new Set();

/** First check, before any delay: the offer exists and the player saw it. Returns the offer. */
export function precheck(db, userId, betId) {
  const bet = db.prepare('SELECT * FROM bets WHERE id = ? AND user_id = ?').get(Number(betId), userId);
  if (!bet) throw new HttpError(404, 'Aposta não encontrada.');
  const offer = cashoutOffer(db, bet);
  if (offer.status !== 'available') throw new HttpError(409, `Cash out ${offer.status === 'suspended' ? 'suspenso' : 'indisponível'}: ${offer.reason}.`, { cashout: offerView(offer) });
  return offer;
}

/**
 * Cashes a bet out (inside a transaction), after the delay. `seenCents` is the amount the player
 * accepted: a lower value now is refused (409, with the new offer); otherwise the accepted amount is paid.
 */
export function cashOut(db, userId, betId, seenCents) {
  const bet = db.prepare('SELECT * FROM bets WHERE id = ? AND user_id = ?').get(Number(betId), userId);
  if (!bet) throw new HttpError(404, 'Aposta não encontrada.');
  const offer = cashoutOffer(db, bet);
  if (offer.status !== 'available') throw new HttpError(409, `Cash out ${offer.status === 'suspended' ? 'suspenso' : 'indisponível'}: ${offer.reason}.`, { cashout: offerView(offer) });
  const seen = Math.round(Number(seenCents));
  if (!Number.isFinite(seen) || seen <= 0 || offer.valueCents < seen - 1) {
    throw new HttpError(409, 'O valor do cash out mudou. Confirme o novo valor.', { cashout: offerView(offer) });
  }
  const pay = Math.min(seen, offer.valueCents);
  const r = db.prepare("UPDATE bets SET status = 'cashout', payout_cents = ?, real_payout_cents = ?, settled_at = ? WHERE id = ? AND status = 'open'")
    .run(pay, pay, nowIso(), bet.id);
  if (!r.changes) throw new HttpError(409, 'Esta aposta já foi resolvida.');
  db.prepare('INSERT INTO cashouts (bet_id, user_id, stake_cents, value_cents, fair_cents, seen_cents, live, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .run(bet.id, userId, bet.stake_cents, pay, offer.fairCents, seen, offer.live ? 1 : 0, nowIso());
  const balance = postTransaction(db, userId, pay, 'cashout', `Cash out da aposta #${bet.id}`, `bet:${bet.id}`);
  return { valueCents: pay, balance };
}
