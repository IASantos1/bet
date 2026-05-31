$dateStr = "2026-02-25"
Write-Host "Checking imported_odds for $dateStr..."
npx wrangler d1 execute bet62-db --local --command "SELECT count(*) as count FROM imported_odds WHERE event_date LIKE '$dateStr%';"
