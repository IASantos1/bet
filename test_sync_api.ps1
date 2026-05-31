# Wait for worker to be ready
Write-Host "Waiting 2s..."
Start-Sleep -Seconds 2

# Trigger debug sync
Write-Host "Triggering Debug Sync..."
try {
    $res = Invoke-WebRequest -Uri "http://127.0.0.1:8788/api/dev/debug-sync" -Method Get
    $content = $res.Content | ConvertFrom-Json
    
    if ($content.success) {
        Write-Host "Debug Sync Success!"
        Write-Host "---------------- LOGS ----------------"
        $content.logs | ForEach-Object { Write-Host $_ }
        Write-Host "--------------------------------------"
    } else {
        Write-Host "Debug Sync Failed!"
        Write-Host "Error: $($content.error)"
        Write-Host "---------------- LOGS ----------------"
        $content.logs | ForEach-Object { Write-Host $_ }
        Write-Host "--------------------------------------"
    }
} catch {
    Write-Host "Debug Sync Request Failed: $_"
}

# Check if event has odds now via API
Write-Host "Checking event soccer_1514683 via API..."
try {
    $res = Invoke-WebRequest -Uri "http://127.0.0.1:8788/api/dev/check-event/soccer_1514683" -Method Get
    $content = $res.Content | ConvertFrom-Json
    
    if ($content.found) {
        Write-Host "Event Found!"
        Write-Host "Home Odd: $($content.event.home_odd)"
        Write-Host "Draw Odd: $($content.event.draw_odd)"
        Write-Host "Away Odd: $($content.event.away_odd)"
        Write-Host "Updated At: $($content.event.updated_at)"
    } else {
        Write-Host "Event NOT found in events table."
    }
} catch {
    Write-Host "Check Event Failed: $_"
}
