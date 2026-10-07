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
    const want = { success: true, event_id: 2085793307, id: liveId, stream_id: 20571954, hls_url: `https://winhouse.bet/tv/p/20571954.m3u8?t=${token}`, expires_at: 1791413872 };
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
