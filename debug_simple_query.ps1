$ErrorActionPreference = "Continue"

Write-Output "Checking Simple Payload..."
try {
    $r = Invoke-WebRequest -Uri "http://127.0.0.1:8788/api/dev/check-payload" -TimeoutSec 10
    Write-Output "Status Code: $($r.StatusCode)"
    Write-Output "Content: $($r.Content)"
} catch {
    Write-Output "Check Payload Failed: $_"
}
