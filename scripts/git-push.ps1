param(
  [string]$Message
)
$msg = $Message
if (-not $msg -or $msg -eq "") { $msg = $env:npm_config_message }
if (-not $msg -or $msg -eq "") { $msg = "chore: sync from Trae" }
$changes = git status --porcelain
if ($changes) {
  git add .
  git commit -m $msg
} else {
  Write-Output "No changes to commit"
}
git pull --rebase origin main
git push -u origin main
