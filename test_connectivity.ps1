
$uri = "http://127.0.0.1:8788/"
Write-Host "Testing connectivity to: $uri"
try {
    $response = Invoke-WebRequest -Uri $uri -Method Get -TimeoutSec 5
    Write-Host "Response: $($response.StatusCode)"
} catch {
    Write-Host "Error: $_"
}
