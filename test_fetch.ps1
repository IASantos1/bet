$ErrorActionPreference = "Continue"
$date = "2026-02-25"
$url = "http://127.0.0.1:8788/api/dev/test-fetch?date=$date"
Write-Output "Fetching from $url"
$response = Invoke-WebRequest -Uri $url -Method Get
Write-Output $response.Content
