$localWrangler = "$PWD\.wrangler-local"
$env:WRANGLER_HOME = $localWrangler
$env:USERPROFILE = $localWrangler
$env:APPDATA = "$localWrangler\AppData\Roaming"

$query = "SELECT i.id, i.updated_at, i.event_date FROM imported_odds i LEFT JOIN events e ON i.id = e.external_event_id WHERE i.is_live = 0 AND i.event_date LIKE '2026-02-25%' AND (e.external_event_id IS NULL OR datetime(i.updated_at) > datetime(e.updated_at)) ORDER BY i.event_date ASC LIMIT 10;"

Write-Host "Checking sync candidates for 2026-02-25..."
npx wrangler d1 execute bet62-db --local --command $query
