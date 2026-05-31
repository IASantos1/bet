
$sql = "SELECT id, match, league FROM events WHERE match LIKE '%Illinois%' OR match LIKE '%Minnesota%'"
$cmd = "npx wrangler d1 execute bet62-db --local --command `"$sql`""
Invoke-Expression $cmd
