
$localWrangler = "$PWD\.wrangler-local"
$env:WRANGLER_HOME = $localWrangler
$env:USERPROFILE = $localWrangler
$env:APPDATA = "$localWrangler\AppData\Roaming"

$query = "SELECT i.id, i.updated_at, i.event_date FROM imported_odds i LEFT JOIN events e ON i.id = e.external_event_id WHERE i.is_live = 0 AND i.updated_at > datetime('now', '-48 hours') AND (e.external_event_id IS NULL OR datetime(i.updated_at) > datetime(e.updated_at)) ORDER BY i.event_date ASC LIMIT 5;"

Write-Host "Executing sync query..."
npx wrangler d1 execute bet62-db --local --command $query
