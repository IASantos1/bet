param([string]$date = "2026-02-25", [string]$search = "Illinois", [string]$sport = "soccer")

$uri = "http://127.0.0.1:8788/api/dev/test-fetch?date=$date&sport=$sport"
Write-Host "Fetching $sport fixtures for date: $date"
Write-Host "GET $uri"

try {
    $response = Invoke-WebRequest -Uri $uri -Method Get -ErrorAction Stop
    $json = $response.Content | ConvertFrom-Json
    
    if ($json.fixtures) {
        Write-Host "Found $($json.fixtures.Count) fixtures."
        
        $matches = $json.fixtures | Where-Object { 
            ($_.teams.home.name -match $search) -or ($_.teams.away.name -match $search) 
        }
        
        if ($matches) {
            Write-Host "FOUND MATCHES for '$search':" -ForegroundColor Green
            foreach ($match in $matches) {
                $id = if ($match.id) { $match.id } else { $match.fixture.id }
                $league = if ($match.league) { $match.league.name } else { "Unknown" }
                $homeTeam = $match.teams.home.name
                $awayTeam = $match.teams.away.name
                $dateVal = if ($match.date) { $match.date } else { $match.fixture.date }
                $status = if ($match.status) { $match.status.short } else { $match.fixture.status.short }
                
                Write-Host "ID: $id"
                Write-Host "League: $league"
                Write-Host "Teams: $homeTeam vs $awayTeam"
                Write-Host "Date: $dateVal"
                Write-Host "Status: $status"
                Write-Host "-------------------"
            }
        } else {
            Write-Host "No matches found containing '$search'." -ForegroundColor Yellow
        }
    } else {
        Write-Host "No 'fixtures' field in JSON."
    }
} catch {
    Write-Host "Error: $_"
}
