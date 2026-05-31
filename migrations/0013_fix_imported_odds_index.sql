-- Migration: Create index for imported_odds to support ON CONFLICT(sport, id)
-- Date: 2025-12-28

CREATE UNIQUE INDEX IF NOT EXISTS idx_imported_odds_sport_id ON imported_odds(sport, id);
