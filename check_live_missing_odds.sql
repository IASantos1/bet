SELECT id, external_event_id, league, home_team, away_team, home_odd, is_live 
FROM events 
WHERE is_live=1 AND (home_odd IS NULL OR home_odd = 0);