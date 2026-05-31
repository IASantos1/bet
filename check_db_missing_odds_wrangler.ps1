
$sql = "SELECT COUNT(*) as missing_odds_count FROM events WHERE home_odd IS NULL OR home_odd = 0"
$cmd = "npx wrangler d1 execute bet62-db --local --command `"$sql`""
Invoke-Expression $cmd
