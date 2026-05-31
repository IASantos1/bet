
$localWrangler = "$PWD\.wrangler-local"
$env:WRANGLER_HOME = $localWrangler
$env:USERPROFILE = $localWrangler
$env:APPDATA = "$localWrangler\AppData\Roaming"

$query = "SELECT * FROM events WHERE external_event_id = 'soccer_1503672';"
npx wrangler d1 execute bet62-db --local --command $query
