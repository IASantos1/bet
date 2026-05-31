$projectRoot = Get-Location
$localWranglerHome = "$projectRoot\.wrangler-home"

$env:WRANGLER_HOME = $localWranglerHome
$env:XDG_CONFIG_HOME = $localWranglerHome
$env:XDG_DATA_HOME = $localWranglerHome
$env:XDG_CACHE_HOME = $localWranglerHome
$env:USERPROFILE = "$localWranglerHome\user"

Write-Host "Attempting to add score_home column..."
npx wrangler d1 execute bet62-db --local --persist-to ./.wrangler-local --command "ALTER TABLE events ADD COLUMN score_home INTEGER;"

Write-Host "Attempting to add score_away column..."
npx wrangler d1 execute bet62-db --local --persist-to ./.wrangler-local --command "ALTER TABLE events ADD COLUMN score_away INTEGER;"

Write-Host "Verifying schema..."
npx wrangler d1 execute bet62-db --local --persist-to ./.wrangler-local --command "PRAGMA table_info(events);"
