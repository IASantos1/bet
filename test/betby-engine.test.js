import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createBetbyEngine, scoreTeams, sameTeam } from '../server/betby-engine.js';

test('team-name matching: club prefixes/suffixes, added cities and transliterated names still match', () => {
  assert.ok(sameTeam('Gence', 'Gence BC'));
  assert.ok(sameTeam('Zemun', 'FK Zemun'));
  assert.ok(sameTeam('Utebo', 'Utebo FC'));
  assert.ok(sameTeam('Sabadell', 'CE Sabadell FC'));
  assert.ok(sameTeam('Besiktas', 'Besiktas'));
  assert.ok(sameTeam('Real Union', 'Real Union de Irun'));
  assert.ok(sameTeam('Radnicki 1923', 'FK Radnicki 1923 Kragujevac'));
  assert.ok(sameTeam('Kolossos Rodou', 'BC Kolossos Rhodes'));
  assert.ok(sameTeam('Capital City Go-Go', 'Capital City GO-GO'));
  // Different clubs that merely share a city must NOT match on their own.
  assert.ok(!sameTeam('Real Madrid', 'Atletico Madrid'));
  assert.ok(!sameTeam('Sporting', 'Benfica'));
});

test('scoreTeams: a confident match scores higher than a weak one, non-matches near zero', () => {
  assert.ok(scoreTeams('Benfica', 'SL Benfica') >= 0.6);
  assert.ok(scoreTeams('Benfica', 'SL Benfica') > scoreTeams('Real Madrid', 'Atletico Madrid'));
  assert.ok(scoreTeams('Sporting', 'Benfica') < 0.5);
});

const cfg = { tracker: 'https://ui.invisiblesport.com', locale: 'en-gb' };

// A snapshot of the two BETBY feeds as the browser relays it: one live football event with a Statscore widget.
function snapshot({ names = ['SL Benfica', 'FC Porto'], sport = '1', scheduled = 1_700_000_000, statscore = 6820840 } = {}) {
  return {
    events: { E1: { sport, scheduled, names } },
    widgets: { E1: [{ id: 'statscore', type: 'scoreboard', event_id: statscore }] },
  };
}

test('engine: off / no teams → null', () => {
  const eng = createBetbyEngine();
  assert.equal(eng.resolve(null, { home: 'A', away: 'B' }), null);
  assert.equal(eng.resolve(cfg, { home: 'A' }), null);
  assert.equal(eng.resolve(cfg, { sport: 'futebol', home: 'A', away: 'B' }), null, 'no feed yet → null');
});

test('engine: matches by team name and builds the Statscore tracker URL', () => {
  const eng = createBetbyEngine();
  eng.ingest(snapshot());
  const url = eng.resolve(cfg, { sport: 'futebol', home: 'Benfica', away: 'Porto', start: '2023-11-14T22:13:20.000Z' });
  assert.ok(url && url.startsWith('https://ui.invisiblesport.com/tracker.html?providers='));
  const providers = JSON.parse(decodeURIComponent(url.split('providers=')[1]));
  assert.equal(providers.id, 'statscore');
  assert.equal(providers.eventId, 6820840);
  assert.equal(providers.sportId, '1');
  assert.equal(providers.liveEvent, true);
});

test('engine: team orientation can be swapped', () => {
  const eng = createBetbyEngine();
  eng.ingest(snapshot());
  assert.ok(eng.resolve(cfg, { sport: 'futebol', home: 'Porto', away: 'Benfica' }), 'home/away swapped still matches');
});

test('engine: a cross-sport name coincidence does NOT match', () => {
  const eng = createBetbyEngine();
  eng.ingest(snapshot({ names: ['Giants', 'Eagles'], sport: '1' })); // BETBY soccer
  assert.equal(eng.resolve(cfg, { sport: 'futamericano', home: 'Giants', away: 'Eagles' }), null);
});

test('engine: a different fixture does not match', () => {
  const eng = createBetbyEngine();
  eng.ingest(snapshot());
  assert.equal(eng.resolve(cfg, { sport: 'futebol', home: 'Sporting', away: 'Braga' }), null);
});

test('engine: no Statscore widget → null (nothing to embed)', () => {
  const eng = createBetbyEngine();
  eng.ingest({ events: { E1: { sport: '1', scheduled: 1, names: ['Benfica', 'Porto'] } }, widgets: { E1: [] } });
  assert.equal(eng.resolve(cfg, { sport: 'futebol', home: 'Benfica', away: 'Porto' }), null);
});

test('engine: a confident match is LOCKED — it survives the feed going empty', () => {
  const eng = createBetbyEngine();
  eng.ingest(snapshot());
  const url = eng.resolve(cfg, { sport: 'futebol', home: 'Benfica', away: 'Porto' });
  assert.ok(url, 'resolves while the feed is present');
  eng.ingest({ events: {}, widgets: {} }); // board emptied
  assert.equal(eng.resolve(cfg, { sport: 'futebol', home: 'Benfica', away: 'Porto' }), url, 'locked URL still returned');
});

test('engine: the admin alias catalog pins a name that would not auto-match', () => {
  const eng = createBetbyEngine();
  eng.ingest(snapshot());
  assert.equal(eng.resolve(cfg, { sport: 'futebol', home: 'Encarnados', away: 'Porto' }), null, 'no match before the alias');
  const eng2 = createBetbyEngine();
  eng2.ingest(snapshot());
  eng2.setAliases([{ from: 'Encarnados', to: 'SL Benfica' }]);
  assert.ok(eng2.resolve(cfg, { sport: 'futebol', home: 'Encarnados', away: 'Porto' }), 'the alias pins the mini-field');
});

test('engine: urlsFor returns a map keyed by our event id', () => {
  const eng = createBetbyEngine();
  eng.ingest(snapshot());
  const urls = eng.urlsFor(cfg, [
    { id: 42, sport: 'futebol', home: 'Benfica', away: 'Porto' },
    { id: 43, sport: 'futebol', home: 'Sporting', away: 'Braga' },
  ]);
  assert.ok(urls[42], 'matched game has a URL');
  assert.equal(urls[43], null, 'unmatched game is null');
});
