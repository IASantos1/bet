$dateStr = "2026-02-25"
Write-Host "Checking imported_odds leagues for $dateStr..."
# Extract league name from payload using SQLite JSON functions if available, or just dump a sample
# Since D1 might not support complex JSON extraction easily in CLI without jq, we'll dump a few payloads and parse in JS or just look at raw text
npx wrangler d1 execute bet62-db --local --command "SELECT id, payload FROM imported_odds WHERE event_date LIKE '$dateStr%' LIMIT 5;" > future_payloads_sample.txt
Write-Host "Dumped 5 payloads to future_payloads_sample.txt"
