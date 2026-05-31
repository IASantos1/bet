$env:WRANGLER_HOME=".\.wrangler_local"

# Check for VALID odds in the next 48 hours
$dateStart = Get-Date
$dateEnd = $dateStart.AddHours(48).ToString("yyyy-MM-ddTHH:mm:ssZ")
$dateStartStr = $dateStart.ToString("yyyy-MM-ddTHH:mm:ssZ")

Write-Host "Checking for VALID odds (home_odd > 0) between $dateStartStr and $dateEnd (UTC)..."

$output = npx wrangler d1 execute bet62-db --local --command "SELECT id, external_event_id, home_team, away_team, event_date, home_odd, draw_odd, away_odd FROM events WHERE home_odd > 0 AND event_date BETWEEN '$dateStartStr' AND '$dateEnd' ORDER BY event_date ASC LIMIT 5"
$output

