-- Ensure table exists before indexing (Fix for fresh install)
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

-- Performance optimization for imported_odds table
CREATE INDEX IF NOT EXISTS idx_imported_odds_updated ON imported_odds(updated_at);
CREATE INDEX IF NOT EXISTS idx_imported_odds_live ON imported_odds(is_live, event_date);
CREATE INDEX IF NOT EXISTS idx_imported_odds_sport ON imported_odds(sport);

-- Ensure event_updates index exists (redundant if 0007 applied, but safe)
CREATE INDEX IF NOT EXISTS idx_event_updates_id ON event_updates(id);
