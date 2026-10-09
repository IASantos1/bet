import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../server/db.js';
import { seed } from '../server/seed.js';
import { createApp } from '../server/app.js';
import express from 'express';
import { createRapidStream, nameScore, playableServers, createVideoProxy, safeTarget, rankServers, findStreams } from '../server/rapidstream.js';

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

test('HLS then FLV servers are offered (direct first, referer ones too), never DRM or local hosts', () => {
  const out = playableServers([
    HLS,
    { name: 'Server 2', url: 'https://cdn.example.com/a.mpd|drmScheme=clearkey', type: 'drm' },
    { name: 'Server 3', url: 'https://cdn.example.com/b.m3u8', header: { referer: 'https://x/' }, type: 'referer' },
    { name: 'Server 4', url: 'http://cdn.example.com/c.m3u8', type: 'direct' },
    { name: 'Server 5', url: 'https://cdn.example.com/d.flv', type: 'direct' },
    { name: 'Server 6', url: 'https://127.0.0.1/e.m3u8', type: 'direct' },
  ]);
  assert.deepEqual(out.map((s) => [s.name, s.kind, s.referer]), [['Server 1', 'hls', null], ['Server 4', 'hls', null], ['Server 3', 'hls', 'https://x/'], ['Server 5', 'flv', null]]);
  assert.equal(safeTarget('https://192.168.1.1/a'), null);
  assert.equal(safeTarget('https://fcbarcelona.com/a.m3u8')?.hostname, 'fcbarcelona.com');
});

test('live matches: all pages read once, cached, matched to our game in either order', async () => {
  const calls = [];
  const fetchImpl = async (url, opts) => {
    calls.push(url);
    assert.equal(opts.headers['X-RapidAPI-Key'], 'k');
    const n = Number(new URL(url).searchParams.get('page'));
    return Response.json(n === 1 ? page([match('Benfica', 'Porto', [HLS])], true) : page([match('Gil Vicente FC', 'Moreirense', [HLS])]));
  };
  const rs = createRapidStream({ apiKey: 'k', listPath: '/matches?page={page}', fetchImpl });
  const r = await rs.streamsFor('Moreirense', 'Gil Vicente');
  assert.deepEqual(r.servers.map((s) => s.url), [HLS.url]);
  assert.equal(calls.length, 2);
  await rs.streamsFor('Benfica', 'Porto');
  assert.equal(calls.length, 2, 'served from the cache');
  assert.equal((await rs.streamsFor('Braga', 'Arouca')).servers.length, 0);
  assert.equal(rs.status().requestsToday, 2);
});

test('the same game listed twice: the servers of both listings are offered', async () => {
  const two = { ...HLS, name: 'Server 2', url: 'https://cdn.example.com/live/b.m3u8' };
  const fetchImpl = async () => Response.json(page([match('Gimnasia La Plata', 'Atl. Tucuman', [HLS]), match('Gimnasia La Plata', 'Atletico Tucuman', [HLS, two])]));
  const rs = createRapidStream({ apiKey: 'k', listPath: '/matches?page={page}', fetchImpl });
  const r = await rs.streamsFor('Gimnasia y Esgrima La Plata', 'Atletico Tucuman');
  assert.deepEqual(r.servers.map((s) => s.url), [HLS.url, two.url]);
});

test('an API error is reported, not thrown', async () => {
  const rs = createRapidStream({ apiKey: 'k', listPath: '/matches?page={page}', fetchImpl: async () => Response.json({ message: 'You are not subscribed' }, { status: 403 }) });
  const r = await rs.streamsFor('A', 'B');
  assert.match(r.error, /403/);
});

test('HTTP: /api/live2 needs a signed-in player with balance and a live football game', async () => {
  const db = openDb(':memory:');
  seed(db);
  const fetchImpl = async (url) => (String(url).includes('.m3u8') ? new Response('#EXTM3U\n') : Response.json(page([match('Lisboa SC', 'Porto Norte', [HLS])])));
  const rapidStream = createRapidStream({ apiKey: 'k', listPath: '/matches?page={page}', fetchImpl });
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
    // Stripe's API stays allowed, and no unexpanded template text reaches the header.
    assert.match(cfg.csp, /connect-src 'self' https:\/\/api\.stripe\.com https:;/);
    assert.doesNotMatch(cfg.csp, /\$\{/);
    assert.equal((await call('GET', `/api/live2/${live.id}`)).status, 401);
    await call('POST', '/api/auth/register', { name: 'Ana Silva', email: 'ana@example.com', password: 'segredo123', birthdate: '1990-05-10', acceptTerms: true });
    assert.equal((await call('GET', `/api/live2/${live.id}`)).body.reason, 'balance');
    db.prepare("UPDATE users SET balance_cents = 1000 WHERE email = 'ana@example.com'").run();
    const ok = await call('GET', `/api/live2/${live.id}`);
    assert.equal(ok.body.servers.length, 1);
    assert.match(ok.body.servers[0].url, /^\/api\/tv\/p\?t=/);
    // The proxy: refused without a valid token; with one, refused to a signed-out visitor.
    assert.equal((await call('GET', '/api/tv/p?t=bad.sig')).status, 403);
    const other = db.prepare("SELECT id FROM events WHERE status = 'live' AND sport = 'futebol' AND home <> 'Lisboa SC'").get();
    if (other) assert.equal((await call('GET', `/api/live2/${other.id}`)).status, 404);
  } finally { server.close(); }
});

test('video proxy: signed addresses only, playlists rewritten, headers sent, segments passed through', async () => {
  const seen = [];
  const fetchImpl = async (url, opts) => {
    seen.push({ url, referer: opts.headers.Referer });
    if (url.endsWith('.m3u8')) {
      return new Response('#EXTM3U\n#EXT-X-KEY:METHOD=AES-128,URI="key.bin"\nseg1.ts\nhttp://other.example.org/seg2.ts\nhttps://10.0.0.1/x.ts\n', { headers: { 'content-type': 'application/vnd.apple.mpegurl' } });
    }
    return new Response(Buffer.from('TSDATA'), { headers: { 'content-type': 'video/mp2t' } });
  };
  const proxy = createVideoProxy({ fetchImpl });
  const app = express();
  app.get('/api/tv/p', (req, res) => proxy.handle(req, res));
  const server = app.listen(0);
  await new Promise((r) => server.once('listening', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const start = proxy.sign('https://cdn.example.com/live/index.m3u8', { referer: 'https://portal.example.com/' });
    const list = await (await fetch(base + start)).text();
    const lines = list.split('\n');
    assert.equal(lines[0], '#EXTM3U');
    assert.match(lines[1], /URI="\/api\/tv\/p\?t=/);
    assert.match(lines[2], /^\/api\/tv\/p\?t=/);
    assert.match(lines[3], /^\/api\/tv\/p\?t=/);
    assert.equal(lines[4], '', 'a private address is dropped');
    assert.equal(seen[0].referer, 'https://portal.example.com/');
    const seg = await fetch(base + lines[2]);
    assert.equal(await seg.text(), 'TSDATA');
    assert.equal(seen[1].url, 'https://cdn.example.com/live/seg1.ts');
    assert.equal(seen[1].referer, 'https://portal.example.com/', 'the referer rides along');
    // A token changed by hand is refused.
    assert.equal((await fetch(base + lines[2].replace(/.$/, (c) => (c === 'A' ? 'B' : 'A')))).status, 403);
    assert.equal(proxy.open(proxy.sign('https://127.0.0.1/x').split('t=')[1]), null);
  } finally { server.close(); }
});

test('servers are probed at once: the fastest that answers first, the dead ones left out', async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const fetchImpl = async (url) => {
    if (url.includes('dead')) throw new Error('timeout');
    if (url.includes('slow')) { await wait(60); return new Response('#EXTM3U\n'); }
    if (url.includes('html')) return new Response('<html>blocked</html>');
    return new Response('#EXTM3U\n');
  };
  const s = (n) => ({ name: n, url: `https://cdn.example.com/${n}-${Math.random()}.m3u8` });
  const list = [s('slow'), s('dead'), s('html'), s('fast')];
  const out = await rankServers(list, { fetchImpl });
  assert.deepEqual(out.map((x) => x.name), ['fast', 'slow']);
  // None answers: the list is kept as it was.
  const none = [s('dead'), s('html')];
  assert.deepEqual((await rankServers(none, { fetchImpl })).map((x) => x.name), ['dead', 'html']);
});

test('FLV: probed by its signature, streamed through the proxy as one long response', async () => {
  const flvBody = () => new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode('FLV\x01\x05')); c.enqueue(new TextEncoder().encode('more')); c.close(); } });
  const fetchImpl = async (url) => (url.includes('good') ? new Response(flvBody(), { headers: { 'content-type': 'video/x-flv' } }) : new Response('<html>no</html>'));
  const list = [{ name: 'bad', kind: 'flv', url: 'https://cdn.example.com/bad.flv' }, { name: 'good', kind: 'flv', url: 'https://cdn.example.com/good.flv' }];
  assert.deepEqual((await rankServers(list, { fetchImpl })).map((x) => x.name), ['good']);
  const proxy = createVideoProxy({ fetchImpl });
  const app = express();
  app.get('/api/tv/p', (req, res) => proxy.handle(req, res));
  const server = app.listen(0);
  await new Promise((r) => server.once('listening', r));
  try {
    const res = await fetch(`http://127.0.0.1:${server.address().port}${proxy.sign('https://cdn.example.com/good.flv')}`);
    assert.equal(res.headers.get('content-type'), 'video/x-flv');
    assert.equal(await res.text(), 'FLV\x01\x05more');
  } finally { server.close(); }
});

test('admin raw call: any path of the configured host, answered as it comes; odd paths refused', async () => {
  const seen = [];
  const rs = createRapidStream({ apiKey: 'k', listPath: '/l', host: 'other-api.p.rapidapi.com', fetchImpl: async (url, opts) => { seen.push([url, opts.headers['X-RapidAPI-Host']]); return Response.json({ ok: 1 }); } });
  const r = await rs.raw('/live?x=1');
  assert.deepEqual([r.status, r.json], [200, { ok: 1 }]);
  assert.deepEqual(seen[0], ['https://other-api.p.rapidapi.com/live?x=1', 'other-api.p.rapidapi.com']);
  await assert.rejects(rs.raw('https://evil.example/x'), /caminho/);
  await assert.rejects(rs.raw('/../x'), /caminho/);
});

test('player page link (?url=…m3u8): the inner playlist is played with the player page as referer', () => {
  const [s] = findStreams({ url: 'https://football-live-stream.online/?url=https://station1.example.org/live/abc/playlist.m3u8' });
  assert.equal(s.url, 'https://station1.example.org/live/abc/playlist.m3u8');
  assert.equal(s.type, 'referer');
  assert.equal(s.header.referer, 'https://football-live-stream.online/');
  assert.equal(findStreams({ url: 'https://cdn.example.org/live/x.m3u8?token=1' })[0].type, 'direct');
});

test('key without list route: video stays off, admin route tool still answers', async () => {
  const rs = createRapidStream({ apiKey: 'k', fetchImpl: async () => Response.json({ result: [] }) });
  assert.equal(rs.enabled, false);
  assert.equal((await rs.raw('/link/abc')).status, 200);
});

test('"football-live-stream-api" shape: result[] list (live only), links from the game route', async () => {
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(url);
    if (url.includes('/list')) {
      return Response.json({ result: [
        { league: 'Argentine Division 1', home_name: 'Gimnasia La Plata', away_name: 'Atletico Tucuman', status: 'Live', score: '0 - 0', id: '8yomo4h16xykq0j' },
        { league: 'Liga', home_name: 'Benfica', away_name: 'Porto', status: 'Upcoming', id: 'zzz' },
      ] });
    }
    return Response.json({ data: { links: [{ label: 'HD', url: 'https://cdn.example.com/a/index.m3u8', headers: { Referer: 'https://site.example/' } }, { url: 'https://cdn.example.com/b.flv' }, { url: 'https://x.example/c.mpd|drm=1' }] } });
  };
  const rs = createRapidStream({ apiKey: 'k', host: 'football-live-stream-api.p.rapidapi.com', listPath: '/list', streamPath: '/stream?id={id}', fetchImpl });
  const r = await rs.streamsFor('Gimnasia y Esgrima La Plata', 'Atletico Tucuman');
  assert.deepEqual(r.servers.map((x) => [x.name, x.kind, x.referer]), [['HD', 'hls', 'https://site.example/'], ['Servidor 2', 'flv', null]]);
  assert.equal(calls.filter((u) => u.includes('/stream?id=8yomo4h16xykq0j')).length, 1);
  assert.equal((await rs.streamsFor('Benfica', 'Porto')).servers.length, 0, 'upcoming games are not live');
  await rs.streamsFor('Gimnasia La Plata', 'Atl. Tucuman');
  assert.equal(calls.length, 2, 'list and game route served from the cache');
  assert.equal(findStreams({ a: 'nothing here' }).length, 0);
});
