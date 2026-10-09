import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../server/db.js';
import { seed } from '../server/seed.js';
import { createApp } from '../server/app.js';
import { createRapidStream, nameScore, playableServers } from '../server/rapidstream.js';

const page = (matches, hasNext = false) => ({ matches, pagination: { page: 1, hasNext } });
const match = (home, away, servers) => ({ match_status: 'live', home_team_name: home, away_team_name: away, league_name: 'Liga', servers });
const HLS = { name: 'Server 1', url: 'https://cdn.example.com/live/a.m3u8?t=1', header: { 'user-agent': 'x' }, type: 'direct' };

test('team names: accents, club suffixes and short forms agree; other teams do not', () => {
  assert.ok(nameScore('Sporting CP', 'Sporting Clube de Portugal') >= 0.5);
  assert.equal(nameScore('Moreirense', 'Moreirense FC'), 1);
  assert.equal(nameScore('Man United', 'Manchester United'), 1);
  assert.equal(nameScore('Atlético Madrid', 'Atletico Madrid'), 1);
  assert.equal(nameScore('Benfica', 'Porto'), 0);
});

test('only HTTPS HLS without referer or DRM is offered to the browser', () => {
  const out = playableServers([
    HLS,
    { name: 'Server 2', url: 'https://cdn.example.com/a.mpd|drmScheme=clearkey', type: 'drm' },
    { name: 'Server 3', url: 'https://cdn.example.com/b.m3u8', header: { referer: 'https://x/' }, type: 'referer' },
    { name: 'Server 4', url: 'http://cdn.example.com/c.m3u8', type: 'direct' },
    { name: 'Server 5', url: 'https://cdn.example.com/d.flv', type: 'direct' },
  ]);
  assert.deepEqual(out, [{ name: 'Server 1', url: HLS.url }]);
});

test('live matches: all pages read once, cached, matched to our game in either order', async () => {
  const calls = [];
  const fetchImpl = async (url, opts) => {
    calls.push(url);
    assert.equal(opts.headers['X-RapidAPI-Key'], 'k');
    const n = Number(new URL(url).searchParams.get('page'));
    return Response.json(n === 1 ? page([match('Benfica', 'Porto', [HLS])], true) : page([match('Gil Vicente FC', 'Moreirense', [HLS])]));
  };
  const rs = createRapidStream({ apiKey: 'k', fetchImpl });
  const r = await rs.streamsFor('Moreirense', 'Gil Vicente');
  assert.deepEqual(r.servers, [{ name: 'Server 1', url: HLS.url }]);
  assert.equal(calls.length, 2);
  await rs.streamsFor('Benfica', 'Porto');
  assert.equal(calls.length, 2, 'served from the cache');
  assert.equal((await rs.streamsFor('Braga', 'Arouca')).servers.length, 0);
  assert.equal(rs.status().requestsToday, 2);
});

test('an API error is reported, not thrown', async () => {
  const rs = createRapidStream({ apiKey: 'k', fetchImpl: async () => Response.json({ message: 'You are not subscribed' }, { status: 403 }) });
  const r = await rs.streamsFor('A', 'B');
  assert.match(r.error, /403/);
});

test('HTTP: /api/live2 needs a signed-in player with balance and a live football game', async () => {
  const db = openDb(':memory:');
  seed(db);
  const fetchImpl = async () => Response.json(page([match('Lisboa SC', 'Porto Norte', [HLS])]));
  const rapidStream = createRapidStream({ apiKey: 'k', fetchImpl });
  const server = createApp(db, { loginAttempts: 1000, registrations: 1000, rapidStream }).listen(0);
  await new Promise((r) => server.once('listening', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  let cookie = '';
  const call = async (method, path, body) => {
    const res = await fetch(base + path, { method, headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}) }, body: body ? JSON.stringify(body) : undefined });
    const set = res.headers.get('set-cookie');
    if (set) cookie = set.split(';')[0];
    return { status: res.status, body: await res.json().catch(() => null), csp: res.headers.get('content-security-policy') };
  };
  try {
    const live = db.prepare("SELECT id FROM events WHERE status = 'live' AND sport = 'futebol' AND home = 'Lisboa SC'").get();
    assert.ok(live, 'seed has a live football game');
    const cfg = await call('GET', '/api/config');
    assert.equal(cfg.body.rapidStream, true);
    assert.match(cfg.csp, /media-src 'self' https: blob:/);
    assert.equal((await call('GET', `/api/live2/${live.id}`)).status, 401);
    await call('POST', '/api/auth/register', { name: 'Ana Silva', email: 'ana@example.com', password: 'segredo123', birthdate: '1990-05-10', acceptTerms: true });
    assert.equal((await call('GET', `/api/live2/${live.id}`)).body.reason, 'balance');
    db.prepare("UPDATE users SET balance_cents = 1000 WHERE email = 'ana@example.com'").run();
    const ok = await call('GET', `/api/live2/${live.id}`);
    assert.deepEqual(ok.body, { success: true, servers: [{ name: 'Server 1', url: HLS.url }] });
    const other = db.prepare("SELECT id FROM events WHERE status = 'live' AND sport = 'futebol' AND home <> 'Lisboa SC'").get();
    if (other) assert.equal((await call('GET', `/api/live2/${other.id}`)).status, 404);
  } finally { server.close(); }
});
