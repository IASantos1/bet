$env:WRANGLER_HOME = ".\.wrangler_local"
npx wrangler d1 execute bet62-db --local --command "SELECT id, payload, is_live, updated_at FROM imported_odds WHERE id = 'soccer_1511506'"
