$env:WRANGLER_HOME=".\.wrangler_local"
npx wrangler d1 execute bet62-db --local --command "DELETE FROM events WHERE id = 120"
npx wrangler d1 execute bet62-db --local --command "SELECT id, external_event_id, home_team, away_team, event_date, is_live, home_odd, draw_odd, away_odd FROM events WHERE home_odd = 0 AND away_odd = 0 AND is_live = 1 LIMIT 5"
