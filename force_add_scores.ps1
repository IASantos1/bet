$projectRoot = Get-Location
$localWranglerHome = "$projectRoot\.wrangler-home"

$env:WRANGLER_HOME = $localWranglerHome
$env:XDG_CONFIG_HOME = $localWranglerHome
$env:XDG_DATA_HOME = $localWranglerHome
$env:XDG_CACHE_HOME = $localWranglerHome
$env:USERPROFILE = "$localWranglerHome\user"

Write-Host "Forcing Add Column score_home..."
npx wrangler d1 execute bet62-db --local --persist-to ./.wrangler-local --command "ALTER TABLE events ADD COLUMN score_home INTEGER;"

Write-Host "Forcing Add Column score_away..."
npx wrangler d1 execute bet62-db --local --persist-to ./.wrangler-local --command "ALTER TABLE events ADD COLUMN score_away INTEGER;"

Write-Host "Checking Schema..."
npx wrangler d1 execute bet62-db --local --persist-to ./.wrangler-local --command "PRAGMA table_info(events);"
