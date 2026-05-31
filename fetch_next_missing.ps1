$env:WRANGLER_HOME=".\.wrangler_local"
npx wrangler d1 execute bet62-db --local --command "SELECT id FROM events WHERE id = 120"
npx wrangler d1 execute bet62-db --local --command "SELECT payload FROM imported_odds WHERE id = '22bet_698449854'" --json | Out-File -FilePath payload.json -Encoding utf8
