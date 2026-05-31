
$maxRetries = 10
$retryDelay = 3

for ($i = 0; $i -lt $maxRetries; $i++) {
    try {
        Write-Host "Checking API (Attempt $($i+1)/$maxRetries)..."
        $response = Invoke-RestMethod -Uri 'http://127.0.0.1:8788/api/events/by-sport?sports=all&include=odds' -Method Get
        
        $liveCount = 0
        $pregameCount = 0
        
        if ($response.live) { $liveCount = $response.live.Count }
        if ($response.pregame) { $pregameCount = $response.pregame.Count }
        
        Write-Host "  -> Live: $liveCount | Pregame: $pregameCount"
        
        if ($liveCount -gt 0 -or $pregameCount -gt 0) {
            Write-Host "✅ Events found!" -ForegroundColor Green
            if ($liveCount -gt 0) {
                Write-Host "First Live Event Sample:"
                Write-Host ($response.live[0] | ConvertTo-Json -Depth 2)
            }
            exit 0
        }
    } catch {
        Write-Host "  -> API Error: $($_.Exception.Message)"
    }
    
    Start-Sleep -Seconds $retryDelay
}

Write-Host "❌ No events found after timeout." -ForegroundColor Red
exit 1
