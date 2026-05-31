CREATE TABLE IF NOT EXISTS market_exposure (
    market_id TEXT PRIMARY KEY,
    exposure REAL DEFAULT 0,
    max_exposure REAL DEFAULT 10000,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_market_exposure_exposure ON market_exposure(exposure);
