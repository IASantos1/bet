import type http from 'http';
import type pg from 'pg';

export type AuthedUser = {
  id: string;
  email: string;
  role: 'user' | 'admin';
  name?: string | null;
  kyc_verified?: boolean;
};

export function getBearerToken(req: http.IncomingMessage): string {
  const h = String(req.headers['authorization'] || '').trim();
  if (!h) return '';
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m ? m[1].trim() : '';
}

type SessionExpiresMode = 'ms' | 'ts';
let __sessions_expires_mode: SessionExpiresMode | null = null;

async function detectSessionsExpiresMode(pool: pg.Pool): Promise<SessionExpiresMode> {
  if (__sessions_expires_mode) return __sessions_expires_mode;
  try {
    const r = await pool.query(
      `SELECT data_type
       FROM information_schema.columns
       WHERE table_name = 'sessions' AND column_name = 'expires_at'
       LIMIT 1`,
    );
    const t = String(r.rows?.[0]?.data_type || '').toLowerCase();
    __sessions_expires_mode = t.includes('timestamp') || t.includes('date') ? 'ts' : 'ms';
  } catch {
    __sessions_expires_mode = 'ms';
  }
  return __sessions_expires_mode;
}

export async function requireUser(pool: pg.Pool, req: http.IncomingMessage): Promise<AuthedUser | null> {
  const token = getBearerToken(req);
  if (!token) return null;

  const mode = await detectSessionsExpiresMode(pool);
  try {
    const row =
      mode === 'ts'
        ? await pool.query(
            `SELECT s.user_id, u.email, u.role, u.name, p.kyc_verified
             FROM sessions s
             JOIN users u ON u.id = s.user_id
             LEFT JOIN profiles p ON p.user_id = u.id
             WHERE s.token = $1 AND s.expires_at > NOW()
             LIMIT 1`,
            [token],
          )
        : await pool.query(
            `SELECT s.user_id, u.email, u.role, u.name, p.kyc_verified
             FROM sessions s
             JOIN users u ON u.id = s.user_id
             LEFT JOIN profiles p ON p.user_id = u.id
             WHERE s.token = $1 AND s.expires_at > $2
             LIMIT 1`,
            [token, Date.now()],
          );
    const r = row.rows?.[0];
    if (!r) return null;
    return {
      id: String(r.user_id),
      email: String(r.email),
      role: (String(r.role) === 'admin' ? 'admin' : 'user') as any,
      name: r.name == null ? null : String(r.name),
      kyc_verified: r.kyc_verified == null ? undefined : Boolean(r.kyc_verified),
    };
  } catch {
    return null;
  }
}

export function isAdmin(u: AuthedUser | null): boolean {
  return !!u && u.role === 'admin';
}
