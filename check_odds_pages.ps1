param([string]$date = "2026-02-25")

$uri = "http://127.0.0.1:8788/api/dev/check-odds-pages?date=$date"
Write-Host "Checking odds pages for date: $date"
Write-Host "GET $uri"

try {
    $response = Invoke-WebRequest -Uri $uri -Method Get -ErrorAction Stop
    $json = $response.Content | ConvertFrom-Json
    Write-Host "Total Pages: $($json.paging.total)"
    Write-Host "Current Page: $($json.paging.current)"
    Write-Host "Response Count: $($json.response.Count)"
} catch {
    Write-Host "Error: $_"
    if ($_.Exception.Response) {
        $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
        Write-Host "Response Body: $($reader.ReadToEnd())"
    }
}
