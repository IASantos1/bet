$localWrangler = "$PWD\.wrangler-local"
$env:WRANGLER_HOME = $localWrangler
$env:USERPROFILE = $localWrangler
$env:APPDATA = "$localWrangler\AppData\Roaming"

Write-Host "Checking SQLite time..."
npx wrangler d1 execute bet62-db --local --command "SELECT datetime('now') as now, datetime('now', '-3 hours') as minus_3h;"
