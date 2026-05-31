
$env:WRANGLER_HOME=".wrangler-local"
npx wrangler d1 execute DB --local --command "SELECT id, start_time, event_date, is_live, home_team FROM events WHERE is_live = 0 ORDER BY event_date DESC LIMIT 10"
