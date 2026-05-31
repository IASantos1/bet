$ErrorActionPreference = "Stop"

# Set WRANGLER_HOME to match the running worker configuration
$localWrangler = "$PWD\.wrangler-local"

$env:WRANGLER_HOME = $localWrangler
$env:XDG_CONFIG_HOME = $localWrangler
$env:XDG_CACHE_HOME = $localWrangler
$env:XDG_DATA_HOME = $localWrangler
$env:USERPROFILE = $localWrangler
$env:HOME = $localWrangler
$env:APPDATA = "$localWrangler\AppData\Roaming"
$env:LOCALAPPDATA = "$localWrangler\AppData\Local"

Write-Host "Checking events table schema..."

# Execute query to get table info
$query = "PRAGMA table_info(events);"
npx wrangler d1 execute bet62-db --local --command "$query"
