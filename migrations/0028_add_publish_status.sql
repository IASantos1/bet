-- Add publish_status column to imported_odds
ALTER TABLE imported_odds ADD COLUMN publish_status TEXT DEFAULT 'pending';
CREATE INDEX IF NOT EXISTS idx_imported_odds_publish ON imported_odds(publish_status);
