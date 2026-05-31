$port = 8790
$conns = Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue
if ($conns) {
    foreach ($conn in $conns) {
        $procId = $conn.OwningProcess
        Write-Host "Found process $procId on port $port. Killing..."
        Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue
    }
    Write-Host "Processes killed."
} else {
    Write-Host "No process found on port $port."
}
