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

CREATE INDEX IF NOT EXISTS idx_imported_odds_sport ON imported_odds(sport);
CREATE INDEX IF NOT EXISTS idx_imported_odds_is_live ON imported_odds(is_live);
