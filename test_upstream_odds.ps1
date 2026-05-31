param([string]$id = "1521377")

$uri = "http://127.0.0.1:8788/api/dev/check-odds/$id"
Write-Host "Checking upstream odds for ID: $id"
Write-Host "GET $uri"

try {
    $response = Invoke-WebRequest -Uri $uri -Method Get -ErrorAction Stop
    $json = $response.Content | ConvertFrom-Json
    
    # Check if we got odds
    if ($json.response -and $json.response.Count -gt 0) {
        $odds = $json.response[0].bookmakers
        if ($odds -and $odds.Count -gt 0) {
            Write-Host "SUCCESS: Odds found upstream!" -ForegroundColor Green
            $odds | Select-Object id, name | Format-Table
            
            # Show first bookmaker's bets
            $bets = $odds[0].bets
            if ($bets) {
                Write-Host "Bets available:"
                $bets | Select-Object id, name | Format-Table
            }
        } else {
            Write-Host "WARNING: Fixture found, but NO ODDS returned by API-Sports." -ForegroundColor Yellow
        }
    } else {
        Write-Host "ERROR: Fixture not found or API error." -ForegroundColor Red
        Write-Host $response.Content
    }
    
    # Save for inspection
    $response.Content | Out-File "upstream_odds_check_$id.json" -Encoding UTF8
} catch {
    Write-Host "Error: $_"
    if ($_.Exception.Response) {
        $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
        Write-Host "Response Body: $($reader.ReadToEnd())"
    }
}
