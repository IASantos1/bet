
$dateStr = "2026-02-25"
$url = "http://127.0.0.1:8788/api/events?date=$dateStr&limit=1000"
Write-Host "Fetching events for $dateStr from API ($url)..."
try {
    $r = Invoke-WebRequest -Uri $url -TimeoutSec 30
    $json = $r.Content | ConvertFrom-Json
    
    $events = $json.events
    if ($null -eq $events) {
        # Check if root is array
        $events = $json
    }

    Write-Host "Found $($events.Count) events for $dateStr"
    
    if ($events.Count -gt 0) {
        Write-Host "First event sample: $($events[0] | ConvertTo-Json -Depth 2)"
    }

    # Filter for Concacaf or U20
    $concacaf = $events | Where-Object { 
        ($_.league.name -like "*Concacaf*" -or $_.league.name -like "*U20*") -or
        ($_.league_obj.name -like "*Concacaf*" -or $_.league_obj.name -like "*U20*")
    }
    
    if ($concacaf) {
        Write-Host "FOUND Concacaf/U20 Events:" -ForegroundColor Green
        $concacaf | ForEach-Object {
            $ln = if ($_.league.name) { $_.league.name } else { $_.league_obj.name }
            Write-Host "  - [$($_.id)] $($_.home_team) vs $($_.away_team) ($ln)"
        }
    } else {
        Write-Host "NO Concacaf/U20 Events found in API response." -ForegroundColor Red
        # List some leagues found to verify
        $leagues = $events | ForEach-Object { if ($_.league.name) { $_.league.name } else { $_.league_obj.name } } | Select-Object -Unique
        Write-Host "Leagues found: $($leagues -join ', ')"
    }
} catch {
    Write-Host "Error fetching API: $_"
}

