
$localWrangler = "$PWD\.wrangler-local"
$env:WRANGLER_HOME = $localWrangler
$env:USERPROFILE = $localWrangler
$env:APPDATA = "$localWrangler\AppData\Roaming"

Write-Host "Checking events table schema..."
npx wrangler d1 execute bet62-db --local --command "PRAGMA table_info(events);"

Write-Host "Checking if soccer_1521377 is in events table..."
npx wrangler d1 execute bet62-db --local --command "SELECT * FROM events WHERE external_event_id = 'soccer_1521377';"

Write-Host "Checking imported_odds for soccer_1521377..."
npx wrangler d1 execute bet62-db --local --command "SELECT id, is_live, event_date, updated_at FROM imported_odds WHERE id = 'soccer_1521377';"
