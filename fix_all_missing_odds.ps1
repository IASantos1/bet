$env:WRANGLER_HOME=".\.wrangler_local"

# 1. Get IDs
Write-Host "Fetching list of events with missing odds..."
npx wrangler d1 execute bet62-db --local --command "SELECT id, external_event_id FROM events WHERE home_odd = 0 AND away_odd = 0 AND is_live = 1 LIMIT 50" --json | Out-File -FilePath "missing_events.json" -Encoding utf8

# 2. Parse JSON list (using Node because PowerShell JSON handling can be finicky with utf8 BOM sometimes)
# Or just use PowerShell if the file is clean. Let's try PowerShell.
$jsonContent = Get-Content "missing_events.json" -Raw
# Remove wrangler log lines if any (usually top/bottom)
# The output is usually pure JSON if redirect worked well, but wrangler might output logs to stderr.
# Let's clean it up just in case: find first [ and last ]
$startIndex = $jsonContent.IndexOf('[')
$endIndex = $jsonContent.LastIndexOf(']')
if ($startIndex -ge 0 -and $endIndex -ge 0) {
    $jsonContent = $jsonContent.Substring($startIndex, $endIndex - $startIndex + 1)
}

try {
    $events = $jsonContent | ConvertFrom-Json
} catch {
    Write-Error "Failed to parse missing_events.json"
    exit 1
}

# The structure from wrangler is usually: [ { "results": [ { "id": ..., "external_event_id": ... } ] } ]
if ($events -is [array] -and $events.Count -gt 0 -and $events[0].results) {
    $eventList = $events[0].results
} else {
    Write-Host "No events found or unexpected JSON structure."
    exit 0
}

Write-Host "Found $($eventList.Count) events to process."

foreach ($evt in $eventList) {
    $extId = $evt.external_event_id
    if (-not $extId) { continue }
    
    Write-Host "Processing event: $extId"
    
    # 3. Fetch Payload
    # Note: Using 'id' column in imported_odds which matches 'external_event_id' in events
    # We need to escape single quotes in ID if any (unlikely for 22bet IDs but good practice)
    $safeId = $extId.Replace("'", "''")
    
    npx wrangler d1 execute bet62-db --local --command "SELECT payload FROM imported_odds WHERE id = '$safeId'" --json | Out-File -FilePath payload.json -Encoding utf8
    
    # 4. Run Processor
    node process_payload.cjs
    if ($LASTEXITCODE -eq 0) {
        # 5. Execute Update
        ./update_event.ps1
        Write-Host "  -> Updated."
    } else {
        Write-Host "  -> Failed to process payload."
    }
}

Write-Host "Done."
