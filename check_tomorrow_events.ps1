
# Setup local environment to avoid EPERM
$localWrangler = "$PWD\.wrangler-local"
$env:WRANGLER_HOME = $localWrangler
$env:XDG_CONFIG_HOME = $localWrangler
$env:XDG_CACHE_HOME = $localWrangler
$env:XDG_DATA_HOME = $localWrangler
$env:USERPROFILE = $localWrangler
$env:HOME = $localWrangler
$env:APPDATA = "$localWrangler\AppData\Roaming"
$env:LOCALAPPDATA = "$localWrangler\AppData\Local"


$dateStr = "2026-02-25"

Write-Host "Checking 'events' table for $dateStr..."
$queryEvents = "SELECT COUNT(*) as count FROM events WHERE event_date LIKE '$dateStr%';"
npx wrangler d1 execute bet62-db --local --command $queryEvents

Write-Host "Checking 'imported_odds' table for payload containing $dateStr..."
# Note: imported_odds stores payload as JSON string. We can't easily query JSON in D1 local without json_extract, but let's try LIKE
$queryImported = "SELECT COUNT(*) as count FROM imported_odds WHERE payload LIKE '%$dateStr%';"
npx wrangler d1 execute bet62-db --local --command $queryImported

Write-Host "Listing top 5 events for $dateStr from 'events' table..."
$queryList = "SELECT id, home_team, away_team, league, home_odd, draw_odd, away_odd, status FROM events WHERE event_date LIKE '$dateStr%' LIMIT 5;"
npx wrangler d1 execute bet62-db --local --command $queryList


