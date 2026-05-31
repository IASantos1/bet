
$env:WRANGLER_HOME=".wrangler-local"
$dbName = "bet62-db"

$query = "SELECT id, external_event_id, home_team, away_team FROM events WHERE id = 1440"
Write-Host "Query: $query"
npx wrangler d1 execute $dbName --command $query --local
