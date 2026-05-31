$ErrorActionPreference = "Continue"

Write-Output "Checking Imported Payload for soccer_1499169..."
$env:WRANGLER_HOME=".wrangler-local"

# Dump payload to file
npx wrangler d1 execute bet62-db --local --command "SELECT payload FROM imported_odds WHERE id = 'soccer_1499169';" > payload_dump_single.txt
