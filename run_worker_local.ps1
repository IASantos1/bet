$env:WRANGLER_HOME = ".\.wrangler_local"
npx wrangler dev src/worker/index.ts --port 8788
