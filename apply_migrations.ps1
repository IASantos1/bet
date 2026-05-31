$ErrorActionPreference = "Stop"

# Set WRANGLER_HOME to match the running worker configuration
$localWrangler = "$PWD\.wrangler-local"

# Ensure the directory exists (it should, but just in case)
if (-not (Test-Path $localWrangler)) {
    New-Item -ItemType Directory -Force -Path $localWrangler | Out-Null
}

$env:WRANGLER_HOME = $localWrangler
$env:XDG_CONFIG_HOME = $localWrangler
$env:XDG_CACHE_HOME = $localWrangler
$env:XDG_DATA_HOME = $localWrangler

# Override User Profile to force local paths for everything (match run_worker.ps1)
$env:USERPROFILE = $localWrangler
$env:HOME = $localWrangler
$env:APPDATA = "$localWrangler\AppData\Roaming"
$env:LOCALAPPDATA = "$localWrangler\AppData\Local"

# Create AppData directories
if (-not (Test-Path $env:APPDATA)) { New-Item -ItemType Directory -Force -Path $env:APPDATA | Out-Null }
if (-not (Test-Path $env:LOCALAPPDATA)) { New-Item -ItemType Directory -Force -Path $env:LOCALAPPDATA | Out-Null }

Write-Host "Applying migrations using local Wrangler environment..."
Write-Host "Wrangler Home: $env:WRANGLER_HOME"
Write-Host "User Profile: $env:USERPROFILE"

# Apply migrations
npx wrangler d1 migrations apply bet62-db --local

Write-Host "Migrations applied successfully."
