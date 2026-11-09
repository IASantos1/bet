import { test } from 'node:test';
import assert from 'node:assert/strict';
import { matchFeedGame } from '../server/thesportsfeedlink.js';

const games = [
  { id: 'g-other', players: ['Zoe Vai', 'Yan Sol'], ball: { x: 0.1, y: 0.2 }, lastAt: '2026-11-09T20:00:00Z' },
  { id: 'g-ann-bea', players: ['Ann Lee', 'Bea Mar'], ball: { x: 0.4, y: 0.6 }, score: '1-0-1-0', lastAt: '2026-11-09T20:01:00Z' },
  { id: 'g-no-ball', players: ['Ann Lee', 'Bea Mar'], ball: null, score: '0-0', lastAt: '2026-11-09T20:02:00Z' },
];

test('feed link: matches the game whose lineup has both sides (either order)', () => {
  assert.equal(matchFeedGame(games, 'Ann Lee', 'Bea Mar')?.id, 'g-ann-bea');
  assert.equal(matchFeedGame(games, 'Bea Mar', 'Ann Lee')?.id, 'g-ann-bea'); // order swapped
});

test('feed link: prefers a game that currently has a ball', () => {
  // both g-ann-bea (ball) and g-no-ball match; the one with a ball wins
  assert.equal(matchFeedGame(games, 'Ann Lee', 'Bea Mar')?.id, 'g-ann-bea');
});

test('feed link: loose name matching (accents / extra words)', () => {
  assert.equal(matchFeedGame(games, 'Ann', 'Bea')?.id, 'g-ann-bea');
});

test('feed link: null when no game has both names, or a side is missing', () => {
  assert.equal(matchFeedGame(games, 'Ann Lee', 'Nobody'), null);
  assert.equal(matchFeedGame(games, '', 'Bea Mar'), null);
  assert.equal(matchFeedGame([], 'Ann', 'Bea'), null);
});
