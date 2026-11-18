import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb, nowIso } from '../server/db.js';
import { createApp } from '../server/app.js';

function liveEvent(db, home, away, clock, updatedAt) {
  return Number(db.prepare(`INSERT INTO events (sport, competition, home, away, start_time, status, home_score, away_score, clock, source, created_at, updated_at)
    VALUES ('futebol', 'Spain Copa del Rey', ?, ?, ?, 'live', 1, 1, ?, 'winhouse', ?, ?)`)
    .run(home, away, new Date(Date.now() - 3600_000).toISOString(), clock, nowIso(), updatedAt).lastInsertRowid);
}

async function board(db) {
  const srv = createApp(db).listen(0);
  try {
    const port = srv.address().port;
    const r = await fetch(`http://127.0.0.1:${port}/api/events`).then((x) => x.json());
    return r.events || [];
  } finally {
    srv.close();
  }
}

test('the same live fixture shown twice collapses to one (keeps the most recently updated row)', async () => {
  const db = openDb(':memory:');
  liveEvent(db, 'Alcoyano', 'Mallorca', 'Intervalo', new Date(Date.now() - 600_000).toISOString()); // stale
  const current = liveEvent(db, 'Alcoyano', 'Mallorca', "89'", nowIso());                            // current
  liveEvent(db, 'Badajoz', 'Tenerife', "88'", nowIso());                                             // distinct
  const events = await board(db);
  const dup = events.filter((e) => e.home === 'Alcoyano' && e.away === 'Mallorca');
  assert.equal(dup.length, 1, 'the duplicated fixture appears once');
  assert.equal(dup[0].id, current, 'the row kept is the most recently updated one (89\', not Intervalo)');
  assert.equal(events.length, 2, 'two distinct fixtures remain');
});

test('a live row wins over a stale scheduled twin of the same fixture', async () => {
  const db = openDb(':memory:');
  // A scheduled pre-match row and its live twin (different ids) — only the live one should show.
  db.prepare(`INSERT INTO events (sport, competition, home, away, start_time, status, source, created_at, updated_at)
    VALUES ('futebol', 'Liga', 'Celta', 'Getafe', ?, 'scheduled', 'winhouse', ?, ?)`)
    .run(new Date(Date.now() + 1800_000).toISOString(), nowIso(), nowIso());
  const live = liveEvent(db, 'Celta', 'Getafe', "12'", nowIso());
  const events = await board(db);
  const twin = events.filter((e) => e.home === 'Celta' && e.away === 'Getafe');
  assert.equal(twin.length, 1, 'the fixture shows once');
  assert.equal(twin[0].id, live, 'the live row is the one kept');
});
