$ErrorActionPreference = "Continue"
$env:WRANGLER_HOME=".wrangler-local"
npx wrangler d1 execute bet62-db --local --command "SELECT external_event_id, home_team, away_team, home_odd, draw_odd, away_odd, event_date FROM events WHERE external_event_id = 'soccer_1491917';"