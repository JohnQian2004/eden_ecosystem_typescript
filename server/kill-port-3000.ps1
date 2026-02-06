$port = 3000
$lines = netstat -ano | Select-String ":$port "
foreach ($line in $lines) {
    $parts = $line -split '\s+'
    $pid = $parts[-1]
    if ($pid -match '^\d+$') {
        $proc = Get-Process -Id $pid -ErrorAction SilentlyContinue
        if ($proc) {
            if ($proc.ProcessName -notlike '*node*') {
                Write-Host "Killing non-node.js process: $($proc.ProcessName) (PID: $pid)"
                Stop-Process -Id $pid -Force -ErrorAction SilentlyContinue
            } else {
                Write-Host "Skipping node.js process: $($proc.ProcessName) (PID: $pid)"
            }
        }
    }
}
