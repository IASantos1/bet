
$uri = "http://127.0.0.1:8788/api/dev/debug-sync"
Write-Host "Triggering Debug Sync: $uri"
try {
    $response = Invoke-WebRequest -Uri $uri -Method Get -TimeoutSec 60
    $json = $response.Content
    $json | Out-File "debug_sync_output.json" -Encoding utf8
    Write-Host "Response saved to debug_sync_output.json"
    
    # Parse and display logs
    $data = $json | ConvertFrom-Json
    if ($data.logs) {
        $data.logs | ForEach-Object { Write-Host $_ }
    } else {
        Write-Host "No logs returned."
    }
} catch {
    Write-Host "Error: $_"
    if ($_.Exception.Response) {
        Write-Host "Status Code: $($_.Exception.Response.StatusCode)"
    }
}
