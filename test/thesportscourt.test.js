import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTheSportsCourt } from '../server/thesportscourt.js';

const delay = (ms) => new Promise((r) => setTimeout(r, ms));

// A fake live manager (thesportslive.js) and SportScore client.
function fakes({ ball = { x: 0.4, y: 0.6 }, score = '1-0', resolve = true } = {}) {
  const watched = new Set();
  const thesportsLive = {
    enabled: true,
    watch: (id) => watched.add(id),
    unwatch: (id) => watched.delete(id),
    get: (id) => (watched.has(id) ? { id, ball, score } : null),
  };
  const sportscore = {
    enabled: true,
    matches: async () => ({ ok: true, data: { matches: resolve ? [{ url: '/tennis/match/a-vs-b/', home_team: { name: 'Ann' }, away_team: { name: 'Bea' }, status: 'live' }] : [] } }),
    match: async () => ({ ok: true, data: { tracker: { id: 'trk123abc', sport: 'tennis' } } }),
  };
  return { thesportsLive, sportscore, watched };
}

const liveTennis = { id: 7, sport: 'tenis', status: 'live', home: 'Ann', away: 'Bea' };

test('court: covers only live court sports while enabled', () => {
  const { thesportsLive, sportscore } = fakes();
  const court = createTheSportsCourt({ thesportsLive, sportscore });
  assert.ok(court.covers(liveTennis));
  assert.ok(court.covers({ ...liveTennis, sport: 'basquetebol' }));
  assert.ok(!court.covers({ ...liveTennis, sport: 'futebol' })); // football keeps its own pitch
  assert.ok(!court.covers({ ...liveTennis, status: 'upcoming' })); // not live
});

test('court: disabled when a client is missing', () => {
  assert.equal(createTheSportsCourt({ thesportsLive: { enabled: true }, sportscore: null }).enabled, false);
  assert.equal(createTheSportsCourt({ thesportsLive: { enabled: false }, sportscore: { enabled: true } }).enabled, false);
});

test('court: follow resolves the tracker, watches it and streams the ball', async () => {
  const { thesportsLive, sportscore, watched } = fakes({ ball: { x: 0.2, y: 0.8 }, score: '2-1' });
  const court = createTheSportsCourt({ thesportsLive, sportscore, pollMs: 10 });
  const got = [];
  court.bus.on('e:7', (m) => got.push(m));
  const unfollow = court.follow(7, liveTennis);
  await delay(60);
  assert.ok(watched.has('trk123abc'), 'watches the resolved tracker id');
  assert.ok(got.length >= 1, 'emits at least one court frame');
  assert.deepEqual(got[0], { type: 'court', data: { ball: { x: 0.2, y: 0.8 }, score: '2-1' } });
  assert.deepEqual(court.snapshot(7), { ball: { x: 0.2, y: 0.8 }, score: '2-1' });
  unfollow();
  assert.ok(!watched.has('trk123abc'), 'unwatches when the last viewer leaves');
});

test('court: two viewers share one watch; it stops only when both leave', async () => {
  const { thesportsLive, sportscore, watched } = fakes();
  const court = createTheSportsCourt({ thesportsLive, sportscore, pollMs: 10 });
  const a = court.follow(7, liveTennis);
  const b = court.follow(7, liveTennis);
  await delay(40);
  assert.ok(watched.has('trk123abc'));
  a();
  assert.ok(watched.has('trk123abc'), 'still watched while one viewer remains');
  b();
  assert.ok(!watched.has('trk123abc'), 'stopped when the last viewer leaves');
});

test('court: no tracker found → nothing watched, no throw', async () => {
  const { thesportsLive, sportscore, watched } = fakes({ resolve: false });
  const court = createTheSportsCourt({ thesportsLive, sportscore, pollMs: 10 });
  const unfollow = court.follow(7, liveTennis);
  await delay(40);
  assert.equal(watched.size, 0);
  unfollow();
});

test('court: follow on a non-court sport is a no-op', () => {
  const { thesportsLive, sportscore } = fakes();
  const court = createTheSportsCourt({ thesportsLive, sportscore });
  const unfollow = court.follow(9, { ...liveTennis, sport: 'futebol' });
  assert.equal(court.isFollowing(9), false);
  unfollow();
});
