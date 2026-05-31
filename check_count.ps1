$projectRoot = Get-Location
$localWranglerHome = "$projectRoot\.wrangler-home"

$env:WRANGLER_HOME = $localWranglerHome
$env:XDG_CONFIG_HOME = $localWranglerHome
$env:XDG_DATA_HOME = $localWranglerHome
$env:XDG_CACHE_HOME = $localWranglerHome
$env:USERPROFILE = "$localWranglerHome\user"

Write-Host "Checking DB count (Worker DB)..."
npx wrangler d1 execute bet62-db --local --persist-to ./.wrangler-local --command "SELECT COUNT(*) as total, SUM(is_live) as live_count FROM events;"
