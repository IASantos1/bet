import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveBetbyTracker, runBetbyEngine, scoreTeams, sameTeam, setBetbyAliases } from '../public/betby-tracker.js';

test('team-name matching: club prefixes/suffixes, added cities and transliterated names still match', () => {
  // Prefix/suffix club designators (football + basketball).
  assert.ok(sameTeam('Gence', 'Gence BC'));
  assert.ok(sameTeam('Zemun', 'FK Zemun'));
  assert.ok(sameTeam('Utebo', 'Utebo FC'));
  assert.ok(sameTeam('Sabadell', 'CE Sabadell FC'));
  assert.ok(sameTeam('Besiktas', 'Besiktas'));
  // An added city / suffix.
  assert.ok(sameTeam('Real Union', 'Real Union de Irun'));
  assert.ok(sameTeam('Radnicki 1923', 'FK Radnicki 1923 Kragujevac'));
  // Transliterated city, same club name.
  assert.ok(sameTeam('Kolossos Rodou', 'BC Kolossos Rhodes'));
  // Hyphen / case differences.
  assert.ok(sameTeam('Capital City Go-Go', 'Capital City GO-GO'));
  // Different clubs that merely share a city must NOT match on their own.
  assert.ok(!sameTeam('Real Madrid', 'Atletico Madrid'));
  assert.ok(!sameTeam('Sporting', 'Benfica'));
});

const cfg = { base: 'https://demoapi.betby.com', brandId: 'B1', tracker: 'https://ui.invisiblesport.com', locale: 'en-gb' };

// Minimal fake of the two BETBY feeds. One live football event (Benfica vs Porto) with a Statscore widget.
function fakeFeeds({ competitors = [{ name: 'SL Benfica' }, { name: 'FC Porto' }], sport = '1', scheduled = 1_700_000_000, statscore = 6820840 } = {}) {
  return (url) => {
    const u = String(url);
    let body = {};
    if (u.includes('/v4/live/') && u.endsWith('/0')) body = { events: { E1: { desc: { sport, scheduled, competitors } } }, top_events_versions: [] };
    else if (u.includes('/v1/side/') && u.endsWith('/0')) body = { version: '7' };
    else if (u.includes('/v1/side/')) body = { version: '7', items: [[['E1', 'widget'], [{ id: 'statscore', type: 'scoreboard', event_id: statscore }]]] };
    return Promise.resolve({ ok: true, json: () => Promise.resolve(body) });
  };
}

test('BETBY tracker: no config or no teams → null (feature inert)', async () => {
  assert.equal(await resolveBetbyTracker(null, { home: 'A', away: 'B' }), null);
  assert.equal(await resolveBetbyTracker(cfg, { home: 'A' }), null);
});

test('BETBY tracker: matches by team name and builds the Statscore URL', async () => {
  globalThis.fetch = fakeFeeds();
  const url = await resolveBetbyTracker({ ...cfg, brandId: 'match1' }, { sport: 'futebol', home: 'Benfica', away: 'Porto', start: '2023-11-14T22:13:20.000Z' });
  assert.ok(url, 'should resolve a URL');
  assert.ok(url.startsWith('https://ui.invisiblesport.com/tracker.html?providers='));
  const providers = JSON.parse(decodeURIComponent(url.split('providers=')[1]));
  assert.equal(providers.id, 'statscore');
  assert.equal(providers.eventId, 6820840);
  assert.equal(providers.sportId, '1');
  assert.equal(providers.liveEvent, true);
});

test('BETBY tracker: team orientation can be swapped', async () => {
  globalThis.fetch = fakeFeeds();
  const url = await resolveBetbyTracker({ ...cfg, brandId: 'match2' }, { sport: 'futebol', home: 'Porto', away: 'Benfica' });
  assert.ok(url, 'home/away swapped vs BETBY should still match');
});

test('BETBY tracker: a cross-sport name coincidence does NOT match', async () => {
  // BETBY has a SOCCER event (sport "1") for "Giants vs Eagles"; our live game is AMERICAN FOOTBALL.
  globalThis.fetch = fakeFeeds({ competitors: [{ name: 'Giants' }, { name: 'Eagles' }], sport: '1' });
  const url = await resolveBetbyTracker({ ...cfg, brandId: 'xsport' }, { sport: 'futamericano', home: 'Giants', away: 'Eagles' });
  assert.equal(url, null, 'same names but different sport must not match');
});

test('BETBY tracker: a different fixture does not match', async () => {
  globalThis.fetch = fakeFeeds();
  assert.equal(await resolveBetbyTracker({ ...cfg, brandId: 'nomatch' }, { sport: 'futebol', home: 'Sporting', away: 'Braga' }), null);
});

test('BETBY tracker: no Statscore widget → null (nothing to embed)', async () => {
  globalThis.fetch = (url) => {
    const u = String(url);
    let body = {};
    if (u.includes('/v4/live/') && u.endsWith('/0')) body = { events: { E1: { desc: { sport: '1', scheduled: 1, competitors: [{ name: 'Benfica' }, { name: 'Porto' }] } } } };
    else if (u.includes('/v1/side/') && u.endsWith('/0')) body = { version: '1' };
    else if (u.includes('/v1/side/')) body = { version: '1', items: [] };
    return Promise.resolve({ ok: true, json: () => Promise.resolve(body) });
  };
  assert.equal(await resolveBetbyTracker({ ...cfg, brandId: 'nowidget' }, { sport: 'futebol', home: 'Benfica', away: 'Porto' }), null);
});

test('BETBY tracker: feed failure is swallowed → null', async () => {
  globalThis.fetch = () => Promise.reject(new Error('blocked'));
  assert.equal(await resolveBetbyTracker({ ...cfg, brandId: 'down' }, { sport: 'futebol', home: 'Benfica', away: 'Porto' }), null);
});

test('scoreTeams: a confident match scores higher than a weak one, non-matches near zero', () => {
  assert.ok(scoreTeams('Benfica', 'SL Benfica') >= 0.6, 'club prefix is a confident match');
  assert.ok(scoreTeams('Benfica', 'SL Benfica') > scoreTeams('Real Madrid', 'Atletico Madrid'), 'real pair beats a shared-city coincidence');
  assert.ok(scoreTeams('Sporting', 'Benfica') < 0.5, 'different clubs score low');
});

test('matching engine: a confident game is LOCKED so opening it is instant even once the feed is gone', async () => {
  globalThis.fetch = fakeFeeds();
  const engCfg = { ...cfg, brandId: 'engine1' };
  const live = [{ sport: 'futebol', home: 'Benfica', away: 'Porto', start: '2023-11-14T22:13:20.000Z' }];
  await runBetbyEngine(engCfg, live);
  // Feed now down: the locked verdict must still resolve without touching the network.
  globalThis.fetch = () => Promise.reject(new Error('blocked'));
  const url = await resolveBetbyTracker(engCfg, live[0]);
  assert.ok(url && url.startsWith('https://ui.invisiblesport.com/tracker.html?providers='), 'locked match resolves offline');
});

test('matching engine: the admin alias catalog pins a name that would not auto-match', async () => {
  // BETBY carries "SL Benfica"; our board writes it as "Encarnados" — only the alias links them.
  globalThis.fetch = fakeFeeds();
  const aliasCfg = { ...cfg, brandId: 'alias1' };
  assert.equal(await resolveBetbyTracker(aliasCfg, { sport: 'futebol', home: 'Encarnados', away: 'Porto' }), null, 'no match before the alias');
  setBetbyAliases([{ from: 'Encarnados', to: 'SL Benfica' }]);
  const url = await resolveBetbyTracker({ ...cfg, brandId: 'alias2' }, { sport: 'futebol', home: 'Encarnados', away: 'Porto' });
  assert.ok(url, 'the alias pins the mini-field');
  setBetbyAliases([]); // reset for other tests
});
