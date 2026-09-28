import { HttpError } from './security.js';
import { nowIso } from './db.js';

/**
 * Applies a signed amount to a user's balance and records it in the ledger.
 * Must run inside a transaction (see db.tx). Throws 400 if the balance would go negative.
 */
export function postTransaction(db, userId, amountCents, type, description, ref = null) {
  const user = db.prepare('SELECT balance_cents FROM users WHERE id = ?').get(userId);
  if (!user) throw new HttpError(404, 'Utilizador não encontrado.');
  const balance = user.balance_cents + amountCents;
  if (balance < 0) throw new HttpError(400, 'Saldo insuficiente.');
  db.prepare('UPDATE users SET balance_cents = ? WHERE id = ?').run(balance, userId);
  db.prepare(
    `INSERT INTO transactions (user_id, type, amount_cents, balance_after_cents, description, ref, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(userId, type, amountCents, balance, description, ref, nowIso());
  return balance;
}
