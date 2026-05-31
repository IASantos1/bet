
$localWrangler = "$PWD\.wrangler-local"
$env:WRANGLER_HOME = $localWrangler
$env:USERPROFILE = $localWrangler
$env:APPDATA = "$localWrangler\AppData\Roaming"

# Increase output width to avoid truncation if possible, but Wrangler truncates anyway.
# We just need enough to find the ID.
npx wrangler d1 execute bet62-db --local --command "SELECT payload FROM imported_odds WHERE payload LIKE '%2026-02-25%' LIMIT 1" | Out-File "imported_payload_sample.txt" -Encoding UTF8
