import { apiFetch } from './backendClient';

export interface LiveOddsItem {
  matchId: string;
  odds: {
    home: number;
    draw: number;
    away: number;
  };
}

const liveOddsCache: Record<string, LiveOddsItem[]> = {};

function mergeLiveOdds(previous: LiveOddsItem[], current: LiveOddsItem[]): LiveOddsItem[] {
  if (!previous.length) {
    return current;
  }
  if (!current.length) {
    return previous;
  }
  const map = new Map<string, LiveOddsItem>();
  for (const item of previous) {
    map.set(String(item.matchId), item);
  }
  for (const item of current) {
    map.set(String(item.matchId), item);
  }
  return Array.from(map.values());
}

export async function fetchLiveOdds(): Promise<LiveOddsItem[]> {
  const path = '/football/odds/live';
  const data = await apiFetch(path, { method: 'GET' });
  if (!Array.isArray(data)) {
    return liveOddsCache[path] || [];
  }
  const list = data as LiveOddsItem[];
  const merged = liveOddsCache[path]
    ? mergeLiveOdds(liveOddsCache[path], list)
    : list;
  liveOddsCache[path] = merged;
  return merged;
}

/**
 * Busca odds ao vivo por desporto
 * football → /football/odds/live (1X2)
 * basketball → /basketball/odds/live (moneyline)
 * default → /{sport}/odds/live (formato compatível)
 */
export async function fetchLiveOddsBySport(sport: string): Promise<LiveOddsItem[]> {
  const s = (sport || '').toLowerCase();
  let path = '/football/odds/live';
  if (s.includes('basket')) {
    path = '/basketball/odds/live';
  } else if (s.includes('hockey')) {
    path = '/hockey/odds/live';
  } else if (s.includes('baseball')) {
    path = '/baseball/odds/live';
  } else if (s.includes('football') || s.includes('soccer') || s.includes('futebol')) {
    path = '/football/odds/live';
  }

  const data = await apiFetch(path, { method: 'GET' });
  if (!Array.isArray(data)) {
    return liveOddsCache[path] || [];
  }
  const list = data as LiveOddsItem[];
  const merged = liveOddsCache[path]
    ? mergeLiveOdds(liveOddsCache[path], list)
    : list;
  liveOddsCache[path] = merged;
  return merged;
}

export async function fetchUpcomingOddsBySport(sport: string): Promise<LiveOddsItem[]> {
  const s = (sport || '').toLowerCase();

  if (!(s.includes('football') || s.includes('soccer') || s.includes('futebol'))) {
    return [];
  }

  const path = '/football/odds/upcoming';
  const data = await apiFetch(path, { method: 'GET' });
  if (!Array.isArray(data)) {
    return liveOddsCache[path] || [];
  }
  const list = data as LiveOddsItem[];
  const merged = liveOddsCache[path]
    ? mergeLiveOdds(liveOddsCache[path], list)
    : list;
  liveOddsCache[path] = merged;
  return merged;
}

export async function fetchFixture1X2OddsFromApiFootball(
  _fixtureId: string | number,
): Promise<{ home: number; draw?: number; away: number } | null> {
  return null;
}
