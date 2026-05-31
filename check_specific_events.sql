-- Check for Illinois vs Minnesota
SELECT id, league, home_team, away_team, event_date, is_live 
FROM events 
WHERE (home_team LIKE '%Illinois%' OR away_team LIKE '%Illinois%') 
   OR (home_team LIKE '%Minnesota%' OR away_team LIKE '%Minnesota%');

-- Check for specific ID 1521379
SELECT * FROM events WHERE external_event_id = '1521379' OR id = '1521379';
