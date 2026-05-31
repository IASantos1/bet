
Write-Host "--- EVENTS TABLE (is_live=0) ---"
$body = @{
    query = "SELECT id, start_time, event_date, is_live, home_team FROM events WHERE is_live = 0 ORDER BY event_date ASC LIMIT 5"
    params = @()
} | ConvertTo-Json -Depth 10

try {
    $res = Invoke-RestMethod -Uri "http://127.0.0.1:8788/api/dev/sql" -Method Post -Body $body -ContentType "application/json" -TimeoutSec 10
    $res | Format-Table -AutoSize
} catch {
    Write-Host "Error querying events: $($_.Exception.Message)"
    if ($_.Exception.Response) {
        $stream = $_.Exception.Response.GetResponseStream()
        $reader = New-Object System.IO.StreamReader($stream)
        $reader.ReadToEnd()
    }
}

Write-Host "--- IMPORTED ODDS (Top 5 recent) ---"
$body2 = @{
    query = "SELECT id, updated_at FROM imported_odds ORDER BY updated_at DESC LIMIT 5"
    params = @()
} | ConvertTo-Json -Depth 10

try {
    $res2 = Invoke-RestMethod -Uri "http://127.0.0.1:8788/api/dev/sql" -Method Post -Body $body2 -ContentType "application/json" -TimeoutSec 10
    $res2 | Format-Table -AutoSize
} catch {
    Write-Host "Error querying imported_odds: $($_.Exception.Message)"
}
