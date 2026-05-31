$env:WRANGLER_HOME = ".\.wrangler_local"
npx wrangler d1 execute bet62-db --local --command "SELECT id, external_event_id, home_odd, markets FROM events WHERE (home_odd IS NULL OR home_odd = 0) AND status IN ('1H', '2H', 'HT', 'ET', 'P', 'NS') LIMIT 5"
