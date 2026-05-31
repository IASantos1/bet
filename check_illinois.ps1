
$dbPath = ".wrangler-local-tmp\v3\d1\miniflare-D1DatabaseObject\d380720456108169990150d60341777d122393080d3215162489278065586616.sqlite"
$query = "SELECT id, match, league, event_date FROM events WHERE match LIKE '%Illinois%' OR match LIKE '%Minnesota%' OR match LIKE '%illinois%' OR match LIKE '%minnesota%';"
$cmd = "sqlite3 '$dbPath' ""$query"""
Invoke-Expression $cmd
