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

test('off when collect is false', () => {
  assert.equal(createBetby({ collect: false, brandId: 'B1' }).on, false);
  assert.equal(createBetby({ collect: true, brandId: '' }).on, false);
});
