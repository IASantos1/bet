$from = "2026-02-25T00:00:00.000Z"
$to = "2026-02-25T23:59:59.999Z"
$url = "http://127.0.0.1:8788/api/events-range?from=$from&to=$to"

Write-Host "Fetching events for 2026-02-25 (UTC) from API ($url)..."
try {
    $r = Invoke-WebRequest -Uri $url -TimeoutSec 30
    $json = $r.Content | ConvertFrom-Json
    
    # Handle array response directly
    $events = $json
    if ($json.events) { $events = $json.events }
    
    Write-Host "Found $($events.Count) events for 2026-02-25"
    
    if ($events.Count -gt 0) {
        Write-Host "First event sample: $($events[0].match) - $($events[0].league)"
    }

    # Filter for Concacaf or U20
    $concacaf = $events | Where-Object { 
        $_.league -like "*Concacaf*" -or $_.league -like "*U20*" 
    }
    
    if ($concacaf) {
        Write-Host "FOUND Concacaf/U20 Events:" -ForegroundColor Green
        $concacaf | ForEach-Object {
            Write-Host "  - [$($_.id)] $($_.home_team) vs $($_.away_team) ($($_.league)) [Odds: H:$($_.home_odd) D:$($_.draw_odd) A:$($_.away_odd)]"
        }
    } else {
        Write-Host "NO Concacaf/U20 Events found in API response." -ForegroundColor Red
        # List unique leagues found
        $leagues = $events | Select-Object -ExpandProperty league | Select-Object -Unique
        Write-Host "Leagues found: $($leagues -join ', ')"
    }
} catch {
    Write-Host "Error fetching API: $_"
    if ($_.Exception.Response) {
        $reader = New-Object System.IO.StreamReader $_.Exception.Response.GetResponseStream()
        Write-Host "Response Body: $($reader.ReadToEnd())"
    }
}
