CREATE TABLE IF NOT EXISTS trading_decisions (
    event_id TEXT PRIMARY KEY,
    status TEXT,
    manual_odds TEXT,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
