SELECT id, external_event_id, league, home_team, away_team, event_date 
FROM events 
WHERE (home_odd IS NULL OR home_odd = 0) AND event_date > datetime('now') 
ORDER BY event_date ASC
LIMIT 5;