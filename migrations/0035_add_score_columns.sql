-- Migration 0035: Add score columns to events
ALTER TABLE events ADD COLUMN score_home INTEGER;
ALTER TABLE events ADD COLUMN score_away INTEGER;
