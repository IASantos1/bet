
try {
    Write-Host "Triggering force-poll..."
    $response = Invoke-WebRequest -Uri "http://127.0.0.1:8788/api/dev/force-poll" -Method Get -ErrorAction Stop
    Write-Host "Force Poll Status: $($response.StatusCode)"
    Write-Host "Response: $($response.Content)"
} catch {
    Write-Host "Force Poll Failed: $_"
}

# Wait for sync to process (it's async in worker but DB writes happen)
Start-Sleep -Seconds 5

Write-Host "Checking events table count for tomorrow..."
$dateStr = "2026-02-25"
$localWrangler = "$PWD\.wrangler-local"
$env:WRANGLER_HOME = $localWrangler
$env:XDG_CONFIG_HOME = $localWrangler
$env:XDG_CACHE_HOME = $localWrangler
$env:XDG_DATA_HOME = $localWrangler
$env:USERPROFILE = $localWrangler 
$env:APPDATA = "$localWrangler\AppData\Roaming"
$env:LOCALAPPDATA = "$localWrangler\AppData\Local"

$queryEvents = "SELECT COUNT(*) as count FROM events WHERE event_date LIKE '$dateStr%';"
npx wrangler d1 execute bet62-db --local --command $queryEvents
