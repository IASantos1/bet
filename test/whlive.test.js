import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tokenPayload, parseLivestream, createWinHouseLive } from '../server/whlive.js';
import { openDb } from '../server/db.js';
import { createApp } from '../server/app.js';
import { nowIso } from '../server/db.js';

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const jwt = (payload) => `${b64({ alg: 'HS256' })}.${b64(payload)}.c2lnbmF0dXJl`;

test('token: the stream id (vi) from a JWT-like token or a plain base64 one', () => {
  assert.equal(tokenPayload(jwt({ vi: '20571954', exp: 1791413872 })).vi, '20571954');
  assert.equal(tokenPayload(b64({ vi: '1' })).vi, '1');
  assert.equal(tokenPayload('not-a-token'), null);
});

test('livestream answer → HLS address on the player host', () => {
  const t = jwt({ vi: '20571954' });
  const s = parseLivestream({ success: true, embed_url: `https://winhouse.bet/tv/play?t=${t}`, expires_at: 1791413872, relay: 'winhouse' });
  assert.deepEqual(s, {
    streamId: '20571954', hlsUrl: `https://winhouse.bet/tv/p/20571954.m3u8?t=${t}`,
    embedUrl: `https://winhouse.bet/tv/play?t=${t}`, expiresAt: 1791413872,
  });
  assert.equal(parseLivestream({ success: true, embed_url: `https://winhouse.bet/tv/play?t=${t}` }, { tvBase: 'https://cdn.example' }).hlsUrl.startsWith('https://cdn.example/tv/p/20571954.m3u8?t='), true);
  assert.match(parseLivestream({ success: false, error: 'no stream' }).error, /no stream/);
  assert.equal(parseLivestream({ Error: true, Message: 'error_not_logged_in' }).error, 'error_not_logged_in');
  assert.match(parseLivestream({ success: true, embed_url: 'https://winhouse.bet/tv/play?t=abc' }).error, /vi/);
  assert.match(parseLivestream({ success: true, embed_url: 'http://winhouse.bet/tv/play?t=abc' }).error, /https/);
});

test('cache: one WinHouse call while the token is good, a new one near the expiry', async () => {
  let clock = 1_000_000_000_000;
  let calls = 0;
  const client = {
    livestream: async (id) => {
      calls += 1;
      return { ok: true, status: 200, body: { success: true, embed_url: `https://winhouse.bet/tv/play?t=${jwt({ vi: `9${id}` })}`, expires_at: clock / 1000 + 300 } };
    },
  };
  const live = createWinHouseLive({ client, marginSeconds: 45, now: () => clock });
  const [a, b] = await Promise.all([live.getLiveStream(7), live.getLiveStream(7)]);
  assert.equal(calls, 1);
  assert.equal(a.streamId, '97');
  assert.equal(b, a);
  clock += 200_000; // 100 s left: still good
  await live.getLiveStream(7);
  assert.equal(calls, 1);
  clock += 70_000; // 30 s left: inside the margin → fetched again
  await live.getLiveStream(7);
  assert.equal(calls, 2);
});

test('GET /api/live/:eventId: only WinHouse games in play here; our id or the WinHouse id', async () => {
  const db = openDb(':memory:');
  const add = (ext, status) => Number(db.prepare(`INSERT INTO events (sport, competition, home, away, start_time, status, source, external_id, created_at, updated_at)
    VALUES ('futebol', 'L', 'A', 'B', ?, ?, 'winhouse', ?, ?, ?)`).run(nowIso(), status, ext, nowIso(), nowIso()).lastInsertRowid);
  const liveId = add('2085793307', 'live');
  add('2085793308', 'scheduled');
  const token = jwt({ vi: '20571954' });
  const winhouseLive = createWinHouseLive({ client: { livestream: async () => ({ ok: true, status: 200, body: { success: true, embed_url: `https://winhouse.bet/tv/play?t=${token}`, expires_at: 1791413872 } }) } });
  const winhouseFeed = { streamOf: (ext) => ({ has: ext === '2085793307', url: null }) };
  const server = createApp(db, { winhouseLive, winhouseFeed }).listen(0);
  await new Promise((r) => server.once('listening', r));
  const get = async (p) => { const r = await fetch(`http://127.0.0.1:${server.address().port}${p}`); return { status: r.status, body: await r.json() }; };
  try {
    const want = { success: true, event_id: 2085793307, id: liveId, stream_id: 20571954, embed_url: `https://winhouse.bet/tv/play?t=${token}`, hls_url: `https://winhouse.bet/tv/p/20571954.m3u8?t=${token}`, expires_at: 1791413872 };
    assert.deepEqual(await get('/api/live/2085793307'), { status: 200, body: want });
    assert.deepEqual((await get(`/api/live/${liveId}`)).body, want);
    assert.equal((await get('/api/live/2085793308')).status, 404); // not in play
    assert.equal((await get('/api/live/123456789')).status, 404); // not ours
    assert.equal((await get('/api/live/abc')).status, 404);
    const { success, ...item } = want;
    assert.ok(success);
    assert.deepEqual((await get('/api/live')).body, { success: true, streams: [item] });
  } finally {
    server.close();
    db.close();
  }
});

test('sidebar leagues: countries with open games per league; one league of the next month', async () => {
  const db = openDb(':memory:');
  const add = (competition, status, days = 1) => {
    const id = Number(db.prepare(`INSERT INTO events (sport, competition, home, away, start_time, status, source, external_id, created_at, updated_at)
      VALUES ('futebol', ?, 'A', 'B', ?, ?, 'winhouse', ?, ?, ?)`).run(competition, new Date(Date.now() + days * 86_400_000).toISOString(), status, String(Math.random()), nowIso(), nowIso()).lastInsertRowid);
    db.prepare("INSERT INTO selections (event_id, market, code, odds_x100, active) VALUES (?, '1x2', '1', 150, 1)").run(id);
    return id;
  };
  add('England. Premier League', 'live');
  const later = add('england premier league', 'scheduled', 20); // 20 days away: outside the board, inside the league page
  add('England. Premier League', 'scheduled', 40); // beyond a month
  add('Spain. La Liga', 'scheduled', 2);
  const server = createApp(db).listen(0);
  await new Promise((r) => server.once('listening', r));
  const get = async (p) => (await fetch(`http://127.0.0.1:${server.address().port}${p}`)).json();
  try {
    const { leagues } = await get('/api/leagues');
    const england = leagues.futebol.find((c) => c.country === 'England');
    assert.equal(england.leagues.find((l) => l.name === 'England. Premier League').count, 2);
    assert.equal(leagues.futebol.find((c) => c.country === 'Spain').leagues.find((l) => l.name === 'Spain. La Liga').count, 1);
    const { events } = await get(`/api/events?competition=${encodeURIComponent('England. Premier League')}`);
    assert.equal(events.length, 2);
    assert.ok(events.some((e) => e.id === later));
  } finally {
    server.close();
    db.close();
  }
});

test('live video with a wallet session: /tenant/session once, its token as x-access-token, a new session when the book drops it', async () => {
  const calls = [];
  let sessions = 0;
  const token = jwt({ vi: '777' });
  const client = {
    hasWallet: true,
    tenantSession: async (player) => { sessions += 1; calls.push(`session ${player}`); return { ok: true, status: 200, body: { ok: true, token: `tok${sessions}`, username: `bet62_${player}` } }; },
    livestream: async (id, tok) => {
      calls.push(`stream ${id} ${tok}`);
      if (tok === 'tok1' && calls.filter((c) => c.startsWith('stream')).length > 1) return { ok: true, status: 200, body: { Error: true, Message: 'error_not_logged_in' } };
      return { ok: true, status: 200, body: { success: true, embed_url: `https://winhouse.bet/tv/play?t=${token}`, expires_at: Date.now() / 1000 + 600 } };
    },
  };
  const live = createWinHouseLive({ client, playerId: '5512' });
  assert.equal((await live.getLiveStream(1)).streamId, '777');
  assert.deepEqual(calls, ['session 5512', 'stream 1 tok1']);
  assert.equal(live.session().username, 'bet62_5512');
  // The book no longer accepts tok1: a fresh session, asked again.
  assert.equal((await live.getLiveStream(2)).streamId, '777');
  assert.deepEqual(calls.slice(2), ['stream 2 tok1', 'session 5512', 'stream 2 tok2']);
  // Not configured (no wallet key / player): no session, the plain request.
  const plain = createWinHouseLive({ client: { ...client, hasWallet: false }, playerId: '5512' });
  assert.equal(await plain.sessionToken(), null);
});

test('wallet session via launch token: signed HMAC on /tenant/sso, /tenant/session only when sso fails', async () => {
  const { createWinHouseClient } = await import('../server/winhouse.js');
  const { createHmac } = await import('node:crypto');
  const sent = [];
  const fetchImpl = async (url, opts) => {
    sent.push({ url: String(url), opts });
    return new Response(JSON.stringify({ ok: true, token: 'ssotok', username: 'bet62_7' }), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  const client = createWinHouseClient({ baseUrl: 'https://wh.test', tenant: 'ifr_x', walletKey: 'k3y', fetchImpl });
  const r = await client.tenantSso('7', { now: 1000 });
  assert.equal(r.body.token, 'ssotok');
  assert.equal(sent[0].url, 'https://wh.test/tenant/sso');
  const body = JSON.parse(sent[0].opts.body);
  assert.equal(body.key, 'ifr_x');
  const [player, expiry, sess, sig] = body.launch.split('.');
  assert.deepEqual([player, expiry, sess], ['7', '301000', 'bet62-tv']);
  assert.equal(sig, createHmac('sha256', 'k3y').update('7|301000|bet62-tv').digest('hex'));
  assert.ok(!JSON.stringify(sent[0]).includes('k3y'));

  const calls = [];
  const live = createWinHouseLive({
    playerId: '7',
    client: {
      hasWallet: true,
      tenantSso: async () => { calls.push('sso'); return { ok: false, status: 401, body: { ok: false, error: 'bad launch' } }; },
      tenantSession: async () => { calls.push('session'); return { ok: false, status: 403, body: { error: 'IP address not allowed for this key', ip: '1.2.3.4' } }; },
      livestream: async () => ({ ok: true, status: 200, body: {} }),
    },
  });
  assert.equal(await live.sessionToken(), null);
  assert.deepEqual(calls, ['sso', 'session']);
  assert.match(live.session().error, /sso: HTTP 401 bad launch · session: HTTP 403 .*1\.2\.3\.4/);
});
