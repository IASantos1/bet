-- Migration: Add elapsed to events
ALTER TABLE events ADD COLUMN elapsed INTEGER DEFAULT 0;
