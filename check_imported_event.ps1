$env:WRANGLER_HOME=".\.wrangler_local"
npx wrangler d1 execute bet62-db --local --command "SELECT id, payload FROM imported_odds WHERE id = 'soccer_1519506'" --json | Out-File -FilePath check_imported.json -Encoding utf8
