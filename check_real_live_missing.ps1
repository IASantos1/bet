
$env:WRANGLER_HOME=".wrangler-local"
$dbName = "bet62-db"

$query = "SELECT e.id, e.home_team, e.away_team, e.is_live, i.is_live as imported_live, i.updated_at as imported_updated, e.home_odd FROM events e LEFT JOIN imported_odds i ON e.external_event_id = i.id WHERE e.is_live = 1 AND (e.home_odd IS NULL OR e.home_odd = 0) LIMIT 10"
Write-Host "Query: $query"
npx wrangler d1 execute $dbName --command $query --local
