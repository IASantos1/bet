$id = "soccer_1521379"
Write-Host "Fetching payload for $id..."

# Use wrangler d1 execute to get the payload
$cmd = "npx wrangler d1 execute bet62-db --local --command ""SELECT payload FROM imported_odds WHERE id = '$id'"""
$output = Invoke-Expression $cmd

# Extract JSON part (assuming it's wrapped in lines)
# The output format is usually header + data. We need to be careful.
# But since the payload is huge, let's just dump it to a file first.

$output | Out-File "u20_payload_raw.txt" -Encoding UTF8
Write-Host "Raw output saved to u20_payload_raw.txt"

# Try to parse it in PowerShell if possible, or just read the file in next step.
