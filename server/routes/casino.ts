import type http from 'http';
import { sendJson } from '../lib/http';
import { isCasinoConfigured } from '../lib/casinoAggregator';
import { getCachedCasinoCatalog } from '../lib/casinoCatalog';

/**
 * Public (unauthenticated) casino catalog endpoint — the real, licensed game list, cached server-
 * side. Never returns placeholder/fictional games: when the aggregator isn't configured or isn't
 * reachable yet (e.g. this server's IP isn't whitelisted with the aggregator), it returns an empty
 * list with `error` set rather than inventing data.
 */
export async function handleCasinoRoutes(req: http.IncomingMessage, res: http.ServerResponse, url: URL): Promise<boolean> {
  if (req.method === 'GET' && url.pathname === '/api/casino/games') {
    if (!isCasinoConfigured()) {
      sendJson(res, 200, { success: true, games: [], error: 'CASINO_API_KEY not configured' });
      return true;
    }
    const { games, stale, error } = await getCachedCasinoCatalog();
    sendJson(res, 200, { success: true, games: games.filter((g) => g.launch_enable), stale, error });
    return true;
  }

  return false;
}
