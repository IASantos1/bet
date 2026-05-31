$localWrangler = "$PWD\.wrangler-local"
$env:WRANGLER_HOME = $localWrangler
$env:USERPROFILE = $localWrangler
$env:APPDATA = "$localWrangler\AppData\Roaming"

Write-Host "Checking freshness of imported_odds for 2026-02-25..."
$query = "SELECT id, updated_at, event_date FROM imported_odds WHERE event_date LIKE '2026-02-25%' ORDER BY updated_at DESC LIMIT 5;"
npx wrangler d1 execute bet62-db --local --command $query
