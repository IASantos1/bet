$env:WRANGLER_HOME=".\.wrangler_local"
npx wrangler d1 execute bet62-db --local --command "SELECT id, payload FROM imported_odds LIMIT 1" --json > sample.json