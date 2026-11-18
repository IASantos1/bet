import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb, nowIso, setSetting } from '../server/db.js';
import { createApp } from '../server/app.js';

function addEvent(db, home, away) {
  const id = Number(db.prepare(`INSERT INTO events (sport, competition, home, away, start_time, status, created_at, updated_at)
    VALUES ('futebol', 'Liga', ?, ?, ?, 'scheduled', ?, ?)`)
    .run(home, away, new Date(Date.now() + 3600_000).toISOString(), nowIso(), nowIso()).lastInsertRowid);
  db.prepare("INSERT INTO selections (event_id, market, code, odds_x100, active) VALUES (?, '1x2', '1', 150, 1), (?, '1x2', 'X', 380, 1), (?, '1x2', '2', 600, 1)").run(id, id, id);
  return id;
}

async function boardNames(db) {
  const srv = createApp(db).listen(0);
  try {
    const port = srv.address().port;
    const r = await fetch(`http://127.0.0.1:${port}/api/events`).then((x) => x.json());
    return (r.events || []).flatMap((e) => [e.home, e.away]);
  } finally {
    srv.close();
  }
}

test('untranslated (non-Latin) team names are blocked from the board by default', async () => {
  const db = openDb(':memory:');
  addEvent(db, 'Benfica', 'Porto');               // Latin → shown
  addEvent(db, 'Sporting', 'Braga');              // Latin → shown
  addEvent(db, 'Шуйфу Юньфу', 'Чжэньсюн Луокан');  // Cyrillic → hidden
  addEvent(db, '上海队', '北京队');                 // Chinese → hidden
  addEvent(db, '東京', 'FC Tokyo');                // Japanese on one side → hidden
  const names = await boardNames(db);
  assert.ok(names.includes('Benfica') && names.includes('Sporting'), 'Latin games stay');
  assert.ok(!names.some((n) => /[Ѐ-ӿ㐀-鿿぀-ヿ]/.test(n)), 'no non-Latin names on the board');
  assert.equal(names.length, 4, 'only the two Latin games (4 names) are shown');
});

test('the filter can be turned off (events.hideForeign = false)', async () => {
  const db = openDb(':memory:');
  addEvent(db, 'Benfica', 'Porto');
  addEvent(db, 'Шуйфу Юньфу', 'Чжэньсюн Луокан');
  setSetting(db, 'events.hideForeign', false);
  const names = await boardNames(db);
  assert.ok(names.includes('Шуйфу Юньфу'), 'with the filter off, foreign names appear');
});
