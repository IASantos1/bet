
# Set local Wrangler home
$localWrangler = "$PWD\.wrangler-local"
$env:WRANGLER_HOME = $localWrangler
$env:USERPROFILE = $localWrangler
$env:APPDATA = "$localWrangler\AppData\Roaming"

Write-Host "Checking odds for soccer_1491914..."
npx wrangler d1 execute bet62-db --local --command "SELECT external_event_id, home_odd, draw_odd, away_odd, status, market_status, is_live, event_date FROM events WHERE external_event_id = 'soccer_1491914'"
Write-Host "Done."
