
$port = 8788
$tcp = Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue
if ($tcp) {
    Write-Host "Killing process on port $port (PID: $($tcp.OwningProcess))"
    Stop-Process -Id $tcp.OwningProcess -Force
}
Start-Sleep -Seconds 2
./run_worker.ps1
