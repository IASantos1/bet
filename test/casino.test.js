import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb, nowIso, tx } from '../server/db.js';
import { createCasino } from '../server/casino.js';
import { postTransaction } from '../server/wallet.js';
import { createApp } from '../server/app.js';
import { seed } from '../server/seed.js';

/** Fake Agent API v4 with an in-memory casino wallet per user. */
function fakeAgentApi({ failDeposit = null } = {}) {
  const wallets = new Map();
  const calls = [];
  let nextCode = 400000001;
  const users = new Map();
  const ok = (data) => new Response(JSON.stringify({ code: 0, message: 'OK', data }), { status: 200 });
  const fail = (code) => new Response(JSON.stringify({ code, message: 'err' }), { status: 200 });
  const fetchImpl = async (url, opts) => {
    const path = new URL(url).pathname;
    const body = JSON.parse(opts.body || '{}');
    calls.push({ path, body, auth: opts.headers.Authorization });
    switch (path) {
      case '/v4/user/create': {
        if (!users.has(body.name)) users.set(body.name, nextCode++);
        return ok({ user_code: users.get(body.name), is_new_user: true });
      }
      case '/v4/user/info': return ok({ name: 'x', balance: wallets.get(body.user_code) || 0 });
      case '/v4/wallet/deposit': {
        if (failDeposit === 'error') return fail(1001);
        wallets.set(body.user_code, (wallets.get(body.user_code) || 0) + body.amount);
        if (failDeposit === 'lost') throw new Error('socket hang up');
        return ok({ balance: wallets.get(body.user_code), amount: body.amount });
      }
      case '/v4/wallet/withdraw-all': {
        const amount = wallets.get(body.user_code) || 0;
        wallets.set(body.user_code, 0);
        return ok({ balance: 0, amount });
      }
      case '/v4/game/providers': return ok([{ provider_id: 1, provider_name: 'Pragmatic Play', status: 1 }, { provider_id: 2, provider_name: 'PG', status: 2 }]);
      case '/v4/game/games': return ok([
        { provider_id: 1, game_code: 'vs20doghouse', game_name: 'The Dog House', game_image: 'https://img.example/dh.jpg', launch_enable: true, category: 'Slots' },
        { provider_id: 1, game_code: 'off', game_name: 'Off', launch_enable: false, category: 'Slots' },
      ]);
      case '/v4/game/game-url': return ok({ game_url: `https://games.example/play?u=${body.user_code}&g=${body.game_symbol}` });
      case '/v4/agent/info': return ok({ name: 'classicbet', balance: 50000, currency: 2 });
      default: return fail(1012);
    }
  };
  return { fetchImpl, calls, wallets };
}

function player(db, cents = 10_000) {
  const { lastInsertRowid } = db.prepare(
    "INSERT INTO users (email, name, birthdate, password_hash, created_at) VALUES (?, 'P', '1990-01-01', 'x', ?)"
  ).run(`p${Math.random()}@x.pt`, nowIso());
  const id = Number(lastInsertRowid);
  if (cents) tx(db, () => postTransaction(db, id, cents, 'deposit', 'teste'));
  return db.prepare('SELECT * FROM users WHERE id = ?').get(id);
}
const balance = (db, id) => db.prepare('SELECT balance_cents FROM users WHERE id = ?').get(id).balance_cents;

test('catalogue lists launchable games of providers not in maintenance', async () => {
  const db = openDb(':memory:');
  const api = fakeAgentApi();
  const casino = createCasino(db, { baseUrl: 'https://agent.example', token: 'tok', fetchImpl: api.fetchImpl });
  const { games, providers } = await casino.games();
  assert.deepEqual(games.map((g) => g.code), ['vs20doghouse']);
  assert.equal(providers.find((p) => p.id === 2).maintenance, true);
  assert.ok(api.calls.every((c) => c.auth === 'Bearer tok'));
  await casino.games();
  assert.equal(api.calls.filter((c) => c.path === '/v4/game/providers').length, 1, 'cached');
  db.close();
});

test('transfer in, launch without RTP override, transfer out', async () => {
  const db = openDb(':memory:');
  const api = fakeAgentApi();
  const casino = createCasino(db, { baseUrl: 'https://agent.example', token: 'tok', fetchImpl: api.fetchImpl });
  const p = player(db, 10_000);
  const r = await casino.transferIn(p, 2_500);
  assert.equal(r.casinoCents, 2_500);
  assert.equal(balance(db, p.id), 7_500);

  const url = await casino.launch(p, { providerId: 1, gameCode: 'vs20doghouse', returnUrl: 'https://cb/#/casino' });
  assert.match(url, /games\.example/);
  const launchCall = api.calls.find((c) => c.path === '/v4/game/game-url');
  assert.equal(launchCall.body.rtp, undefined);
  assert.equal(launchCall.body.win_ratio, undefined);
  assert.ok(!api.calls.some((c) => c.path === '/v4/agent/rtp' || c.path.startsWith('/v4/game/call_')));

  // Player wins 12,00 in the game, then brings everything back.
  const code = db.prepare('SELECT casino_user_code FROM users WHERE id = ?').get(p.id).casino_user_code;
  api.wallets.set(code, 37);
  const out = await casino.transferOut(p);
  assert.equal(out.amountCents, 3_700);
  assert.equal(balance(db, p.id), 11_200);
  const types = db.prepare('SELECT type FROM transactions WHERE user_id = ? ORDER BY id').all(p.id).map((t) => t.type);
  assert.deepEqual(types, ['deposit', 'casino_out', 'casino_in']);
  db.close();
});

test('a refused deposit is refunded; a lost answer that landed is not', async () => {
  const db = openDb(':memory:');
  const refused = createCasino(db, { baseUrl: 'https://a', token: 't', fetchImpl: fakeAgentApi({ failDeposit: 'error' }).fetchImpl });
  const p = player(db, 5_000);
  await assert.rejects(() => refused.transferIn(p, 1_000));
  assert.equal(balance(db, p.id), 5_000);

  const db2 = openDb(':memory:');
  const lost = createCasino(db2, { baseUrl: 'https://a', token: 't', fetchImpl: fakeAgentApi({ failDeposit: 'lost' }).fetchImpl });
  const q = player(db2, 5_000);
  const r = await lost.transferIn(q, 1_000);
  assert.equal(r.casinoCents, 1_000);
  assert.equal(balance(db2, q.id), 4_000, 'no double credit');
  db.close();
  db2.close();
});

test('self-excluded players cannot play', async () => {
  const db = openDb(':memory:');
  const casino = createCasino(db, { baseUrl: 'https://a', token: 't', fetchImpl: fakeAgentApi().fetchImpl });
  const p = player(db, 5_000);
  db.prepare('UPDATE users SET excluded_until = ? WHERE id = ?').run(new Date(Date.now() + 86_400_000).toISOString(), p.id);
  const excluded = db.prepare('SELECT * FROM users WHERE id = ?').get(p.id);
  await assert.rejects(() => casino.transferIn(excluded, 1_000), /autoexclusão/);
  await assert.rejects(() => casino.launch(excluded, { providerId: 1, gameCode: 'x' }), /autoexclusão/);
  db.close();
});

test('single wallet: the balance follows the player into the game and back', async () => {
  const db = openDb(':memory:');
  seed(db);
  const api = fakeAgentApi();
  const casino = createCasino(db, { baseUrl: 'https://a', token: 't', fetchImpl: api.fetchImpl });
  const server = createApp(db, { casino, loginAttempts: 100, registrations: 100 }).listen(0);
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
    assert.equal((await call('GET', '/api/casino/games')).body.games.length, 1);
    assert.equal((await call('POST', '/api/casino/launch', { providerId: 1, gameCode: 'vs20doghouse' })).status, 401);
    await call('POST', '/api/auth/register', { name: 'Rui', email: 'rui@x.pt', password: 'segredo123', birthdate: '1990-01-01', acceptTerms: true });
    await call('POST', '/api/wallet/deposit', { amount: 50 });

    // Opening a game moves the whole balance; no amount is asked.
    const l = await call('POST', '/api/casino/launch', { providerId: 1, gameCode: 'vs20doghouse' });
    assert.equal(l.status, 200, JSON.stringify(l.body));
    assert.match(l.body.url, /^https:\/\/games\.example/);
    assert.equal(l.body.balance, 50);
    assert.equal((await call('GET', '/api/me')).body.user.casinoActive, true);
    assert.deepEqual((await call('GET', '/api/casino/wallet')).body, { balance: 50, inCasino: true });

    // The player wins in the game (casino wallet 50 -> 65) …
    const code = db.prepare('SELECT casino_user_code FROM users WHERE email = ?').get('rui@x.pt').casino_user_code;
    api.wallets.set(code, 65);
    // … then places a sports bet without leaving the game first: the money comes back automatically.
    const ev = (await call('GET', '/api/events')).body.events.find((e) => e.status === 'scheduled');
    const sel = ev.selections[0];
    const bet = await call('POST', '/api/bets', { mode: 'single', stake: 5, selections: [{ selectionId: sel.id, odds: sel.odds }] });
    assert.equal(bet.status, 201, JSON.stringify(bet.body));
    assert.equal(bet.body.balance, 60);
    assert.equal((await call('GET', '/api/me')).body.user.casinoActive, false);
    assert.equal(api.wallets.get(code), 0);

    // Leaving a game with nothing in it is harmless.
    await call('POST', '/api/casino/launch', { providerId: 1, gameCode: 'vs20doghouse' });
    const c = await call('POST', '/api/casino/close', {});
    assert.deepEqual(c.body, { amount: 60, balance: 60 });
    assert.deepEqual((await call('POST', '/api/casino/close', {})).body, { amount: 0, balance: 60 });
    const types = (await call('GET', '/api/wallet')).body.transactions.map((t) => t.type).reverse();
    assert.deepEqual(types, ['deposit', 'casino_out', 'casino_in', 'bet', 'casino_out', 'casino_in']);
  } finally {
    server.closeAllConnections();
    server.close();
    db.close();
  }
});

test('catalogue is served in pages with filters', async () => {
  const db = openDb(':memory:');
  const many = Array.from({ length: 50 }, (_, i) => ({ provider_id: 1, game_code: `g${i}`, game_name: i % 10 === 0 ? `Roleta ${i}` : `Slot ${i}`, launch_enable: true, category: i % 10 === 0 ? 'Live' : 'Slots' }));
  const fetchImpl = async (url) => {
    const path = new URL(url).pathname;
    const data = path === '/v4/game/providers' ? [{ provider_id: 1, provider_name: 'P', status: 1 }] : path === '/v4/game/games' ? many : null;
    return new Response(JSON.stringify({ code: 0, data }), { status: 200 });
  };
  const casino = createCasino(db, { baseUrl: 'https://a', token: 't', fetchImpl });
  const p1 = await casino.gamesPage({ offset: 0, limit: 24 });
  assert.equal(p1.total, 50);
  assert.equal(p1.games.length, 24);
  const p3 = await casino.gamesPage({ offset: 48, limit: 24 });
  assert.deepEqual(p3.games.map((g) => g.code), ['g48', 'g49']);
  assert.equal((await casino.gamesPage({ category: 'Ao Vivo' })).total, 5);
  assert.equal((await casino.gamesPage({ q: 'roleta' })).total, 5);
  db.close();
});

test('base URL is normalised whatever form it is pasted in', async () => {
  const { normalizeBaseUrl } = await import('../server/casino.js');
  for (const raw of ['api.agg.example', 'https://api.agg.example/', 'https://api.agg.example/v4', 'https://api.agg.example/v4/', ' "https://api.agg.example/v4/game/games" ']) {
    assert.equal(normalizeBaseUrl(raw), 'https://api.agg.example', raw);
  }
  assert.equal(normalizeBaseUrl('http://10.0.0.5:8080/api/'), 'http://10.0.0.5:8080/api');
  assert.equal(normalizeBaseUrl(''), '');
});

test('catalogue errors are reported instead of silently showing nothing', async () => {
  const db = openDb(':memory:');
  const denied = async () => new Response(JSON.stringify({ code: 1020, message: 'IP_NOT_ALLOWED' }), { status: 200 });
  const casino = createCasino(db, { baseUrl: 'https://a', token: 't', fetchImpl: denied });
  const r = await casino.games();
  assert.equal(r.enabled, true);
  assert.equal(r.games.length, 0);
  assert.match(r.error, /IP_NOT_ALLOWED/);
  const steps = await casino.diagnose();
  assert.equal(steps[0].ok, true);
  assert.equal(steps[1].ok, false);
  assert.match(steps[1].detail, /autorizar o IP/);

  const noProviders = async () => new Response(JSON.stringify({ code: 0, data: [] }), { status: 200 });
  const empty = createCasino(db, { baseUrl: 'https://a', token: 't', fetchImpl: noProviders });
  assert.match((await empty.games()).error, /fornecedores atribuídos/);
  db.close();
});

test('diagnose walks agent → providers → games', async () => {
  const db = openDb(':memory:');
  const casino = createCasino(db, { baseUrl: 'https://agent.example/v4', token: 'tok', fetchImpl: fakeAgentApi().fetchImpl });
  const steps = await casino.diagnose();
  assert.deepEqual(steps.map((s) => [s.name, s.ok]), [['Configuração', true], ['Agente', true], ['Fornecedores', true], ['Jogos', true]]);
  assert.match(steps[3].detail, /1 jogos/);
  db.close();
});

test('a .env file in the working directory is loaded', async () => {
  const { mkdtempSync, writeFileSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { execFileSync } = await import('node:child_process');
  const dir = mkdtempSync(join(tmpdir(), 'cb-env-'));
  writeFileSync(join(dir, '.env'), 'CASINO_API_URL=https://from-dotenv.example/v4\nCASINO_API_TOKEN=abc\n');
  const configUrl = new URL('../server/config.js', import.meta.url).href;
  const env = { ...process.env };
  delete env.CASINO_API_URL;
  delete env.CASINO_API_TOKEN;
  const out = execFileSync(process.execPath, ['--input-type=module', '-e',
    `const { config } = await import(${JSON.stringify(configUrl)}); console.log(config.casino.baseUrl + '|' + config.casino.token);`],
  { cwd: dir, env }).toString().trim();
  assert.equal(out, 'https://from-dotenv.example/v4|abc');
});
