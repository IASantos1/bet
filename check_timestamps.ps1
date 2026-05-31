$env:WRANGLER_HOME=".wrangler-local"
$dbName = "bet62-db"

$query = "SELECT i.id, i.updated_at as imported_updated, e.updated_at as event_updated, e.home_odd FROM imported_odds i LEFT JOIN events e ON i.id = e.external_event_id WHERE i.id = 'soccer_1524345'"
Write-Host "Query: $query"
npx wrangler d1 execute $dbName --command $query --local
