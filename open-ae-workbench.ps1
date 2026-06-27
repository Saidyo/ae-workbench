$ErrorActionPreference = "Stop"

$root = $PSScriptRoot
$electronCmd = Join-Path $root "node_modules\.bin\electron.cmd"

Set-Location $root

$oldElectron = Get-CimInstance Win32_Process | Where-Object {
  $_.CommandLine -like ("*" + $root + "*") -and $_.CommandLine -like "*electron*"
}

foreach ($process in $oldElectron) {
  Stop-Process -Id $process.ProcessId -Force -ErrorAction SilentlyContinue
}

$env:AE_MANAGER_PROD = "1"
Start-Process -FilePath $electronCmd -ArgumentList @(".") -WorkingDirectory $root -WindowStyle Normal
