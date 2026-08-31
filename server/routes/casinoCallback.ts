import type http from 'http';
import type pg from 'pg';
import { randomId } from '../lib/crypto';
import { requestIp } from '../lib/audit';
import { withTransaction, opCasinoBet, opCasinoWin, opCasinoCancelBet, opCasinoCancelWin, WalletError } from '../lib/ledger';

/**
 * POST /callback — GoldSlotPalace's real Seamless-mode wallet webhook (confirmed via
 * /v4/agent/callback-test earlier: https://bet62.plus/callback). Real contract, provided by the
 * account owner as the aggregator's own documentation + a PHP reference implementation:
 *
 *   Header: Callback-Token: <shared secret> — validated against CASINO_CALLBACK_TOKEN below.
 *   Body:   { command, data: {...}, timestamp, check: "21,22,..." } — `check` names, per request,
 *           exactly which of these server-side validations must run before the command itself is
 *           processed (this mirrors the reference PHP's own `foreach ($aCheckItem as $check)`
 *           design — the checks are driven by what the aggregator sends, not hardcoded per
 *           command):
 *             21 = account resolves to a real BET62 user with a casino_users mapping
 *             22 = that user's account isn't suspended
 *             31 = wallet has enough available balance for data.amount
 *             41 = data.trans_guid hasn't already been processed (idempotency)
 *             42 = data.trans_guid HAS already been processed (status lookup)
 *             43 = data.cancel_trans_guid exists (the transaction a cancel is reversing)
 *   Commands: authenticate, balance, bet (debit), win (credit), cancel (reverse a bet or win),
 *             status (report whether a trans_guid is OK or CANCELED).
 *   Response: {result:0, status:'OK', data:{...}} on success; {result:<code>, status:'ERROR',
 *             data:{balance}} on failure — `result` is 100 (bad token), 99 (internal error), or
 *             whichever check code above failed.
 *
 * `account` is always "bet62_<userId>" — the exact string server/routes/casino.ts's POST
 * /api/casino/play passes to createCasinoUser() when it first provisions a BET62 user on the
 * aggregator, so it's parsed back deterministically rather than round-tripped through a lookup
 * table.
 *
 * A casino round has no "reserve then settle" step like a sports bet (the aggregator has already
 * decided the round's outcome by the time it calls us): `bet` debits immediately, `win` credits
 * immediately, and `cancel` reverses whichever one it targets. See server/lib/ledger.ts's
 * opCasinoBet/opCasinoWin/opCasinoCancelBet/opCasinoCancelWin for the actual money movement.
 */

function callbackToken(): string {
  return String(process.env.CASINO_CALLBACK_TOKEN || '').trim();
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function str(v: any): string {
  return v == null ? '' : String(v);
}

// account is always "bet62_<userId>" — see the docstring above. userId itself is a lowercase-hex
// randomId() (server/lib/crypto.ts) whose length depends on the byte count the caller used (24
// hex chars for a user id specifically, from routes/auth.ts's randomId(12) — not hardcoded here
// since nothing about this parsing actually depends on a fixed length).
function parseAccount(account: string): string | null {
  const m = /^bet62_([0-9a-f]+)$/i.exec(String(account || '').trim());
  return m ? m[1] : null;
}

interface ResolvedUser {
  userId: string;
  balance: number;
  suspended: boolean;
}

async function resolveUser(pool: pg.Pool, account: string): Promise<ResolvedUser | null> {
  const userId = parseAccount(account);
  if (!userId) return null;
  const r = await pool.query(
    `SELECT u.id AS user_id, COALESCE(w.available, 0) AS available, p.account_status
     FROM users u
     JOIN casino_users cu ON cu.user_id = u.id
     LEFT JOIN wallets w ON w.user_id = u.id
     LEFT JOIN profiles p ON p.user_id = u.id
     WHERE u.id = $1
     LIMIT 1`,
    [userId],
  );
  const row = r.rows[0];
  if (!row) return null;
  return {
    userId: String(row.user_id),
    balance: round2(Number(row.available || 0)),
    suspended: String(row.account_status || '') === 'SUSPENDED',
  };
}

/** Thrown to unwind a withTransaction() block cleanly (triggering its own ROLLBACK) and carry the
 *  exact {result, balance} the callback response should report. */
class CasinoCallbackError extends Error {
  code: number;
  balance?: number;
  constructor(code: number, balance?: number) {
    super(`casino callback check ${code} failed`);
    this.code = code;
    this.balance = balance;
  }
}

function sendResult(res: http.ServerResponse, result: number, data?: any) {
  res.statusCode = 200; // the aggregator's own contract signals failure via `result`, not HTTP status
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(data !== undefined ? { result, status: result === 0 ? 'OK' : 'ERROR', data } : { result, status: result === 0 ? 'OK' : 'ERROR' }));
}

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

  let parsed: any = null;
  try {
    parsed = rawBody.trim() ? JSON.parse(rawBody) : null;
  } catch {
    parsed = null;
  }

  // Every request is still logged raw, unconditionally, same as before this feature existed —
  // valuable for audit/debugging regardless of how the request is otherwise handled.
  pool
    .query(
      `INSERT INTO casino_callback_log (id, headers, body_raw, body_json, ip, created_at)
       VALUES ($1, $2::jsonb, $3, $4::jsonb, $5, NOW())`,
      [randomId(16), JSON.stringify(req.headers || {}), rawBody, parsed ? JSON.stringify(parsed) : null, requestIp(req)],
    )
    .catch((e) => console.error('[casino-callback] failed to persist raw payload', e));

  // Token check FIRST, before anything else is trusted — without this, anyone who finds the URL
  // could POST forged bet/win/cancel events and move real money.
  const expectedToken = callbackToken();
  const givenToken = String(req.headers['callback-token'] || '').trim();
  if (!expectedToken) {
    console.error('[casino-callback] CASINO_CALLBACK_TOKEN is not configured — rejecting all callbacks');
    return sendResult(res, 100), true;
  }
  if (givenToken !== expectedToken) {
    return sendResult(res, 100), true;
  }

  if (!parsed || typeof parsed !== 'object') return sendResult(res, 99), true;
  const command = str(parsed.command);
  const data = parsed.data && typeof parsed.data === 'object' ? parsed.data : {};
  const checks = str(parsed.check)
    .split(',')
    .map((c) => c.trim())
    .filter(Boolean);

  const user = await resolveUser(pool, str(data.account)).catch(() => null);

  // Checks 21/22 are read-only and apply identically regardless of command — run them up front
  // exactly as the aggregator's own `check` list says to, rather than hardcoding per command.
  if (checks.includes('21') && !user) return sendResult(res, 21), true;
  if (checks.includes('22') && user?.suspended) return sendResult(res, 22, { balance: user.balance }), true;
  // Every real command below needs a resolved user regardless of whether "21" was explicitly
  // listed (it always is, in every real sample) — fail safe rather than proceed with no user.
  if (!user) return sendResult(res, 21), true;

  try {
    switch (command) {
      case 'authenticate': {
        return sendResult(res, 0, { account: str(data.account), balance: user.balance }), true;
      }

      case 'balance': {
        return sendResult(res, 0, { balance: user.balance }), true;
      }

      case 'bet': {
        const transGuid = str(data.trans_guid);
        const amount = Number(data.amount);
        if (!transGuid || !Number.isFinite(amount) || amount <= 0) return sendResult(res, 99, { balance: user.balance }), true;
        if (checks.includes('31') && user.balance < round2(amount)) return sendResult(res, 31, { balance: user.balance }), true;

        const newBalance = await withTransaction(pool, async (client) => {
          const claim = await client.query(
            `INSERT INTO casino_transactions (trans_guid, user_id, gplay_id, round_id, provider_id, game_code, game_type, sort, amount)
             VALUES ($1,$2,$3,$4,$5,$6,$7,'BET',$8)
             ON CONFLICT (trans_guid) DO NOTHING
             RETURNING trans_guid`,
            [transGuid, user.userId, str(data.gplay_id) || null, str(data.round_id) || null, Number.isFinite(Number(data.provider_id)) ? Number(data.provider_id) : null, str(data.game_code) || null, str(data.game_type) || null, round2(amount).toFixed(2)],
          );
          if (claim.rowCount === 0) throw new CasinoCallbackError(41, user.balance);

          const applied = await opCasinoBet(client, {
            userId: user.userId,
            amount: round2(amount),
            idempotencyKey: `casino:${transGuid}`,
            roundId: str(data.round_id) || undefined,
            gameCode: str(data.game_code) || undefined,
          });
          return applied.wallet.available;
        });
        return sendResult(res, 0, { balance: newBalance }), true;
      }

      case 'win': {
        const transGuid = str(data.trans_guid);
        const amount = Number(data.amount);
        if (!transGuid || !Number.isFinite(amount) || amount <= 0) return sendResult(res, 99, { balance: user.balance }), true;

        const newBalance = await withTransaction(pool, async (client) => {
          const claim = await client.query(
            `INSERT INTO casino_transactions (trans_guid, user_id, gplay_id, round_id, provider_id, game_code, game_type, sort, amount)
             VALUES ($1,$2,$3,$4,$5,$6,$7,'WIN',$8)
             ON CONFLICT (trans_guid) DO NOTHING
             RETURNING trans_guid`,
            [transGuid, user.userId, str(data.gplay_id) || null, str(data.round_id) || null, Number.isFinite(Number(data.provider_id)) ? Number(data.provider_id) : null, str(data.game_code) || null, str(data.game_type) || null, round2(amount).toFixed(2)],
          );
          if (claim.rowCount === 0) throw new CasinoCallbackError(41, user.balance);

          const applied = await opCasinoWin(client, {
            userId: user.userId,
            amount: round2(amount),
            idempotencyKey: `casino:${transGuid}`,
            roundId: str(data.round_id) || undefined,
            gameCode: str(data.game_code) || undefined,
          });
          return applied.wallet.available;
        });
        return sendResult(res, 0, { balance: newBalance }), true;
      }

      case 'cancel': {
        const transGuid = str(data.trans_guid);
        const cancelTransGuid = str(data.cancel_trans_guid);
        if (!transGuid || !cancelTransGuid) return sendResult(res, 99, { balance: user.balance }), true;

        const newBalance = await withTransaction(pool, async (client) => {
          // This cancel EVENT's own trans_guid must not already have been processed.
          const claim = await client.query(
            `INSERT INTO casino_transactions (trans_guid, user_id, gplay_id, round_id, provider_id, game_code, game_type, sort, amount, cancel_of)
             VALUES ($1,$2,$3,$4,$5,$6,$7,'CANCEL',$8,$9)
             ON CONFLICT (trans_guid) DO NOTHING
             RETURNING trans_guid`,
            [
              transGuid,
              user.userId,
              str(data.gplay_id) || null,
              str(data.round_id) || null,
              Number.isFinite(Number(data.provider_id)) ? Number(data.provider_id) : null,
              str(data.game_code) || null,
              str(data.game_type) || null,
              (Number.isFinite(Number(data.amount)) ? round2(Number(data.amount)) : 0).toFixed(2),
              cancelTransGuid,
            ],
          );
          if (claim.rowCount === 0) throw new CasinoCallbackError(41, user.balance);

          // The transaction being cancelled must exist — locked so a concurrent cancel of the
          // same original can't reverse it twice.
          const origR = await client.query(
            `SELECT sort, amount FROM casino_transactions WHERE trans_guid = $1 AND user_id = $2 FOR UPDATE`,
            [cancelTransGuid, user.userId],
          );
          const orig = origR.rows[0];
          if (!orig) throw new CasinoCallbackError(43, user.balance);

          if (String(orig.sort) === 'CANCEL') {
            // Already reversed — a repeat cancel of an already-cancelled transaction is a
            // harmless no-op (matches the aggregator's own reference implementation), not an
            // error: just report the current balance without moving money again.
            const w = await client.query(`SELECT available FROM wallets WHERE user_id = $1`, [user.userId]);
            return round2(Number(w.rows[0]?.available ?? user.balance));
          }

          const origAmount = round2(Number(orig.amount));
          let applied;
          if (String(orig.sort) === 'BET') {
            applied = await opCasinoCancelBet(client, {
              userId: user.userId,
              amount: origAmount,
              idempotencyKey: `casino:cancel:${transGuid}`,
              cancelledTransGuid: cancelTransGuid,
            });
          } else if (String(orig.sort) === 'WIN') {
            applied = await opCasinoCancelWin(client, {
              userId: user.userId,
              amount: origAmount,
              idempotencyKey: `casino:cancel:${transGuid}`,
              cancelledTransGuid: cancelTransGuid,
            });
          } else {
            throw new CasinoCallbackError(99, user.balance);
          }

          await client.query(`UPDATE casino_transactions SET sort = 'CANCEL' WHERE trans_guid = $1`, [cancelTransGuid]);
          return applied.wallet.available;
        });
        return sendResult(res, 0, { balance: newBalance }), true;
      }

      case 'status': {
        const transGuid = str(data.trans_guid);
        if (!transGuid) return sendResult(res, 99, { balance: user.balance }), true;
        const r = await pool.query(`SELECT sort FROM casino_transactions WHERE trans_guid = $1 AND user_id = $2 LIMIT 1`, [transGuid, user.userId]);
        const row = r.rows[0];
        if (!row) return sendResult(res, 42, { balance: user.balance }), true;
        const transStatus = String(row.sort) === 'CANCEL' ? 'CANCELED' : 'OK';
        return sendResult(res, 0, { account: str(data.account), trans_guid: transGuid, trans_status: transStatus }), true;
      }

      default:
        console.error('[casino-callback] unknown command', command);
        return sendResult(res, 99, { balance: user.balance }), true;
    }
  } catch (e) {
    if (e instanceof CasinoCallbackError) return sendResult(res, e.code, e.balance != null ? { balance: e.balance } : undefined), true;
    if (e instanceof WalletError && e.code === 'INSUFFICIENT_FUNDS') {
      // Only reachable from opCasinoCancelWin (a win already spent elsewhere can't be safely
      // clawed back) — bet's own insufficient-funds case is pre-checked against check 31 above.
      console.error('[casino-callback] insufficient funds reversing a win', e.message);
      return sendResult(res, 99, { balance: user.balance }), true;
    }
    console.error('[casino-callback] unhandled error processing', command, e);
    return sendResult(res, 99, { balance: user.balance }), true;
  }
}
