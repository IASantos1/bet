import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb, nowIso } from '../server/db.js';
import { createTeamLogos, nameVariants, teamKey } from '../server/teamlogos.js';

test('team names: loose key and other spellings to try', () => {
  assert.equal(teamKey('futebol', 'Atlético  Madrid'), 'futebol|atletico madrid');
  assert.deepEqual(nameVariants('1. Koln'), ['1. Koln', 'Koln']);
  assert.deepEqual(nameVariants('FC Porto'), ['FC Porto', 'Porto']);
  assert.deepEqual(nameVariants('Benfica'), ['Benfica']);
});

test('badges looked up by name for teams the feed sends without one; misses kept a month', async () => {
  const db = openDb(':memory:');
  const soon = new Date(Date.now() + 3_600_000).toISOString();
  const ins = db.prepare(`INSERT INTO events (sport, competition, home, away, start_time, status, source, home_team_ext, away_team_ext, created_at, updated_at)
    VALUES (?, 'L', ?, ?, ?, 'scheduled', 'winhouse', ?, NULL, ?, ?)`);
  ins.run('futebol', 'Eintracht Frankfurt', '1. Koln', soon, null, nowIso(), nowIso());
  ins.run('futebol', 'Porto', 'Nowhere United', soon, 'https://cdn.sportapi.net/a.png', nowIso(), nowIso());
  const asked = [];
  const fetchImpl = async (url) => {
    const t = decodeURIComponent(new URL(url).searchParams.get('t'));
    asked.push(t);
    const teams = {
      'Eintracht Frankfurt': [{ strSport: 'Soccer', strBadge: 'https://r2.thesportsdb.com/images/media/team/badge/ef.png', strColour1: '#E1000F', strColour2: '#000000' }],
      Koln: [{ strSport: 'Basketball', strBadge: 'https://x/b.png' }, { strSport: 'Soccer', strBadge: 'https://r2.thesportsdb.com/k.png', strColour1: 'fff' }],
    }[t] || null;
    return { ok: true, status: 200, json: async () => ({ teams }) };
  };
  const logos = createTeamLogos(db, { fetchImpl });
  assert.equal(logos.get('futebol', 'Eintracht Frankfurt'), null);
  const r = await logos.run();
  assert.deepEqual(r, { asked: 3, found: 2 }); // Porto has the feed's badge: not asked
  assert.ok(!asked.includes('Porto'));
  assert.deepEqual(logos.get('futebol', 'Eintracht Frankfurt'), { logo: 'https://r2.thesportsdb.com/images/media/team/badge/ef.png', colors: ['#e1000f', '#000000'], checkedAt: logos.get('futebol', 'Eintracht Frankfurt').checkedAt });
  assert.equal(logos.get('futebol', '1. Koln').logo, 'https://r2.thesportsdb.com/k.png'); // second spelling, football one
  assert.deepEqual(logos.get('futebol', '1. Koln').colors, ['#ffffff']);
  assert.equal(logos.get('futebol', 'Nowhere United').logo, null);
  // Kept across restarts; a miss is not asked again for a month.
  const again = createTeamLogos(db, { fetchImpl });
  assert.equal(again.get('futebol', '1. Koln').logo, 'https://r2.thesportsdb.com/k.png');
  assert.deepEqual(await again.run(), { asked: 0, found: 0 });
  // Rate-limited: stops for this run without marking anyone.
  db.prepare("DELETE FROM team_logos WHERE team_key LIKE '%nowhere%'").run();
  const limited = createTeamLogos(db, { fetchImpl: async () => ({ ok: false, status: 429, json: async () => ({}) }) });
  assert.deepEqual(await limited.run(), { asked: 0, found: 0 });
  assert.equal(limited.get('futebol', 'Nowhere United'), null);
});
