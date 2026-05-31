CREATE TABLE IF NOT EXISTS live_event_state (
    event_id TEXT PRIMARY KEY,
    frozen INTEGER DEFAULT 0,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_live_event_state_frozen ON live_event_state(frozen);
