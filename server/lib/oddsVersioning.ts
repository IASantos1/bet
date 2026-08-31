/**
 * Odds versioning (BET62 spec §16-17): "toda alteração de odd deverá incrementar a versão."
 * Pure/dependency-free — server/routes/events.ts calls recordOdd() every time it resolves a
 * fresh price from the feed, keyed by event+market+selection, and threads the resulting version
 * through EventsService.getEventOdds() so the Betting Engine can check it exactly instead of
 * only via a price tolerance (see server/lib/bettingEngine.ts).
 *
 * This versions the price this codebase actually persists anywhere durable enough to compare
 * against on a later request: the odds proxy's in-memory cache (server/routes/events.ts). It is
 * not a database table — the cache itself is ephemeral (cleared on server restart) — so a
 * version resets to 1 across a restart. That matches what's actually being versioned; claiming
 * DB-backed durability here would be fiction.
 */

export interface OddSnapshot {
  price: number;
  version: number;
  updatedAt: number;
}

export type OddsStore = Map<string, OddSnapshot>;

export function createOddsStore(): OddsStore {
  return new Map();
}

export function oddsKey(eventId: string, market: string, selection: string): string {
  return `${eventId}:${market}:${selection}`;
}

// Prices are floating point from an upstream feed; treat sub-cent differences as "unchanged"
// rather than bumping the version on noise.
const PRICE_EPSILON = 0.001;

/**
 * Records a freshly-resolved price for one odd. Returns the current snapshot and whether this
 * call actually changed the price (version bumped) vs. just reaffirmed the same one.
 */
export function recordOdd(store: OddsStore, key: string, price: number, now: number): { snapshot: OddSnapshot; changed: boolean } {
  const existing = store.get(key);
  if (!existing) {
    const snapshot: OddSnapshot = { price, version: 1, updatedAt: now };
    store.set(key, snapshot);
    return { snapshot, changed: true };
  }
  if (Math.abs(existing.price - price) <= PRICE_EPSILON) {
    return { snapshot: existing, changed: false };
  }
  const snapshot: OddSnapshot = { price, version: existing.version + 1, updatedAt: now };
  store.set(key, snapshot);
  return { snapshot, changed: true };
}

export function getOdd(store: OddsStore, key: string): OddSnapshot | null {
  return store.get(key) ?? null;
}
