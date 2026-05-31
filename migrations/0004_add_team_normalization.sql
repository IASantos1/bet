CREATE TABLE IF NOT EXISTS team_mappings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source_name TEXT NOT NULL,
    target_name TEXT NOT NULL,
    provider TEXT DEFAULT 'the-odds-api',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(source_name, provider)
);

CREATE INDEX IF NOT EXISTS idx_team_mappings_source ON team_mappings(source_name);
