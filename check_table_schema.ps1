$ErrorActionPreference = "Stop"

# Set WRANGLER_HOME to match the running worker
$localWrangler = "$PWD\.wrangler-local"
$env:WRANGLER_HOME = $localWrangler
$env:XDG_CONFIG_HOME = $localWrangler
$env:XDG_CACHE_HOME = $localWrangler
$env:XDG_DATA_HOME = $localWrangler

Write-Host "Checking 'events' table schema..."
npx wrangler d1 execute bet62-db --local --command "PRAGMA table_info(events);"
