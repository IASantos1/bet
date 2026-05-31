$localWrangler = "$PWD\.wrangler-local"
$env:WRANGLER_HOME = $localWrangler
$env:USERPROFILE = $localWrangler
$env:APPDATA = "$localWrangler\AppData\Roaming"

Write-Host "Checking 'events' table schema (first 5 columns)..."
npx wrangler d1 execute bet62-db --local --command "PRAGMA table_info(events);"

Write-Host "`nChecking for U20/Concacaf events using 'league' column..."
# Trying 'league' instead of 'league_name'
$queryU20 = "SELECT id, league, home_team, away_team, event_date FROM events WHERE event_date LIKE '2026-02-25%' AND (league LIKE '%U20%' OR league LIKE '%Concacaf%');"
npx wrangler d1 execute bet62-db --local --command $queryU20

Write-Host "`nChecking for U20/Concacaf events using 'league_name' column (just in case)..."
$queryU20Name = "SELECT id, league_name, home_team, away_team, event_date FROM events WHERE event_date LIKE '2026-02-25%' AND (league_name LIKE '%U20%' OR league_name LIKE '%Concacaf%');"
npx wrangler d1 execute bet62-db --local --command $queryU20Name
