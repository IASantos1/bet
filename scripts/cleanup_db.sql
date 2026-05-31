-- Cleanup fake/invalid events
DELETE FROM events WHERE home_team IS NULL OR home_team = 'undefined' OR home_team = '';
DELETE FROM events WHERE away_team IS NULL OR away_team = 'undefined' OR away_team = '';
DELETE FROM events WHERE league IS NULL OR league = 'undefined' OR league = '';
DELETE FROM events WHERE event_date IS NULL;
-- Also clean up imported_odds if they exist
DELETE FROM imported_odds WHERE payload LIKE '%"home_team":"undefined"%' OR payload LIKE '%"away_team":"undefined"%';
