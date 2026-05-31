$env:WRANGLER_HOME=".\.wrangler_local"
npx wrangler d1 execute bet62-db --local --command "SELECT id, external_event_id, home_team, away_team, event_date, is_live, home_odd, draw_odd, away_odd FROM events WHERE (home_team LIKE '%Illinois%' OR away_team LIKE '%Illinois%') OR (home_team LIKE '%Minnesota%' OR away_team LIKE '%Minnesota%')"
