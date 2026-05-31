# Wait for worker to be ready
Write-Host "Waiting 5s for worker..."
Start-Sleep -Seconds 5

# Trigger force sync (which calls robustIntegration AND eventSync)
Write-Host "Triggering Force Poll..."
try {
    $res = Invoke-WebRequest -Uri "http://127.0.0.1:8788/api/dev/force-poll" -Method Get
    Write-Host "Force Poll Status: $($res.StatusCode)"
    Write-Host "Force Poll Response: $($res.Content)"
} catch {
    Write-Host "Force Poll Failed: $_"
}

# Wait for sync to process
Write-Host "Waiting 5s for sync..."
Start-Sleep -Seconds 5

# Check if event has odds now
Write-Host "Checking events table for soccer_1514683..."
$env:WRANGLER_HOME = ".wrangler-local"
$query = "SELECT id, home_odd, draw_odd, away_odd, updated_at FROM events WHERE id = 'soccer_1514683'"
.\node_modules\.bin\wrangler d1 execute bet62-db --command="$query"
