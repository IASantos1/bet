$ErrorActionPreference = "Continue"

$env:WRANGLER_HOME=".wrangler-local"

# Get current date in ISO format for comparison
$date = Get-Date
$dateStr = $date.ToString("yyyy-MM-dd")
$futureDate = $date.AddDays(2).ToString("yyyy-MM-dd")

Write-Output "Checking for UPCOMING NS events..."

$query = "SELECT external_event_id, home_team, away_team, home_odd, draw_odd, away_odd, event_date, status FROM events WHERE event_date > '$dateStr' AND status = 'NS' ORDER BY event_date ASC LIMIT 10;"

npx wrangler d1 execute bet62-db --local --command "$query"
