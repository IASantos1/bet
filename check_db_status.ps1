$ErrorActionPreference = "Stop"

# Set WRANGLER_HOME to match the running worker configuration
$localWrangler = "$PWD\.wrangler-local"

$env:WRANGLER_HOME = $localWrangler
$env:XDG_CONFIG_HOME = $localWrangler
$env:XDG_CACHE_HOME = $localWrangler
$env:XDG_DATA_HOME = $localWrangler

# Override User Profile to force local paths for everything (match run_worker.ps1)
$env:USERPROFILE = $localWrangler
$env:HOME = $localWrangler
$env:APPDATA = "$localWrangler\AppData\Roaming"
$env:LOCALAPPDATA = "$localWrangler\AppData\Local"

Write-Output "Checking Imported Odds Count..."
npx wrangler d1 execute bet62-db --local --command "SELECT count(*) as imported_count FROM imported_odds"

Write-Output "`nChecking Events Count..."
npx wrangler d1 execute bet62-db --local --command "SELECT count(*) as events_count FROM events"

Write-Output "`nChecking recent events..."
npx wrangler d1 execute bet62-db --local --command "SELECT external_event_id, home_team, away_team, event_date, status, updated_at FROM events ORDER BY updated_at DESC LIMIT 5"
