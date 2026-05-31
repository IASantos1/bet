
try {
    $response = Invoke-WebRequest -Uri "http://127.0.0.1:8788/api/status" -Method Get -ErrorAction Stop
    Write-Host "Worker Status: $($response.StatusCode)"
    Write-Host "Body: $($response.Content)"
} catch {
    Write-Host "Worker not reachable: $_"
}
