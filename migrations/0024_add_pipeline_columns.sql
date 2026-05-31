-- Add pipeline and state columns to imported_odds
ALTER TABLE imported_odds ADD COLUMN pipeline TEXT;
ALTER TABLE imported_odds ADD COLUMN market_status TEXT;
ALTER TABLE imported_odds ADD COLUMN event_state TEXT;
ALTER TABLE imported_odds ADD COLUMN suspended INTEGER DEFAULT 0;

-- Index for pipeline filtering
CREATE INDEX IF NOT EXISTS idx_imported_odds_pipeline ON imported_odds(pipeline);
