import { test } from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';
import { openDb } from '../server/db.js';
import { seed } from '../server/seed.js';
import { createApp } from '../server/app.js';
import { importNovo } from '../server/importnovo.js';
import { withdrawEligibility } from '../server/withdrawrules.js';

const hash = bcrypt.hashSync('segredo-antigo', 4);
const fakeNovo = () => ({
  query: async (sql) => {
    if (/FROM users ORDER BY id/.test(sql)) {
      return { rows: [
        { id: 7, name: 'Maria Costa', email: 'Maria@Example.com', password_hash: hash, balance: '25.50', freebet_balance: '5.00', nif: '123456789',
          withdrawal_iban: 'PT50000201231234567890154', withdrawal_name: 'Maria Costa', self_excluded_until: null, kyc_status: 'approved', created_at: new Date('2026-09-01') },
        { id: 8, name: 'Rui', email: 'rui@example.com', password_hash: hash, balance: '0.00', freebet_balance: '0.00', kyc_status: 'pending', created_at: new Date('2026-09-02') },
        { id: 9, name: 'Já cá', email: 'admin@classicbet.local', password_hash: hash, balance: '10.00', freebet_balance: '0', kyc_status: 'not_submitted', created_at: new Date() },
      ] };
    }
    if (/SELECT u\.id FROM users u WHERE EXISTS/.test(sql)) return { rows: [{ id: 7 }] };
    if (/FROM kyc_documents/.test(sql)) return { rows: [{ user_id: 7, kind: 'Documento (frente)', file_name: 'cc.png', mime_type: 'image/png', file_size: 3, file_data: Buffer.from('abc'), status: 'approved', created_at: new Date() }] };
    if (/FROM withdrawals/.test(sql)) {
      return { rows: [
        { user_id: 7, amount: '40.00', iban: 'PT50000201231234567890154', status: 'approved', created_at: new Date('2026-09-10'), reviewed_at: new Date('2026-09-11') },
        { user_id: 8, amount: '20.00', iban: 'PT50000201231234567890154', status: 'pending_review', created_at: new Date('2026-10-09') },
      ] };
    }
    if (/FROM bets WHERE status = 'pending'/.test(sql)) return { rows: [{ n: 2 }] };
    throw new Error(`unexpected query ${sql}`);
  },
});

test('Bet62Novo import: a dry run reports and writes nothing; the import brings accounts, balance, free bets, KYC and withdrawals once', async () => {
  const db = openDb(':memory:');
  seed(db);
  const users = () => db.prepare('SELECT COUNT(*) AS n FROM users').get().n;
  const before = users();
  const dry = await importNovo(db, fakeNovo(), { dryRun: true });
  assert.deepEqual([dry.players, dry.imported, dry.balance, dry.freebets, dry.documents, dry.withdrawals, dry.pendingWithdrawals, dry.pendingBets], [3, 2, 25.5, 5, 1, 2, 1, 2]);
  assert.deepEqual(dry.skipped.map((s) => s.email), ['admin@classicbet.local']);
  assert.equal(users(), before); // nothing kept
  const real = await importNovo(db, fakeNovo(), { dryRun: false });
  assert.equal(real.imported, 2);
  const maria = db.prepare("SELECT * FROM users WHERE email = 'maria@example.com'").get();
  assert.deepEqual([maria.balance_cents, maria.kyc_status, maria.novo_id, maria.novo_can_withdraw, maria.iban], [2550, 'approved', 7, 1, 'PT50000201231234567890154']);
  assert.equal(db.prepare('SELECT SUM(amount_cents) AS s FROM freebets WHERE user_id = ?').get(maria.id).s, 500);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM kyc_documents WHERE user_id = ?').get(maria.id).n, 1);
  const rui = db.prepare("SELECT id FROM users WHERE email = 'rui@example.com'").get();
  assert.equal(db.prepare("SELECT status FROM withdrawals WHERE user_id = ?").get(rui.id).status, 'pending');
  // Maria won a bet after her last deposit there: she may withdraw here; Rui must win one first.
  assert.equal(withdrawEligibility(db, maria).eligible, true);
  // Run again: nobody twice.
  const again = await importNovo(db, fakeNovo(), { dryRun: false });
  assert.deepEqual([again.imported, again.alreadyImported], [0, 2]);
});

test('a player brought from Bet62Novo signs in with the old password; the old hash is replaced', async () => {
  const db = openDb(':memory:');
  seed(db);
  await importNovo(db, fakeNovo(), { dryRun: false });
  const server = createApp(db, { loginAttempts: 1000 }).listen(0);
  await new Promise((r) => server.once('listening', r));
  const login = (password) => fetch(`http://127.0.0.1:${server.address().port}/api/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'maria@example.com', password }),
  });
  try {
    assert.equal((await login('errada')).status, 401);
    const ok = await login('segredo-antigo');
    assert.equal(ok.status, 200);
    assert.equal((await ok.json()).user.balance, 25.5);
    assert.match(db.prepare("SELECT password_hash FROM users WHERE email = 'maria@example.com'").get().password_hash, /^scrypt\$/);
    assert.equal((await login('segredo-antigo')).status, 200); // and again, with the new hash
  } finally {
    server.close();
    db.close();
  }
});
