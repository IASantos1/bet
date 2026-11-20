import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createBetby } from '../server/betby.js';

const make = () => createBetby({ collect: true, brandId: 'B1', locale: 'en-gb' }, { fetchImpl: async () => { throw new Error('no net'); } });

test('applyDeltas merges market deltas and removes with null', () => {
  const b = make();
  const { applyDeltas } = b._internal;
  const store = new Map();
  // First payload: an event with one market.
  applyDeltas(store, { events: { e1: { state: { status: 'live' }, score: { home_score: 0, away_score: 0 }, markets: { m1: { v0: { o1: { k: 2.5 } } } } } } });
  assert.equal(store.get('e1').markets.m1.v0.o1.k, 2.5);
  // Delta: add a second outcome and update the score; market m1 keeps o1.
  applyDeltas(store, { events: { e1: { score: { home_score: 1 }, markets: { m1: { v0: { o1: { k: 3.0 }, o2: { k: 1.4 } } } } } } });
  assert.equal(store.get('e1').score.home_score, 1);
  assert.equal(store.get('e1').score.away_score, 0); // kept from before
  assert.equal(store.get('e1').markets.m1.v0.o2.k, 1.4);
  // Delta: remove market m1 (null), then remove the whole event (null).
  applyDeltas(store, { events: { e1: { markets: { m1: null } } } });
  assert.equal(store.get('e1').markets.m1, undefined);
  applyDeltas(store, { events: { e1: null } });
  assert.equal(store.has('e1'), false);
});

test('versionsOf reads the version index', () => {
  const { versionsOf } = make()._internal;
  assert.deepEqual(versionsOf({ top_events_versions: ['10', 11], rest_events_versions: ['11', '12'] }), ['10', '11', '12']);
  assert.deepEqual(versionsOf({}), []);
});

test('eventPlayerMarkets names outcomes from the catalog and keeps only player markets', () => {
  const b = make();
  // Real catalog shape: keyed by market id, with market_type and variants[variant][0].outcomes[{id,name}].
  b._internal.setCatalog({ at: Date.now(), markets: new Map([
    ['40', { id: '40', name: 'Marcador a qualquer momento', market_type: 'PlayerProps', variants: { '': [{ outcomes: [{ id: '100', name: 'Di María' }, { id: '101', name: 'J. Félix' }] }] } }],
    ['18', { id: '18', name: 'Total de golos', market_type: 'Total', variants: { 'total=2.5': [{ outcomes: [{ id: '12', name: 'Mais' }, { id: '13', name: 'Menos' }] }] } }],
  ]) });
  const ev = {
    id: 'e1',
    desc: { competitors: [{ id: 'h', name: 'Benfica' }, { id: 'a', name: 'Porto' }] },
    markets: {
      40: { '': { 100: { k: 2.5 }, 101: { k: 3.1, b: 1 } } }, // player market
      18: { 'total=2.5': { 12: { k: 1.8 }, 13: { k: 2.0 } } }, // not a player market
    },
  };
  const pm = b.eventPlayerMarkets(ev);
  assert.equal(pm.length, 1); // only the PlayerProps market
  assert.equal(pm[0].marketName, 'Marcador a qualquer momento');
  assert.equal(pm[0].marketType, 'PlayerProps');
  const di = pm[0].outcomes.find((o) => o.id === '100');
  assert.equal(di.name, 'Di María');
  assert.equal(di.odd, 2.5);
  assert.equal(pm[0].outcomes.find((o) => o.id === '101').blocked, true);
  assert.deepEqual(b.teamsOf(ev), { home: 'Benfica', away: 'Porto' });
});

test('per-event descriptions resolve real player names (catalog only has generic markets)', () => {
  const b = make();
  // Static catalog: knows the market is a player market, but outcomes are generic (no players).
  b._internal.setCatalog({ at: Date.now(), markets: new Map([
    ['40', { id: '40', name: 'Marcador a qualquer momento', market_type: 'PlayerProps', variants: { '': [{ outcomes: [{ id: '100', name: 'Jogador' }] }] } }],
  ]) });
  // Per-event descriptions: the real players for THIS match.
  b._internal.setEventDesc('e1', new Map([
    ['40', { name: 'Marcador a qualquer momento', variants: { '': [{ outcomes: [{ id: '100', name: 'Di María' }, { id: '101', name: 'J. Félix' }] }] } }],
  ]));
  const ev = { id: 'e1', desc: { competitors: [{ name: 'Benfica' }, { name: 'Porto' }] }, markets: { 40: { '': { 100: { k: 2.5 }, 101: { k: 3.1 } } } } };
  const pm = b.eventPlayerMarkets(ev);
  assert.equal(pm[0].outcomes.find((o) => o.id === '100').name, 'Di María'); // from per-event, not catalog's "Jogador"
  assert.equal(pm[0].outcomes.find((o) => o.id === '101').name, 'J. Félix');
});

test('eventPlayerMarkets maps real BETBY market ids to grader kinds', () => {
  const b = make();
  b._internal.setCatalog({ at: Date.now(), markets: new Map([
    ['40', { id: '40', name: 'Marcador em qualquer altura', market_type: 'PlayerProps', variants: { '': [{ outcomes: [{ id: '1', name: 'Di María' }] }] } }],
    ['898', { id: '898', name: 'Jogador a marcar 2+', market_type: 'PlayerProps', variants: { '': [{ outcomes: [{ id: '1', name: 'Di María' }] }] } }],
    ['899', { id: '899', name: 'Jogador a marcar 3+', market_type: 'PlayerProps', variants: { '': [{ outcomes: [{ id: '1', name: 'Di María' }] }] } }],
  ]) });
  const ev = { id: 'e1', desc: { competitors: [{ name: 'Benfica' }, { name: 'Porto' }] }, markets: {
    40: { '': { 1: { k: 2.5 } } }, 898: { '': { 1: { k: 6 } } }, 899: { '': { 1: { k: 21 } } },
  } };
  const byId = Object.fromEntries(b.eventPlayerMarkets(ev).map((m) => [m.marketId, m.kind]));
  assert.equal(byId['40'], 'anytime_scorer');
  assert.equal(byId['898'], 'scorer_2plus');
  assert.equal(byId['899'], 'hattrick');
});

test('matchEvent finds our football game in the BETBY store, either orientation', () => {
  const b = make();
  // Two BETBY football events in the live store.
  b.stores.live.set('bb1', { id: 'bb1', desc: { sport: '1', scheduled: Math.floor(Date.now() / 1000), competitors: [{ name: 'SL Benfica' }, { name: 'FC Porto' }] }, markets: {} });
  b.stores.live.set('bb2', { id: 'bb2', desc: { sport: '1', scheduled: Math.floor(Date.now() / 1000), competitors: [{ name: 'Sporting CP' }, { name: 'SC Braga' }] }, markets: {} });
  // Our event names differ a little; still matches Benfica/Porto.
  const m = b.matchEvent({ sport: 'futebol', home: 'Benfica', away: 'Porto', start: new Date().toISOString() });
  assert.equal(m.event.id, 'bb1');
  // Swapped orientation (we have them reversed) still matches the same BETBY event.
  const m2 = b.matchEvent({ sport: 'futebol', home: 'Porto', away: 'Benfica', start: new Date().toISOString() });
  assert.equal(m2.event.id, 'bb1');
  assert.equal(m2.swapped, true);
  // A different sport gate rejects it.
  assert.equal(b.matchEvent({ sport: 'basquetebol', home: 'Benfica', away: 'Porto' }), null);
  // Unknown teams: no match.
  assert.equal(b.matchEvent({ sport: 'futebol', home: 'Real Madrid', away: 'Barcelona' }), null);
});

test('matchEvent uses GOAL API alt names as a second key', () => {
  const b = make();
  // BETBY names the game like the GOAL API fixture (full names), not like WinHouse (nicknames).
  b.stores.live.set('bb1', { id: 'bb1', desc: { sport: '1', scheduled: Math.floor(Date.now() / 1000), competitors: [{ name: 'Tottenham Hotspur' }, { name: 'Wolverhampton' }] }, markets: {} });
  // WinHouse nicknames: no match on their own.
  assert.equal(b.matchEvent({ sport: 'futebol', home: 'Spurs', away: 'Wolves', start: new Date().toISOString() }), null);
  // With the GOAL API names as alternatives, it matches.
  const m = b.matchEvent({ sport: 'futebol', home: 'Spurs', away: 'Wolves', start: new Date().toISOString(), altNames: [{ home: 'Tottenham Hotspur', away: 'Wolverhampton' }] });
  assert.equal(m?.event.id, 'bb1');
});

test('off when collect is false', () => {
  assert.equal(createBetby({ collect: false, brandId: 'B1' }).on, false);
  assert.equal(createBetby({ collect: true, brandId: '' }).on, false);
});
