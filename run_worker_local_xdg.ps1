$localDir = Resolve-Path ".\.wrangler_local"
$env:XDG_CONFIG_HOME = $localDir
$env:XDG_CACHE_HOME = $localDir
$env:XDG_DATA_HOME = $localDir
$env:WRANGLER_HOME = $localDir
npx wrangler dev src/worker/index.ts --port 8788
