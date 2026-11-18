import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveBetbyTracker } from '../public/betby-tracker.js';

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
  const url = await resolveBetbyTracker({ ...cfg, brandId: 'xsport' }, { sport: 'futebol-americano', home: 'Giants', away: 'Eagles' });
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
