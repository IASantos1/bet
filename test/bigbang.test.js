import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb, nowIso, tx, setSetting } from '../server/db.js';
import { seed } from '../server/seed.js';
import { createApp } from '../server/app.js';
import { postTransaction } from '../server/wallet.js';
import { createBigBang, signMove, playerToken, parseToken } from '../server/bigbang.js';
import { onDeposit, savePromoConfig, expireDue, playerPromos, promoConfig } from '../server/promotions.js';

const KEY = 'live_key_123';

/** A fake BigBang API: catalogue, players, launch. */
function fakeApi(extra = []) {
  const calls = [];
  const games = [...extra,
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

test('free spins: spins by deposit tier (worth spins × €0.20 to us), each at most the game\'s bet, winnings paid as real money', () => {
  const db = openDb(':memory:');
  const bb = createBigBang(db, { apiKey: KEY, fetchImpl: fakeApi().fetchImpl });
  savePromoConfig(db, { casinoFs: { games: '4822:0.10, 4821:0.20' } });
  assert.deepEqual(promoConfig(db).casinoFs.gameBets, { 4822: 0.1, 4821: 0.2 });
  const u = player(db);
  // €10 → 5 spins, worth 5 × €0.20 = €1.
  tx(db, () => postTransaction(db, u, 1000, 'deposit', 'd'));
  const s = tx(db, () => onDeposit(db, { userId: u, amountCents: 1000, ref: 'pi_fs', choice: 'casino' }));
  assert.deepEqual([s.spins, s.spins_left, s.value_cents], [5, 5, 100]);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM bonuses').get().n, 0); // the player chose the casino: no sports bonus
  // Once per deposit; one casino campaign at a time.
  assert.equal(tx(db, () => onDeposit(db, { userId: u, amountCents: 1000, ref: 'pi_fs', choice: 'casino' })), null);
  tx(db, () => postTransaction(db, u, 2000, 'deposit', 'd2'));
  assert.equal(tx(db, () => onDeposit(db, { userId: u, amountCents: 2000, ref: 'pi_fs2', choice: 'casino' })), null);
  const fs = playerToken(u, s.id);
  assert.equal(bb.walletUser(fs).body.balance, '1.00'); // 5 × €0.20
  // A game outside the list, or a bet above the game's spin: refused.
  assert.equal(bb.walletChange(move(fs, -0.2, 'f0', { game_id: 9001 })).body.error, 'game not eligible for free spins');
  assert.match(bb.walletChange(move(fs, -1, 'f0b')).body.error, /aposta fixa de 0,20 €/);
  assert.match(bb.walletChange(move(fs, -0.2, 'f0c', { game_id: 4822 })).body.error, /aposta fixa de 0,10 €/);
  assert.ok(db.prepare('SELECT bet_warn_at FROM casino_spins WHERE id = ?').get(s.id).bet_warn_at); // the game page warns the player
  // A spin at €0.20 that wins €1.50, then one at €0.10 in the other game: 3 spins left, €1.50 won.
  bb.walletChange(move(fs, -0.2, 'f1'));
  bb.walletChange(move(fs, 1.5, 'f2'));
  bb.walletChange(move(fs, -0.1, 'f3', { game_id: 4822 }));
  assert.equal(bal(db, u), 3000); // the real balance untouched while they run
  const mine = tx(db, () => playerPromos(db, u)).activeSpins;
  assert.deepEqual([mine.spins, mine.spinsLeft, mine.winnings], [5, 3, 1.5]);
  assert.equal(bb.walletUser(fs).body.balance, '0.60'); // 3 × €0.20: the €1.50 won is kept apart, never played
  // The last spins: they end and the €1.50 won is paid as real money.
  for (const t of ['f4', 'f5', 'f6']) bb.walletChange(move(fs, -0.2, t));
  assert.equal(db.prepare('SELECT paid_cents FROM casino_spins WHERE id = ?').get(s.id).paid_cents, 150);
  assert.equal(bal(db, u), 3150);
  assert.equal(bb.walletUser(fs).body.balance, '0.00');
  // A late win of a round open when they ended: paid as winnings.
  bb.walletChange(move(fs, 1, 'f7'));
  assert.equal(bal(db, u), 3250);
  assert.equal(bb.walletChange(move(fs, -0.2, 'f8')).status, 400);
});

test('free spins: expiry pays what they won and drops the spins not played', () => {
  const db = openDb(':memory:');
  const bb = createBigBang(db, { apiKey: KEY, fetchImpl: fakeApi().fetchImpl });
  savePromoConfig(db, { casinoFs: { games: '4821' } });
  const u = player(db);
  tx(db, () => postTransaction(db, u, 2000, 'deposit', 'd'));
  const s = tx(db, () => onDeposit(db, { userId: u, amountCents: 2000, ref: 'pi', choice: 'casino' }));
  assert.deepEqual([s.spins, s.value_cents], [10, 200]); // €20 → 10 spins = €2
  const fs = playerToken(u, s.id);
  bb.walletChange(move(fs, -0.2, 'e1')); // the default €0.20
  bb.walletChange(move(fs, 2, 'e2'));
  tx(db, () => expireDue(db, new Date(Date.now() + 8 * 86_400_000).toISOString()));
  assert.equal(db.prepare('SELECT status FROM casino_spins WHERE id = ?').get(s.id).status, 'expired');
  assert.equal(bal(db, u), 2200);
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
    assert.equal(d.body.bonus.spins, 10); // €20 → 10 spins
    assert.equal(d.body.user.bonus, 0);
    const real = await call('POST', '/api/casino/launch', { gameId: 4822 });
    const uid = db.prepare("SELECT id FROM users WHERE email = 'rui@example.com'").get().id;
    assert.equal(real.body.url, `https://g/real/4822/b62_${uid}`);
    // The username at BigBang is the token itself: the wallet callbacks name the player by it.
    assert.ok(fake.calls.some((c) => c.path.endsWith('/users/create') && c.body.user_token === `b62_${uid}` && c.body.username === `b62_${uid}`));
    const promos = await call('GET', '/api/promotions');
    const fsId = promos.body.mine.activeSpins.id;
    assert.equal(promos.body.mine.activeSpins.spinsLeft, 10);
    assert.equal((await call('POST', '/api/casino/launch', { gameId: 4821, freeSpins: fsId })).status, 400); // not eligible
    const fsl = await call('POST', '/api/casino/launch', { gameId: 4822, freeSpins: fsId });
    assert.equal(fsl.body.url, `https://g/real/4822/b62_${uid}_fs${fsId}`);
    // The wallet callbacks, as BigBang calls them.
    const u = await (await fetch(`${base}/api/casino/bb/user?username=b62_${uid}`)).json();
    assert.equal(u.balance, '20.00');
    const res = await fetch(`${base}/api/casino/bb/balance`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(move(`b62_${uid}_fs${fsId}`, 3, 'cb1', { game_id: 4822 })) });
    assert.equal((await res.json()).balance, '2.00'); // the game is told 10 spins × €0.20: the €3 won is kept apart
    // The previous platform's callback paths answer the same.
    assert.equal((await (await fetch(`${base}/api/casino/bigbang/user-data?username=b62_${uid}`)).json()).balance, '20.00');
    const res2 = await fetch(`${base}/api/casino/bigbang/balance-change`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(move(`b62_${uid}_fs${fsId}`, 0, 'cb2', { game_id: 4822 })) });
    assert.equal((await res2.json()).balance, '2.00');
    // The player ends the free spins: the €3 won is paid.
    const claim = await call('POST', `/api/me/free-spins/${fsId}/claim`, {});
    assert.equal(claim.body.paid, 3);
    assert.equal(claim.body.user.balance, 23);
  } finally {
    server.close();
    db.close();
  }
});

test('lobby: featured block first, then providers in the house order; tabs with counts; popular / newest orders', async () => {
  const db = openDb(':memory:');
  const bb = createBigBang(db, { apiKey: KEY, fetchImpl: fakeApi().fetchImpl });
  let lobby = await bb.lobby({ n: 10 });
  const row = (key) => lobby.rows.find((r) => r.key === key);
  assert.deepEqual(lobby.rows.map((r) => r.key), ['destaques', 'provider', 'provider']);
  // None of the 30 featured titles is here: the block fills with the most popular, providers in turns.
  assert.equal(row('destaques').title, 'Escolhas da semana');
  assert.deepEqual(row('destaques').games.map((g) => g.id), [4821, 9001, 4822]);
  // Neither provider is in the house list: alphabetical.
  assert.deepEqual(lobby.rows.filter((r) => r.key === 'provider').map((r) => [r.provider, r.title, r.total]), [['habanero', 'Jogos da Habanero', 2], ['pragmaticlive', 'Jogos da Pragmatic Live', 1]]);
  // Tabs in the house order, the empty ones left out.
  assert.deepEqual(lobby.categories.map((c) => [c.key, c.total]), [['populares', 3], ['novos', 3], ['slots', 2], ['ao-vivo', 1], ['roleta', 1]]);
  assert.equal(lobby.categories[1].label, 'Novos Jogos');
  // Rounds played here weigh more than the market's hits.
  const u = player(db, 20);
  for (const t of ['a', 'b']) {
    db.prepare(`INSERT INTO casino_moves (transaction_id, user_id, amount_cents, balance_after_cents, round_id, type, game_id, created_at)
      VALUES (?, ?, -100, 0, ?, 'round', 4822, ?)`).run(t, u, t, nowIso());
  }
  const fresh = createBigBang(db, { apiKey: KEY, fetchImpl: fakeApi().fetchImpl });
  lobby = await fresh.lobby({ n: 10 });
  assert.equal(row('destaques').games[0].id, 4822);
  assert.deepEqual((await fresh.gamesPage({ category: 'novos' })).games.map((g) => g.id), [9001, 4822, 4821]);
  assert.deepEqual((await fresh.gamesPage({ category: 'populares' })).total, 3);
  assert.deepEqual((await fresh.gamesPage({ category: 'slots' })).games.map((g) => g.id), [4822, 4821]);
  assert.deepEqual((await fresh.gamesPage({ category: 'roleta' })).games.map((g) => g.id), [9001]);
  assert.deepEqual((await fresh.gamesPage({ category: 'Slots' })).games.map((g) => g.id), [4822, 4821], 'the old kind names still filter');
  // Exclusive games: the ones the operator lists (setting casino.exclusive).
  setSetting(db, 'casino.exclusive', [4821]);
  assert.deepEqual((await fresh.gamesPage({ category: 'exclusivos' })).games.map((g) => g.id), [4821]);
  assert.ok((await fresh.lobby()).categories.some((c) => c.key === 'exclusivos'));
});

test('lobby: the featured titles in their order (exact title, named provider), live tables by kind; house provider order', async () => {
  const g = (id, title, prov, extra = {}) => ({ id, name: `g${id}`, title, provider: prov, category: prov, category_title: prov, thumbnail: `https://x/${id}.webp`, game_type: 'slot', is_premium: false, ...extra });
  const games = [
    g(1, 'Sweet Bonanza', 'Pragmatic'), g(2, 'Gates of Olympus 1000', 'Pragmatic'), g(3, 'Gates of Olympus', 'Pragmatic'),
    g(4, 'Aviator', 'Spribe', { game_type: 'crash' }), g(5, 'European Roulette', 'Evolution', { game_type: 'live' }),
    g(6, "Gonzo's Quest™", 'NetEnt'), g(7, 'Book of Dead', "Play'n GO"), g(8, 'Fortune Tiger', 'PG Soft'),
    g(9, 'Blackjack Classic', 'Evolution', { game_type: 'live' }), g(10, 'Crazy Time', 'Evolution', { game_type: 'live' }),
    g(11, 'Big Bass Splash', 'Reel Kingdom'), g(12, 'Big Bass Splash', 'Pragmatic'), g(13, 'Mega Moolah', 'Microgaming'),
  ];
  const fetchImpl = async (url) => {
    const u = new URL(url);
    const json = (data) => ({ ok: true, status: 200, json: async () => data });
    if (u.pathname.endsWith('/games')) return json({ success: true, data: games, pagination: { total: games.length } });
    if (u.pathname.endsWith('/categories')) return json({ success: true, data: [] });
    return { ok: false, status: 404, json: async () => ({ success: false }) };
  };
  const bb = createBigBang(openDb(':memory:'), { apiKey: KEY, fetchImpl });
  const lobby = await bb.lobby({ n: 5 });
  const featured = lobby.rows[0].games.map((x) => x.name);
  // The house list's order first (Gates of Olympus, Sweet Bonanza, Big Bass Splash, …), one game of a family
  // (Gates of Olympus 1000 only after the others), then the most popular of the rest (Fortune Tiger).
  assert.deepEqual(featured.slice(0, 9), ['Gates of Olympus', 'Sweet Bonanza', 'Big Bass Splash', 'Book of Dead',
    "Gonzo's Quest™", 'Aviator', 'Crazy Time', 'European Roulette', 'Blackjack Classic']);
  assert.equal(featured.at(-1), 'Gates of Olympus 1000');
  assert.ok(featured.includes('Mega Moolah') && featured.includes('Fortune Tiger'));
  assert.equal(new Set(featured).size, featured.length, 'no game twice');
  // Big Bass Splash once (Pragmatic Play comes before Reel Kingdom in the house order).
  assert.equal(lobby.rows[0].games.find((x) => x.name === 'Big Bass Splash').id, 12);
  assert.equal((await bb.games()).games.filter((x) => x.name === 'Big Bass Splash').length, 1);
  // Providers: Pragmatic Play, Evolution, Games Global (Microgaming), Play'n GO, NetEnt, Spribe, then PG Soft.
  assert.deepEqual(lobby.rows.filter((r) => r.key === 'provider').map((r) => r.title), ['Pragmatic Play', 'Evolution', 'Games Global', "Play'n GO", 'NetEnt', 'Spribe', 'PG Soft'].map((p) => `Jogos da ${p}`));
  // "Acabados de chegar" (newest first, no live tables), the Top 10 of the week (while nothing was played
  // here, the market's hits, no live tables) and the jackpots.
  assert.deepEqual(lobby.rows.slice(1, 4).map((r) => [r.key, r.title]), [['novos', 'Acabados de chegar'], ['top10', 'Top 10 em Portugal esta semana'], ['jackpots', 'Jogos com Jackpot']]);
  assert.equal(lobby.rows[1].games[0].id, 13);
  assert.ok(lobby.rows[1].games.every((x) => x.type !== 'live'));
  const top = lobby.rows[2].games;
  assert.equal(top.length, 9, "the 9 games that are not live tables (at most 10)");
  assert.ok(top.every((x) => x.type !== 'live'));
  assert.deepEqual(lobby.rows[3].games.map((x) => x.name), ['Mega Moolah']);
});

test('top 10 da semana: the games played here this week come first (rounds, and players who opened them)', async () => {
  const db = openDb(':memory:');
  const names = ['Sweet Bonanza', 'Gates of Olympus', 'Big Bass Splash', 'Book of Dead', 'Fortune Tiger', 'Starburst', 'Wolf Gold'];
  const games = names.map((n, i) => ({ id: i + 1, name: `g${i}`, title: n, provider: 'Pragmatic', category: 'Pragmatic', category_title: 'Pragmatic', thumbnail: `https://x/${i}.webp`, game_type: 'slot', is_premium: false }));
  const fetchImpl = async (url) => {
    const u = new URL(url);
    const json = (data) => ({ ok: true, status: 200, json: async () => data });
    if (u.pathname.endsWith('/games')) return json({ success: true, data: games, pagination: { total: games.length } });
    return json({ success: true, data: [] });
  };
  const bb = createBigBang(db, { apiKey: KEY, fetchImpl });
  await bb.games();
  // Starburst opened by 2 players this week; Wolf Gold by 1 (and by 3 more a month ago: not counted).
  const at = (days) => new Date(Date.now() - days * 86_400_000).toISOString();
  const ins = db.prepare('INSERT INTO casino_plays (user_id, game_id, played_at) VALUES (?, ?, ?)');
  ins.run(1, 6, at(1)); ins.run(2, 6, at(2)); ins.run(1, 6, at(3)); ins.run(1, 7, at(1));
  for (const u of [2, 3, 4]) ins.run(u, 7, at(20));
  const top = (await bb.lobby()).rows.find((r) => r.key === 'top10').games.map((x) => x.name);
  assert.deepEqual(top.slice(0, 2), ['Starburst', 'Wolf Gold']);
  assert.equal(new Set(top).size, top.length);
});

test('catalogue: one provider per brand (Pragmatic / PragmaticPlay / Pragmatic Play), Live apart, no duplicate games; Populares mixes providers', async () => {
  const { providerKey } = await import('../server/bigbang.js');
  assert.equal(providerKey('Pragmatic'), providerKey('PragmaticPlay'));
  assert.equal(providerKey('Pragmatic Play'), providerKey('Pragmatic'));
  assert.equal(providerKey('PragmaticLive'), providerKey('Pragmatic Play Live'));
  assert.notEqual(providerKey('Pragmatic Play Live'), providerKey('Pragmatic Play'));
  assert.equal(providerKey('AmusnetLocal'), providerKey('Amusnet'));
  const g = (id, title, cat, extra = {}) => ({ id, name: `g${id}`, title, provider: cat, category: cat.replace(/\s/g, ''), category_title: cat, thumbnail: `https://x/${id}.webp`, game_type: 'slot', is_premium: false, ...extra });
  const games = [
    g(1, 'Gates of Olympus', 'Pragmatic'), g(2, 'Gates of Olympus', 'Pragmatic Play', { is_premium: true }), g(3, 'Sweet Bonanza', 'PragmaticPlay'),
    g(4, 'Sugar Rush', 'Pragmatic'), g(5, 'Mega Roulette', 'Pragmatic Play Live', { game_type: 'live' }), g(6, 'Fortune Tiger', 'PG Soft'),
    g(7, 'Fortune Ox', 'PGSoft'), g(8, 'Aviator', 'Spribe', { game_type: 'crash' }),
  ];
  const fetchImpl = async (url) => {
    const u = new URL(url);
    const json = (data) => ({ ok: true, status: 200, json: async () => data });
    if (u.pathname.endsWith('/games')) return json({ success: true, data: games, pagination: { total: games.length } });
    if (u.pathname.endsWith('/categories')) return json({ success: true, data: [{ name: 'Pragmatic', slug: 'Pragmatic' }, { name: 'Pragmatic Play', slug: 'PragmaticPlay', premium: true }, { name: 'PGSoft', slug: 'PGSoft' }] });
    return { ok: false, status: 404, json: async () => ({ success: false }) };
  };
  const bb = createBigBang(openDb(':memory:'), { apiKey: KEY, fetchImpl });
  const all = await bb.games();
  assert.deepEqual(all.providers.map((p) => p.name), ['Pragmatic Play', 'Spribe', 'PG Soft', 'Pragmatic Play Live']);
  // Gates of Olympus once (the Standard copy), every Pragmatic game under "Pragmatic Play".
  assert.deepEqual(all.games.map((x) => x.id).sort(), [1, 3, 4, 5, 6, 7, 8]);
  assert.ok(all.games.filter((x) => x.providerId === providerKey('Pragmatic')).every((x) => x.provider === 'Pragmatic Play'));
  assert.equal((await bb.game(2)).name, 'Gates of Olympus', 'the other copy still opens by id');
  const page = await bb.gamesPage({ provider: providerKey('Pragmatic') });
  assert.deepEqual(page.games.map((x) => x.id).sort(), [1, 3, 4]);
  // Populares: the providers take turns (Fortune Tiger, Aviator, Gates of Olympus, Mega Roulette, Fortune Ox, Sweet Bonanza…).
  const pop = (await bb.gamesPage({ category: 'populares', limit: 5 })).games;
  assert.deepEqual(pop.map((x) => x.name), ['Fortune Tiger', 'Aviator', 'Gates of Olympus', 'Mega Roulette', 'Fortune Ox']);
  const lobby = await bb.lobby({ n: 5 });
  assert.deepEqual(lobby.rows.filter((r) => r.key === 'provider').map((r) => r.title), ['Pragmatic Play', 'Spribe', 'PG Soft', 'Pragmatic Play Live'].map((p) => `Jogos da ${p}`));
});

test('hidden games: by name or id, out of the lists, the game page and "do mesmo estilo"', async () => {
  const db = openDb(':memory:');
  const bb = createBigBang(db, { apiKey: KEY, fetchImpl: fakeApi().fetchImpl });
  assert.equal((await bb.games()).games.length, 3);                   // the default names are not in this catalogue
  setSetting(db, 'casino.hidden', ['hot hot fruit', '9001']);
  assert.deepEqual((await bb.games()).games.map((g) => g.id), [4822]);
  assert.equal(await bb.game(4821), null);
  assert.equal(await bb.game(9001), null);
  assert.equal((await bb.related(await bb.game(4822))).length, 0);
  assert.equal((await bb.gamesPage({})).total, 1);
});

test('launch speed: the demo URL is reused, a player created once is remembered across restarts', async () => {
  const db = openDb(':memory:');
  const api = fakeApi();
  const bb = createBigBang(db, { apiKey: KEY, fetchImpl: api.fetchImpl });
  await bb.games();
  const n = () => api.calls.length;
  let before = n();
  const u1 = await bb.launch({ gameId: 4821, demo: true });
  const u2 = await bb.launch({ gameId: 4821, demo: true });
  assert.equal(u1, u2);
  assert.equal(n() - before, 1);                                   // the second one from the cache
  before = n();
  await bb.launch({ gameId: 4821, token: 'b62_7' });
  assert.deepEqual(api.calls.slice(before).map((c) => c.path.split('/').pop()), ['create', 'launch']);
  // A restart: a new instance, same database — no users/create again.
  const bb2 = createBigBang(db, { apiKey: KEY, fetchImpl: api.fetchImpl });
  before = n();
  await bb2.launch({ gameId: 4821, token: 'b62_7' });
  assert.deepEqual(api.calls.slice(before).map((c) => c.path.split('/').pop()), ['launch']);
});

test('demo: live tables and Premium games are real-money only (no "Testar")', async () => {
  const db = openDb(':memory:');
  const bb = createBigBang(db, { apiKey: KEY, fetchImpl: fakeApi().fetchImpl });
  assert.equal((await bb.game(4821)).demo, true);   // a slot
  assert.equal((await bb.game(9001)).demo, false);  // a live table
  const server = createApp(db, { bigbang: bb }).listen(0);
  try {
    const r = await fetch(`http://127.0.0.1:${server.address().port}/api/casino/launch`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ gameId: 9001, demo: true }) });
    assert.equal(r.status, 400);
    assert.match((await r.json()).error, /só com dinheiro real/);
  } finally { server.close(); }
});

test('split: slots from Palace (Transfer mode), live tables from BigBang; Premium copies preferred on request', async () => {
  const { setSetting: set } = await import('../server/db.js');
  const { palaceId } = await import('../server/bigbang.js');
  const db = openDb(':memory:');
  const palaceGames = [
    { providerId: 7, provider: 'Pragmatic Play', code: 'vs10bbbonus', name: 'Big Bass Bonanza', image: 'https://p/bbb.png', category: 'Slots' },
    { providerId: 8, provider: 'Evolution', code: 'roulette', name: 'Roleta Palace', image: null, category: 'Ao Vivo' },
    { providerId: 9, provider: 'Habanero', code: 'hhf', name: 'Hot Hot Fruit', image: 'https://p/hhf-square.png', category: 'Slots' },
    { providerId: 10, provider: 'HB Games', code: 'hhf2', name: 'Hot Hot Fruit™', image: 'https://p/hhf2.png', category: 'Slots' },
  ];
  let split = false;
  const bb = createBigBang(db, { apiKey: KEY, fetchImpl: fakeApi().fetchImpl, palace: async () => palaceGames, split: () => split });
  assert.deepEqual((await bb.games()).games.map((g) => g.id).sort(), [4821, 4822, 9001]);
  split = true;
  bb.reload();
  const ids = (await bb.games()).games.map((g) => g.id);
  assert.ok(ids.includes(9001));                                     // BigBang live table kept
  assert.ok(!ids.includes(4821));                                    // BigBang slots gone
  assert.ok(ids.includes(palaceId(7, 'vs10bbbonus')));               // Palace slot in
  assert.ok(!ids.includes(palaceId(8, 'roulette')));                 // Palace live left out
  const g = await bb.game(palaceId(7, 'vs10bbbonus'));
  assert.deepEqual([g.source, g.demo, g.palace], ['palace', false, { providerId: 7, code: 'vs10bbbonus' }]);
  // Artwork: BigBang's tall picture of the same game when there is one; else Palace's, shown whole.
  assert.deepEqual([g.image, g.fit], ['https://p/bbb.png', true]);
  const hhf = await bb.game(palaceId(9, 'hhf'));
  assert.deepEqual([hhf.image, hhf.fit], ['https://x/hhf.webp', false]);
  assert.equal((await bb.game(palaceId(10, 'hhf2'))).image, 'https://x/hhf.webp');   // provider spelled apart
  // Launch: Palace's Transfer mode (the balance moves there), and back on close.
  const moves = [];
  const casino = { enabled: true, enterGame: async (u, a) => { moves.push(['in', u.id, a]); return { url: 'https://palace/game', casinoCents: 2000 }; },
    leaveGame: async (u) => { moves.push(['out', u.id]); return 2000; }, casinoBalanceCents: async () => 2000, syncBack: async () => 0 };
  const uid = player(db, 20);
  db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run((await import('../server/security.js')).hashPassword('segredo123'), uid);
  const email = db.prepare('SELECT email FROM users WHERE id = ?').get(uid).email;
  const server = createApp(db, { bigbang: bb, casino, loginAttempts: 100 }).listen(0);
  try {
    const base = `http://127.0.0.1:${server.address().port}`;
    const login = await fetch(`${base}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: 'segredo123' }) });
    const cookie = login.headers.get('set-cookie')?.split(';')[0];
    const call = (path, body) => fetch(`${base}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', cookie }, body: JSON.stringify(body) }).then((r) => r.json().then((j) => ({ status: r.status, j })));
    const r = await call('/api/casino/launch', { gameId: palaceId(7, 'vs10bbbonus') });
    assert.deepEqual([r.status, r.j.url, r.j.transfer], [200, 'https://palace/game', true]);
    assert.deepEqual(moves[0][2], { providerId: 7, gameCode: 'vs10bbbonus', returnUrl: `${base}/casino-return.html` });
    assert.equal((await call('/api/casino/launch', { gameId: palaceId(7, 'vs10bbbonus'), demo: true })).status, 400);
    db.prepare('UPDATE users SET casino_active = 1 WHERE id = ?').run(uid);
    await call('/api/casino/close', {});
    assert.deepEqual(moves[1], ['out', uid]);
  } finally { server.close(); }
  // Premium preferred: the original copy instead of the Standard one.
  const both = [
    { id: 1, name: 'BigBassSplash', title: 'Big Bass Splash', provider: 'Pragmatic', category: 'Pragmatic', category_title: 'Pragmatic', thumbnail: 'https://x/a.webp', game_type: 'slot', is_premium: false },
    { id: 2, name: 'vs10txbigbass', title: 'Big Bass Splash', provider: 'Pragmatic Play', category: 'PragmaticPlay', category_title: 'Pragmatic Play', thumbnail: 'https://x/b.webp', game_type: 'slot', is_premium: true },
  ];
  const fetchBoth = async (url) => ({ ok: true, status: 200, json: async () => (url.includes('/games') ? { success: true, data: both, pagination: { total: 2 } } : { success: true, data: [] }) });
  const db2 = openDb(':memory:');
  const bb2 = createBigBang(db2, { apiKey: KEY, fetchImpl: fetchBoth });
  assert.deepEqual((await bb2.games()).games.map((x) => x.id), [1]);   // Standard by default
  set(db2, 'casino.premium', true);
  bb2.reload();
  assert.deepEqual((await bb2.games()).games.map((x) => x.id), [2]);   // the original
});

test('no game twice: the copy with portrait artwork wins over a landscape one', async () => {
  const { dropCrossDuplicates } = await import('../server/casinolobby.js');
  const g = (id, provider, fit) => ({ id, name: 'Shining Crown', provider, providerId: provider.toLowerCase(), type: 'slot', image: `https://x/${id}.png`, fit });
  assert.deepEqual(dropCrossDuplicates([g(1, 'EGT', true), g(2, 'EGT', false)]).map((x) => x.id), [2]);
});

test('free spins on a Palace slot are played on BigBang\'s copy (fixed bet enforced); no copy: refused', async () => {
  const { palaceId } = await import('../server/bigbang.js');
  const db = openDb(':memory:');
  const games = [
    { providerId: 7, provider: 'Pragmatic Play', code: 'bigbass', name: 'Big Bass Splash', image: null, category: 'Slots' },
    { providerId: 7, provider: 'Pragmatic Play', code: 'olympus', name: 'Gates of Olympus', image: null, category: 'Slots' },
  ];
  const copy = { id: 5001, name: 'vs10txbigbass', title: 'Big Bass Splash', provider: 'Pragmatic', category: 'Pragmatic', category_title: 'Pragmatic Play', thumbnail: null, game_type: 'slot', is_premium: false };
  const bb = createBigBang(db, { apiKey: KEY, fetchImpl: fakeApi([copy]).fetchImpl, palace: async () => games, split: () => true });
  const [bass, oly] = [palaceId(7, 'bigbass'), palaceId(7, 'olympus')];
  const calls = [];
  const casino = {
    enabled: true, casinoBalanceCents: async () => 0, syncBack: async () => 0, leaveGame: async () => 0,
    fsEnterGame: async () => { calls.push('palace'); return { url: 'https://palace/fs', fsCents: 100 }; },
    fsBalanceCents: async () => 100, fsWithdrawAll: async () => 0,
  };
  const uid = player(db, 5);
  db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run((await import('../server/security.js')).hashPassword('segredo123'), uid);
  const email = db.prepare('SELECT email FROM users WHERE id = ?').get(uid).email;
  const fsId = Number(db.prepare(`INSERT INTO casino_spins (user_id, ref, spins, spins_left, spin_value_cents, value_cents, balance_cents, games, game_bets, won_cents, expires_at, created_at)
    VALUES (?, 'fs1', 5, 5, 20, 100, 100, ?, '{}', 0, ?, ?)`).run(uid, JSON.stringify([bass, oly]), new Date(Date.now() + 86_400_000).toISOString(), nowIso()).lastInsertRowid);
  const server = createApp(db, { bigbang: bb, casino, loginAttempts: 100 }).listen(0);
  try {
    const base = `http://127.0.0.1:${server.address().port}`;
    const login = await fetch(`${base}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: 'segredo123' }) });
    const cookie = login.headers.get('set-cookie')?.split(';')[0];
    const post = (path, body) => fetch(`${base}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', cookie }, body: JSON.stringify(body) }).then((r) => r.json().then((j) => ({ status: r.status, j })));
    assert.equal((await post('/api/casino/launch', { gameId: oly, freeSpins: fsId })).status, 400);   // no BigBang copy: refused
    const r = await post('/api/casino/launch', { gameId: bass, freeSpins: fsId });
    assert.equal(r.status, 200);
    assert.match(r.j.url, /^https:\/\/g\/real\/5001\//);
    assert.deepEqual(calls, []);                                                                        // nothing put on Palace
    const fs = playerToken(uid, fsId);
    assert.equal(bb.walletUser(fs).body.balance, '1.00');                                              // 5 spins × €0.20
    const move = (amount, txId) => { const p = { username: fs, amount, game: 'vs10txbigbass', game_category: 'Pragmatic', transaction_id: txId, round_id: txId, type: 'round', round_end: true, game_id: 5001 }; return { ...p, signature: signMove(p, KEY) }; };
    const big = bb.walletChange(move(-1, 'b1'));
    assert.equal(big.status, 400);
    assert.match(big.body.error, /aposta fixa de 0,20 €/);
    assert.equal(bb.walletChange(move(-0.2, 'b2')).status, 200);
    assert.equal(bb.walletChange(move(1.5, 'b3')).body.balance, '0.80');                              // the win is kept apart
    const s = db.prepare('SELECT spins_left, won_cents, chosen_game, play_game FROM casino_spins WHERE id = ?').get(fsId);
    assert.deepEqual([s.spins_left, s.won_cents, s.chosen_game, s.play_game], [4, 150, bass, 5001]);
  } finally { server.close(); }
});

test('free spins already on Palace (before BigBang copies): one picked game, own casino account, winnings above the value paid', async () => {
  const { palaceId } = await import('../server/bigbang.js');
  const db = openDb(':memory:');
  const games = [
    { providerId: 7, provider: 'Pragmatic Play', code: 'bigbass', name: 'Big Bass Splash', image: null, category: 'Slots' },
    { providerId: 7, provider: 'Pragmatic Play', code: 'olympus', name: 'Gates of Olympus', image: null, category: 'Slots' },
  ];
  const bb = createBigBang(db, { apiKey: KEY, fetchImpl: fakeApi().fetchImpl, palace: async () => games, split: () => true });
  const [bass, oly] = [palaceId(7, 'bigbass'), palaceId(7, 'olympus')];
  let fsAccount = 0;
  const calls = [];
  const casino = {
    enabled: true, casinoBalanceCents: async () => 0, syncBack: async () => 0, leaveGame: async () => 0,
    fsEnterGame: async (_u, a) => { calls.push(['enter', a.gameCode, a.fundCents]); if (a.fundCents) fsAccount = a.fundCents; return { url: 'https://palace/fs', fsCents: fsAccount }; },
    fsBalanceCents: async () => fsAccount,
    fsWithdrawAll: async () => { const c = fsAccount; fsAccount = 0; calls.push(['withdraw', c]); return c; },
  };
  const uid = player(db, 5);
  db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run((await import('../server/security.js')).hashPassword('segredo123'), uid);
  const email = db.prepare('SELECT email FROM users WHERE id = ?').get(uid).email;
  const fsId = Number(db.prepare(`INSERT INTO casino_spins (user_id, ref, spins, spins_left, spin_value_cents, value_cents, balance_cents, games, game_bets, won_cents, expires_at, created_at)
    VALUES (?, 'fs1', 5, 5, 20, 100, 100, ?, '{}', 0, ?, ?)`).run(uid, JSON.stringify([bass, oly]), new Date(Date.now() + 86_400_000).toISOString(), nowIso()).lastInsertRowid);
  // Funded there before this release: they go on there until they end.
  db.prepare('UPDATE casino_spins SET palace_cents = 100, palace_pending = 0, palace_at = ? WHERE id = ?').run(nowIso(), fsId);
  fsAccount = 100;
  const server = createApp(db, { bigbang: bb, casino, loginAttempts: 100 }).listen(0);
  try {
    const base = `http://127.0.0.1:${server.address().port}`;
    const login = await fetch(`${base}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: 'segredo123' }) });
    const cookie = login.headers.get('set-cookie')?.split(';')[0];
    const post = (path, body) => fetch(`${base}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', cookie }, body: JSON.stringify(body) }).then((r) => r.json().then((j) => ({ status: r.status, j })));
    const get = (path) => fetch(`${base}${path}`, { headers: { cookie } }).then((r) => r.json());
    assert.deepEqual((await get('/api/me/free-spins/active')).games.map((g) => g.id), [bass, oly]);   // both to pick from
    const r = await post('/api/casino/launch', { gameId: bass, freeSpins: fsId });
    assert.deepEqual([r.status, r.j.url, r.j.freeSpins.spinsLeft], [200, 'https://palace/fs', 5]);
    assert.deepEqual(calls[0], ['enter', 'bigbass', 0]);                                                // the value is already there
    assert.equal(db.prepare('SELECT balance_cents FROM users WHERE id = ?').get(uid).balance_cents, 500); // own balance stays
    assert.deepEqual((await get('/api/me/free-spins/active')).games.map((g) => g.id), [bass]);         // only the picked game now
    assert.equal((await post('/api/casino/launch', { gameId: oly, freeSpins: fsId })).status, 409);    // no other game
    await post('/api/casino/launch', { gameId: bass, freeSpins: fsId });
    assert.deepEqual(calls[1], ['enter', 'bigbass', 0]);                                                // not funded twice
    // The game page reads the account every 2 s: the spins are counted from how it moves.
    let warned = false;
    const wallet = async (cents) => {
      fsAccount = cents;
      const { bet, betTooHigh, palace, ...f } = (await get(`/api/casino/wallet?fs=${fsId}`)).freeSpins;
      assert.deepEqual([bet, palace], [0.2, true]);
      warned = betTooHigh;
      return f;
    };
    assert.deepEqual(await wallet(80), { spinsLeft: 4, spins: 5, won: 0, ended: false });     // a spin (its win may come)
    assert.equal((await wallet(180)).spinsLeft, 4);                                                    // that spin won €1
    assert.equal((await wallet(170)).spinsLeft, 3);                                                    // a spin that won €0.10
    await post('/api/casino/close', {});
    assert.equal(db.prepare("SELECT status FROM casino_spins WHERE id = ?").get(fsId).status, 'active'); // can come back
    assert.deepEqual(await wallet(250), { spinsLeft: 2, spins: 5, won: 2.1, ended: false });          // a spin that won €1
    assert.equal(warned, false);
    const last = await wallet(210);                                                                     // €0.40 gone at once: a raised bet
    assert.deepEqual([last.spinsLeft, last.won, last.ended, warned], [0, 2.1, false, true]);            // 2 spins used, the player warned
    db.prepare("UPDATE casino_spins SET palace_at = ? WHERE id = ?").run(new Date(Date.now() - 5_000).toISOString(), fsId);
    const done = await wallet(210);                                                                     // still: they end
    assert.deepEqual(done, { spinsLeft: 0, spins: 5, won: 2.1, ended: true });
    assert.equal(db.prepare('SELECT balance_cents FROM users WHERE id = ?').get(uid).balance_cents, 710); // winnings: real balance
    assert.equal(fsAccount, 0);
    assert.equal((await post('/api/casino/launch', { gameId: bass, freeSpins: fsId })).status, 400);   // no 6th spin
  } finally { server.close(); }
});

test('Halloween Dice (does not work) is hidden, also in a list the operator already changed, once', () => {
  const db = openDb(':memory:');
  setSetting(db, 'casino.hidden', ['Divine 9']);
  const bb = createBigBang(db, { apiKey: KEY, fetchImpl: fakeApi().fetchImpl });
  assert.deepEqual(bb.hiddenList(), ['Divine 9', 'Halloween Dice']);
  setSetting(db, 'casino.hidden', ['Divine 9']); // the operator shows it again
  assert.deepEqual(createBigBang(db, { apiKey: KEY, fetchImpl: fakeApi().fetchImpl }).hiddenList(), ['Divine 9']);
  assert.ok(createBigBang(openDb(':memory:'), { apiKey: KEY }).hiddenList().includes('Halloween Dice'));
});

test('variety: one game of a family per row; "Porque jogaste" brings the family, the theme, then the provider', async () => {
  const g = (id, title, prov = 'Pragmatic') => ({ id, name: `g${id}`, title, provider: prov, category: prov, category_title: prov, thumbnail: `https://x/${id}.webp`, game_type: 'slot', is_premium: false });
  const list = [
    g(1, 'Gates of Olympus'), g(2, 'Gates of Olympus 1000'), g(3, 'Gates of Olympus Dice'), g(4, 'Gates of Olympus Super Scatter'),
    g(5, 'Big Bass Halloween 3'), g(6, 'Big Bass Splash'), g(7, 'Big Bass Bonanza'), g(8, 'Big Bass Halloween'), g(9, 'Sweet Bonanza'),
    g(10, 'Zeus vs Hades'), g(11, 'Fruity Halloween', 'Habanero'), g(12, 'Sugar Rush'),
  ];
  const fetchImpl = async (url) => {
    const u = new URL(url);
    const json = (data) => ({ ok: true, status: 200, json: async () => data });
    if (u.pathname.endsWith('/games')) return json({ success: true, data: list, pagination: { total: list.length } });
    if (u.pathname.endsWith('/categories')) return json({ success: true, data: [] });
    return { ok: false, status: 404, json: async () => ({ success: false }) };
  };
  const bb = createBigBang(openDb(':memory:'), { apiKey: KEY, fetchImpl });
  const lobby = await bb.lobby({ n: 5 });
  const prag = lobby.rows.find((r) => r.key === 'provider' && r.provider === 'pragmatic').games.map((x) => x.name);
  assert.equal(prag.filter((n) => n.startsWith('Gates of Olympus')).length, 1, 'one Gates of Olympus in the row');
  assert.equal(prag.filter((n) => n.startsWith('Big Bass')).length, 1);
  const rel = (await bb.related(await bb.game(5))).map((x) => x.name);
  // two of its family (other Big Bass), then Halloween games, then the provider's others, one per family
  assert.deepEqual(rel.slice(0, 2).every((n) => n.startsWith('Big Bass')), true);
  assert.ok(rel.indexOf('Fruity Halloween') < rel.indexOf('Sweet Bonanza'), 'the Halloween theme before the provider');
  assert.equal(rel.slice(0, 8).filter((n) => n.startsWith('Gates of Olympus')).length, 1, 'one Gates of Olympus while there are other families');
});
