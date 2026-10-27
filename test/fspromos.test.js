// Free Spins promotions: one point is one spin, winnings never give spins back, a fixed bet,
// callbacks applied once, separate balances, approved conversion rules (tests A–J and more).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb, nowIso, tx } from '../server/db.js';
import { postTransaction } from '../server/wallet.js';
import { createBigBang, signMove, playerToken } from '../server/bigbang.js';
import { expireDue } from '../server/promotions.js';
import { createPromo, updatePromo, setPromoStatus, grantPromo, promoHistory, spinsAudit, walletBreakdown } from '../server/fspromos.js';

const KEY = 'live_key_123';
const fetchImpl = async () => ({ ok: false, status: 404, json: async () => ({}) });
const move = (username, amount, txId, extra = {}) => {
  const p = { username, amount, game: 'SGHotHotFruit', game_category: 'Habanero', transaction_id: txId, round_id: txId, type: 'round', round_end: true, game_id: 4821, ...extra };
  return { ...p, signature: signMove(p, KEY) };
};

function setup({ spins = 5, conversion } = {}) {
  const db = openDb(':memory:');
  const bb = createBigBang(db, { apiKey: KEY, fetchImpl });
  const admin = Number(db.prepare("INSERT INTO users (email, name, birthdate, password_hash, role, created_at) VALUES ('a@x', 'Admin', '1980-01-01', 'x', 'admin', ?)").run(nowIso()).lastInsertRowid);
  const u = Number(db.prepare("INSERT INTO users (email, name, birthdate, password_hash, created_at) VALUES ('p@x', 'Paula', '1990-01-01', 'x', ?)").run(nowIso()).lastInsertRowid);
  tx(db, () => postTransaction(db, u, 5000, 'deposit', 'd'));
  const p = tx(db, () => createPromo(db, { name: 'BET62 Free Spins', spins, spinValue: 0.2, games: [4821], validityDays: 7, conversion }, admin));
  tx(db, () => setPromoStatus(db, p.id, 'available', admin));
  const s = tx(db, () => grantPromo(db, p.id, u, { adminId: admin, ref: 'g1' }));
  const row = () => db.prepare('SELECT * FROM casino_spins WHERE id = ?').get(s.id);
  const bal = () => db.prepare('SELECT balance_cents FROM users WHERE id = ?').get(u).balance_cents;
  return { db, bb, admin, u, p, s, fs: playerToken(u, s.id), row, bal };
}

test('A–D, I: 5 points are 5 spins; a spin takes one; a win never gives points back; at zero no more spins', () => {
  const t = setup();
  assert.deepEqual([t.row().spins, t.row().spins_left], [5, 5]); // A
  assert.equal(t.bb.walletUser(t.fs).body.balance, '1.00'); // 5 × €0.20
  assert.equal(t.bb.walletChange(move(t.fs, -0.2, 's1')).status, 200);
  assert.equal(t.row().spins_left, 4); // B
  t.bb.walletChange(move(t.fs, 3, 'w1'));
  assert.deepEqual([t.row().spins_left, t.row().won_cents], [4, 300]); // C, I: the win is kept apart
  assert.equal(t.bb.walletUser(t.fs).body.balance, '0.80'); // never played again
  for (const id of ['s2', 's3', 's4', 's5']) t.bb.walletChange(move(t.fs, -0.2, id));
  assert.equal(t.row().spins_left, 0); // D
  assert.equal(t.row().status, 'closed');
  assert.equal(t.bb.walletChange(move(t.fs, -0.2, 's6')).status, 400);
  assert.equal(t.row().spins_left, 0); // never negative
  assert.equal(t.bal(), 5300); // no rule: the €3 won paid as real money when they ended
  const actions = spinsAudit(t.db, t.s.id).map((a) => a.action);
  assert.ok(actions.includes('grant') && actions.includes('completed') && actions.filter((a) => a === 'spin').length === 5);
});

test('E: a bet other than the fixed €0.20 is refused before anything is taken, and logged', () => {
  const t = setup();
  for (const amount of [-1, -0.1]) {
    const r = t.bb.walletChange(move(t.fs, amount, `bad${amount}`));
    assert.equal(r.status, 400);
    assert.match(r.body.error, /aposta fixa de 0,20 € por rodada/);
  }
  assert.deepEqual([t.row().spins_left, t.bal()], [5, 5000]); // no point, no real money
  assert.equal(spinsAudit(t.db, t.s.id).filter((a) => a.action === 'refused').length, 2);
  assert.ok(t.row().bet_warn_at); // the game page tells the player
});

test('F, H: the same callback again (or a retry after a timeout) is never applied twice', () => {
  const t = setup();
  t.bb.walletChange(move(t.fs, -0.2, 'x1'));
  // The provider did not get our answer and sends the same transaction again.
  const again = t.bb.walletChange(move(t.fs, -0.2, 'x1'));
  assert.equal(again.body.duplicate, true);
  assert.equal(t.row().spins_left, 4);
  t.bb.walletChange(move(t.fs, 1, 'x2'));
  t.bb.walletChange(move(t.fs, 1, 'x2'));
  assert.equal(t.row().won_cents, 100);
});

test('G: two bets at once with one point left: only one takes it', () => {
  const t = setup({ spins: 1 });
  // Two different transactions arriving together, the second before the first round ends.
  const a = t.bb.walletChange(move(t.fs, -0.2, 'g1', { round_end: false }));
  const b = t.bb.walletChange(move(t.fs, -0.2, 'g2', { round_end: false }));
  assert.deepEqual([a.status, b.status], [200, 400]);
  assert.equal(t.row().spins_left, 0);
});

test('a spin the provider cancels gives its point back once; it is not a win', () => {
  const t = setup();
  t.bb.walletChange(move(t.fs, -0.2, 'r1', { round_id: 'R1', round_end: false }));
  assert.equal(t.row().spins_left, 4);
  t.bb.walletChange(move(t.fs, 0.2, 'r2', { round_id: 'R1', type: 'rollback' }));
  t.bb.walletChange(move(t.fs, 0.2, 'r3', { round_id: 'R1', type: 'rollback' }));
  assert.deepEqual([t.row().spins_left, t.row().won_cents], [5, 0]);
});

test('a suspended promotion refuses spins (none used); resumed it plays again; cancelled, its winnings are paid', () => {
  const t = setup();
  t.bb.walletChange(move(t.fs, -0.2, 'p1'));
  t.bb.walletChange(move(t.fs, 2, 'p2'));
  tx(t.db, () => setPromoStatus(t.db, t.p.id, 'suspended', t.admin, 'revisão'));
  assert.equal(t.bb.walletChange(move(t.fs, -0.2, 'p3')).status, 400);
  assert.equal(t.row().spins_left, 4);
  tx(t.db, () => setPromoStatus(t.db, t.p.id, 'available', t.admin));
  assert.equal(t.bb.walletChange(move(t.fs, -0.2, 'p4')).status, 200);
  tx(t.db, () => setPromoStatus(t.db, t.p.id, 'cancelled', t.admin, 'fim da campanha'));
  assert.equal(t.row().status, 'cancelled');
  assert.equal(t.bal(), 5200); // the €2 won follows its rule (none: paid)
  assert.deepEqual(promoHistory(t.db, t.p.id).map((h) => h.action), ['cancelada', 'retomada', 'suspensa', 'disponibilizada', 'criada']);
});

test('an approved wagering rule: winnings pending (not real, not withdrawable) until real-money bets reach it; else forfeited', () => {
  const t = setup({ spins: 2, conversion: { type: 'wagering', multiplier: 5, days: 3, games: 'all', approved: true } });
  t.bb.walletChange(move(t.fs, -0.2, 'c1'));
  t.bb.walletChange(move(t.fs, 2, 'c2'));
  t.bb.walletChange(move(t.fs, -0.2, 'c3'));
  assert.equal(t.row().status, 'closed');
  assert.deepEqual([t.row().wager_status, t.row().pending_cents, t.row().wager_required_cents], ['pending', 200, 1000]);
  assert.equal(t.bal(), 5000);
  assert.deepEqual(walletBreakdown(t.db, t.u), { real: 50, promotional: 0, pendingPromo: 2, withdrawable: 50 });
  // Real-money bets: €6 counted, the same transaction twice counts once; a cancelled bet is taken back.
  const real = playerToken(t.u);
  t.bb.walletChange(move(real, -6, 'b1'));
  t.bb.walletChange(move(real, -6, 'b1'));
  assert.equal(t.row().wager_done_cents, 600);
  t.bb.walletChange(move(real, -3, 'b2', { round_id: 'RB2' }));
  t.bb.walletChange(move(real, 3, 'b3', { round_id: 'RB2', type: 'refund' }));
  assert.equal(t.row().wager_done_cents, 600);
  t.bb.walletChange(move(real, -4, 'b4'));
  assert.equal(t.row().wager_status, 'converted');
  assert.equal(t.bal(), 5000 - 600 - 400 + 200); // the €2 now real money
  // Another grant whose time runs out: forfeited.
  const t2 = setup({ spins: 1, conversion: { type: 'wagering', multiplier: 5, days: 1, approved: true } });
  t2.bb.walletChange(move(t2.fs, -0.2, 'd1', { round_end: false }));
  t2.bb.walletChange(move(t2.fs, 1, 'd2'));
  tx(t2.db, () => expireDue(t2.db, new Date(Date.now() + 2 * 86_400_000).toISOString()));
  assert.equal(t2.row().wager_status, 'forfeited');
  assert.equal(t2.bal(), 5000);
});

test('a wagering rule needs approval; a grant keeps its terms when the promotion changes; limits per player', () => {
  const t = setup();
  assert.throws(() => updatePromo(t.db, t.p.id, { conversion: { type: 'wagering', multiplier: 5, days: 3 } }, t.admin), /aprovado/);
  tx(t.db, () => updatePromo(t.db, t.p.id, { spins: 50, spinValue: 0.1 }, t.admin));
  assert.deepEqual([t.row().spins, t.row().spin_value_cents], [5, 20]); // the grant given before is unchanged
  assert.equal(promoHistory(t.db, t.p.id)[0].action, 'alterada');
  assert.throws(() => grantPromo(t.db, t.p.id, t.u, { adminId: t.admin }), /já usou|ativas/);
  assert.throws(() => createPromo(t.db, { name: 'Promo X', spins: 10, spinValue: 1, games: [4821] }, t.admin), /€0,10 ou €0,20/);
});

test('J: normal casino bets, deposits and the real balance work as before', () => {
  const t = setup();
  const real = playerToken(t.u);
  assert.equal(t.bb.walletChange(move(real, -2.5, 'n1')).body.balance, '47.50');
  assert.equal(t.bb.walletChange(move(real, 10, 'n2')).body.balance, '57.50');
  assert.equal(t.bb.walletChange(move(real, -100, 'n3')).body.error, 'insufficient balance');
  assert.equal(t.row().spins_left, 5); // free spins untouched
});
