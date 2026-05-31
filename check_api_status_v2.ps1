$ErrorActionPreference = "Stop"

# Use localhost:8788 (Worker)
$BaseUrl = "http://localhost:8788"

Write-Host "Checking API status on $BaseUrl..."

try {
    # 1. Check / (Root Health Check)
    $statusUrl = "$BaseUrl/"
    Write-Host "Requesting $statusUrl..."
    $response = Invoke-WebRequest -Uri $statusUrl -Method Get -TimeoutSec 30
    Write-Host "Status Response Code: $($response.StatusCode)"
    Write-Host "Status Response Body: $($response.Content)"
} catch {
    Write-Host "Error checking /: $_"
}

try {
    # 2. Check /api/dev/sql (POST query)
    $sqlUrl = "$BaseUrl/api/dev/sql"
    $body = @{
        query = "SELECT count(*) as count FROM events"
    } | ConvertTo-Json

    Write-Host "Requesting $sqlUrl with query..."
    $response = Invoke-WebRequest -Uri $sqlUrl -Method Post -Body $body -ContentType "application/json" -TimeoutSec 30
    Write-Host "SQL Response Code: $($response.StatusCode)"
    Write-Host "SQL Response Body: $($response.Content)"
} catch {
    Write-Host "Error checking /api/dev/sql: $_"
}
