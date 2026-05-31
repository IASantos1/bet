$env:WRANGLER_HOME=".\.wrangler_local"
npx wrangler d1 execute bet62-db --local --command "SELECT id, (payload LIKE '%bookmakers%') as has_bookmakers FROM imported_odds WHERE id = 'soccer_1511506'"