$env:WRANGLER_HOME=".\.wrangler_local"
npx wrangler d1 execute bet62-db --local --command "SELECT payload FROM imported_odds WHERE id = '22bet_698449049'" > payload_dump.txt