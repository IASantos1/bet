
$localWrangler = "$PWD\.wrangler-local"
$env:WRANGLER_HOME = $localWrangler
$env:USERPROFILE = $localWrangler
$env:APPDATA = "$localWrangler\AppData\Roaming"

$query = "SELECT COUNT(*) as count, MIN(updated_at) as min_updated, MAX(updated_at) as max_updated, MIN(event_date) as min_date, MAX(event_date) as max_date FROM imported_odds WHERE payload LIKE '%2026-02-25%';"
npx wrangler d1 execute bet62-db --local --command $query
