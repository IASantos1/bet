$localWrangler = "$PWD\.wrangler-local"
$env:WRANGLER_HOME = $localWrangler
$env:USERPROFILE = $localWrangler
$env:APPDATA = "$localWrangler\AppData\Roaming"

Write-Host "Counting events for 2026-02-25..."
npx wrangler d1 execute bet62-db --local --command "SELECT count(*) as total FROM events WHERE event_date LIKE '2026-02-25%';"

Write-Host "`nListing first 10 events for 2026-02-25..."
npx wrangler d1 execute bet62-db --local --command "SELECT id, league, home_team, away_team, event_date FROM events WHERE event_date LIKE '2026-02-25%' LIMIT 10;"
