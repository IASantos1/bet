
try {
    $response = Invoke-WebRequest -Uri "http://localhost:8788/api/featured-games" -Method Get
    Write-Output "Status: $($response.StatusCode)"
    Write-Output "Content: $($response.Content)"
} catch {
    Write-Output "Error: $($_.Exception.Message)"
    if ($_.Exception.Response) {
        Write-Output "Response Status: $($_.Exception.Response.StatusCode)"
    }
}
