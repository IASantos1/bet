$uri = "http://127.0.0.1:8788/api/dev/force-poll"
Write-Host "Triggering Force Poll: $uri"
try {
    $response = Invoke-WebRequest -Uri $uri -Method Get -TimeoutSec 10
    Write-Host "Response: $($response.Content)"
} catch {
    Write-Host "Error: $_"
}
