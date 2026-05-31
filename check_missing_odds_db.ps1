
$dbPath = ".wrangler-local-tmp\v3\d1\miniflare-D1DatabaseObject\d380720456108169990150d60341777d122393080d3215162489278065586616.sqlite"
$query = "SELECT id, league, match, home_odd, draw_odd, away_odd, is_live, event_date FROM events WHERE (home_odd IS NULL OR home_odd = 0) AND event_date > datetime('now') LIMIT 20;"
$cmd = "sqlite3 '$dbPath' ""$query"""
Invoke-Expression $cmd
