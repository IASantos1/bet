
$localWrangler = "$PWD\.wrangler-local"
$env:WRANGLER_HOME = $localWrangler
$env:USERPROFILE = $localWrangler
$env:APPDATA = "$localWrangler\AppData\Roaming"

$query = "SELECT payload FROM imported_odds WHERE payload LIKE '%2026-02-25%' LIMIT 1;"
npx wrangler d1 execute bet62-db --local --command $query
