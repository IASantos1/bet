$localPath = Join-Path $PSScriptRoot ".wrangler_local"
if (-not (Test-Path $localPath)) {
    New-Item -ItemType Directory -Force -Path $localPath | Out-Null
}

$env:WRANGLER_HOME = $localPath
$env:XDG_CONFIG_HOME = Join-Path $localPath "config"
$env:XDG_DATA_HOME = Join-Path $localPath "data"
$env:XDG_CACHE_HOME = Join-Path $localPath "cache"

Write-Host "Starting worker with local WRANGLER_HOME: $localPath"

# Use npx to run wrangler, which handles finding the bin correctly
npx wrangler dev src/worker/index.ts --port 8788 --log-level debug
