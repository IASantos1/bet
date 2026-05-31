$projectRoot = Get-Location
$localWranglerHome = "$projectRoot\.wrangler-home"

$env:WRANGLER_HOME = $localWranglerHome
$env:XDG_CONFIG_HOME = $localWranglerHome
$env:XDG_DATA_HOME = $localWranglerHome
$env:XDG_CACHE_HOME = $localWranglerHome
$env:USERPROFILE = "$localWranglerHome\user"

Write-Host "Checking Schema for score columns..."
npx wrangler d1 execute bet62-db --local --persist-to ./.wrangler-local --command "PRAGMA table_info(events);"
