$path = Get-Location
$env:USERPROFILE = "$path\.wrangler-home\user"
$env:WRANGLER_HOME = "$path\.wrangler-home"
$env:XDG_CONFIG_HOME = "$path\.wrangler-home"
$env:XDG_DATA_HOME = "$path\.wrangler-home"
$env:XDG_CACHE_HOME = "$path\.wrangler-home"

# Ensure directories exist
New-Item -ItemType Directory -Force -Path "$path\.wrangler-home\user\.wrangler" | Out-Null
New-Item -ItemType Directory -Force -Path "$path\.wrangler-home\logs" | Out-Null
New-Item -ItemType Directory -Force -Path "$path\.wrangler-home\registry" | Out-Null

Write-Host "Starting worker with custom environment..."
Write-Host "USERPROFILE: $env:USERPROFILE"
Write-Host "WRANGLER_HOME: $env:WRANGLER_HOME"

npm run worker
