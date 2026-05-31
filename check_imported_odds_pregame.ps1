
# Set local Wrangler home to avoid EPERM
$localWrangler = "$PWD\.wrangler-local"
$env:WRANGLER_HOME = $localWrangler
$env:USERPROFILE = $localWrangler
$env:APPDATA = "$localWrangler\AppData\Roaming"

Write-Host "Fetching one PRE-GAME imported payload for 2026-02-25..."
# Get one event's payload where is_live=0
$json = npx wrangler d1 execute bet62-db --local --command "SELECT id, is_live, payload FROM imported_odds WHERE event_date LIKE '2026-02-25%' AND is_live = 0 LIMIT 1" --json
$json | Out-File "imported_payload_pregame.json" -Encoding UTF8

Write-Host "Done. Check imported_payload_pregame.json"
