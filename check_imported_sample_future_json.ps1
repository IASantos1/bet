$dateStr = "2026-02-25"
Write-Host "Checking imported_odds leagues for $dateStr (JSON)..."
# Use --json for clean output
npx wrangler d1 execute bet62-db --local --command "SELECT id, payload FROM imported_odds WHERE event_date LIKE '$dateStr%' LIMIT 5;" --json > future_payloads_json.txt
Write-Host "Dumped 5 payloads to future_payloads_json.txt"
