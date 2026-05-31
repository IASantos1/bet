param(
    [string]$EndpointUrl = "http://127.0.0.1:8787/api/dev/import/spro/bulk",
    [string]$AdminToken = "admin_token_secure_123", # Default dev token
    [switch]$DryRun
)

if (Get-Module -ListAvailable PSReadLine) { Remove-Module PSReadLine -ErrorAction SilentlyContinue }

Write-Host "Target Endpoint: $EndpointUrl"
Write-Host "Dry Run: $DryRun"

$headers = @{
    "X-Admin-Token" = $AdminToken
}

$providers = @(
    "draftkings","neobet","thescore","espnbet","betmgm","sportsinteraction",
    "bwin","partysports","bet99","fanduel","betrivers","leovegas","northstar",
    "playfallsview","888","pinnacle","ps3838","tonybet","bodog","bovada",
    "pokerstars","ballybet","playnow","betfair","miseojeu","paddypower",
    "casumo","hardrock","betvictor","betano (uk)","parimatch","talksportbet","betonline"
)
$defaultProvider = $env:ODDS_PROVIDER
if (-not $defaultProvider -or [string]::IsNullOrWhiteSpace($defaultProvider)) { $defaultProvider = "pinnacle" } else { $defaultProvider = ($defaultProvider.ToLower() -replace '[^a-z0-9]','') }
$events = @()

$now = Get-Date

function New-GuidStr {
    return [guid]::NewGuid().ToString()
}

# Load External Fixtures (User Request: "Separar dados em JSON externo")
$fixturesDir = Join-Path $PSScriptRoot "fixtures"
$soccerFile = Join-Path $fixturesDir "matches_soccer.json"
$nbaFile = Join-Path $fixturesDir "matches_nba.json"

if (Test-Path $soccerFile) {
    Write-Host "Loading Soccer matches from $soccerFile"
    $matches = Get-Content $soccerFile | ConvertFrom-Json
    foreach ($m in $matches) {
        $startTime = if ($m.start_offset_hours) { $now.AddHours($m.start_offset_hours) } else { Get-Date $m.start }
        $events += @{
            external_event_id = New-GuidStr
            provider = $defaultProvider
            match = $m.match
            league = $m.league
            home_team = $m.home
            away_team = $m.away
            start_time = $startTime.ToString("yyyy-MM-ddTHH:mm:ssZ")
            home_odd = 1.95
            draw_odd = 3.50
            away_odd = 3.80
            odds = @{
                h2h = @{
                    home = 1.95
                    draw = 3.50
                    away = 3.80
                }
                over_under = @{
                    over_0_5  = 1.20
                    under_0_5 = 4.50
                    over_2_5  = 1.88
                    under_2_5 = 1.95
                    over_3    = 2.20
                    under_3   = 1.70
                }
                both_teams_to_score = @{
                    yes = 1.80
                    no  = 2.00
                }
            }
        }
    }
}

if (Test-Path $nbaFile) {
    Write-Host "Loading NBA matches from $nbaFile"
    $matches = Get-Content $nbaFile | ConvertFrom-Json
    foreach ($m in $matches) {
        $startTime = if ($m.start_offset_hours) { $now.AddHours($m.start_offset_hours) } else { Get-Date $m.start }
        $events += @{
            external_event_id = New-GuidStr
            provider = $defaultProvider
            match = $m.match
            league = $m.league
            home_team = $m.home
            away_team = $m.away
            start_time = $startTime.ToString("yyyy-MM-ddTHH:mm:ssZ")
            home_odd = 1.85
            draw_odd = 0
            away_odd = 2.05
            odds = @{
                h2h = @{
                    home = 1.85
                    away = 2.05
                }
                totals = @{
                    over_215_5 = 1.90
                    under_215_5 = 1.90
                }
            }
        }
    }
}

$RandomOdds = {
    param([double]$min,[double]$max)
    return [math]::Round(($min + (Get-Random -Minimum 0 -Maximum 1)*($max-$min)),2)
}

function Add-Event {
    param($league, $homeTeam, $awayTeam, [datetime]$startTime)
    $script:events += @{
        external_event_id = New-GuidStr
        provider   = $defaultProvider
        match      = "$homeTeam vs $awayTeam"
        league     = $league
        home_team  = $homeTeam
        away_team  = $awayTeam
        start_time = $startTime.ToString("yyyy-MM-ddTHH:mm:ssZ")
        home_odd   = & $RandomOdds 1.5 3.0
        draw_odd   = & $RandomOdds 2.5 4.0
        away_odd   = & $RandomOdds 1.5 3.5
        odds = @{
            h2h = @{
                home = 1.5
                draw = 3.0
                away = 2.5
            }
        }
    }
}

# Add bulk fake events for load testing
$ligas = @{}
$ligas["Eredivisie"] = @("Ajax","PSV","Feyenoord","AZ")
$ligas["Scottish Premiership"] = @("Celtic","Rangers","Aberdeen","Hearts")

foreach ($k in $ligas.Keys) {
    $teams = $ligas[$k]
    for ($i=0; $i -lt [Math]::Min($teams.Count-1,6); $i+=2) {
        $homeTeam = $teams[$i]
        $awayTeam = $teams[$i+1]
        $dt = $now.AddHours(($i/2)+1)
        Add-Event -league $k -homeTeam $homeTeam -awayTeam $awayTeam -startTime $dt
    }
}

$eventsCount = ($events | Measure-Object).Count
Write-Host "Events Generated: $eventsCount"

if ($eventsCount -eq 0) { Write-Host "No events generated!"; exit 0 }

if ($DryRun) {
    Write-Host "Dry Run Mode: Skipping POST request."
    $events | ConvertTo-Json -Depth 5 | Select-Object -First 2
    exit 0
}

$batchSize = 50 # Reduced batch size for safety
$total = ($events | Measure-Object).Count

for ($offset = 0; $offset -lt $total; $offset += $batchSize) {
    $end = [math]::Min($offset + $batchSize - 1, $total - 1)
    $chunk = $events[$offset..$end]
    $body = $chunk | ConvertTo-Json -Depth 10
    
    Write-Host "Sending batch: Size=$($chunk.Count) Offset=$offset"
    
    try {
        $response = Invoke-RestMethod -Method POST -Uri $EndpointUrl -ContentType "application/json" -Body $body -Headers $headers -TimeoutSec 180
        Write-Host "Response: $($response | ConvertTo-Json -Depth 2 -Compress)"
    } catch {
        Write-Error "Batch Failed: $($_.Exception.Message)"
        if ($_.Exception.Response) {
            $reader = New-Object System.IO.StreamReader $_.Exception.Response.GetResponseStream()
            Write-Error $reader.ReadToEnd()
        }
    }
    Start-Sleep -Milliseconds 500
}
