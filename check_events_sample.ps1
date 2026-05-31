
$localWrangler = "$PWD\.wrangler-local"
$env:WRANGLER_HOME = $localWrangler
$env:USERPROFILE = $localWrangler
$env:APPDATA = "$localWrangler\AppData\Roaming"

$query = "SELECT * FROM events LIMIT 5;"
npx wrangler d1 execute bet62-db --local --command $query
