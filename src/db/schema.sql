-- Database Schema
-- Updated: 2025-12-28

-- Table: events
CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    external_event_id TEXT,
    team_match TEXT,
    match TEXT, -- Legacy
    league TEXT,
    home_team TEXT,
    away_team TEXT,
    home_odd REAL,
    draw_odd REAL,
    away_odd REAL,
    event_date DATETIME,
    start_time DATETIME,
    is_live INTEGER DEFAULT 0,
    score TEXT,
    elapsed INTEGER DEFAULT 0,
    sport TEXT,
    external_provider TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_events_external_id ON events(external_event_id) WHERE external_event_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_events_is_live_start ON events(is_live, start_time);

-- Table: imported_odds
CREATE TABLE IF NOT EXISTS imported_odds (
    id TEXT PRIMARY KEY,
    sport TEXT, 
    league_name TEXT, 
    home_team TEXT,
    away_team TEXT,
    event_date TEXT,
    status TEXT, 
    payload TEXT, 
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP, 
    is_live INTEGER DEFAULT 0
);

-- Index required for ON CONFLICT(sport, id) clauses
CREATE UNIQUE INDEX IF NOT EXISTS idx_imported_odds_sport_id ON imported_odds(sport, id);
CREATE INDEX IF NOT EXISTS idx_imported_odds_sport ON imported_odds(sport);
CREATE INDEX IF NOT EXISTS idx_imported_odds_is_live ON imported_odds(is_live);
CREATE INDEX IF NOT EXISTS idx_imported_odds_status ON imported_odds(status);

-- Table: locks
CREATE TABLE IF NOT EXISTS locks (
    key TEXT PRIMARY KEY,
    expires_at DATETIME NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Table: api_usage_daily
CREATE TABLE IF NOT EXISTS api_usage_daily (
    date TEXT NOT NULL, -- YYYY-MM-DD
    provider TEXT NOT NULL,
    endpoint TEXT NOT NULL,
    count INTEGER DEFAULT 0,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (date, provider, endpoint)
);
