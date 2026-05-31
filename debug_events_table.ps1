$ErrorActionPreference = "Stop"

# Set WRANGLER_HOME to match the running worker configuration
$localWrangler = "$PWD\.wrangler-local"

# Ensure the directory exists
if (-not (Test-Path $localWrangler)) {
    New-Item -ItemType Directory -Force -Path $localWrangler | Out-Null
}

$env:WRANGLER_HOME = $localWrangler
$env:XDG_CONFIG_HOME = $localWrangler
$env:XDG_CACHE_HOME = $localWrangler
$env:XDG_DATA_HOME = $localWrangler

Write-Host "Checking 'events' table structure..."
npx wrangler d1 execute bet62-db --local --command "PRAGMA table_info(events)"

Write-Host "`nChecking 'imported_odds' count..."
npx wrangler d1 execute bet62-db --local --command "SELECT count(*) as imported_count FROM imported_odds"

Write-Host "`nChecking 'events' count..."
npx wrangler d1 execute bet62-db --local --command "SELECT count(*) as events_count FROM events"

Write-Host "`nChecking 5 random imported odds payload status..."
npx wrangler d1 execute bet62-db --local --command "SELECT id, status, is_live, updated_at FROM imported_odds ORDER BY RANDOM() LIMIT 5"
