import type http from 'http';
import type pg from 'pg';
import { randomId } from '../lib/crypto';
import { requestIp } from '../lib/audit';

/**
 * POST /callback — the webhook URL configured on the GoldSlotPalace (or compatible) aggregator's
 * side for this agent (confirmed via /v4/agent/callback-test: https://bet62.plus/callback).
 * There is no documented payload schema yet, and v4/user/create already showed calling it fails
 * with CALLBACK_ERROR while this endpoint doesn't exist — so capturing every real payload here is
 * how the actual contract gets learned, safely: nothing here touches the wallet or ledger. Once a
 * real schema is confirmed (from captured payloads or provider docs), replace the capture-only
 * body with real balance debit/credit handling built on server/lib/ledger.ts, the same way every
 * other money-moving endpoint in this codebase already works.
 */
export async function handleCasinoCallback(
  pool: pg.Pool,
  req: http.IncomingMessage,
  res: http.ServerResponse,
  url: URL,
): Promise<boolean> {
  if (url.pathname !== '/callback') return false;
  if (req.method !== 'POST') {
    res.statusCode = 405;
    res.setHeader('content-type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({ code: 1, message: 'METHOD_NOT_ALLOWED' }));
    return true;
  }

  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  const rawBody = Buffer.concat(chunks).toString('utf-8');

  let parsed: unknown = null;
  try {
    parsed = rawBody.trim() ? JSON.parse(rawBody) : null;
  } catch {
    parsed = null;
  }

  console.warn('[casino-callback] received', { headers: req.headers, body: rawBody.slice(0, 2000) });

  try {
    await pool.query(
      `INSERT INTO casino_callback_log (id, headers, body_raw, body_json, ip, created_at)
       VALUES ($1, $2::jsonb, $3, $4::jsonb, $5, NOW())`,
      [randomId(16), JSON.stringify(req.headers || {}), rawBody, parsed ? JSON.stringify(parsed) : null, requestIp(req)],
    );
  } catch (e) {
    console.error('[casino-callback] failed to persist payload', e);
  }

  res.statusCode = 200;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.end(JSON.stringify({ code: 0, message: 'OK' }));
  return true;
}
