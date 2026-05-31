
$localWrangler = "$PWD\.wrangler-local"
$env:WRANGLER_HOME = $localWrangler
$env:USERPROFILE = $localWrangler
$env:APPDATA = "$localWrangler\AppData\Roaming"

$id = "soccer_1521377"
$query = "SELECT payload FROM imported_odds WHERE id = '$id';"

Write-Host "Fetching payload for $id..."
$json = npx wrangler d1 execute bet62-db --local --command $query --json
$json | Out-File "payload_specific.json" -Encoding utf8
Write-Host "Saved to payload_specific.json"

# Parse and display relevant parts
try {
    $content = Get-Content "payload_specific.json" -Raw | ConvertFrom-Json
    # The output of wrangler d1 execute --json is an array of results
    # usually content[0].results[0].payload
    if ($content[0].results.Count -gt 0) {
        $payloadStr = $content[0].results[0].payload
        $payload = $payloadStr | ConvertFrom-Json
        Write-Host "League: $($payload.league.name)"
        Write-Host "Home: $($payload.teams.home.name)"
        Write-Host "Away: $($payload.teams.away.name)"
        Write-Host "Date: $($payload.fixture.date)"
        
        $bookmakers = $payload.bookmakers
        if ($bookmakers) {
            Write-Host "Bookmakers count: $($bookmakers.Count)"
            if ($bookmakers.Count -gt 0) {
                Write-Host "First bookmaker markets count: $($bookmakers[0].markets.Count)"
            }
        } else {
            Write-Host "No bookmakers found."
            # Check for other odds structures?
            if ($payload.odds) {
                 Write-Host "Found 'odds' property directly."
            }
        }
    } else {
        Write-Host "No results found for ID $id"
    }
} catch {
    Write-Host "Error parsing JSON: $_"
}
