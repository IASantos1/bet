$env:WRANGLER_HOME=".\.wrangler_local"

Write-Host "Checking for API-Football (non-22bet) events with missing odds (Live)..."
npx wrangler d1 execute bet62-db --local --command "SELECT id, external_event_id, home_team, away_team, event_date, is_live, home_odd, draw_odd, away_odd FROM events WHERE home_odd = 0 AND away_odd = 0 AND is_live = 1 AND external_event_id NOT LIKE '22bet_%' LIMIT 20"

Write-Host "`nChecking for Pre-Match events with missing odds (LIMIT 20)..."
npx wrangler d1 execute bet62-db --local --command "SELECT id, external_event_id, home_team, away_team, event_date, is_live, home_odd, draw_odd, away_odd FROM events WHERE home_odd = 0 AND away_odd = 0 AND is_live = 0 AND event_date > '2026-02-24T00:00:00Z' ORDER BY event_date ASC LIMIT 20"

Write-Host "`nCounting Pre-Match missing odds..."
npx wrangler d1 execute bet62-db --local --command "SELECT COUNT(*) as missing_prematch_count FROM events WHERE home_odd = 0 AND away_odd = 0 AND is_live = 0 AND event_date > '2026-02-24T00:00:00Z'"
