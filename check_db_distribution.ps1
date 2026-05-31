
$localWrangler = "$PWD\.wrangler-local"
$env:WRANGLER_HOME = $localWrangler
$env:USERPROFILE = $localWrangler
$env:APPDATA = "$localWrangler\AppData\Roaming"

Write-Host "Checking imported_odds recent updates..."
$query1 = "SELECT COUNT(*) as recent_imports FROM imported_odds WHERE updated_at > datetime('now', '-1 hour');"
npx wrangler d1 execute bet62-db --local --command $query1

Write-Host "Checking events table date distribution..."
$query2 = "SELECT substr(event_date, 1, 10) as date, COUNT(*) as count FROM events GROUP BY date ORDER BY date;"
npx wrangler d1 execute bet62-db --local --command $query2
