import { test } from 'node:test';
import assert from 'node:assert/strict';
import { matchPlayerName, gradePlayerMarket } from '../server/playermarkets.js';

// A match report as goalApi.matchReport produces: players with team / goals / assists / yellow / red.
const report = {
  home: { id: 'H', name: 'Benfica' },
  away: { id: 'A', name: 'Porto' },
  players: [
    { id: 'p1', name: 'Di María', team: 'home', goals: 2, assists: 1, yellow: 0, red: 1 },
    { id: 'p5', name: 'S. Solans', team: 'away', goals: 1, assists: 0, yellow: 1, red: 0 },
    { id: 'p9', name: 'J. Félix', team: 'home', goals: 0, assists: 1, yellow: 0, red: 0 },
  ],
};

test('name match: BETBY full name to GOAL short name by surname + initial', () => {
  assert.equal(matchPlayerName('Sérgio Solans', report.players, 'away').player?.id, 'p5');
  assert.equal(matchPlayerName('Sérgio Solans', report.players, 'away').confidence, 'surname-initial');
  // Exact full name.
  assert.equal(matchPlayerName('Di María', report.players).confidence, 'exact');
  // Wrong side filters it out.
  assert.equal(matchPlayerName('Sérgio Solans', report.players, 'home').player, null);
  // Wrong initial rejects a same-surname guess.
  assert.equal(matchPlayerName('Marcos Solans', report.players, 'away').player, null);
});

test('name match: id wins when present', () => {
  const m = matchPlayerName('whoever', report.players, null, 'p1');
  assert.equal(m.player.id, 'p1');
  assert.equal(m.confidence, 'id');
});

test('grade: anytime scorer won / lost, finished vs pending', () => {
  assert.equal(gradePlayerMarket({ kind: 'anytime_scorer', player: 'Di María', side: 'home' }, report).result, 'WON');
  assert.equal(gradePlayerMarket({ kind: 'scorer_2plus', player: 'Di María', side: 'home' }, report).result, 'WON');
  assert.equal(gradePlayerMarket({ kind: 'hattrick', player: 'Di María', side: 'home' }, report).result, 'PENDING');
  assert.equal(gradePlayerMarket({ kind: 'hattrick', player: 'Di María', side: 'home' }, report, { finished: true }).result, 'LOST');
});

test('grade: assists, cards and sent-off', () => {
  assert.equal(gradePlayerMarket({ kind: 'anytime_assist', player: 'João Félix', side: 'home' }, report).result, 'WON');
  assert.equal(gradePlayerMarket({ kind: 'to_be_carded', player: 'Sérgio Solans', side: 'away' }, report).result, 'WON');
  assert.equal(gradePlayerMarket({ kind: 'to_be_sent_off', player: 'Di María', side: 'home' }, report).result, 'WON');
  assert.equal(gradePlayerMarket({ kind: 'to_be_sent_off', player: 'Sérgio Solans', side: 'away' }, report, { finished: true }).result, 'LOST');
});

test('grade: unknown player is pending while live, loss when finished with a feed', () => {
  assert.equal(gradePlayerMarket({ kind: 'anytime_scorer', player: 'Ninguém', side: 'home' }, report).result, 'PENDING');
  assert.equal(gradePlayerMarket({ kind: 'anytime_scorer', player: 'Ninguém', side: 'home' }, report, { finished: true }).result, 'LOST');
  // No feed at all stays pending even when finished.
  assert.equal(gradePlayerMarket({ kind: 'anytime_scorer', player: 'Ninguém' }, { players: [] }, { finished: true }).result, 'PENDING');
});
