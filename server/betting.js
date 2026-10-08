import { config } from './config.js';
import { nowIso } from './db.js';
import { HttpError } from './security.js';
import { legOutcome, resultCode, PERIOD_MARKETS } from './markets.js';
import { builderConflict, impliedLeg } from './featured.js';
import { fundBet, protects, settleFunds } from './promotions.js';
import { checkBet } from './limits.js';

export { resultCode };

/**
 * Payout for `stakeCents` at the product of the given odds (x100), floored and capped. A bet
 * builder (`factor` < 1) pays that product less the margin for its legs' correlation.
 */
export function payoutFor(stakeCents, oddsX100List, factor = 1) {
  const odds = oddsX100List.reduce((acc, o) => acc * (o / 100), 1) * factor;
  const raw = Math.floor(stakeCents * odds + 1e-6);
  return { totalOdds: Math.round(odds * 100) / 100, payoutCents: Math.min(raw, config.limits.maxPayoutCents) };
}

/**
 * Places one bet (multiple) or one bet per selection (single). Runs inside a transaction.
 * `picks` = [{ selectionId, odds }] where odds is the price the user saw; if any price moved the
 * whole slip is refused with 409 and the current prices, so the user can confirm them.
 */
export function placeBets(db, user, { mode, stakeCents, picks, freebetId = null }) {
  const { limits } = config;
  if (!['single', 'multiple', 'builder'].includes(mode)) throw new HttpError(400, 'Tipo de aposta inválido.');
  if (!Array.isArray(picks) || picks.length === 0) throw new HttpError(400, 'O boletim está vazio.');
  if (freebetId) {
    // A free bet: its own amount is the stake (whatever the page sent), on one bet only.
    const f = db.prepare("SELECT amount_cents FROM freebets WHERE id = ? AND user_id = ? AND status = 'active'").get(Number(freebetId), user.id);
    if (!f) throw new HttpError(400, 'Esta free bet já não está disponível.');
    if (mode === 'single' && picks.length > 1) throw new HttpError(400, 'Uma free bet vale para uma só aposta.');
    stakeCents = f.amount_cents;
  }
  if (picks.length > limits.maxSelections) throw new HttpError(400, `Máximo de ${limits.maxSelections} seleções.`);
  if (stakeCents < limits.minStakeCents) throw new HttpError(400, `Aposta mínima: €${(limits.minStakeCents / 100).toFixed(2)}.`);
  if (stakeCents > limits.maxStakeCents) throw new HttpError(400, `Aposta máxima: €${(limits.maxStakeCents / 100).toFixed(2)}.`);
  if (user.excluded_until && user.excluded_until > nowIso()) {
    throw new HttpError(403, 'A sua conta está em autoexclusão. Não é possível apostar.');
  }

  const ids = picks.map((p) => Number(p.selectionId));
  if (ids.some((id) => !Number.isInteger(id) || id <= 0)) throw new HttpError(400, 'Seleção inválida.');
  if (new Set(ids).size !== ids.length) throw new HttpError(400, 'Seleção repetida no boletim.');

  const getSel = db.prepare(
    `SELECT s.id, s.market, s.code, s.odds_x100, s.active, s.src, e.id AS event_id, e.status, e.start_time, e.home, e.away, e.source, e.live_odds_at, e.pl_live_at
       FROM selections s JOIN events e ON e.id = s.event_id WHERE s.id = ?`
  );
  const now = nowIso();
  const legs = [];
  const changes = [];
  for (const pick of picks) {
    const sel = getSel.get(Number(pick.selectionId));
    if (!sel) throw new HttpError(400, 'Seleção inexistente.');
    // Feed matches in play need a recent live price; manual events are the operator's call.
    // Each source vouches for its own in-play prices (PropLine: pl_live_at).
    const liveAt = sel.src === 'pl' ? sel.pl_live_at : sel.live_odds_at;
    const liveFresh = sel.source === 'manual'
      || (liveAt && Date.now() - new Date(liveAt).getTime() <= config.liveOddsMaxAgeSeconds * 1000);
    const open = (sel.status === 'live' && liveFresh) || (sel.status === 'scheduled' && sel.start_time > now);
    if (!open || !sel.active) {
      throw new HttpError(409, `Mercado fechado: ${sel.home} vs ${sel.away}.`, { closed: [sel.id] });
    }
    if (Math.round(Number(pick.odds) * 100) !== sel.odds_x100) {
      changes.push({ selectionId: sel.id, odds: sel.odds_x100 / 100 });
    }
    legs.push(sel);
  }
  if (changes.length) throw new HttpError(409, 'As odds foram alteradas. Confirme as novas odds.', { changes });

  if (mode === 'multiple') {
    if (legs.length < 2) throw new HttpError(400, 'Uma múltipla precisa de pelo menos 2 seleções.');
    if (new Set(legs.map((l) => l.event_id)).size !== legs.length) {
      throw new HttpError(400, 'Múltipla: apenas uma seleção por jogo.');
    }
  }

  if (mode === 'builder') {
    // Several picks on one match, priced together.
    if (legs.length < 2 || legs.length > 4) throw new HttpError(400, 'O criador de apostas leva 2 a 4 seleções.');
    if (new Set(legs.map((l) => l.event_id)).size !== 1) throw new HttpError(400, 'Criador de apostas: todas as seleções do mesmo jogo.');
    if (legs[0].status !== 'scheduled') throw new HttpError(409, 'O criador de apostas é só antes do jogo.');
    const conflict = builderConflict(legs);
    if (conflict) throw new HttpError(400, conflict);
  }

  const factor = mode === 'builder' ? config.builderFactor : 1;
  const slips = mode === 'single' ? legs.map((l) => [l]) : [legs];
  const insertBet = db.prepare(
    `INSERT INTO bets (user_id, type, stake_cents, total_odds, potential_cents, created_at) VALUES (?, ?, ?, ?, ?, ?)`
  );
  const setFunding = db.prepare('UPDATE bets SET real_stake_cents = ?, bonus_stake_cents = ?, freebet_stake_cents = ?, bonus_id = ?, freebet_id = ?, protected = ? WHERE id = ?');
  const label = mode === 'multiple' ? `Aposta múltipla (${legs.length} seleções)` : mode === 'builder' ? `Criador de apostas (${legs.length} seleções)` : 'Aposta simples';
  const insertLeg = db.prepare(
    `INSERT INTO bet_legs (bet_id, event_id, selection_id, market, code, odds_x100) VALUES (?, ?, ?, ?, ?, ?)`
  );
  const betIds = [];
  for (const slipLegs of slips) {
    // A builder leg another leg makes certain (double chance covering the result) counts as 1.00.
    const prices = slipLegs.map((l) => (mode === 'builder' && impliedLeg(l, slipLegs) ? 100 : l.odds_x100));
    const { totalOdds, payoutCents } = payoutFor(stakeCents, prices, factor);
    // The player's own limits (stake, weekly loss), on the real money this bet would spend.
    if (!freebetId) {
      const balance = db.prepare('SELECT balance_cents FROM users WHERE id = ?').get(user.id).balance_cents;
      checkBet(db, user, { stakeCents, realCents: Math.min(balance, stakeCents) });
    }
    const { lastInsertRowid } = insertBet.run(user.id, mode, stakeCents, totalOdds, payoutCents, now);
    const betId = Number(lastInsertRowid);
    for (const l of slipLegs) insertLeg.run(betId, l.event_id, l.id, l.market, l.code, l.odds_x100);
    // Paid with a free bet, or real money first and the bonus for the rest (a short balance rolls everything back).
    const fund = fundBet(db, user, { betId, stakeCents, totalOdds, freebetId, label });
    const isProtected = !freebetId && protects(db, user, { realCents: fund.real, stakeCents, totalOdds });
    setFunding.run(fund.real, fund.bonus, fund.freebet, fund.bonusId, fund.freebetId, isProtected ? 1 : 0, betId);
    betIds.push(betId);
  }
  return betIds;
}

/** The margin a builder bet was priced with: its total odds over the product of its legs (implied legs included). */
function builderFactorOf(bet, legs) {
  const product = legs.reduce((a, l) => a * (l.odds_x100 / 100), 1);
  return product > 0 ? Math.min(1, bet.total_odds / product) : 1;
}

/**
 * Decides a bet once its legs allow it and pays winnings/refunds. Runs inside a transaction.
 * Returns the amount credited (cents): winnings, a refund, or 0.
 */
export function settleBet(db, betId) {
  const bet = db.prepare('SELECT * FROM bets WHERE id = ?').get(betId);
  if (!bet || bet.status !== 'open') return 0;
  const legs = db.prepare('SELECT status, odds_x100 FROM bet_legs WHERE bet_id = ?').all(betId);
  const now = nowIso();

  // Paid from (and back to) where the stake came from: real money, bonus or free bet (promotions.js).
  if (legs.some((l) => l.status === 'lost')) {
    db.prepare("UPDATE bets SET status = 'lost', settled_at = ? WHERE id = ?").run(now, betId);
    settleFunds(db, { ...bet, status: 'lost', settled_at: now }, 'lost');
    return 0;
  }
  if (legs.some((l) => l.status === 'open')) return 0;

  const won = legs.filter((l) => l.status === 'won');
  if (won.length === 0) {
    db.prepare("UPDATE bets SET status = 'void', payout_cents = ?, settled_at = ? WHERE id = ?")
      .run(bet.stake_cents - (bet.freebet_stake_cents || 0), now, betId);
    return settleFunds(db, bet, 'void');
  }
  // Void legs count as odds 1.00, so the payout uses only the winning legs (a builder keeps its margin).
  const { payoutCents } = payoutFor(bet.stake_cents, won.map((l) => l.odds_x100), bet.type === 'builder' ? builderFactorOf(bet, legs) : 1);
  // A free bet pays only its winnings (the stake was not the player's).
  const paid = bet.freebet_stake_cents ? Math.max(0, payoutCents - bet.freebet_stake_cents) : payoutCents;
  db.prepare("UPDATE bets SET status = 'won', payout_cents = ?, settled_at = ? WHERE id = ?").run(paid, now, betId);
  settleFunds(db, bet, 'won', payoutCents);
  return paid;
}

/**
 * Settles every open leg on an event that is finished (by result, per market) or cancelled (void),
 * and records it in the settlements log. Runs inside a transaction. Returns the bets touched.
 * `source` says who triggered it: 'feed' (provider result), 'admin' or 'engine' (automatic rules).
 */
const parsePeriodScores = (v) => { try { const p = JSON.parse(v || 'null'); return Array.isArray(p) ? p : null; } catch { return null; } };

export function settleEvent(db, eventId, { source = 'engine', userId = null, note = null } = {}) {
  const ev = db.prepare('SELECT status, home_score, away_score, reg_home_score, reg_away_score, home_games, away_games, retired, period_scores FROM events WHERE id = ?').get(eventId);
  if (!ev || (ev.status !== 'finished' && ev.status !== 'cancelled')) return 0;
  const legs = db.prepare("SELECT id, bet_id, market, code FROM bet_legs WHERE event_id = ? AND status = 'open'").all(eventId);
  const setLeg = db.prepare('UPDATE bet_legs SET status = ? WHERE id = ?');
  for (const leg of legs) {
    // Regulation-time markets use the regulation score where the sport has one (ice hockey).
    const reg = leg.market !== 'ml' && ev.reg_home_score !== null && ev.reg_away_score !== null;
    // After a retirement only the winner stands; totals and handicaps are void.
    // (period markets: a set completed before the retirement stands, the others are void)
    const status = ev.status === 'cancelled' || (ev.retired && !['1x2', 'ml'].includes(leg.market) && !PERIOD_MARKETS.has(leg.market)) ? 'void'
      : legOutcome(leg.market, leg.code, reg ? ev.reg_home_score : ev.home_score, reg ? ev.reg_away_score : ev.away_score,
        { homeGames: ev.home_games, awayGames: ev.away_games, periods: parsePeriodScores(ev.period_scores) });
    setLeg.run(status, leg.id);
  }
  const betIds = [...new Set(legs.map((l) => l.bet_id))];
  let payoutCents = 0;
  for (const id of betIds) payoutCents += settleBet(db, id);
  db.prepare(
    `INSERT INTO settlements (event_id, action, home_score, away_score, bets_settled, payout_cents, source, user_id, note, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(eventId, ev.status === 'cancelled' ? 'void' : 'result', ev.status === 'cancelled' ? null : ev.home_score,
    ev.status === 'cancelled' ? null : ev.away_score, betIds.length, payoutCents, source, userId, note, nowIso());
  return betIds.length;
}
