-- Migration number: 0022 	 2026-01-15T00:00:00.000Z
-- Table: api_usage_daily
CREATE TABLE IF NOT EXISTS api_usage_daily (
    date TEXT NOT NULL, -- YYYY-MM-DD
    provider TEXT NOT NULL,
    endpoint TEXT NOT NULL,
    count INTEGER DEFAULT 0,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (date, provider, endpoint)
);
