$localWrangler = "$PWD\.wrangler-local"
$env:WRANGLER_HOME = $localWrangler
$env:USERPROFILE = $localWrangler
$env:APPDATA = "$localWrangler\AppData\Roaming"

Write-Host "DEBUG: Checking table info again..."
npx wrangler d1 execute bet62-db --local --command "PRAGMA table_info(events);"

Write-Host "`nDEBUG: Trying simple select..."
npx wrangler d1 execute bet62-db --local --command "SELECT id, league_name FROM events LIMIT 5;"

Write-Host "`nChecking total events for 2026-02-25..."
$queryCount = "SELECT COUNT(*) as count FROM events WHERE event_date LIKE '2026-02-25%';"
npx wrangler d1 execute bet62-db --local --command $queryCount

Write-Host "`nChecking for U20/Concacaf events (using parameter binding if possible, but here using string interpolation)..."
# Simplified query to avoid potential parsing issues
$queryU20 = "SELECT id, league_name FROM events WHERE event_date LIKE '2026-02-25%' AND league_name LIKE '%U20%';"
npx wrangler d1 execute bet62-db --local --command $queryU20
