$dateStr = "2026-02-25"
$url = "http://127.0.0.1:8788/api/events?date=$dateStr&limit=1000"
Write-Host "Fetching raw events for $dateStr from API ($url)..."
try {
    $r = Invoke-WebRequest -Uri $url -TimeoutSec 30
    $r.Content | Out-File "api_response_raw.json" -Encoding UTF8
    Write-Host "Saved to api_response_raw.json"
} catch {
    Write-Host "Error fetching API: $_"
}
