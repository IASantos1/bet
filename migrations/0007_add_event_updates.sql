CREATE TABLE IF NOT EXISTS event_updates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id TEXT NOT NULL,
  market_key TEXT,
  data TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_event_updates_id ON event_updates(id);
CREATE INDEX IF NOT EXISTS idx_event_updates_event_id ON event_updates(event_id);
