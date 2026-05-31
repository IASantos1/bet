$localWrangler = "$PWD\.wrangler-local"
$env:WRANGLER_HOME = $localWrangler
$env:USERPROFILE = $localWrangler
$env:APPDATA = "$localWrangler\AppData\Roaming"

$id = "soccer_1521377"
Write-Host "Checking if $id exists in events table..."
npx wrangler d1 execute bet62-db --local --command "SELECT * FROM events WHERE external_event_id = '$id';"

$id2 = "soccer_1503672"
Write-Host "Checking if $id2 exists in events table..."
npx wrangler d1 execute bet62-db --local --command "SELECT * FROM events WHERE external_event_id = '$id2';"
