$ErrorActionPreference = "Continue"

# 1. Get up to 5 events with missing odds (ANY source)
Write-Host "Fetching 5 events with missing odds (ANY source)..."
# Removed external_event_id filter to see what we get
$eventsJson = npx wrangler d1 execute bet62-db --local --command "SELECT id, external_event_id, home_team, away_team, event_date FROM events WHERE home_odd = 0 AND away_odd = 0 AND is_live = 0 AND event_date > '2026-02-24T00:00:00Z' LIMIT 5" --json 2>$null

# Clean up any potential non-JSON lines if stderr redirection didn't catch everything
# Wrangler sometimes outputs logs to stdout if not configured correctly
$jsonStart = $eventsJson | Where-Object { $_ -match "^\[" -or $_ -match "^\{" } | Select-Object -First 1
if (-not $jsonStart) {
    # If not found line by line, try to find the start of JSON in the whole string
    $fullOutput = $eventsJson -join "`n"
    $startIndex = $fullOutput.IndexOf('[')
    if ($startIndex -lt 0) { $startIndex = $fullOutput.IndexOf('{') }
    
    if ($startIndex -ge 0) {
        $jsonContent = $fullOutput.Substring($startIndex)
    } else {
        Write-Host "Failed to find JSON in output. Raw output:"
        Write-Host $fullOutput
        exit
    }
} else {
    $jsonContent = $eventsJson
}

try {
    $events = $jsonContent | ConvertFrom-Json
} catch {
    Write-Host "Failed to parse JSON. Content:"
    Write-Host $jsonContent
    exit
}

if ($events.results[0].results.Count -eq 0) {
    Write-Host "No missing odds events found."
    exit
}

$events.results[0].results | Format-Table

# 2. Pick the first one and check imported_odds
$firstEvent = $events.results[0].results[0]
$externalId = $firstEvent.external_event_id
# Remove 'soccer_' prefix if present
if ($externalId -match 'soccer_(\d+)') {
    $fixtureId = $matches[1]
} else {
    $fixtureId = $externalId
}

Write-Host "`nChecking imported_odds for Fixture ID: $fixtureId"

# Check if it exists in imported_odds
$importedJson = npx wrangler d1 execute bet62-db --local --command "SELECT id, created_at, length(data) as data_len FROM imported_odds WHERE id = '$fixtureId'" --json 2>$null

# Clean up JSON again
$fullOutput = $importedJson -join "`n"
$startIndex = $fullOutput.IndexOf('{')
if ($startIndex -ge 0) {
    $jsonContent = $fullOutput.Substring($startIndex)
    try {
        $imported = $jsonContent | ConvertFrom-Json
    } catch {
        Write-Host "Failed to parse imported JSON. Content:"
        Write-Host $jsonContent
        exit
    }
} else {
    Write-Host "Failed to find JSON in imported output. Raw:"
    Write-Host $fullOutput
    exit
}

if ($imported.results[0].results.Count -eq 0) {
    Write-Host "❌ Raw data NOT found in imported_odds for ID $fixtureId"
} else {
    Write-Host "✅ Raw data FOUND in imported_odds for ID $fixtureId"
    $imported.results[0].results | Format-Table

    # 3. Extract bookmakers from the raw data
    Write-Host "`nExtracting bookmakers data..."
    $rawJson = npx wrangler d1 execute bet62-db --local --command "SELECT data FROM imported_odds WHERE id = '$fixtureId'" --json 2>$null
    
    # Clean up JSON again
    $fullOutput = $rawJson -join "`n"
    $startIndex = $fullOutput.IndexOf('{')
    if ($startIndex -ge 0) {
        $jsonContent = $fullOutput.Substring($startIndex)
        try {
            $rawData = $jsonContent | ConvertFrom-Json
            $dataContent = $rawData.results[0].results[0].data
        } catch {
            Write-Host "Failed to parse raw data JSON."
            exit
        }
    } else {
        Write-Host "Failed to find JSON in raw data output."
        exit
    }
    
    # Save to temp file to inspect with Node.js if needed, or just print substring
    $dataContent | Out-File "temp_raw_data.json" -Encoding utf8
    
    # Use node to parse and print bookmakers count
    node -e "
        const fs = require('fs');
        const data = JSON.parse(fs.readFileSync('temp_raw_data.json', 'utf8'));
        console.log('Bookmakers found:', data.bookmakers ? data.bookmakers.length : 0);
        if (data.bookmakers && data.bookmakers.length > 0) {
            console.log('First bookmaker:', data.bookmakers[0].name);
            console.log('Markets count:', data.bookmakers[0].bets ? data.bookmakers[0].bets.length : 0);
        } else {
            console.log('No bookmakers array or empty.');
        }
    "
}
