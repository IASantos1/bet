-- Migration 0034: Add country to events
ALTER TABLE events ADD COLUMN country TEXT;
