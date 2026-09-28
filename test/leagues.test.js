import { test } from 'node:test';
import assert from 'node:assert/strict';
import { leagueTier } from '../server/leagues.js';

test('big leagues come first in every sport', () => {
  assert.equal(leagueTier('futebol', 'Premier League'), 1);
  assert.equal(leagueTier('futebol', 'Liga Portugal'), 1);
  assert.equal(leagueTier('futebol', 'UEFA Europa League'), 2);
  assert.equal(leagueTier('futebol', 'Segunda Liga'), 9);
  assert.equal(leagueTier('tenis', 'ATP · Wimbledon · Final'), 1);
  assert.equal(leagueTier('tenis', 'ATP · Rome Masters · Final'), 2);
  assert.equal(leagueTier('tenis', 'ATP · Challenger Lyon'), 9);
  assert.equal(leagueTier('basquetebol', 'NBA'), 1);
  assert.equal(leagueTier('dardos', 'World Matchplay 2026 · Final'), 1);
  assert.equal(leagueTier('esports', 'IEM Cologne 2026 · Semifinal · BO3'), 1);
  assert.equal(leagueTier('hoquei', 'NHL'), 1);
});
