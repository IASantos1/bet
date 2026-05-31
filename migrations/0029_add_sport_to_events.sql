-- Migration number: 0029 	 2026-01-28T13:20:00.000Z
ALTER TABLE events ADD COLUMN sport TEXT DEFAULT 'soccer';
CREATE INDEX IF NOT EXISTS idx_events_sport ON events(sport);
