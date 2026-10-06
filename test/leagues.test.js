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

test('football leagues with the same name elsewhere do not jump the queue', () => {
  assert.equal(leagueTier('futebol', 'England. Premier League'), 1);
  assert.equal(leagueTier('futebol', 'Inglaterra. Premier League'), 1);
  assert.equal(leagueTier('futebol', 'Egypt. Premier League'), 9);
  assert.equal(leagueTier('futebol', 'Brazil. Serie A'), 1);
  assert.equal(leagueTier('futebol', 'Ecuador. Serie A'), 9);
  assert.equal(leagueTier('futebol', 'Austria. Bundesliga'), 9);
  assert.equal(leagueTier('futebol', 'França. Ligue 1'), 1);
  assert.equal(leagueTier('futebol', 'AFC Champions League'), 9);
  assert.equal(leagueTier('futebol', 'UEFA Champions League'), 1);
  assert.equal(leagueTier('futebol', 'World Cup. Qualification. Europe'), 2);
  assert.equal(leagueTier('futebol', 'Spain. Segunda Division'), 2);
  assert.equal(leagueTier('futebol', 'Saudi Arabia. Pro League'), 2);
});
