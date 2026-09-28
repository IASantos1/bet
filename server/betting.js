import { config } from './config.js';
import { nowIso } from './db.js';
import { HttpError } from './security.js';
import { postTransaction } from './wallet.js';

export const resultCode = (home, away) => (home > away ? '1' : home < away ? '2' : 'X');

/** Payout for `stakeCents` at the product of the given odds (x100), floored and capped. */
export function payoutFor(stakeCents, oddsX100List) {
  const odds = oddsX100List.reduce((acc, o) => acc * (o / 100), 1);
  const raw = Math.floor(stakeCents * odds + 1e-6);
  return { totalOdds: Math.round(odds * 100) / 100, payoutCents: Math.min(raw, config.limits.maxPayoutCents) };
}

/**
 * Places one bet (multiple) or one bet per selection (single). Runs inside a transaction.
 * `picks` = [{ selectionId, odds }] where odds is the price the user saw; if any price moved the
 * whole slip is refused with 409 and the current prices, so the user can confirm them.
 */
export function placeBets(db, user, { mode, stakeCents, picks }) {
  const { limits } = config;
  if (mode !== 'single' && mode !== 'multiple') throw new HttpError(400, 'Tipo de aposta inválido.');
  if (!Array.isArray(picks) || picks.length === 0) throw new HttpError(400, 'O boletim está vazio.');
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
    `SELECT s.id, s.code, s.odds_x100, s.active, e.id AS event_id, e.status, e.start_time, e.home, e.away
       FROM selections s JOIN events e ON e.id = s.event_id WHERE s.id = ?`
  );
  const now = nowIso();
  const legs = [];
  const changes = [];
  for (const pick of picks) {
    const sel = getSel.get(Number(pick.selectionId));
    if (!sel) throw new HttpError(400, 'Seleção inexistente.');
    const open = sel.status === 'live' || (sel.status === 'scheduled' && sel.start_time > now);
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

  const slips = mode === 'multiple' ? [legs] : legs.map((l) => [l]);
  const insertBet = db.prepare(
    `INSERT INTO bets (user_id, type, stake_cents, total_odds, potential_cents, created_at) VALUES (?, ?, ?, ?, ?, ?)`
  );
  const insertLeg = db.prepare(
    `INSERT INTO bet_legs (bet_id, event_id, selection_id, code, odds_x100) VALUES (?, ?, ?, ?, ?)`
  );
  const betIds = [];
  for (const slipLegs of slips) {
    const { totalOdds, payoutCents } = payoutFor(stakeCents, slipLegs.map((l) => l.odds_x100));
    const { lastInsertRowid } = insertBet.run(user.id, mode, stakeCents, totalOdds, payoutCents, now);
    const betId = Number(lastInsertRowid);
    for (const l of slipLegs) insertLeg.run(betId, l.event_id, l.id, l.code, l.odds_x100);
    betIds.push(betId);
  }
  // Debit last so the ledger entry can reference the bets; a short balance rolls everything back.
  postTransaction(db, user.id, -stakeCents * slips.length, 'bet',
    mode === 'multiple' ? `Aposta múltipla (${legs.length} seleções)` : `Aposta simples ×${slips.length}`,
    `bet:${betIds.join(',')}`);
  return betIds;
}

/** Decides a bet once its legs allow it and pays winnings/refunds. Runs inside a transaction. */
export function settleBet(db, betId) {
  const bet = db.prepare('SELECT * FROM bets WHERE id = ?').get(betId);
  if (!bet || bet.status !== 'open') return;
  const legs = db.prepare('SELECT status, odds_x100 FROM bet_legs WHERE bet_id = ?').all(betId);
  const now = nowIso();

  if (legs.some((l) => l.status === 'lost')) {
    db.prepare("UPDATE bets SET status = 'lost', settled_at = ? WHERE id = ?").run(now, betId);
    return;
  }
  if (legs.some((l) => l.status === 'open')) return;

  const won = legs.filter((l) => l.status === 'won');
  if (won.length === 0) {
    db.prepare("UPDATE bets SET status = 'void', payout_cents = ?, settled_at = ? WHERE id = ?")
      .run(bet.stake_cents, now, betId);
    postTransaction(db, bet.user_id, bet.stake_cents, 'refund', `Aposta #${betId} anulada — reembolso`, `bet:${betId}`);
    return;
  }
  // Void legs count as odds 1.00, so the payout uses only the winning legs.
  const { payoutCents } = payoutFor(bet.stake_cents, won.map((l) => l.odds_x100));
  db.prepare("UPDATE bets SET status = 'won', payout_cents = ?, settled_at = ? WHERE id = ?").run(payoutCents, now, betId);
  postTransaction(db, bet.user_id, payoutCents, 'payout', `Aposta #${betId} ganha`, `bet:${betId}`);
}

/** Settles every open leg on an event that is finished (by result) or cancelled (void). */
export function settleEvent(db, eventId) {
  const ev = db.prepare('SELECT status, result FROM events WHERE id = ?').get(eventId);
  if (!ev || (ev.status !== 'finished' && ev.status !== 'cancelled')) return 0;
  const legs = db.prepare("SELECT id, bet_id, code FROM bet_legs WHERE event_id = ? AND status = 'open'").all(eventId);
  const setLeg = db.prepare('UPDATE bet_legs SET status = ? WHERE id = ?');
  for (const leg of legs) {
    const status = ev.status === 'cancelled' ? 'void' : leg.code === ev.result ? 'won' : 'lost';
    setLeg.run(status, leg.id);
  }
  const betIds = [...new Set(legs.map((l) => l.bet_id))];
  for (const id of betIds) settleBet(db, id);
  return betIds.length;
}
