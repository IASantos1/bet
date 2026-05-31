
try {
    Write-Host "Calling /api/dev/debug-sync..."
    $response = Invoke-WebRequest -Uri "http://127.0.0.1:8788/api/dev/debug-sync" -Method Get -ErrorAction Stop -TimeoutSec 120
    
    # Save raw content to file to avoid truncation issues in console
    $response.Content | Out-File "debug_sync_logs.json" -Encoding UTF8
    
    Write-Host "Sync Debug Status: $($response.StatusCode)"
    Write-Host "Logs saved to debug_sync_logs.json"
    
    # Print first 20 lines of logs from JSON (parsing if possible)
    try {
        $json = $response.Content | ConvertFrom-Json
        if ($json.logs) {
            $json.logs | Select-Object -First 20 | ForEach-Object { Write-Host $_ }
            
            # Check for specific errors or drops
            $drops = $json.logs | Where-Object { $_ -match "Dropped" -or $_ -match "Error" -or $_ -match "whitelist" }
            if ($drops) {
                Write-Host "`n--- WARNINGS/ERRORS FOUND ---"
                $drops | ForEach-Object { Write-Host $_ }
            }
        }
    } catch {
        Write-Host "Could not parse JSON logs directly."
    }
} catch {
    Write-Host "Debug Sync Failed: $_"
    if ($_.Exception.Response) {
        Write-Host "Response Body: " 
        $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
        $reader.ReadToEnd()
    }
}
