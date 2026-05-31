$env:WRANGLER_HOME=".wrangler-local"
$dbName = "bet62-db"
$query = "SELECT id, external_event_id, home_team, away_team, home_odd, draw_odd, away_odd, updated_at FROM events WHERE external_event_id IN ('soccer_1524345', 'soccer_1514683')"
npx wrangler d1 execute $dbName --command $query --local
