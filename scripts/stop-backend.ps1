$processes = Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like "*start-backend.mjs*" }
foreach ($p in $processes) {
    Stop-Process -Id $p.ProcessId -Force
    Write-Host "Stopped process $($p.ProcessId)"
}
if (!($processes)) {
    Write-Host "No backend process found."
}
