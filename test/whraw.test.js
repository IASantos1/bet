import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb, nowIso } from '../server/db.js';
import { seed } from '../server/seed.js';
import { createApp } from '../server/app.js';

test('admin: a WinHouse game shows its gameId and everything WinHouse sends for it', async () => {
  const db = openDb(':memory:');
  seed(db);
  const id = Number(db.prepare(`INSERT INTO events (sport, competition, home, away, start_time, status, home_score, away_score, source, external_id, created_at, updated_at)
    VALUES ('tenis', 'ATP. Challenger. Braga', 'A', 'B', ?, 'live', 1, 0, 'winhouse', '777', ?, ?)`).run(nowIso(), nowIso(), nowIso()).lastInsertRowid);
  const asked = [];
  const app = createApp(db, {
    winhouse: { enabled: true, markets: async (o) => { asked.push(o); return { liveAttempt: { keys: ['score'], sample: '{"score":"15:30"}' } }; } },
    winhouseFeed: { rawLive: (g) => (g === '777' ? { id: 777, result: '1-0', current_minute: '2 set', score_info: '15:30' } : null) },
    winhouseTracker: { enabled: true, inspect: async (g) => ({ gameId: g, ok: true }) },
  });
  const server = app.listen(0);
  await new Promise((r) => server.once('listening', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const login = await fetch(`${base}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'admin@classicbet.local', password: 'admin12345' }) });
    const Cookie = login.headers.get('set-cookie').split(';')[0];
    const get = async (p) => { const r = await fetch(base + p, { headers: { Cookie } }); return { status: r.status, body: await r.json() }; };
    const { body } = await get('/api/admin/events');
    assert.equal(body.events.find((e) => e.id === id).externalId, '777');
    const raw = await get(`/api/admin/events/${id}/winhouse-raw`);
    assert.equal(raw.status, 200);
    const data = JSON.parse(raw.body.raw);
    assert.deepEqual(data.listaAoVivo, { id: 777, result: '1-0', current_minute: '2 set', score_info: '15:30' });
    assert.deepEqual(data.paginaAoVivo, { keys: ['score'], sample: '{"score":"15:30"}' });
    assert.deepEqual(data.tracker, { gameId: '777', ok: true });
    assert.deepEqual(asked, [{ gameId: '777', live: true }]);
    // A game from another source has no WinHouse data.
    const manual = db.prepare("SELECT id FROM events WHERE source = 'manual' LIMIT 1").get();
    if (manual) assert.equal((await get(`/api/admin/events/${manual.id}/winhouse-raw`)).status, 409);
    // Players never see the provider's game number.
    assert.equal((await (await fetch(`${base}/api/events/${id}`)).json()).event.externalId, undefined);
  } finally {
    server.close();
    db.close();
  }
});
