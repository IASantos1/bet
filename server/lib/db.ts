import pg from 'pg';

const { Pool } = pg;

export type Db = {
  pool: pg.Pool;
};

export function createPool(): pg.Pool | null {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) return null;
  return new Pool({
    connectionString,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
  });
}

export async function ensureSchema(pool: pg.Pool | null): Promise<void> {
  if (!pool) return;
  const sql = [
    `CREATE TABLE IF NOT EXISTS users (
      id            TEXT        PRIMARY KEY,
      email         TEXT        NOT NULL UNIQUE,
      password_hash TEXT        NOT NULL,
      password_salt TEXT        NOT NULL,
      role          TEXT        NOT NULL DEFAULT 'user',
      name          TEXT,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`,
    `CREATE TABLE IF NOT EXISTS profiles (
      id               TEXT          PRIMARY KEY,
      user_id          TEXT          NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      email            TEXT          NOT NULL,
      full_name        TEXT,
      phone            TEXT,
      balance          NUMERIC(18,2) NOT NULL DEFAULT 0,
      free_bet_balance NUMERIC(18,2) NOT NULL DEFAULT 0,
      kyc_verified     BOOLEAN       NOT NULL DEFAULT FALSE,
      email_verified   BOOLEAN       NOT NULL DEFAULT FALSE,
      birth_date       TEXT,
      self_exclude     BOOLEAN       NOT NULL DEFAULT FALSE,
      self_exclude_until TIMESTAMPTZ,
      is_operator      BOOLEAN       NOT NULL DEFAULT FALSE,
      created_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
      updated_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW()
    )`,
    `CREATE TABLE IF NOT EXISTS sessions (
      token      TEXT        PRIMARY KEY,
      user_id    TEXT        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      issued_at  BIGINT      NOT NULL,
      expires_at BIGINT      NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`,
    `CREATE TABLE IF NOT EXISTS refresh_tokens (
      id         TEXT        PRIMARY KEY,
      user_id    TEXT        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash TEXT        NOT NULL UNIQUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      expires_at TIMESTAMPTZ NOT NULL,
      revoked    BOOLEAN     NOT NULL DEFAULT FALSE,
      user_agent TEXT,
      ip         TEXT
    )`,
    `CREATE TABLE IF NOT EXISTS transactions (
      id                TEXT          PRIMARY KEY,
      user_id           TEXT          NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      type              TEXT          NOT NULL,
      amount            NUMERIC(18,2) NOT NULL,
      status            TEXT          NOT NULL DEFAULT 'pending',
      payment_method    TEXT,
      description       TEXT,
      external_id       TEXT,
      stripe_session_id TEXT,
      completed_at      TIMESTAMPTZ,
      created_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
      updated_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW()
    )`,
    `CREATE TABLE IF NOT EXISTS bets (
      id               TEXT          PRIMARY KEY,
      user_id          TEXT          NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      bet_type         TEXT          NOT NULL,
      stake            NUMERIC(18,2) NOT NULL,
      potential_win    NUMERIC(18,2) NOT NULL,
      total_odds       NUMERIC(18,6) NOT NULL,
      status           TEXT          NOT NULL DEFAULT 'pending',
      is_free_bet      BOOLEAN       NOT NULL DEFAULT FALSE,
      winnings         NUMERIC(18,2),
      selections       JSONB,
      total_stake      NUMERIC(18,2),
      potential_return NUMERIC(18,2),
      cashout_value    NUMERIC(18,2),
      cashout_at       TIMESTAMPTZ,
      settled_at       TIMESTAMPTZ,
      created_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
      updated_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW()
    )`,
    `CREATE TABLE IF NOT EXISTS user_two_factor (
      user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      secret TEXT NOT NULL,
      enabled BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`,
    `CREATE TABLE IF NOT EXISTS favorites (
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      event_id TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (user_id, event_id)
    )`,
    `CREATE TABLE IF NOT EXISTS user_presence (
      user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      last_seen BIGINT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`,
    `CREATE TABLE IF NOT EXISTS user_documents (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      doc_type TEXT NOT NULL,
      filename TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      size_bytes BIGINT NOT NULL DEFAULT 0,
      content_base64 TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'SUBMITTED',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`,
    `CREATE INDEX IF NOT EXISTS idx_user_documents_user_id ON user_documents(user_id)`,
    `CREATE TABLE IF NOT EXISTS user_self_exclude_history (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      action TEXT NOT NULL,
      until TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`,
    `CREATE INDEX IF NOT EXISTS idx_user_self_exclude_history_user_id ON user_self_exclude_history(user_id)`,
    `CREATE TABLE IF NOT EXISTS odds_overrides (
      event_id TEXT PRIMARY KEY,
      home_odd NUMERIC,
      draw_odd NUMERIC,
      away_odd NUMERIC,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`,
    `CREATE INDEX IF NOT EXISTS idx_profiles_user_id ON profiles(user_id)`,
    `CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id)`,
    `CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at)`,
    `CREATE INDEX IF NOT EXISTS idx_transactions_user_id ON transactions(user_id)`,
    `CREATE INDEX IF NOT EXISTS idx_transactions_created_at ON transactions(created_at DESC)`,
    `CREATE INDEX IF NOT EXISTS idx_bets_user_id ON bets(user_id)`,
    `CREATE INDEX IF NOT EXISTS idx_bets_created_at ON bets(created_at DESC)`,
  ];

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const q of sql) await client.query(q);
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}
