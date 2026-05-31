$ids = "'soccer_1503672', 'soccer_1491910', 'soccer_1494512', 'soccer_1515255', 'soccer_1522252'"
Write-Host "Checking events table for specific IDs..."
npx wrangler d1 execute bet62-db --local --command "SELECT id, external_event_id, home_team, away_team, home_odd, draw_odd, away_odd, status, updated_at FROM events WHERE external_event_id IN ($ids);"
