import type http from 'http';
import type pg from 'pg';
import { authenticator } from 'otplib';
import QRCode from 'qrcode';
import { randomId, hashPassword, verifyPassword, sha256Hex } from '../lib/crypto';
import { readJsonBody, sendJson, badRequest, unauthorized } from '../lib/http';
import { getBearerToken, requireUser } from '../lib/auth';

type SignUpBody = {
  email?: string;
  password?: string;
  firstName?: string;
  lastName?: string;
  dob?: string;
  country?: string;
};

type SignInBody = {
  username?: string;
  password?: string;
};

type RefreshBody = {
  refreshToken?: string;
};

type TwoFactorLoginBody = {
  userId?: string;
  token?: string;
};

type TwoFactorConfirmBody = {
  token?: string;
};

function ipOf(req: http.IncomingMessage): string {
  const raw = String(req.headers['x-forwarded-for'] || '').split(',')[0]?.trim();
  return raw || String(req.socket.remoteAddress || '');
}

type ColInfo = { name: string; dataType: string };
const __tableCols = new Map<string, ColInfo[]>();

async function getTableCols(pool: pg.Pool, tableName: string): Promise<ColInfo[]> {
  const key = String(tableName || '').toLowerCase();
  const cached = __tableCols.get(key);
  if (cached) return cached;
  const r = await pool.query(
    `SELECT column_name, data_type
     FROM information_schema.columns
     WHERE table_name = $1`,
    [key],
  );
  const cols = (r.rows || []).map((x: any) => ({
    name: String(x.column_name || ''),
    dataType: String(x.data_type || ''),
  }));
  __tableCols.set(key, cols);
  return cols;
}

function hasCol(cols: ColInfo[], col: string): boolean {
  const c = String(col || '').toLowerCase();
  return cols.some((x) => String(x.name || '').toLowerCase() === c);
}

function colType(cols: ColInfo[], col: string): string {
  const c = String(col || '').toLowerCase();
  const hit = cols.find((x) => String(x.name || '').toLowerCase() === c);
  return String(hit?.dataType || '').toLowerCase();
}

async function issueTokens(pool: pg.Pool, userId: string, req: http.IncomingMessage): Promise<{ token: string; refreshToken: string }> {
  const token = randomId(24);
  const refreshToken = randomId(32);
  const now = Date.now();
  const expiresAtMs = now + 24 * 60 * 60 * 1000;
  const refreshExpiresAtMs = now + 30 * 24 * 60 * 60 * 1000;

  const sessionsCols = await getTableCols(pool, 'sessions').catch(() => []);
  const sessionsHasIssuedAt = hasCol(sessionsCols, 'issued_at');
  const sessionsExpiresType = colType(sessionsCols, 'expires_at');
  const sessionsExpiresIsTs = sessionsExpiresType.includes('timestamp') || sessionsExpiresType.includes('date');
  const sessionsIssuedType = colType(sessionsCols, 'issued_at');
  const sessionsIssuedIsTs = sessionsIssuedType.includes('timestamp') || sessionsIssuedType.includes('date');

  if (sessionsHasIssuedAt) {
    if (sessionsExpiresIsTs || sessionsIssuedIsTs) {
      await pool.query(
        `INSERT INTO sessions (token, user_id, issued_at, expires_at)
         VALUES ($1, $2, to_timestamp($3 / 1000.0), to_timestamp($4 / 1000.0))
         ON CONFLICT (token) DO NOTHING`,
        [token, userId, now, expiresAtMs],
      );
    } else {
      await pool.query(
        `INSERT INTO sessions (token, user_id, issued_at, expires_at)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (token) DO NOTHING`,
        [token, userId, now, expiresAtMs],
      );
    }
  } else {
    if (sessionsExpiresIsTs) {
      await pool.query(
        `INSERT INTO sessions (token, user_id, expires_at)
         VALUES ($1, $2, to_timestamp($3 / 1000.0))
         ON CONFLICT (token) DO NOTHING`,
        [token, userId, expiresAtMs],
      );
    } else {
      await pool.query(
        `INSERT INTO sessions (token, user_id, expires_at)
         VALUES ($1, $2, $3)
         ON CONFLICT (token) DO NOTHING`,
        [token, userId, expiresAtMs],
      );
    }
  }

  const refreshCols = await getTableCols(pool, 'refresh_tokens').catch(() => []);
  const hasTokenHash = hasCol(refreshCols, 'token_hash');
  const hasToken = hasCol(refreshCols, 'token');
  const expiresType = colType(refreshCols, 'expires_at');
  const expiresIsTs = expiresType.includes('timestamp') || expiresType.includes('date');
  const tokenHash = sha256Hex(refreshToken);
  const refreshExpiresAt = expiresIsTs ? new Date(refreshExpiresAtMs).toISOString() : new Date(refreshExpiresAtMs);

  if (hasTokenHash) {
    await pool.query(
      `INSERT INTO refresh_tokens (id, user_id, token_hash, expires_at, revoked, user_agent, ip)
       VALUES ($1, $2, $3, $4, FALSE, $5, $6)`,
      [randomId(16), userId, tokenHash, refreshExpiresAt, String(req.headers['user-agent'] || ''), ipOf(req)],
    );
  } else if (hasToken) {
    const revokedCol = hasCol(refreshCols, 'revoked');
    const revokedVal = revokedCol ? false : undefined;
    if (revokedCol) {
      await pool.query(
        `INSERT INTO refresh_tokens (id, user_id, token, expires_at, revoked, user_agent, ip)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [randomId(16), userId, tokenHash, refreshExpiresAt, revokedVal, String(req.headers['user-agent'] || ''), ipOf(req)],
      );
    } else {
      await pool.query(
        `INSERT INTO refresh_tokens (id, user_id, token, expires_at, user_agent, ip)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [randomId(16), userId, tokenHash, refreshExpiresAt, String(req.headers['user-agent'] || ''), ipOf(req)],
      );
    }
  } else {
    await pool.query(
      `INSERT INTO refresh_tokens (id, user_id, token_hash, expires_at, revoked, user_agent, ip)
       VALUES ($1, $2, $3, $4, FALSE, $5, $6)`,
      [randomId(16), userId, tokenHash, refreshExpiresAt, String(req.headers['user-agent'] || ''), ipOf(req)],
    );
  }

  return { token, refreshToken };
}

async function isTwoFactorEnabled(pool: pg.Pool, userId: string): Promise<boolean> {
  const r = await pool.query(`SELECT enabled FROM user_two_factor WHERE user_id = $1 LIMIT 1`, [userId]);
  return Boolean(r.rows?.[0]?.enabled);
}

async function getTwoFactorSecret(pool: pg.Pool, userId: string): Promise<string | null> {
  const r = await pool.query(`SELECT secret FROM user_two_factor WHERE user_id = $1 LIMIT 1`, [userId]);
  const s = r.rows?.[0]?.secret;
  return s ? String(s) : null;
}

export async function handleAuthRoutes(
  pool: pg.Pool,
  req: http.IncomingMessage,
  res: http.ServerResponse,
  url: URL,
): Promise<boolean> {
  const path = url.pathname;

  if (req.method === 'POST' && path === '/api/auth/signup') {
    try {
      const body = await readJsonBody<SignUpBody>(req).catch(() => null);
      if (!body) return badRequest(res, 'Invalid JSON'), true;
      const email = String(body.email || '').trim().toLowerCase();
      const password = String(body.password || '');
      if (!email || password.length < 6) return badRequest(res, 'Invalid credentials'), true;

      const exists = await pool.query(`SELECT 1 FROM users WHERE email = $1 LIMIT 1`, [email]);
      if (exists.rows.length > 0) return sendJson(res, 409, { error: 'Email already exists' }), true;

      const userId = randomId(12);
      const pw = hashPassword(password);
      const name = `${String(body.firstName || '').trim()} ${String(body.lastName || '').trim()}`.trim();

      await pool.query(
        `INSERT INTO users (id, email, password_hash, password_salt, role, name)
         VALUES ($1, $2, $3, $4, 'user', $5)`,
        [userId, email, pw.hashHex, pw.saltHex, name || null],
      );
      await pool.query(
        `INSERT INTO profiles (id, user_id, email, full_name, birth_date, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
         ON CONFLICT (id) DO NOTHING`,
        [randomId(12), userId, email, name || null, body.dob || null],
      );

      const tokens = await issueTokens(pool, userId, req);
      sendJson(res, 200, { token: tokens.token, refreshToken: tokens.refreshToken });
      return true;
    } catch (e: any) {
      sendJson(res, 500, { error: 'Signup failed', details: String(e?.message || e) });
      return true;
    }
  }

  if (req.method === 'POST' && path === '/api/auth/signin') {
    try {
      const body = await readJsonBody<SignInBody>(req).catch(() => null);
      if (!body) return badRequest(res, 'Invalid JSON'), true;
      const email = String(body.username || '').trim().toLowerCase();
      const password = String(body.password || '');
      if (!email || !password) return badRequest(res, 'Invalid credentials'), true;

      const r = await pool.query(
        `SELECT id, email, password_hash, password_salt FROM users WHERE email = $1 LIMIT 1`,
        [email],
      );
      const u = r.rows?.[0];
      if (!u) return unauthorized(res), true;
      if (!verifyPassword(password, String(u.password_hash), String(u.password_salt))) return unauthorized(res), true;

      const enabled = await isTwoFactorEnabled(pool, String(u.id));
      if (enabled) {
        sendJson(res, 200, { requires2fa: true, userId: String(u.id) });
        return true;
      }

      const tokens = await issueTokens(pool, String(u.id), req);
      sendJson(res, 200, { token: tokens.token, refreshToken: tokens.refreshToken });
      return true;
    } catch (e: any) {
      sendJson(res, 500, { error: 'Signin failed', details: String(e?.message || e) });
      return true;
    }
  }

  if (req.method === 'POST' && path === '/api/auth/refresh') {
    const body = await readJsonBody<RefreshBody>(req).catch(() => null);
    if (!body) return badRequest(res, 'Invalid JSON'), true;
    const refreshToken = String(body.refreshToken || '').trim();
    if (!refreshToken) return unauthorized(res), true;

    try {
      const tokenHash = sha256Hex(refreshToken);
      const refreshCols = await getTableCols(pool, 'refresh_tokens').catch(() => []);
      const useTokenHash = hasCol(refreshCols, 'token_hash');
      const tokenCol = useTokenHash ? 'token_hash' : (hasCol(refreshCols, 'token') ? 'token' : 'token_hash');
      const revokedCol = hasCol(refreshCols, 'revoked');
      const sql = `SELECT id, user_id, expires_at${revokedCol ? ', revoked' : ''} FROM refresh_tokens WHERE ${tokenCol} = $1 LIMIT 1`;
      const r = await pool.query(sql, [tokenHash]);
      const row = r.rows?.[0];
      if (!row) return unauthorized(res), true;
      if (revokedCol && Boolean(row.revoked)) return unauthorized(res), true;
      const exp = new Date(row.expires_at).getTime();
      if (!Number.isFinite(exp) || exp < Date.now()) return unauthorized(res), true;

      if (revokedCol) await pool.query(`UPDATE refresh_tokens SET revoked = TRUE WHERE id = $1`, [String(row.id)]);
      const tokens = await issueTokens(pool, String(row.user_id), req);
      sendJson(res, 200, { token: tokens.token, refreshToken: tokens.refreshToken });
      return true;
    } catch (e: any) {
      sendJson(res, 500, { error: 'Refresh failed', details: String(e?.message || e) });
      return true;
    }
  }

  if (req.method === 'POST' && path === '/api/auth/logout') {
    const token = getBearerToken(req);
    if (token) await pool.query(`DELETE FROM sessions WHERE token = $1`, [token]).catch(() => null);
    sendJson(res, 200, { success: true });
    return true;
  }

  if (req.method === 'GET' && path === '/api/auth/me') {
    const u = await requireUser(pool, req);
    if (!u) {
      sendJson(res, 200, { user: null });
      return true;
    }
    const kyc = u.kyc_verified ? 'verified' : 'unverified';
    sendJson(res, 200, {
      user: {
        userId: u.id,
        username: u.email,
        is_operator: u.role === 'admin' ? 1 : 0,
        kyc_status: kyc,
      },
    });
    return true;
  }

  if (req.method === 'GET' && path === '/api/auth/2fa/status') {
    const u = await requireUser(pool, req);
    if (!u) return unauthorized(res), true;
    const enabled = await isTwoFactorEnabled(pool, u.id);
    sendJson(res, 200, { enabled });
    return true;
  }

  if (req.method === 'POST' && path === '/api/auth/2fa/setup') {
    const u = await requireUser(pool, req);
    if (!u) return unauthorized(res), true;

    const secret = authenticator.generateSecret();
    await pool.query(
      `INSERT INTO user_two_factor (user_id, secret, enabled)
       VALUES ($1, $2, FALSE)
       ON CONFLICT (user_id) DO UPDATE SET secret = EXCLUDED.secret, enabled = FALSE, updated_at = NOW()`,
      [u.id, secret],
    );

    const label = encodeURIComponent(String(u.email || 'user'));
    const issuer = encodeURIComponent('BET62');
    const otpauth = authenticator.keyuri(label, issuer, secret);
    const qrCode = await QRCode.toDataURL(otpauth);

    sendJson(res, 200, { success: true, qrCode });
    return true;
  }

  if (req.method === 'POST' && path === '/api/auth/2fa/confirm') {
    const u = await requireUser(pool, req);
    if (!u) return unauthorized(res), true;
    const body = await readJsonBody<TwoFactorConfirmBody>(req).catch(() => null);
    if (!body) return badRequest(res, 'Invalid JSON'), true;
    const token = String(body.token || '').trim();
    if (!/^\d{6}$/.test(token)) return badRequest(res, 'Invalid token'), true;
    const secret = await getTwoFactorSecret(pool, u.id);
    if (!secret) return badRequest(res, '2FA not initialized'), true;
    const ok = authenticator.check(token, secret);
    if (!ok) return sendJson(res, 200, { success: false }), true;

    await pool.query(`UPDATE user_two_factor SET enabled = TRUE, updated_at = NOW() WHERE user_id = $1`, [u.id]);
    sendJson(res, 200, { success: true });
    return true;
  }

  if (req.method === 'POST' && path === '/api/auth/2fa/login') {
    const body = await readJsonBody<TwoFactorLoginBody>(req).catch(() => null);
    if (!body) return badRequest(res, 'Invalid JSON'), true;
    const userId = String(body.userId || '').trim();
    const token = String(body.token || '').trim();
    if (!userId || !/^\d{6}$/.test(token)) return unauthorized(res), true;

    const secret = await getTwoFactorSecret(pool, userId);
    if (!secret) return unauthorized(res), true;
    const enabled = await isTwoFactorEnabled(pool, userId);
    if (!enabled) return unauthorized(res), true;
    const ok = authenticator.check(token, secret);
    if (!ok) return sendJson(res, 200, { success: false }), true;

    const tokens = await issueTokens(pool, userId, req);
    sendJson(res, 200, { success: true, token: tokens.token, refreshToken: tokens.refreshToken });
    return true;
  }

  return false;
}
