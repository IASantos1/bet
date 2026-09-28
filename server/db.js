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
  type                TEXT    NOT NULL CHECK (type IN ('deposit', 'withdrawal', 'withdrawal_refund', 'bet', 'payout', 'refund', 'casino_out', 'casino_in')),
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

-- Priced selections per market (see server/markets.js). Odds are integer hundredths (2.15 -> 215).
CREATE TABLE IF NOT EXISTS selections (
  id        INTEGER PRIMARY KEY,
  event_id  INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  market    TEXT    NOT NULL DEFAULT '1x2' CHECK (market IN ('1x2', 'dc', 'dnb', 'ou', 'btts', 'ml')),
  code      TEXT    NOT NULL,
  odds_x100 INTEGER NOT NULL CHECK (odds_x100 > 100),
  active    INTEGER NOT NULL DEFAULT 1,
  UNIQUE (event_id, market, code)
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
  market       TEXT    NOT NULL DEFAULT '1x2',
  code         TEXT    NOT NULL,
  odds_x100    INTEGER NOT NULL,
  status       TEXT    NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'won', 'lost', 'void'))
);
CREATE INDEX IF NOT EXISTS idx_bet_legs_event ON bet_legs(event_id, status);
CREATE INDEX IF NOT EXISTS idx_bet_legs_bet ON bet_legs(bet_id);

-- Settlement audit log: every result or void applied to an event, by whom and with what effect.
CREATE TABLE IF NOT EXISTS settlements (
  id           INTEGER PRIMARY KEY,
  event_id     INTEGER NOT NULL REFERENCES events(id),
  action       TEXT    NOT NULL CHECK (action IN ('result', 'void')),
  home_score   INTEGER,
  away_score   INTEGER,
  bets_settled INTEGER NOT NULL DEFAULT 0,
  payout_cents INTEGER NOT NULL DEFAULT 0,
  source       TEXT    NOT NULL CHECK (source IN ('feed', 'admin', 'engine')),
  user_id      INTEGER REFERENCES users(id),
  note         TEXT,
  created_at   TEXT    NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_settlements_event ON settlements(event_id);
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
  // Provider team ids, used for the club badges served by the provider's image proxy.
  if (!cols.has('home_team_ext')) db.exec('ALTER TABLE events ADD COLUMN home_team_ext TEXT');
  if (!cols.has('league_ext')) db.exec('ALTER TABLE events ADD COLUMN league_ext TEXT');
  if (!cols.has('away_team_ext')) db.exec('ALTER TABLE events ADD COLUMN away_team_ext TEXT');
  // When the current in-play price was received (live odds over the provider's WebSocket).
  if (!cols.has('live_odds_at')) db.exec('ALTER TABLE events ADD COLUMN live_odds_at TEXT');
  // When the provider first reported the match postponed (voided after 48 h without a new date).
  if (!cols.has('postponed_at')) db.exec('ALTER TABLE events ADD COLUMN postponed_at TEXT');
  if (!cols.has('home_country')) db.exec('ALTER TABLE events ADD COLUMN home_country TEXT');
  if (!cols.has('away_country')) db.exec('ALTER TABLE events ADD COLUMN away_country TEXT');
  // Live scoreboard details that do not fit the score/clock columns (tennis: set, point, server).
  if (!cols.has('live_detail')) db.exec('ALTER TABLE events ADD COLUMN live_detail TEXT');
  if (!cols.has('reg_home_score')) db.exec('ALTER TABLE events ADD COLUMN reg_home_score INTEGER');
  if (!cols.has('reg_away_score')) db.exec('ALTER TABLE events ADD COLUMN reg_away_score INTEGER');

  // Markets beyond 1X2: selections gain a market column (the table is rebuilt, keeping ids so
  // bet legs stay linked) and bet legs record the market they were placed on.
  const selCols = new Set(db.prepare('PRAGMA table_info(selections)').all().map((c) => c.name));
  if (!selCols.has('market')) {
    rebuild(db, 'selections', `INSERT INTO selections (id, event_id, market, code, odds_x100, active)
      SELECT id, event_id, '1x2', code, odds_x100, active FROM selections_old`);
  }
  // Match-winner market for other sports ('ml'): the market CHECK is widened by a rebuild.
  const selSql = db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'selections'").get()?.sql || '';
  if (!selSql.includes("'ml'")) {
    rebuild(db, 'selections', `INSERT INTO selections (id, event_id, market, code, odds_x100, active)
      SELECT id, event_id, market, code, odds_x100, active FROM selections_old`);
  }
  const legCols = new Set(db.prepare('PRAGMA table_info(bet_legs)').all().map((c) => c.name));
  if (!legCols.has('market')) db.exec("ALTER TABLE bet_legs ADD COLUMN market TEXT NOT NULL DEFAULT '1x2'");

  // Casino (aggregator Agent API): the player's code there.
  const userCols = new Set(db.prepare('PRAGMA table_info(users)').all().map((c) => c.name));
  if (!userCols.has('casino_user_code')) db.exec('ALTER TABLE users ADD COLUMN casino_user_code INTEGER');
  // Single wallet: 1 while the player's balance is in the casino (a game is open).
  if (!userCols.has('casino_active')) db.exec('ALTER TABLE users ADD COLUMN casino_active INTEGER NOT NULL DEFAULT 0');

  // Ledger types for casino transfers. SQLite cannot alter a CHECK, so older databases get the
  // table rebuilt with the same rows.
  const txSql = db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'transactions'").get()?.sql || '';
  if (!txSql.includes('casino_out')) {
    rebuild(db, 'transactions', `INSERT INTO transactions (id, user_id, type, amount_cents, balance_after_cents, description, ref, created_at)
      SELECT id, user_id, type, amount_cents, balance_after_cents, description, ref, created_at FROM transactions_old`);
  }
}

/** Recreates a table from SCHEMA (to change constraints SQLite cannot ALTER), copying its rows. */
function rebuild(db, table, copySql) {
  db.exec('PRAGMA foreign_keys = OFF');
  // Keep other tables' foreign keys pointing at the name, not at the renamed old table.
  db.exec('PRAGMA legacy_alter_table = ON');
  db.exec('BEGIN');
  try {
    db.exec(`ALTER TABLE ${table} RENAME TO ${table}_old`);
    // Indexes keep their names across a rename; drop them so SCHEMA can recreate them.
    for (const { name } of db.prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = ? AND sql IS NOT NULL").all(`${table}_old`)) {
      db.exec(`DROP INDEX ${name}`);
    }
    db.exec(SCHEMA);
    db.exec(copySql);
    db.exec(`DROP TABLE ${table}_old`);
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  } finally {
    db.exec('PRAGMA legacy_alter_table = OFF');
    db.exec('PRAGMA foreign_keys = ON');
  }
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
