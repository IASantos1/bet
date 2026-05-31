-- Auth
CREATE TABLE IF NOT EXISTS user (
    id VARCHAR(15) NOT NULL PRIMARY KEY,
    username TEXT
);

CREATE TABLE IF NOT EXISTS user_key (
    id VARCHAR(255) NOT NULL PRIMARY KEY,
    user_id VARCHAR(15) NOT NULL,
    hashed_password VARCHAR(255),
    FOREIGN KEY (user_id) REFERENCES user(id)
);

CREATE TABLE IF NOT EXISTS user_session (
    id VARCHAR(127) NOT NULL PRIMARY KEY,
    user_id VARCHAR(15) NOT NULL,
    active_expires BIGINT NOT NULL,
    idle_expires BIGINT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES user(id)
);

-- Core Betting
DROP TABLE IF EXISTS events;
CREATE TABLE events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    team_match TEXT NOT NULL,
    league TEXT,
    home_team TEXT NOT NULL,
    away_team TEXT NOT NULL,
    home_odd REAL,
    draw_odd REAL,
    away_odd REAL,
    event_date TEXT,
    is_live INTEGER NOT NULL DEFAULT 0,
    score TEXT,
    start_time DATETIME,
    end_time DATETIME,
    external_event_id TEXT,
    external_provider TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_events_is_live ON events(is_live);
CREATE INDEX IF NOT EXISTS idx_events_teams_date ON events(home_team, away_team, event_date);
CREATE INDEX IF NOT EXISTS idx_events_start_time ON events(start_time);
CREATE INDEX IF NOT EXISTS idx_events_end_time ON events(end_time);
CREATE UNIQUE INDEX IF NOT EXISTS uniq_events_league_teams_start ON events(league, home_team, away_team, start_time);

CREATE TABLE IF NOT EXISTS bets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    event_id INTEGER NOT NULL,
    selection TEXT NOT NULL,
    odd REAL NOT NULL,
    stake REAL NOT NULL,
    potential_win REAL NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    result TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_bets_user_id ON bets(user_id);
CREATE INDEX IF NOT EXISTS idx_bets_status ON bets(status);

CREATE TABLE IF NOT EXISTS favorites (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    event_id INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_favorites_user_id ON favorites(user_id);
CREATE INDEX IF NOT EXISTS idx_favorites_event_id ON favorites(event_id);

-- Sports Data
CREATE TABLE IF NOT EXISTS leagues (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    normalized_name TEXT NOT NULL UNIQUE,
    season TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS teams (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    normalized_name TEXT NOT NULL,
    league_id INTEGER,
    season TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(normalized_name, league_id, season)
);

CREATE TABLE IF NOT EXISTS players (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    full_name TEXT NOT NULL,
    normalized_name TEXT NOT NULL,
    position TEXT,
    team_id INTEGER,
    league_id INTEGER,
    season TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(normalized_name, team_id, season)
);

CREATE TABLE IF NOT EXISTS team_aliases (
    alias TEXT NOT NULL,
    alias_normalized TEXT NOT NULL UNIQUE,
    canonical TEXT NOT NULL,
    canonical_normalized TEXT NOT NULL
);

-- User & Compliance
CREATE TABLE IF NOT EXISTS user_profile (
    user_id TEXT PRIMARY KEY NOT NULL,
    gender TEXT,
    last_name TEXT,
    first_name TEXT,
    birth_date TEXT,
    email TEXT,
    phone TEXT,
    address TEXT,
    city TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    terms_accepted_at DATETIME,
    self_exclude INTEGER NOT NULL DEFAULT 0,
    self_exclude_until TEXT,
    is_operator INTEGER NOT NULL DEFAULT 0,
    kyc_status TEXT NOT NULL DEFAULT 'PENDING',
    verified_iban TEXT,
    verified_nif TEXT,
    iban_locked INTEGER NOT NULL DEFAULT 1,
    nif_locked INTEGER NOT NULL DEFAULT 1,
    max_daily_loss REAL
);

CREATE TABLE IF NOT EXISTS user_referrals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    inviter_user_id TEXT NOT NULL,
    invited_user_id TEXT NOT NULL UNIQUE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS user_documents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    type TEXT NOT NULL,
    filename TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    size INTEGER NOT NULL,
    content_base64 TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    status TEXT NOT NULL DEFAULT 'SUBMITTED',
    metadata TEXT
);

CREATE TABLE IF NOT EXISTS user_presence (
    user_id TEXT PRIMARY KEY NOT NULL,
    last_seen BIGINT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS user_two_factor (
    user_id TEXT PRIMARY KEY NOT NULL,
    secret TEXT NOT NULL,
    enabled INTEGER NOT NULL DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS aml_alerts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    kind TEXT NOT NULL,
    details TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Wallet & Finance Extensions
CREATE TABLE IF NOT EXISTS ledger_entries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    wallet_id INTEGER NOT NULL,
    transaction_id INTEGER,
    delta REAL NOT NULL,
    balance_after REAL NOT NULL,
    type TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS wallet_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    type TEXT NOT NULL,
    amount REAL NOT NULL,
    before_balance REAL NOT NULL,
    after_balance REAL NOT NULL,
    source TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS rates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    rate REAL NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS wallet_holds (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    wallet_id INTEGER NOT NULL,
    amount REAL NOT NULL,
    status TEXT NOT NULL,
    reason TEXT,
    transaction_id INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS profit_payouts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT NOT NULL,
    amount_eur REAL NOT NULL,
    amount_usdt REAL NOT NULL,
    eur_per_usdt REAL NOT NULL,
    external_id TEXT,
    status TEXT NOT NULL DEFAULT 'PENDING',
    swift TEXT,
    iban TEXT,
    holder_name TEXT,
    currency TEXT,
    reference TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS user_referrals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    inviter_user_id TEXT NOT NULL,
    invited_user_id TEXT NOT NULL UNIQUE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS user_promotions (
    id INTEGER PRIMARY KEY AUTOINCREMENT, 
    user_id TEXT NOT NULL, 
    type TEXT NOT NULL, 
    amount REAL NOT NULL, 
    status TEXT NOT NULL, 
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_promotions_user_type ON user_promotions(user_id, type);

-- IP Bans
CREATE TABLE IF NOT EXISTS ip_bans (
    ip TEXT PRIMARY KEY NOT NULL,
    expires_at BIGINT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Fixes for existing tables
-- transactions table in 0000 might miss created_ts.
-- Removed ALTER TABLE to avoid errors if column already exists from runtime execution.
-- ALTER TABLE transactions ADD COLUMN created_ts INTEGER;
