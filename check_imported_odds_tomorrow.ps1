$localWrangler = "$PWD\.wrangler-local"
$env:WRANGLER_HOME = $localWrangler
$env:USERPROFILE = $localWrangler
$env:APPDATA = "$localWrangler\AppData\Roaming"

Write-Host "Fetching one imported payload for 2026-02-25..."
# Get one event's payload
$json = npx wrangler d1 execute bet62-db --local --command "SELECT payload FROM imported_odds WHERE event_date LIKE '2026-02-25%' LIMIT 1" --json
$json | Out-File "imported_payload_tomorrow.json" -Encoding UTF8

# Parse and display relevant parts
try {
    $data = $json | ConvertFrom-Json
    if ($data -is [Array] -and $data.Count -gt 0) {
        $payloadStr = $data[0].payload
        $payload = $payloadStr | ConvertFrom-Json
        
        Write-Host "Fixture: $($payload.fixture.id) - $($payload.teams.home.name) vs $($payload.teams.away.name)"
        
        if ($payload.bookmakers) {
            Write-Host "Bookmakers found: $($payload.bookmakers.Count)"
            if ($payload.bookmakers.Count -gt 0) {
                 Write-Host "First Bookmaker: $($payload.bookmakers[0].name)"
                 Write-Host "Bets count: $($payload.bookmakers[0].bets.Count)"
                 if ($payload.bookmakers[0].bets.Count -gt 0) {
                     Write-Host "First Bet: $($payload.bookmakers[0].bets[0].label)"
                     Write-Host "Values: $($payload.bookmakers[0].bets[0].values | ConvertTo-Json -Depth 1)"
                 }
            }
        } else {
            Write-Host "NO 'bookmakers' field in payload!"
        }
    } else {
        Write-Host "No data returned."
    }
} catch {
    Write-Host "Error parsing: $_"
}
