$ErrorActionPreference = "Continue"

Write-Output "Checking 'events' table schema..."
$env:WRANGLER_HOME=".wrangler-local"
npx wrangler d1 execute bet62-db --local --command "PRAGMA table_info(events);"
