
$env:WRANGLER_HOME=".wrangler-local"
$dbName = "bet62-db"

$query = "SELECT id, is_live, updated_at, event_date FROM imported_odds WHERE id = 'soccer_1514683'"
Write-Host "Query: $query"
npx wrangler d1 execute $dbName --command $query --local
