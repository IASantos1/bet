$ErrorActionPreference = "Continue"

Write-Output "Checking Events with Odds..."
$env:WRANGLER_HOME=".wrangler-local"

Write-Output "`nTotal Events:"
npx wrangler d1 execute bet62-db --local --command "SELECT count(*) as total FROM events;"

Write-Output "`nEvents with Odds (home_odd > 1):"
npx wrangler d1 execute bet62-db --local --command "SELECT count(*) as with_odds FROM events WHERE home_odd > 1;"

Write-Output "`nEvents WITHOUT Odds (home_odd IS NULL or home_odd <= 1):"
npx wrangler d1 execute bet62-db --local --command "SELECT count(*) as no_odds FROM events WHERE home_odd IS NULL OR home_odd <= 1;"

Write-Output "`nSample Event WITH Odds:"
npx wrangler d1 execute bet62-db --local --command "SELECT external_event_id, home_team, away_team, home_odd, draw_odd, away_odd, event_date, status FROM events WHERE home_odd > 1 LIMIT 5;"

Write-Output "`nSample Event WITHOUT Odds (Pre-Match or Live):"
npx wrangler d1 execute bet62-db --local --command "SELECT external_event_id, home_team, away_team, home_odd, draw_odd, away_odd, event_date, status FROM events WHERE (home_odd IS NULL OR home_odd <= 1) AND status NOT IN ('FT', 'AET', 'PEN', 'PST', 'CANC', 'ABD', 'WO') LIMIT 5;"
