$localWrangler = "$PWD\.wrangler-local"
$env:WRANGLER_HOME = $localWrangler
$env:USERPROFILE = $localWrangler
$env:APPDATA = "$localWrangler\AppData\Roaming"

Write-Host "Checking 'events' table schema..."
npx wrangler d1 execute bet62-db --local --command "PRAGMA table_info(events);"

Write-Host "`nChecking 'imported_odds' table schema..."
npx wrangler d1 execute bet62-db --local --command "PRAGMA table_info(imported_odds);"
