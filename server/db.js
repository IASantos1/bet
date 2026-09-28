import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id              INTEGER PRIMARY KEY,
  email           TEXT    NOT NULL UNIQUE,
  name            TEXT    NOT NULL,
  birthdate       TEXT    NOT NULL,
  phone           TEXT,
  password_hash   TEXT    NOT NULL,
  role            TEXT    NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
  balance_cents   INTEGER NOT NULL DEFAULT 0 CHECK (balance_cents >= 0),
  excluded_until  TEXT,
  created_at      TEXT    NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash  TEXT    PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at  TEXT    NOT NULL,
  created_at  TEXT    NOT NULL
);

-- Wallet ledger: every balance change is recorded here with the resulting balance.
CREATE TABLE IF NOT EXISTS transactions (
  id                  INTEGER PRIMARY KEY,
  user_id             INTEGER NOT NULL REFERENCES users(id),
  type                TEXT    NOT NULL CHECK (type IN ('deposit', 'withdrawal', 'withdrawal_refund', 'bet', 'payout', 'refund')),
  amount_cents        INTEGER NOT NULL,
  balance_after_cents INTEGER NOT NULL,
  description         TEXT    NOT NULL,
  ref                 TEXT,
  created_at          TEXT    NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_transactions_user ON transactions(user_id, id);

CREATE TABLE IF NOT EXISTS withdrawals (
  id           INTEGER PRIMARY KEY,
  user_id      INTEGER NOT NULL REFERENCES users(id),
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
  iban         TEXT    NOT NULL,
  status       TEXT    NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at   TEXT    NOT NULL,
  decided_at   TEXT
);

CREATE TABLE IF NOT EXISTS events (
  id          INTEGER PRIMARY KEY,
  sport       TEXT    NOT NULL,
  competition TEXT    NOT NULL,
  home        TEXT    NOT NULL,
  away        TEXT    NOT NULL,
  start_time  TEXT    NOT NULL,
  status      TEXT    NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'live', 'finished', 'cancelled')),
  home_score  INTEGER,
  away_score  INTEGER,
  clock       TEXT,
  result      TEXT    CHECK (result IN ('1', 'X', '2')),
  featured    INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT    NOT NULL,
  updated_at  TEXT    NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_events_status ON events(status, start_time);

-- Match-result (1X2) market. Odds are stored as integer hundredths (2.15 -> 215).
CREATE TABLE IF NOT EXISTS selections (
  id        INTEGER PRIMARY KEY,
  event_id  INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  code      TEXT    NOT NULL CHECK (code IN ('1', 'X', '2')),
  odds_x100 INTEGER NOT NULL CHECK (odds_x100 > 100),
  active    INTEGER NOT NULL DEFAULT 1,
  UNIQUE (event_id, code)
);

CREATE TABLE IF NOT EXISTS bets (
  id              INTEGER PRIMARY KEY,
  user_id         INTEGER NOT NULL REFERENCES users(id),
  type            TEXT    NOT NULL CHECK (type IN ('single', 'multiple')),
  stake_cents     INTEGER NOT NULL CHECK (stake_cents > 0),
  total_odds      REAL    NOT NULL,
  potential_cents INTEGER NOT NULL,
  status          TEXT    NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'won', 'lost', 'void')),
  payout_cents    INTEGER NOT NULL DEFAULT 0,
  created_at      TEXT    NOT NULL,
  settled_at      TEXT
);
CREATE INDEX IF NOT EXISTS idx_bets_user ON bets(user_id, id);

CREATE TABLE IF NOT EXISTS bet_legs (
  id           INTEGER PRIMARY KEY,
  bet_id       INTEGER NOT NULL REFERENCES bets(id) ON DELETE CASCADE,
  event_id     INTEGER NOT NULL REFERENCES events(id),
  selection_id INTEGER NOT NULL REFERENCES selections(id),
  code         TEXT    NOT NULL,
  odds_x100    INTEGER NOT NULL,
  status       TEXT    NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'won', 'lost', 'void'))
);
CREATE INDEX IF NOT EXISTS idx_bet_legs_event ON bet_legs(event_id, status);
CREATE INDEX IF NOT EXISTS idx_bet_legs_bet ON bet_legs(bet_id);
`;

export function openDb(file) {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
  db.exec(SCHEMA);
  migrate(db);
  return db;
}

/** Additive migrations for databases created by earlier versions. */
function migrate(db) {
  const cols = new Set(db.prepare('PRAGMA table_info(events)').all().map((c) => c.name));
  // Events imported from an external data feed: where they came from and their id there.
  if (!cols.has('source')) db.exec("ALTER TABLE events ADD COLUMN source TEXT NOT NULL DEFAULT 'manual'");
  if (!cols.has('external_id')) db.exec('ALTER TABLE events ADD COLUMN external_id TEXT');
  if (!cols.has('odds_next_at')) db.exec('ALTER TABLE events ADD COLUMN odds_next_at TEXT');
  db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_events_external ON events(source, external_id) WHERE external_id IS NOT NULL');
}

/** Runs fn inside a write transaction; rolls back if it throws. Must not be nested. */
export function tx(db, fn) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

export const nowIso = () => new Date().toISOString();
