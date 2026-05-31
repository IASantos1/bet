-- Migration 0011: Add country to user_profile
ALTER TABLE user_profile ADD COLUMN country TEXT;
