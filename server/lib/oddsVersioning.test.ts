import { describe, expect, it } from 'vitest';
import { createOddsStore, oddsKey, recordOdd, getOdd } from './oddsVersioning';

describe('Odds Versioning — recordOdd (spec §17)', () => {
  it('starts a fresh odd at version 1', () => {
    const store = createOddsStore();
    const key = oddsKey('evt1', 'h2h', 'home');
    const { snapshot, changed } = recordOdd(store, key, 2.1, 1000);
    expect(snapshot).toEqual({ price: 2.1, version: 1, updatedAt: 1000 });
    expect(changed).toBe(true);
  });

  it('increments the version every time the price actually changes', () => {
    const store = createOddsStore();
    const key = oddsKey('evt1', 'h2h', 'home');
    recordOdd(store, key, 2.1, 1000);
    const r2 = recordOdd(store, key, 2.05, 2000);
    expect(r2.snapshot).toEqual({ price: 2.05, version: 2, updatedAt: 2000 });
    expect(r2.changed).toBe(true);

    const r3 = recordOdd(store, key, 1.95, 3000);
    expect(r3.snapshot.version).toBe(3);
  });

  it('does not bump the version when the price is reaffirmed unchanged', () => {
    const store = createOddsStore();
    const key = oddsKey('evt1', 'h2h', 'home');
    recordOdd(store, key, 2.1, 1000);
    const r2 = recordOdd(store, key, 2.1, 5000);
    expect(r2.changed).toBe(false);
    expect(r2.snapshot).toEqual({ price: 2.1, version: 1, updatedAt: 1000 }); // untouched, including the original timestamp
  });

  it('treats a sub-cent difference as noise, not a real change', () => {
    const store = createOddsStore();
    const key = oddsKey('evt1', 'h2h', 'home');
    recordOdd(store, key, 2.100, 1000);
    const r2 = recordOdd(store, key, 2.1004, 2000);
    expect(r2.changed).toBe(false);
    expect(r2.snapshot.version).toBe(1);
  });

  it('keeps home/draw/away as independent odds with independent versions', () => {
    const store = createOddsStore();
    recordOdd(store, oddsKey('evt1', 'h2h', 'home'), 2.1, 1000);
    recordOdd(store, oddsKey('evt1', 'h2h', 'draw'), 3.4, 1000);
    recordOdd(store, oddsKey('evt1', 'h2h', 'home'), 1.9, 2000); // only home changes

    expect(getOdd(store, oddsKey('evt1', 'h2h', 'home'))?.version).toBe(2);
    expect(getOdd(store, oddsKey('evt1', 'h2h', 'draw'))?.version).toBe(1);
  });

  it('keeps different events with the same market/selection independent', () => {
    const store = createOddsStore();
    recordOdd(store, oddsKey('evt1', 'h2h', 'home'), 2.1, 1000);
    recordOdd(store, oddsKey('evt2', 'h2h', 'home'), 5.0, 1000);
    expect(getOdd(store, oddsKey('evt1', 'h2h', 'home'))?.price).toBe(2.1);
    expect(getOdd(store, oddsKey('evt2', 'h2h', 'home'))?.price).toBe(5.0);
  });

  it('getOdd returns null for an odd that was never recorded', () => {
    const store = createOddsStore();
    expect(getOdd(store, oddsKey('evtX', 'h2h', 'home'))).toBeNull();
  });
});
