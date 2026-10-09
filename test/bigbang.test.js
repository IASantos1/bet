import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb, nowIso, tx } from '../server/db.js';
import { seed } from '../server/seed.js';
import { createApp } from '../server/app.js';
import { postTransaction } from '../server/wallet.js';
import { createBigBang, signMove, playerToken, parseToken } from '../server/bigbang.js';
import { onDeposit, savePromoConfig, expireDue, playerPromos } from '../server/promotions.js';

const KEY = 'live_key_123';

/** A fake BigBang API: catalogue, players, launch. */
function fakeApi() {
  const calls = [];
  const games = [
    { id: 4821, name: 'SGHotHotFruit', title: 'Hot Hot Fruit', provider: 'Habanero', category: 'Habanero', category_title: 'Habanero', thumbnail: 'https://x/hhf.webp', game_type: 'slot', is_premium: false },
    { id: 4822, name: 'SGOlympus', title: '1000 Olympus Rivals', provider: 'Habanero', category: 'Habanero', category_title: 'Habanero', thumbnail: 'https://x/oly.webp', game_type: 'slot', is_premium: false },
    { id: 9001, name: 'LiveRoulette', title: 'Roleta ao Vivo', provider: 'Pragmatic Live', category: 'PragmaticLive', category_title: 'Pragmatic Live', thumbnail: null, game_type: 'live', is_premium: false },
  ];
  const fetchImpl = async (url, opts) => {
    assert.equal(opts.headers['X-API-Key'], KEY);
    const u = new URL(url);
    const body = opts.body ? JSON.parse(opts.body) : null;
    calls.push({ path: u.pathname, body });
    const json = (data) => ({ ok: true, status: 200, json: async () => data });
    if (u.pathname.endsWith('/games')) return json({ success: true, data: games, pagination: { total: games.length, limit: 5000, offset: 0 } });
    if (u.pathname.endsWith('/categories')) return json({ success: true, data: [{ id: 1, name: 'Habanero', slug: 'Habanero', premium: false }, { id: 2, name: 'Pragmatic Live', slug: 'PragmaticLive', premium: false }] });
    if (u.pathname.endsWith('/users/create')) return json({ success: true, data: { user_token: body.user_token } });
    if (u.pathname.endsWith('/games/launch')) return json({ success: true, game_url: body.demo ? `https://g/demo/${body.game_id}` : `https://g/real/${body.game_id}/${body.user_token}` });
    return { ok: false, status: 404, json: async () => ({ success: false, error: { code: 404, message: 'nope' } }) };
  };
  return { fetchImpl, calls };
}

function player(db, euros = 0) {
  const id = Number(db.prepare("INSERT INTO users (email, name, birthdate, password_hash, created_at) VALUES (?, 'Rita', '1990-01-01', 'x', ?)").run(`r${Math.random()}@x.com`, nowIso()).lastInsertRowid);
  if (euros) tx(db, () => postTransaction(db, id, euros * 100, 'deposit', 'd'));
  return id;
}
const move = (username, amount, txId, extra = {}) => {
  const p = { username, amount, game: 'SGHotHotFruit', game_category: 'Habanero', transaction_id: txId, round_id: txId, type: 'round', round_end: true, game_id: 4821, ...extra };
  return { ...p, signature: signMove(p, KEY) };
};
const bal = (db, id) => db.prepare('SELECT balance_cents FROM users WHERE id = ?').get(id).balance_cents;

test('tokens and signature: HMAC over username + amount (shortest JS form) + game + category + transaction id', () => {
  assert.equal(playerToken(7), 'b62_7');
  assert.equal(playerToken(7, 3), 'b62_7_fs3');
  assert.deepEqual(parseToken('b62_7_fs3'), { userId: 7, spinsId: 3 });
  // Players created before (display name as username) are still understood.
  assert.deepEqual(parseToken('bet62_7_fs3'), { userId: 7, spinsId: 3 });
  assert.equal(parseToken('other_7'), null);
  const p = { username: 'player_42', amount: -2.5, game: 'SGHotHotFruit', game_category: 'Habanero', transaction_id: '66a3' };
  // -2.50 in the JSON arrives as -2.5: that is what is concatenated.
  assert.equal(signMove(JSON.parse(JSON.stringify(p)), 'k'), signMove({ ...p, amount: '-2.5' }, 'k'));
});

test('seamless wallet: balance read, bets and wins applied once per transaction, insufficient and unsigned refused, sandbox never touches money', () => {
  const db = openDb(':memory:');
  const bb = createBigBang(db, { apiKey: KEY, fetchImpl: fakeApi().fetchImpl });
  const u = player(db, 20);
  const name = playerToken(u);
  assert.deepEqual(bb.walletUser(name).body, { username: name, balance: '20.00', currency: 'EUR' });
  assert.equal(bb.walletUser('bet62_999').status, 404);
  // A bet, then a win (a standard game sends the net result per round).
  let r = bb.walletChange(move(name, -2.5, 't1'));
  assert.deepEqual([r.status, r.body.balance], [200, '17.50']);
  r = bb.walletChange(move(name, 10, 't2'));
  assert.equal(r.body.balance, '27.50');
  // The same transaction again: not applied twice.
  r = bb.walletChange(move(name, 10, 't2'));
  assert.equal(r.body.duplicate, true);
  assert.equal(bal(db, u), 2750);
  // Zero is accepted (a lost premium round closes with win 0).
  assert.equal(bb.walletChange(move(name, 0, 't3')).status, 200);
  // More than the balance: refused, nothing changes.
  r = bb.walletChange(move(name, -100, 't4'));
  assert.equal(r.status, 400);
  assert.equal(r.body.error, 'insufficient balance');
  // Bad signature.
  assert.equal(bb.walletChange({ ...move(name, 50, 't5'), signature: 'x'.repeat(64) }).status, 401);
  assert.equal(bb.walletChange({ ...move(name, 50, 't6'), amount: 500 }).status, 401); // amount changed after signing
  // Sandbox key traffic: answered, but real money untouched.
  assert.equal(bb.walletChange(move(name, 999, 't7', { sandbox: true })).body.balance, '100000.00');
  assert.equal(bal(db, u), 2750);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM transactions WHERE type IN ('casino_bet', 'casino_win')").get().n, 2);
  // A self-excluded player cannot bet.
  db.prepare('UPDATE users SET excluded_until = ? WHERE id = ?').run(new Date(Date.now() + 86_400_000).toISOString(), u);
  assert.equal(bb.walletChange(move(name, -1, 't8')).body.error, 'self-excluded');
});

test('free spins: chosen on the deposit by tier, played only in eligible games, winnings above the value paid as real money', () => {
  const db = openDb(':memory:');
  const bb = createBigBang(db, { apiKey: KEY, fetchImpl: fakeApi().fetchImpl });
  savePromoConfig(db, { casinoFs: { games: '4822, 4821' } });
  const u = player(db);
  // €60 → the €50 tier: 25 spins × €0.20 = €5.
  tx(db, () => postTransaction(db, u, 6000, 'deposit', 'd'));
  const s = tx(db, () => onDeposit(db, { userId: u, amountCents: 6000, ref: 'pi_fs', choice: 'casino' }));
  assert.equal(s.spins, 25);
  assert.equal(s.value_cents, 500);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM bonuses').get().n, 0); // the player chose the casino: no sports bonus
  // Once per deposit; one casino campaign at a time.
  assert.equal(tx(db, () => onDeposit(db, { userId: u, amountCents: 6000, ref: 'pi_fs', choice: 'casino' })), null);
  tx(db, () => postTransaction(db, u, 2000, 'deposit', 'd2'));
  assert.equal(tx(db, () => onDeposit(db, { userId: u, amountCents: 2000, ref: 'pi_fs2', choice: 'casino' })), null);
  const fs = playerToken(u, s.id);
  assert.equal(bb.walletUser(fs).body.balance, '5.00');
  // A game outside the list: refused.
  assert.equal(bb.walletChange(move(fs, -1, 'f0', { game_id: 9001 })).body.error, 'game not eligible for free spins');
  // Played: −1, +4 → €8 on the free-spins balance; the real balance untouched.
  bb.walletChange(move(fs, -1, 'f1'));
  bb.walletChange(move(fs, 4, 'f2'));
  assert.equal(bb.walletUser(fs).body.balance, '8.00');
  assert.equal(bal(db, u), 8000);
  // The player ends them: €8 − €5 given = €3 of winnings paid in real money.
  const r = tx(db, () => playerPromos(db, u));
  assert.equal(r.activeSpins.winnings, 3);
  // Expiry pays the winnings and removes the rest.
  tx(db, () => expireDue(db, new Date(Date.now() + 8 * 86_400_000).toISOString()));
  assert.equal(bal(db, u), 8300);
  assert.equal(db.prepare('SELECT status, paid_cents FROM casino_spins WHERE id = ?').get(s.id).status, 'expired');
  assert.equal(bb.walletUser(fs).body.balance, '0.00');
  // A late win of a round open when they ended: paid as winnings.
  bb.walletChange(move(fs, 1, 'f3'));
  assert.equal(bal(db, u), 8400);
  assert.equal(bb.walletChange(move(fs, -1, 'f4')).status, 400);
});

test('free spins: none below the first tier, none without eligible games; the €100 cap; never cumulative with the sports bonus', () => {
  const db = openDb(':memory:');
  const u = player(db);
  tx(db, () => postTransaction(db, u, 5000, 'deposit', 'd'));
  assert.equal(tx(db, () => onDeposit(db, { userId: u, amountCents: 5000, ref: 'a', choice: 'casino' })), null); // no games configured
  savePromoConfig(db, { casinoFs: { games: [4821] } });
  const v = player(db);
  tx(db, () => postTransaction(db, v, 900, 'deposit', 'd'));
  assert.equal(tx(db, () => onDeposit(db, { userId: v, amountCents: 900, ref: 'b', choice: 'casino' })), null); // below €10
  const w = player(db);
  tx(db, () => postTransaction(db, w, 50000, 'deposit', 'd'));
  assert.equal(tx(db, () => onDeposit(db, { userId: w, amountCents: 50000, ref: 'c', choice: 'casino' })).spins, 50); // €500 counts as €100
  assert.throws(() => savePromoConfig(db, { casinoFs: { tiers: '10:x' } }), /escalões/);
});

test('API: catalogue, game page, "Testar" without an account, "Jogar" needs balance, free spins only in their games, wallet callbacks', async () => {
  const db = openDb(':memory:');
  seed(db);
  const fake = fakeApi();
  const bigbang = createBigBang(db, { apiKey: KEY, fetchImpl: fake.fetchImpl });
  const server = createApp(db, { loginAttempts: 1000, registrations: 1000, bigbang }).listen(0);
  await new Promise((r) => server.once('listening', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  let cookie = '';
  const call = async (method, path, body) => {
    const res = await fetch(base + path, { method, headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}) }, body: body ? JSON.stringify(body) : undefined });
    const set = res.headers.get('set-cookie');
    if (set) cookie = set.split(';')[0];
    return { status: res.status, body: await res.json() };
  };
  try {
    const list = await call('GET', '/api/casino/games?category=Slots');
    assert.equal(list.body.total, 2);
    assert.equal(list.body.games[0].name, 'Hot Hot Fruit'); // the title, never the launch slug
    assert.equal(list.body.providers.length, 2);
    const g = await call('GET', '/api/casino/game/4822');
    assert.equal(g.body.game.provider, 'Habanero');
    assert.equal(g.body.related[0].id, 4821);
    // Testar: demo, no account.
    const demo = await call('POST', '/api/casino/launch', { gameId: 4822, demo: true });
    assert.equal(demo.body.url, 'https://g/demo/4822');
    // Jogar: account and balance needed.
    assert.equal((await call('POST', '/api/casino/launch', { gameId: 4822 })).status, 401);
    assert.equal((await call('POST', '/api/auth/register', { name: 'Rui Sousa', email: 'rui@example.com', password: 'segredo123', birthdate: '1990-05-10', acceptTerms: true })).status, 201);
    const empty = await call('POST', '/api/casino/launch', { gameId: 4822 });
    assert.equal(empty.status, 400);
    assert.equal(empty.body.needsDeposit, true);
    savePromoConfig(db, { casinoFs: { games: [4822] } });
    const d = await call('POST', '/api/wallet/deposit', { amount: 20, method: 'mbway', promo: 'casino' });
    assert.equal(d.body.bonus.spins, 10);
    assert.equal(d.body.user.bonus, 0);
    const real = await call('POST', '/api/casino/launch', { gameId: 4822 });
    const uid = db.prepare("SELECT id FROM users WHERE email = 'rui@example.com'").get().id;
    assert.equal(real.body.url, `https://g/real/4822/b62_${uid}`);
    // The username at BigBang is the token itself: the wallet callbacks name the player by it.
    assert.ok(fake.calls.some((c) => c.path.endsWith('/users/create') && c.body.user_token === `b62_${uid}` && c.body.username === `b62_${uid}`));
    const promos = await call('GET', '/api/promotions');
    const fsId = promos.body.mine.activeSpins.id;
    assert.equal(promos.body.mine.activeSpins.spins, 10);
    assert.equal((await call('POST', '/api/casino/launch', { gameId: 4821, freeSpins: fsId })).status, 400); // not eligible
    const fsl = await call('POST', '/api/casino/launch', { gameId: 4822, freeSpins: fsId });
    assert.equal(fsl.body.url, `https://g/real/4822/b62_${uid}_fs${fsId}`);
    // The wallet callbacks, as BigBang calls them.
    const u = await (await fetch(`${base}/api/casino/bb/user?username=b62_${uid}`)).json();
    assert.equal(u.balance, '20.00');
    const res = await fetch(`${base}/api/casino/bb/balance`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(move(`b62_${uid}_fs${fsId}`, 3, 'cb1', { game_id: 4822 })) });
    assert.equal((await res.json()).balance, '5.00');
    // The player ends the free spins: €5 − €2 = €3 of winnings.
    const claim = await call('POST', `/api/me/free-spins/${fsId}/claim`, {});
    assert.equal(claim.body.paid, 3);
    assert.equal(claim.body.user.balance, 23);
  } finally {
    server.close();
    db.close();
  }
});

test('lobby: popular first (rounds played here, then known hits), newest by id, rows per kind; "Ver todos" orders', async () => {
  const db = openDb(':memory:');
  const bb = createBigBang(db, { apiKey: KEY, fetchImpl: fakeApi().fetchImpl });
  let lobby = await bb.lobby({ n: 10 });
  const row = (key) => lobby.rows.find((r) => r.key === key);
  assert.deepEqual(lobby.rows.map((r) => r.key), ['populares', 'novos', 'Slots', 'Ao Vivo']);
  // Nothing played yet: the known hit (roulette) first.
  assert.equal(row('populares').games[0].id, 9001);
  assert.deepEqual(row('novos').games.map((g) => g.id), [9001, 4822, 4821]);
  assert.deepEqual(row('Slots').games.map((g) => g.id), [4821, 4822]);
  // Rounds played here weigh more than the market's hits.
  const u = player(db, 20);
  for (const t of ['a', 'b']) {
    db.prepare(`INSERT INTO casino_moves (transaction_id, user_id, amount_cents, balance_after_cents, round_id, type, game_id, created_at)
      VALUES (?, ?, -100, 0, ?, 'round', 4822, ?)`).run(t, u, t, nowIso());
  }
  const fresh = createBigBang(db, { apiKey: KEY, fetchImpl: fakeApi().fetchImpl });
  lobby = await fresh.lobby({ n: 10 });
  assert.equal(row('populares').games[0].id, 4822);
  assert.deepEqual((await fresh.gamesPage({ category: 'novos' })).games.map((g) => g.id), [9001, 4822, 4821]);
  assert.deepEqual((await fresh.gamesPage({ category: 'populares' })).total, 3);
  assert.deepEqual((await fresh.gamesPage({ category: 'Slots' })).games.map((g) => g.id), [4822, 4821]);
});
