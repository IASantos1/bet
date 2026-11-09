import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTheSportsCourt } from '../server/thesportscourt.js';

const delay = (ms) => new Promise((r) => setTimeout(r, ms));

// A fake live manager (thesportslive.js): the feed holds games with lineup names and a ball.
function fakes({ ball = { x: 0.4, y: 0.6 }, score = '1-0', present = true } = {}) {
  const st = { held: 0 };
  const game = { id: 'trk123abc', score, ball, players: ['Ann', 'Bea'], msgs: 5, lastAt: '2026-11-09T20:01:00Z' };
  const thesportsLive = {
    enabled: true,
    hold: () => { st.held += 1; },
    release: () => { st.held = Math.max(0, st.held - 1); },
    games: () => (present ? [{ id: 'other', players: ['Zoe', 'Yan'], msgs: 2 }, game] : [{ id: 'other', players: ['Zoe', 'Yan'], msgs: 2 }]),
    get: (id) => (id === 'trk123abc' ? game : null),
  };
  return { thesportsLive, st };
}

const liveTennis = { id: 7, sport: 'tenis', status: 'live', home: 'Ann', away: 'Bea' };

test('court: covers only live court sports while enabled', () => {
  const { thesportsLive } = fakes();
  const court = createTheSportsCourt({ thesportsLive });
  assert.ok(court.covers(liveTennis));
  assert.ok(court.covers({ ...liveTennis, sport: 'basquetebol' }));
  assert.ok(!court.covers({ ...liveTennis, sport: 'futebol' })); // football keeps its own pitch
  assert.ok(!court.covers({ ...liveTennis, status: 'upcoming' })); // not live
});

test('court: disabled when the feed manager is off', () => {
  assert.equal(createTheSportsCourt({ thesportsLive: { enabled: false } }).enabled, false);
  assert.equal(createTheSportsCourt({ thesportsLive: null }).enabled, false);
});

test('court: follow holds the feed, links by names and streams the ball', async () => {
  const { thesportsLive, st } = fakes({ ball: { x: 0.2, y: 0.8 }, score: '2-1' });
  const court = createTheSportsCourt({ thesportsLive, pollMs: 10 });
  const got = [];
  court.bus.on('e:7', (m) => got.push(m));
  const unfollow = court.follow(7, liveTennis);
  assert.equal(st.held, 1, 'holds the feed open while a court is watched');
  await delay(60);
  assert.ok(got.length >= 1, 'emits at least one court frame');
  assert.deepEqual(got[0], { type: 'court', data: { ball: { x: 0.2, y: 0.8 }, score: '2-1' } });
  assert.equal(court.isFollowing(7), true);
  assert.equal(court.status().matches[0].trackerId, 'trk123abc');
  unfollow();
  assert.equal(st.held, 0, 'releases the feed when the last viewer leaves');
});

test('court: two viewers share one hold; it releases only when both leave', async () => {
  const { thesportsLive, st } = fakes();
  const court = createTheSportsCourt({ thesportsLive, pollMs: 10 });
  const a = court.follow(7, liveTennis);
  const b = court.follow(7, liveTennis);
  await delay(30);
  assert.equal(st.held, 1, 'one shared hold for the match, not one per viewer');
  a();
  assert.equal(st.held, 1, 'still held while one viewer remains');
  b();
  assert.equal(st.held, 0, 'released when the last viewer leaves');
});

test('court: no feed game with these names → not linked, reason set, no throw', async () => {
  const { thesportsLive } = fakes({ present: false });
  const court = createTheSportsCourt({ thesportsLive, pollMs: 10 });
  const unfollow = court.follow(7, liveTennis);
  await delay(40);
  const row = court.status().matches.find((m) => m.eventId === 7);
  assert.equal(row.trackerId, null);
  assert.match(row.reason, /feed/i);
  unfollow();
});

test('court: follow on a non-court sport is a no-op', () => {
  const { thesportsLive } = fakes();
  const court = createTheSportsCourt({ thesportsLive });
  const unfollow = court.follow(9, { ...liveTennis, sport: 'futebol' });
  assert.equal(court.isFollowing(9), false);
  unfollow();
});
