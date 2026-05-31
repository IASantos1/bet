$projectRoot = Get-Location
$localWranglerHome = "$projectRoot\.wrangler-home"

$env:WRANGLER_HOME = $localWranglerHome
$env:XDG_CONFIG_HOME = $localWranglerHome
$env:XDG_DATA_HOME = $localWranglerHome
$env:XDG_CACHE_HOME = $localWranglerHome
$env:USERPROFILE = "$localWranglerHome\user"

Write-Host "Forcing Add Column country..."
# Try to add column directly
npx wrangler d1 execute bet62-db --local --persist-to ./.wrangler-local --command "ALTER TABLE events ADD COLUMN country TEXT;"

Write-Host "Checking Column Count..."
npx wrangler d1 execute bet62-db --local --persist-to ./.wrangler-local --command "SELECT count(*) as col_count FROM pragma_table_info('events');"

Write-Host "Checking Schema..."
npx wrangler d1 execute bet62-db --local --persist-to ./.wrangler-local --command "PRAGMA table_info(events);"
