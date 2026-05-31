Write-Host "Triggering Force Poll via API..."
try {
    $response = Invoke-WebRequest -Uri "http://127.0.0.1:8788/api/dev/force-poll" -Method Get -UseBasicParsing
    Write-Host "Status Code: $($response.StatusCode)"
    Write-Host "Content: $($response.Content)"
} catch {
    Write-Host "Error: $_"
    Write-Host "Exception: $($_.Exception.Message)"
}
