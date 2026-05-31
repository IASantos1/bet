$ErrorActionPreference = "Stop"
try {
    Write-Host "Triggering Debug Sync..."
    $response = Invoke-WebRequest -Uri "http://127.0.0.1:8788/api/dev/debug-sync" -Method Get
    $json = $response.Content | ConvertFrom-Json
    
    Write-Host "Sync Completed. Analyzing Logs..."
    
    $targetLogs = $json.logs | Where-Object { 
        $_ -match "soccer_1524345" -or 
        $_ -match "soccer_1514683" -or 
        $_ -match "\[BatchUpsert\]" -or
        $_ -match "\[Sync\]"
    }
    
    if ($targetLogs) {
        Write-Host "Found relevant logs:"
        $targetLogs | ForEach-Object { Write-Host $_ }
    } else {
        Write-Host "No relevant logs found. Showing first 10 logs:"
        $json.logs | Select-Object -First 10 | ForEach-Object { Write-Host $_ }
    }
} catch {
    Write-Host "Error: $_"
    if ($_.Exception.Response) {
        $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
        Write-Host "Response Body: $($reader.ReadToEnd())"
    }
}
