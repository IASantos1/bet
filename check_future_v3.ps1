
$env:WRANGLER_HOME=".wrangler-local"
npx wrangler d1 execute DB --local --command "SELECT id, start_time, event_date, is_live, home_team FROM events WHERE start_time >= '2026-02-25' ORDER BY event_date ASC LIMIT 10"
