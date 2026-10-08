import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../server/db.js';
import { seed } from '../server/seed.js';
import { createApp } from '../server/app.js';

let server;
let base;
let db;

before(async () => {
  db = openDb(':memory:');
  seed(db);
  server = createApp(db, { loginAttempts: 1000, registrations: 1000 }).listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(() => {
  server.close();
  db.close();
});

/** Minimal cookie-keeping client. */
function client() {
  let cookie = '';
  return async (method, path, body) => {
    const res = await fetch(base + path, {
      method,
      headers: { ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}) },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const set = res.headers.get('set-cookie');
    if (set) cookie = set.split(';')[0];
    return { status: res.status, body: await res.json() };
  };
}

const adult = { name: 'Ana Silva', password: 'segredo123', birthdate: '1990-05-10', acceptTerms: true };
let emailSeq = 0;
async function newPlayer(deposit = 0) {
  const c = client();
  const r = await c('POST', '/api/auth/register', { ...adult, email: `ana${++emailSeq}@example.com` });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  if (deposit) assert.equal((await c('POST', '/api/wallet/deposit', { amount: deposit, method: 'mbway' })).status, 201);
  return c;
}
async function adminClient() {
  const c = client();
  assert.equal((await c('POST', '/api/auth/login', { email: 'admin@classicbet.local', password: 'admin12345' })).status, 200);
  return c;
}
async function createEvent(adm, odds = { 1: 2, X: 3, 2: 4 }) {
  const r = await adm('POST', '/api/admin/events', {
    sport: 'futebol', competition: 'Teste', home: 'Casa FC', away: 'Fora FC',
    startTime: new Date(Date.now() + 3600_000).toISOString(), odds,
  });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  return r.body.event;
}
const sel = (ev, code) => ev.selections.find((s) => s.code === code);

test('lists seeded live and upcoming events with odds', async () => {
  const r = await client()('GET', '/api/events');
  assert.equal(r.status, 200);
  assert.ok(r.body.events.length >= 8);
  assert.ok(r.body.events.some((e) => e.status === 'live'));
  assert.ok(r.body.events.every((e) => e.selections.length >= 2));
});

test('registration enforces age, terms and unique email', async () => {
  const c = client();
  const young = new Date();
  young.setFullYear(young.getFullYear() - 17);
  let r = await c('POST', '/api/auth/register', { ...adult, email: 'jovem@example.com', birthdate: young.toISOString().slice(0, 10) });
  assert.equal(r.status, 403);
  r = await c('POST', '/api/auth/register', { ...adult, email: 'termos@example.com', acceptTerms: false });
  assert.equal(r.status, 400);
  r = await c('POST', '/api/auth/register', { ...adult, email: 'dup@example.com' });
  assert.equal(r.status, 201);
  assert.equal(r.body.user.balance, 0);
  r = await client()('POST', '/api/auth/register', { ...adult, email: 'DUP@example.com' });
  assert.equal(r.status, 409);
});

test('login, session and logout', async () => {
  const c = client();
  assert.equal((await c('POST', '/api/auth/login', { email: 'dup@example.com', password: 'errada123' })).status, 401);
  assert.equal((await c('POST', '/api/auth/login', { email: 'dup@example.com', password: adult.password })).status, 200);
  assert.equal((await c('GET', '/api/me')).body.user.email, 'dup@example.com');
  await c('POST', '/api/auth/logout', {});
  assert.equal((await c('GET', '/api/me')).body.user, null);
});

test('protected routes require auth and admin role', async () => {
  const anon = client();
  assert.equal((await anon('GET', '/api/wallet')).status, 401);
  const p = await newPlayer();
  assert.equal((await p('GET', '/api/admin/stats')).status, 403);
});

test('login is rate limited per IP and email', async () => {
  const limitedDb = openDb(':memory:');
  const s = createApp(limitedDb, { loginAttempts: 2 }).listen(0);
  await new Promise((r) => s.once('listening', r));
  const url = `http://127.0.0.1:${s.address().port}/api/auth/login`;
  const statuses = [];
  for (let i = 0; i < 3; i++) {
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'x@example.com', password: 'nope1234' }) });
    statuses.push(res.status);
  }
  s.close();
  limitedDb.close();
  assert.deepEqual(statuses, [401, 401, 429]);
});

test('mutating requests must be JSON (CSRF guard)', async () => {
  const res = await fetch(`${base}/api/auth/logout`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'a=1' });
  assert.equal(res.status, 415);
});

test('origin check accepts the public host a proxy forwards', async () => {
  const post = (headers) => fetch(`${base}/api/auth/logout`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: '{}' });
  assert.equal((await post({ Origin: 'https://evil.example' })).status, 403);
  assert.equal((await post({ Origin: 'https://bet.up.railway.app', 'X-Forwarded-Host': 'bet.up.railway.app' })).status, 200);
});

test('login tolerates a trailing space typed after the password', async () => {
  const c = client();
  assert.equal((await c('POST', '/api/auth/login', { email: ' Admin@classicbet.local ', password: 'admin12345 ' })).status, 200);
});

test('single bet: debits stake, pays out on win', async () => {
  const adm = await adminClient();
  const ev = await createEvent(adm);
  const p = await newPlayer(50);
  let r = await p('POST', '/api/bets', { mode: 'single', stake: 10, selections: [{ selectionId: sel(ev, '1').id, odds: 2 }] });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  assert.equal(r.body.balance, 40);

  r = await adm('POST', `/api/admin/events/${ev.id}/result`, { homeScore: 2, awayScore: 1 });
  assert.equal(r.status, 200);
  assert.equal(r.body.settledBets, 1);

  const wallet = (await p('GET', '/api/wallet')).body;
  assert.equal(wallet.balance, 60);
  assert.deepEqual(wallet.transactions.map((t) => t.type), ['payout', 'bet', 'deposit']);
  const bets = (await p('GET', '/api/bets')).body.bets;
  assert.equal(bets[0].status, 'won');
  assert.equal(bets[0].payout, 20);

  // Finished events cannot be bet on or re-settled.
  r = await p('POST', '/api/bets', { mode: 'single', stake: 1, selections: [{ selectionId: sel(ev, 'X').id, odds: 3 }] });
  assert.equal(r.status, 409);
  assert.equal((await adm('POST', `/api/admin/events/${ev.id}/result`, { homeScore: 0, awayScore: 0 })).status, 409);
});

test('single mode with several picks creates one bet per pick', async () => {
  const adm = await adminClient();
  const a = await createEvent(adm);
  const b = await createEvent(adm);
  const p = await newPlayer(30);
  const r = await p('POST', '/api/bets', { mode: 'single', stake: 5, selections: [
    { selectionId: sel(a, '1').id, odds: 2 }, { selectionId: sel(b, '2').id, odds: 4 },
  ] });
  assert.equal(r.status, 201);
  assert.equal(r.body.betIds.length, 2);
  assert.equal(r.body.balance, 20);
});

test('multiple bet: wins only if every leg wins; void leg counts as 1.00', async () => {
  const adm = await adminClient();
  const a = await createEvent(adm, { 1: 2, X: 3, 2: 4 });
  const b = await createEvent(adm, { 1: 1.5, X: 3, 2: 5 });
  const c = await createEvent(adm, { 1: 3, X: 3, 2: 2 });
  const p = await newPlayer(100);
  let r = await p('POST', '/api/bets', { mode: 'multiple', stake: 10, selections: [
    { selectionId: sel(a, '1').id, odds: 2 }, { selectionId: sel(b, '1').id, odds: 1.5 }, { selectionId: sel(c, '2').id, odds: 2 },
  ] });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  assert.equal(r.body.balance, 90);

  await adm('POST', `/api/admin/events/${a.id}/result`, { homeScore: 1, awayScore: 0 });
  await adm('POST', `/api/admin/events/${b.id}/cancel`, {});
  let bet = (await p('GET', '/api/bets')).body.bets[0];
  assert.equal(bet.status, 'open');
  assert.equal(bet.totalOdds, 6);

  await adm('POST', `/api/admin/events/${c.id}/result`, { homeScore: 0, awayScore: 2 });
  bet = (await p('GET', '/api/bets')).body.bets[0];
  assert.equal(bet.status, 'won');
  assert.equal(bet.payout, 40); // 10 × 2.00 × (void) × 2.00
  assert.equal((await p('GET', '/api/wallet')).body.balance, 130);
});

test('multiple bet loses as soon as one leg loses', async () => {
  const adm = await adminClient();
  const a = await createEvent(adm);
  const b = await createEvent(adm);
  const p = await newPlayer(20);
  await p('POST', '/api/bets', { mode: 'multiple', stake: 10, selections: [
    { selectionId: sel(a, '1').id, odds: 2 }, { selectionId: sel(b, '1').id, odds: 2 },
  ] });
  await adm('POST', `/api/admin/events/${a.id}/result`, { homeScore: 0, awayScore: 0 });
  const bet = (await p('GET', '/api/bets')).body.bets[0];
  assert.equal(bet.status, 'lost');
  assert.equal((await p('GET', '/api/wallet')).body.balance, 10);
});

test('multiple rejects two picks from the same event', async () => {
  const adm = await adminClient();
  const a = await createEvent(adm);
  const p = await newPlayer(20);
  const r = await p('POST', '/api/bets', { mode: 'multiple', stake: 5, selections: [
    { selectionId: sel(a, '1').id, odds: 2 }, { selectionId: sel(a, '2').id, odds: 4 },
  ] });
  assert.equal(r.status, 400);
  assert.equal((await p('GET', '/api/wallet')).body.balance, 20);
});

test('changed odds are refused with the current price; suspended markets are closed', async () => {
  const adm = await adminClient();
  const ev = await createEvent(adm);
  const p = await newPlayer(20);
  await adm('PATCH', `/api/admin/events/${ev.id}`, { odds: { 1: 1.8 } });
  let r = await p('POST', '/api/bets', { mode: 'single', stake: 5, selections: [{ selectionId: sel(ev, '1').id, odds: 2 }] });
  assert.equal(r.status, 409);
  assert.deepEqual(r.body.changes, [{ selectionId: sel(ev, '1').id, odds: 1.8 }]);

  await adm('PATCH', `/api/admin/events/${ev.id}`, { suspended: true });
  r = await p('POST', '/api/bets', { mode: 'single', stake: 5, selections: [{ selectionId: sel(ev, '1').id, odds: 1.8 }] });
  assert.equal(r.status, 409);
  assert.equal((await p('GET', '/api/wallet')).body.balance, 20);
});

test('stake limits and insufficient balance', async () => {
  const adm = await adminClient();
  const ev = await createEvent(adm);
  const p = await newPlayer(5);
  const pick = [{ selectionId: sel(ev, '1').id, odds: 2 }];
  assert.equal((await p('POST', '/api/bets', { mode: 'single', stake: 0.5, selections: pick })).status, 400);
  const r = await p('POST', '/api/bets', { mode: 'single', stake: 10, selections: pick });
  assert.equal(r.status, 400);
  assert.match(r.body.error, /Saldo insuficiente/);
  assert.equal((await p('GET', '/api/wallet')).body.balance, 5);
});

test('withdrawal: debited on request, refunded on rejection', async () => {
  const adm = await adminClient();
  const p = await newPlayer(100);
  assert.equal((await p('POST', '/api/wallet/withdraw', { amount: 30, iban: 'PT50 0002 0123 1234 5678 9015 4' })).status, 201);
  assert.equal((await p('POST', '/api/wallet/withdraw', { amount: 20, iban: 'invalido' })).status, 400);
  assert.equal((await p('GET', '/api/wallet')).body.balance, 70);

  const list = (await adm('GET', '/api/admin/withdrawals')).body.withdrawals;
  const w = list.find((x) => x.status === 'pending');
  assert.equal((await adm('POST', `/api/admin/withdrawals/${w.id}/reject`, {})).status, 200);
  assert.equal((await adm('POST', `/api/admin/withdrawals/${w.id}/approve`, {})).status, 409);
  assert.equal((await p('GET', '/api/wallet')).body.balance, 100);
});

test('self-exclusion blocks bets and deposits', async () => {
  const adm = await adminClient();
  const ev = await createEvent(adm);
  const p = await newPlayer(20);
  assert.equal((await p('POST', '/api/me/self-exclusion', { days: 7 })).status, 200);
  assert.equal((await p('POST', '/api/bets', { mode: 'single', stake: 5, selections: [{ selectionId: sel(ev, '1').id, odds: 2 }] })).status, 403);
  assert.equal((await p('POST', '/api/wallet/deposit', { amount: 10 })).status, 403);
});

test('admin can take an event live and update score', async () => {
  const adm = await adminClient();
  const ev = await createEvent(adm);
  const r = await adm('PATCH', `/api/admin/events/${ev.id}`, { status: 'live', homeScore: 1, awayScore: 0, clock: "12'" });
  assert.equal(r.status, 200);
  assert.equal(r.body.event.status, 'live');
  const live = (await client()('GET', '/api/events?status=live')).body.events;
  assert.ok(live.some((e) => e.id === ev.id && e.homeScore === 1 && e.clock === "12'"));
});

test('admin players: wallet credit/debit, free bets, ban and the detail page', async () => {
  const adm = await adminClient();
  const p = await newPlayer();
  const me = (await p('GET', '/api/me')).body.user;
  // Credit, then take some back; never below zero.
  assert.equal((await adm('POST', `/api/admin/users/${me.id}/balance`, { amount: '50' })).body.balance, 50);
  assert.equal((await adm('POST', `/api/admin/users/${me.id}/balance`, { amount: '-20' })).body.balance, 30);
  assert.equal((await adm('POST', `/api/admin/users/${me.id}/balance`, { amount: '-100' })).status, 400);
  assert.equal((await adm('POST', `/api/admin/users/${me.id}/balance`, { amount: 'abc' })).status, 400);
  assert.equal((await adm('POST', `/api/admin/users/${me.id}/freebet`, { amount: '10,5' })).body.freebet, 10.5);
  assert.equal((await p('POST', `/api/admin/users/${me.id}/balance`, { amount: '50' })).status, 403); // players cannot
  const d = (await adm('GET', `/api/admin/users/${me.id}`)).body;
  assert.equal(d.user.balance, 30);
  assert.equal(d.user.freebet, 10.5);
  assert.deepEqual(d.transactions.map((t) => t.type), ['admin_debit', 'admin_credit']);
  assert.equal(d.user.kycStatus, 'not_submitted');
  // Ban: signed out at once, cannot sign in again; unban restores it.
  assert.equal((await adm('POST', `/api/admin/users/${me.id}/ban`, { banned: true })).status, 200);
  assert.equal((await p('GET', '/api/me')).body.user, null);
  const again = client();
  assert.equal((await again('POST', '/api/auth/login', { email: me.email, password: adult.password })).status, 403);
  assert.equal((await adm('POST', `/api/admin/users/${me.id}/ban`, { banned: false })).status, 200);
  assert.equal((await again('POST', '/api/auth/login', { email: me.email, password: adult.password })).status, 200);
  const admMe = (await adm('GET', '/api/me')).body.user;
  assert.equal((await adm('POST', `/api/admin/users/${admMe.id}/ban`, { banned: true })).status, 400);
});

test('admin: future games setting (0–90 days) is saved', async () => {
  const adm = await adminClient();
  assert.equal((await adm('POST', '/api/admin/winhouse/future', { days: 120 })).status, 400);
  const r = await adm('POST', '/api/admin/winhouse/future', { days: 45 });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.futureDays, 45);
  assert.equal(db.prepare("SELECT value FROM settings WHERE key = 'winhouse.futureDays'").get().value, '45');
  assert.equal((await client()('POST', '/api/admin/winhouse/future', { days: 10 })).status, 401);
  assert.equal((await client()('GET', '/api/events')).status, 200);
});
