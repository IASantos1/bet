/**
 * In-memory cache over getCasinoAllGames(). The real catalog has thousands of entries across
 * every provider, so the public /api/casino/games endpoint must not call the aggregator on every
 * page load — that would be slow and could trip their own rate limits. A stale cache is kept and
 * served (with the error attached) rather than falling back to placeholder data, so the page is
 * always honest about whether it's showing real data.
 */

import { getCasinoAllGames, type CasinoGame } from './casinoAggregator';

const CACHE_TTL_MS = 15 * 60 * 1000;

let cachedGames: CasinoGame[] | null = null;
let cachedAt = 0;
let lastError: string | null = null;
let inFlight: Promise<void> | null = null;

async function refresh(): Promise<void> {
  try {
    const games = await getCasinoAllGames();
    cachedGames = games;
    cachedAt = Date.now();
    lastError = null;
  } catch (e: any) {
    lastError = String(e?.message || e);
  }
}

export async function getCachedCasinoCatalog(): Promise<{ games: CasinoGame[]; stale: boolean; error: string | null }> {
  const isFresh = cachedGames !== null && Date.now() - cachedAt < CACHE_TTL_MS;
  if (!isFresh) {
    if (!inFlight) {
      inFlight = refresh().finally(() => {
        inFlight = null;
      });
    }
    await inFlight;
  }
  return { games: cachedGames || [], stale: cachedGames !== null && Date.now() - cachedAt >= CACHE_TTL_MS, error: lastError };
}
