// Bringing the players of the previous platform (Bet62Novo, PostgreSQL) into this one, once: their
// accounts (the same password: its bcrypt hash is kept until they sign in), real balance, free
// bets, identity documents and verification, and their withdrawals (the pending ones stay pending).
// Bet62Novo is only read. A dry run does everything and then undoes it, so its report shows what
// the import will do. A second run skips the players already brought (and any e-mail already here).

import { nowIso } from './db.js';
import { postTransaction } from './wallet.js';
import { grantFreebet } from './promotions.js';

const cents = (v) => Math.round(Number(v || 0) * 100);
const iso = (v) => (v ? new Date(v).toISOString() : null);
const KYC = new Set(['not_submitted', 'pending', 'approved', 'rejected']);
const OPEN_WD = new Set(['pending_review', 'processing', 'withdrawal_hold', 'pending']);
const PAID_WD = new Set(['approved', 'paid', 'completed']);

/**
 * `pg`: { query(sql, params) → { rows } } on Bet62Novo's database. Returns the report:
 * { dryRun, players, imported, skipped: [...], balance, freebets, documents, withdrawals, pendingBets }.
 */
export async function importNovo(db, pg, { dryRun = true } = {}) {
  const q = async (sql, params = []) => (await pg.query(sql, params)).rows;
  const users = await q(`SELECT id, name, email, password_hash, balance, freebet_balance, nif, withdrawal_iban, withdrawal_name,
    self_excluded_until, kyc_status, created_at FROM users ORDER BY id`);
  // Who had won a bet after their last completed deposit (they may withdraw here too).
  const canWithdraw = new Set((await q(`SELECT u.id FROM users u WHERE EXISTS (SELECT 1 FROM bets b WHERE b.user_id = u.id AND b.status = 'won'
    AND b.created_at > COALESCE((SELECT MAX(COALESCE(p.confirmed_at, p.created_at)) FROM payments p WHERE p.user_id = u.id AND p.status = 'completed'), 'epoch'::timestamptz))`)).map((r) => r.id));
  const docs = await q(`SELECT user_id, kind, file_name, mime_type, file_size, file_data, status, created_at FROM kyc_documents
    WHERE file_data IS NOT NULL ORDER BY id`);
  const wds = await q('SELECT user_id, amount, iban, status, created_at, reviewed_at FROM withdrawals ORDER BY id');
  const pendingBets = Number((await q("SELECT COUNT(*)::int AS n FROM bets WHERE status = 'pending'"))[0]?.n || 0);

  const report = { dryRun, players: users.length, imported: 0, alreadyImported: 0, skipped: [], balance: 0, freebets: 0, documents: 0, withdrawals: 0, pendingWithdrawals: 0, pendingBets };
  const byNovo = new Map();
  db.exec('BEGIN');
  try {
    for (const u of users) {
      const email = String(u.email || '').trim().toLowerCase();
      if (db.prepare('SELECT 1 FROM users WHERE novo_id = ?').get(u.id)) { report.alreadyImported += 1; continue; }
      if (!email || db.prepare('SELECT 1 FROM users WHERE email = ?').get(email)) { report.skipped.push({ id: u.id, email, reason: 'email já existe aqui' }); continue; }
      if (!u.password_hash) { report.skipped.push({ id: u.id, email, reason: 'sem palavra-passe' }); continue; }
      const kyc = KYC.has(u.kyc_status) ? u.kyc_status : 'not_submitted';
      const { lastInsertRowid } = db.prepare(`INSERT INTO users (email, name, birthdate, password_hash, excluded_until, created_at, kyc_status, nif, iban, iban_name, novo_id, novo_can_withdraw)
        VALUES (?, ?, '', ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(email, String(u.name || email).slice(0, 120), u.password_hash, iso(u.self_excluded_until),
        iso(u.created_at) || nowIso(), kyc, u.nif || null, u.withdrawal_iban || null, u.withdrawal_name || null, u.id, canWithdraw.has(u.id) ? 1 : 0);
      const id = Number(lastInsertRowid);
      byNovo.set(u.id, id);
      const bal = cents(u.balance);
      if (bal > 0) postTransaction(db, id, bal, 'admin_credit', 'Saldo transferido da plataforma anterior (Bet62)', `novo:${u.id}`);
      const fb = cents(u.freebet_balance);
      if (fb > 0) grantFreebet(db, id, { amountCents: fb, source: 'migration', ref: `novo:${u.id}`, validityDays: 30, description: 'Free bet transferida da plataforma anterior' });
      report.imported += 1;
      report.balance += bal;
      report.freebets += fb;
    }
    for (const d of docs) {
      const id = byNovo.get(d.user_id);
      if (!id) continue;
      const data = Buffer.isBuffer(d.file_data) ? d.file_data : Buffer.from(d.file_data);
      db.prepare(`INSERT INTO kyc_documents (user_id, kind, file_name, mime_type, file_size, data, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(id, String(d.kind || 'Documento'), String(d.file_name || 'documento'), String(d.mime_type || 'application/octet-stream'), data.length, data,
          ['pending', 'approved', 'rejected'].includes(d.status) ? d.status : 'pending', iso(d.created_at) || nowIso());
      report.documents += 1;
    }
    // Withdrawals: their history, and the ones still waiting (already off the balance there, so not taken again).
    for (const w of wds) {
      const id = byNovo.get(w.user_id);
      if (!id) continue;
      const open = OPEN_WD.has(w.status);
      const status = open ? 'pending' : PAID_WD.has(w.status) ? 'approved' : 'rejected';
      db.prepare('INSERT INTO withdrawals (user_id, amount_cents, iban, status, created_at, decided_at) VALUES (?, ?, ?, ?, ?, ?)')
        .run(id, cents(w.amount), String(w.iban || ''), status, iso(w.created_at) || nowIso(), open ? null : iso(w.reviewed_at) || iso(w.created_at));
      report.withdrawals += 1;
      if (open) report.pendingWithdrawals += 1;
    }
    db.exec(dryRun ? 'ROLLBACK' : 'COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
  report.balance /= 100;
  report.freebets /= 100;
  return report;
}

/** A connection to Bet62Novo's database (its public URL), SSL first, plain when the server has none. */
export async function connectNovo(url) {
  const { default: pgLib } = await import('pg');
  const tryWith = async (ssl) => {
    const c = new pgLib.Client({ connectionString: url, ssl, connectionTimeoutMillis: 10_000, statement_timeout: 120_000 });
    await c.connect();
    return c;
  };
  try { return await tryWith({ rejectUnauthorized: false }); } catch (err) {
    if (!/ssl/i.test(String(err.message))) throw err;
    return tryWith(false);
  }
}
