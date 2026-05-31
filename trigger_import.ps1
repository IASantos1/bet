Write-Host "Triggering Force Import..."
try {
    $response = Invoke-RestMethod -Uri "http://127.0.0.1:8788/api/dev/force-import" -Method Post -Headers @{ Authorization = "Bearer dev-admin-token" }
    Write-Host "Success:"
    Write-Host ($response | ConvertTo-Json -Depth 5)
} catch {
    Write-Host "Error:"
    Write-Host $_
}
