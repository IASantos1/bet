
npx wrangler d1 execute bet62-db --local --command "SELECT id, external_event_id, sport, league, home_team, away_team FROM events WHERE (home_odd IS NULL OR home_odd = 0) AND status = 'NS' LIMIT 5"
