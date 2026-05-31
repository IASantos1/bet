$ErrorActionPreference = "Continue"

$eventId = "soccer_1524356"
Write-Output "Checking Imported Payload for $eventId..."
$env:WRANGLER_HOME=".wrangler-local"

npx wrangler d1 execute bet62-db --local --command "SELECT payload FROM imported_odds WHERE id = '$eventId';" > payload_dump_generic.txt

Write-Output "Payload dumped to payload_dump_generic.txt"
