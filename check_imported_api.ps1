
param(
    [string]$eventId = "soccer_1524345"
)

Write-Host "Checking imported odds for $eventId..."
try {
    $res = Invoke-WebRequest -Uri "http://127.0.0.1:8788/api/dev/check-imported/$eventId" -Method Get
    $content = $res.Content | ConvertFrom-Json
    
    if ($content.found) {
        Write-Host "Imported Found!"
        Write-Host "Is Live: $($content.imported.is_live)"
        Write-Host "Updated At: $($content.imported.updated_at)"
        Write-Host "Event Date: $($content.imported.event_date)"
        
        # Check payload for odds
        $payload = $content.imported.payload | ConvertFrom-Json
        
        # Check for markets
        if ($payload.markets) {
            Write-Host "Markets found in payload:"
            $payload.markets | ForEach-Object {
                Write-Host "  Market: $($_.key)"
                $_.outcomes | ForEach-Object {
                    Write-Host "    Outcome: $($_.name) = $($_.price)"
                }
            }
        } elseif ($payload.odds) {
            Write-Host "Odds found in payload (legacy?):"
            Write-Host ($payload.odds | ConvertTo-Json -Depth 2)
        } else {
            Write-Host "No markets or odds found in payload."
            Write-Host "Payload keys: $(($payload | Get-Member -MemberType NoteProperty).Name -join ', ')"
        }
        
    } else {
        Write-Host "Imported NOT found."
    }
} catch {
    Write-Host "Check Imported Failed: $_"
}
