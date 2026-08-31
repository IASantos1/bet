import type http from 'http';
import type pg from 'pg';
import { sendJson, readJsonBody, unauthorized, badRequest } from '../lib/http';
import { requireUser } from '../lib/auth';
import { isCasinoConfigured, createCasinoUser, getCasinoGameUrl } from '../lib/casinoAggregator';
import { getCachedCasinoCatalog } from '../lib/casinoCatalog';

/**
 * Public (unauthenticated) casino catalog endpoint — the real, licensed game list, cached server-
 * side. Never returns placeholder/fictional games: when the aggregator isn't configured or isn't
 * reachable yet (e.g. this server's IP isn't whitelisted with the aggregator), it returns an empty
 * list with `error` set rather than inventing data.
 */
export async function handleCasinoRoutes(
  pool: pg.Pool | null,
  req: http.IncomingMessage,
  res: http.ServerResponse,
  url: URL,
): Promise<boolean> {
  if (req.method === 'GET' && url.pathname === '/api/casino/games') {
    if (!isCasinoConfigured()) {
      sendJson(res, 200, { success: true, games: [], error: 'CASINO_API_KEY not configured' });
      return true;
    }
    const { games, stale, error } = await getCachedCasinoCatalog();
    sendJson(res, 200, { success: true, games: games.filter((g) => g.launch_enable), stale, error });
    return true;
  }

  // POST /api/casino/play — real game launch, Seamless mode (confirmed by the account owner: the
  // aggregator debits/credits BET62's own wallet directly via /callback, not via wallet/deposit-
  // withdraw). Creates the aggregator-side user for this BET62 account on first play (idempotent —
  // createCasinoUser is safe to retry, but casino_users caches the mapping so it's only called
  // once per user), then returns a real, single-use launch URL.
  //
  // ⚠️ server/routes/casinoCallback.ts only LOGS the aggregator's bet/win webhook today — it does
  // not yet credit/debit the wallet, because its real payload schema has never been observed. This
  // endpoint intentionally still returns real launch URLs (rather than staying a placeholder)
  // specifically so a real callback gets captured and the payload can be read from
  // casino_callback_log — see that file's docstring for the follow-up once a real payload lands.
  if (req.method === 'POST' && url.pathname === '/api/casino/play') {
    if (!pool) return sendJson(res, 503, { error: 'Database unavailable' }), true;
    const u = await requireUser(pool, req);
    if (!u) return unauthorized(res), true;
    if (!isCasinoConfigured()) return badRequest(res, 'CASINO_API_KEY not configured'), true;

    const body = await readJsonBody<{ provider_id?: number; game_code?: string; return_url?: string }>(req).catch(() => null);
    const providerId = Number(body?.provider_id);
    const gameCode = String(body?.game_code || '').trim();
    if (!body || !Number.isFinite(providerId) || providerId <= 0 || !gameCode) {
      return badRequest(res, 'provider_id and game_code required'), true;
    }

    try {
      const existing = await pool.query(`SELECT user_code FROM casino_users WHERE user_id = $1 LIMIT 1`, [u.id]);
      let userCode = Number(existing.rows?.[0]?.user_code);

      if (!Number.isFinite(userCode) || userCode <= 0) {
        // `name` must match ^[_a-zA-Z0-9]+$, 2-50 chars — u.id is a 32-char hex randomId(16), well
        // within that after the "bet62_" prefix.
        const created = await createCasinoUser(`bet62_${u.id}`);
        userCode = created.user_code;
        // ON CONFLICT: a concurrent request from the same user could race here (e.g. a double-
        // click) — createCasinoUser is itself idempotent per the aggregator's own spec (returns
        // the existing user if the name is already taken), so a second insert just keeps the
        // first row rather than erroring.
        await pool.query(
          `INSERT INTO casino_users (user_id, user_code, created_at) VALUES ($1, $2, NOW())
           ON CONFLICT (user_id) DO NOTHING`,
          [u.id, userCode],
        );
      }

      const { game_url } = await getCasinoGameUrl({
        user_code: userCode,
        provider_id: providerId,
        game_symbol: gameCode,
        return_url: typeof body.return_url === 'string' ? body.return_url : '',
      });
      if (!game_url) return sendJson(res, 200, { success: false, error: 'Jogo indisponível de momento' }), true;
      sendJson(res, 200, { success: true, game_url });
    } catch (e: any) {
      sendJson(res, 200, { success: false, error: String(e?.message || e) });
    }
    return true;
  }

  return false;
}
