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

    // ---- Wallet + Double-Entry Ledger (BET62 spec §7-9) ----
    // wallets.* is a transactionally-consistent materialized balance, always written in the
    // same DB transaction as the ledger_entries that justify it. ledger_entries is the
    // append-only source of truth; nothing here is ever UPDATEd or DELETEd after insert.
    `CREATE TABLE IF NOT EXISTS wallets (
      user_id            TEXT          PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      available          NUMERIC(18,2) NOT NULL DEFAULT 0,
      reserved           NUMERIC(18,2) NOT NULL DEFAULT 0,
      bonus              NUMERIC(18,2) NOT NULL DEFAULT 0,
      pending_withdrawal NUMERIC(18,2) NOT NULL DEFAULT 0,
      currency           TEXT          NOT NULL DEFAULT 'EUR',
      version            BIGINT        NOT NULL DEFAULT 0,
      created_at         TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
      updated_at         TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
      CONSTRAINT wallets_non_negative CHECK (available >= 0 AND reserved >= 0 AND bonus >= 0 AND pending_withdrawal >= 0)
    )`,
    `CREATE TABLE IF NOT EXISTS ledger_transactions (
      id              TEXT          PRIMARY KEY,
      idempotency_key TEXT          NOT NULL UNIQUE,
      type            TEXT          NOT NULL,
      user_id         TEXT          NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      reference_id    TEXT,
      metadata        JSONB         NOT NULL DEFAULT '{}'::jsonb,
      result_snapshot JSONB,
      status          TEXT          NOT NULL DEFAULT 'completed',
      created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW()
    )`,
    `CREATE INDEX IF NOT EXISTS idx_ledger_tx_user ON ledger_transactions(user_id, created_at DESC)`,
    `CREATE INDEX IF NOT EXISTS idx_ledger_tx_reference ON ledger_transactions(reference_id)`,
    `CREATE INDEX IF NOT EXISTS idx_ledger_tx_type ON ledger_transactions(type)`,
    `CREATE TABLE IF NOT EXISTS ledger_entries (
      id             BIGSERIAL     PRIMARY KEY,
      transaction_id TEXT          NOT NULL REFERENCES ledger_transactions(id),
      account        TEXT          NOT NULL,
      user_id        TEXT          REFERENCES users(id) ON DELETE SET NULL,
      direction      TEXT          NOT NULL CHECK (direction IN ('debit','credit')),
      amount         NUMERIC(18,2) NOT NULL CHECK (amount > 0),
      currency       TEXT          NOT NULL DEFAULT 'EUR',
      created_at     TIMESTAMPTZ   NOT NULL DEFAULT NOW()
    )`,
    `CREATE INDEX IF NOT EXISTS idx_ledger_entries_tx ON ledger_entries(transaction_id)`,
    `CREATE INDEX IF NOT EXISTS idx_ledger_entries_account ON ledger_entries(account)`,
    `CREATE INDEX IF NOT EXISTS idx_ledger_entries_user ON ledger_entries(user_id)`,

    // ---- KYC state machine + account status (spec §6, §35) + Audit Log (spec §41) ----
    `ALTER TABLE profiles ADD COLUMN IF NOT EXISTS kyc_status TEXT NOT NULL DEFAULT 'NOT_STARTED'`,
    `ALTER TABLE profiles ADD COLUMN IF NOT EXISTS account_status TEXT NOT NULL DEFAULT 'ACTIVE'`,
    `ALTER TABLE user_documents ADD COLUMN IF NOT EXISTS ip_address TEXT`,
    `CREATE INDEX IF NOT EXISTS idx_profiles_kyc_status ON profiles(kyc_status)`,
    `CREATE TABLE IF NOT EXISTS audit_logs (
      id            TEXT        PRIMARY KEY,
      operator_id   TEXT        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      action        TEXT        NOT NULL,
      resource_type TEXT        NOT NULL,
      resource_id   TEXT,
      reason        TEXT,
      metadata      JSONB       NOT NULL DEFAULT '{}'::jsonb,
      ip            TEXT,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`,
    `CREATE INDEX IF NOT EXISTS idx_audit_logs_resource ON audit_logs(resource_type, resource_id)`,
    `CREATE INDEX IF NOT EXISTS idx_audit_logs_operator ON audit_logs(operator_id, created_at DESC)`,

    // ---- Bonus Engine (spec §34) ----
    `CREATE TABLE IF NOT EXISTS bonus_campaigns (
      id                  TEXT          PRIMARY KEY,
      name                TEXT          NOT NULL,
      type                TEXT          NOT NULL,
      active              BOOLEAN       NOT NULL DEFAULT TRUE,
      minimum_deposit     NUMERIC(18,2) NOT NULL DEFAULT 0,
      bonus_percent       NUMERIC(6,3)  NOT NULL DEFAULT 0,
      maximum_bonus       NUMERIC(18,2) NOT NULL,
      wagering_multiplier NUMERIC(6,2)  NOT NULL DEFAULT 1,
      minimum_odds        NUMERIC(6,2)  NOT NULL DEFAULT 1.0,
      expiry_days         INTEGER       NOT NULL DEFAULT 30,
      max_conversion      NUMERIC(18,2),
      created_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW()
    )`,
    `CREATE TABLE IF NOT EXISTS user_bonuses (
      id                 TEXT          PRIMARY KEY,
      user_id            TEXT          NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      campaign_id        TEXT          NOT NULL REFERENCES bonus_campaigns(id),
      amount             NUMERIC(18,2) NOT NULL,
      wagering_required  NUMERIC(18,2) NOT NULL,
      wagering_progress  NUMERIC(18,2) NOT NULL DEFAULT 0,
      status             TEXT          NOT NULL DEFAULT 'ACTIVE',
      granted_at         TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
      expires_at         TIMESTAMPTZ   NOT NULL,
      settled_at         TIMESTAMPTZ
    )`,
    // One active bonus per user at a time — enforced by the database, not just app logic.
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_user_bonuses_one_active ON user_bonuses(user_id) WHERE status = 'ACTIVE'`,
    `CREATE INDEX IF NOT EXISTS idx_user_bonuses_user ON user_bonuses(user_id, granted_at DESC)`,
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
