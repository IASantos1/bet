// Cash out: the player closes an open bet now, for what it is worth at the current prices.
//
//   value = stake × (odds taken on every leg) / (current odds of the legs still open) × factor
//
// A leg already won counts at its odds (no current price needed), a void leg at 1.00; the factor is
// the house margin (config.cashout.factor). Offered on real-money singles and multiples only (not on
// free bets, bonus money or bet builders), while every open leg has an open, current price — in
// play only with a fresh live price, as for placing a bet. The amount is always worked out here; the
// page sends the amount it showed only so a changed price is confirmed first (like changed odds).
import { config } from './config.js';
import { nowIso } from './db.js';
import { HttpError } from './security.js';
import { postTransaction } from './wallet.js';

const legsOf = (db, betId) => db.prepare(
  `SELECT l.status AS leg_status, l.odds_x100 AS taken, s.odds_x100 AS now, s.active, s.src,
          e.status AS ev_status, e.start_time, e.source, e.live_odds_at, e.pl_live_at
     FROM bet_legs l JOIN selections s ON s.id = l.selection_id JOIN events e ON e.id = l.event_id WHERE l.bet_id = ?`
).all(betId);

/** { status: 'available' | 'suspended' | 'unavailable', valueCents?, reason? } for one bet. */
export function cashoutOffer(db, bet, { now = Date.now() } = {}) {
  const c = config.cashout;
  if (!c.enabled) return { status: 'unavailable', reason: 'Cash out desligado' };
  if (bet.status !== 'open') return { status: 'unavailable', reason: 'Aposta resolvida' };
  if (bet.type === 'builder') return { status: 'unavailable', reason: 'Indisponível no criador de apostas' };
  if (bet.freebet_stake_cents || bet.bonus_stake_cents) return { status: 'unavailable', reason: 'Indisponível em free bets e saldo de bónus' };
  const legs = legsOf(db, bet.id);
  if (!legs.length || legs.some((l) => l.leg_status === 'lost')) return { status: 'unavailable', reason: 'Seleção perdida' };
  let taken = 1;
  let current = 1;
  for (const l of legs) {
    if (l.leg_status === 'void') continue;
    taken *= l.taken / 100;
    if (l.leg_status === 'won') continue;
    // An open leg needs an open price now: before the start, or in play with a fresh live price.
    const liveAt = l.src === 'pl' ? l.pl_live_at : l.live_odds_at;
    const liveFresh = l.source === 'manual' || (liveAt && now - new Date(liveAt).getTime() <= config.liveOddsMaxAgeSeconds * 1000);
    const open = (l.ev_status === 'live' && liveFresh) || (l.ev_status === 'scheduled' && new Date(l.start_time).getTime() > now);
    if (!open || !l.active) return { status: 'suspended', reason: 'Mercado suspenso' };
    current *= l.now / 100;
  }
  const value = Math.min(bet.potential_cents, Math.floor(bet.stake_cents * (taken / current) * c.factor));
  if (value < c.minCents) return { status: 'unavailable', reason: 'Valor demasiado baixo' };
  return { status: 'available', valueCents: value };
}

/**
 * Cashes a bet out (inside a transaction). `seenCents` is the amount the player accepted; if the
 * value moved, nothing is done and the new offer comes back (409) to be confirmed.
 */
export function cashOut(db, userId, betId, seenCents) {
  const bet = db.prepare('SELECT * FROM bets WHERE id = ? AND user_id = ?').get(Number(betId), userId);
  if (!bet) throw new HttpError(404, 'Aposta não encontrada.');
  const offer = cashoutOffer(db, bet);
  if (offer.status !== 'available') throw new HttpError(409, `Cash out ${offer.status === 'suspended' ? 'suspenso' : 'indisponível'}: ${offer.reason}.`, { cashout: offerView(offer) });
  if (Math.abs(offer.valueCents - Number(seenCents)) > 1) {
    throw new HttpError(409, 'O valor do cash out mudou. Confirme o novo valor.', { cashout: offerView(offer) });
  }
  const r = db.prepare("UPDATE bets SET status = 'cashout', payout_cents = ?, real_payout_cents = ?, settled_at = ? WHERE id = ? AND status = 'open'")
    .run(offer.valueCents, offer.valueCents, nowIso(), bet.id);
  if (!r.changes) throw new HttpError(409, 'Esta aposta já foi resolvida.');
  const balance = postTransaction(db, userId, offer.valueCents, 'cashout', `Cash out da aposta #${bet.id}`, `bet:${bet.id}`);
  return { valueCents: offer.valueCents, balance };
}

export const offerView = (o) => ({ status: o.status, value: o.valueCents ? o.valueCents / 100 : null, reason: o.reason || null });
