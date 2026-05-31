-- Add market_status column to events table
ALTER TABLE events ADD COLUMN market_status TEXT DEFAULT 'active';
CREATE INDEX IF NOT EXISTS idx_events_market_status ON events(market_status);
