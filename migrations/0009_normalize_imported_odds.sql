-- Optimize events table for lookups and consistency
CREATE UNIQUE INDEX IF NOT EXISTS idx_events_external_id ON events(external_event_id) WHERE external_event_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_events_is_live_start ON events(is_live, start_time);

-- Ensure imported_odds has all necessary columns (idempotent)
-- (D1 doesn't support IF NOT EXISTS for columns, so we rely on the fact that we might have added them in previous migrations or just ignore errors in application code, 
-- but here we can try to be cleaner if possible. Since we can't check column existence easily in SQL here, we skip ALTERs that might fail if column exists.
-- Instead, we focus on indices.)

CREATE INDEX IF NOT EXISTS idx_imported_odds_status ON imported_odds(status);
