$uri = "http://127.0.0.1:8788/api/events-range?from=2026-02-25T00:00:00Z&to=2026-02-25T23:59:59Z"
Write-Host "GET $uri"
try {
    $response = Invoke-WebRequest -Uri $uri -Method Get -ErrorAction Stop
    $json = $response.Content | ConvertFrom-Json
    Write-Host "Response count: $($json.Count)"
    
    # Check for ANY event with odds
    $withOdds = $json | Where-Object { $_.home_odd -gt 0 }
    
    if ($withOdds) {
        Write-Host "FOUND EVENTS WITH ODDS:" -ForegroundColor Green
        $withOdds | Select-Object -First 10 | Format-Table id, league, match, home_odd, draw_odd, away_odd
        Write-Host "Total with odds: $($withOdds.Count)"
    } else {
        Write-Host "NO EVENTS WITH ODDS FOUND FOR TOMORROW." -ForegroundColor Red
    }
    
    # Check specifically for U20/Concacaf again
    $concacaf = $json | Where-Object { $_.league -match "Concacaf" -or $_.league -match "U20" }
    Write-Host "Total U20/Concacaf events: $($concacaf.Count)"
    
} catch {
    Write-Host "Error: $_"
}
