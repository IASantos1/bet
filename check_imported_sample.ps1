$ErrorActionPreference = "Continue"

Write-Output "Checking Imported Odds Status..."
try {
    $r = Invoke-WebRequest -Uri "http://127.0.0.1:8788/api/dev/check-imported-status" -TimeoutSec 10
    Write-Output "Status Code: $($r.StatusCode)"
    Write-Output "Content: $($r.Content)"
} catch {
    Write-Output "Check Status Failed: $_"
}

Write-Output "`nInspecting Sample Imported Payload..."
try {
    $r = Invoke-WebRequest -Uri "http://127.0.0.1:8788/api/dev/inspect-imported" -TimeoutSec 10
    Write-Output "Status Code: $($r.StatusCode)"
    Write-Output "Content: $($r.Content)"
} catch {
    Write-Output "Inspect Payload Failed: $_"
}
