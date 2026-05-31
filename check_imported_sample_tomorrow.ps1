
$dateStr = "2026-02-25"
$query = "SELECT payload FROM imported_odds WHERE payload LIKE '%$dateStr%' LIMIT 1;"

# Setup local env
$localWrangler = "$PWD\.wrangler-local"
$env:WRANGLER_HOME = $localWrangler
$env:XDG_CONFIG_HOME = $localWrangler
$env:XDG_CACHE_HOME = $localWrangler
$env:XDG_DATA_HOME = $localWrangler
$env:USERPROFILE = $localWrangler # Force override
$env:APPDATA = "$localWrangler\AppData\Roaming"
$env:LOCALAPPDATA = "$localWrangler\AppData\Local"

# Use --json and capture output
Write-Host "Executing query..."
npx wrangler d1 execute bet62-db --local --command $query --json > sample_payload_tomorrow.json
Write-Host "Query executed. Reading file..."
Get-Content sample_payload_tomorrow.json | ForEach-Object { Write-Host $_ }

