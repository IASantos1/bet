
$port = 8790
Write-Host "Testing TCP connection to 127.0.0.1:$port..."
$tcp = Test-NetConnection -ComputerName 127.0.0.1 -Port $port
if ($tcp.TcpTestSucceeded) {
    Write-Host "TCP Connection Successful!"
} else {
    Write-Host "TCP Connection FAILED!"
}

Write-Host "Testing HTTP request (verbose, 20s timeout)..."
try {
    $response = Invoke-WebRequest -Uri "http://127.0.0.1:$port/" -Method Get -TimeoutSec 20 -Verbose
    Write-Host "HTTP Status: $($response.StatusCode)"
} catch {
    Write-Host "HTTP Request Failed: $_"
}
