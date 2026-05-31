$env:WRANGLER_HOME = ".\.wrangler_local"
npx wrangler d1 execute bet62-db --local --command "PRAGMA table_info(imported_odds);"
