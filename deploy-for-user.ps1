$ErrorActionPreference = "Stop"

$root = $PSScriptRoot
$electronCmd = Join-Path $root "node_modules\.bin\electron.cmd"
$requiredDirs = @("Library", "Projects", "Cache", "data")

function Write-Step($message) {
  Write-Host ""
  Write-Host "==> $message" -ForegroundColor Cyan
}

function Assert-Command($name, $installHint) {
  if (-not (Get-Command $name -ErrorAction SilentlyContinue)) {
    throw "$name was not found. $installHint"
  }
}

function Test-EagleApi {
  $bases = @("http://127.0.0.1:41595", "http://localhost:41595")

  foreach ($base in $bases) {
    try {
      $appInfo = Invoke-RestMethod -Uri "$base/api/application/info" -TimeoutSec 2
      $libraryInfo = $null
      try {
        $libraryInfo = Invoke-RestMethod -Uri "$base/api/library/info" -TimeoutSec 2
      } catch {
        $libraryInfo = $null
      }

      $libraryName = $libraryInfo.data.name
      if (-not $libraryName) {
        $libraryName = $libraryInfo.name
      }

      $appName = $appInfo.data.name
      if (-not $appName) {
        $appName = $appInfo.name
      }
      if (-not $appName) {
        $appName = "Eagle"
      }

      return [pscustomobject]@{
        Connected = $true
        ApiBase = $base
        AppName = $appName
        LibraryName = $libraryName
      }
    } catch {
      continue
    }
  }

  return [pscustomobject]@{
    Connected = $false
    ApiBase = ""
    AppName = ""
    LibraryName = ""
  }
}

Set-Location $root

Write-Step "Checking runtime"
Assert-Command "node" "Install Node.js LTS from https://nodejs.org/ first."
Assert-Command "npm" "Reinstall Node.js LTS from https://nodejs.org/ first."

$nodeVersion = node --version
$npmVersion = npm --version
Write-Host "Node: $nodeVersion"
Write-Host "npm:  $npmVersion"

Write-Step "Preparing local folders"
foreach ($dir in $requiredDirs) {
  New-Item -ItemType Directory -Force -Path (Join-Path $root $dir) | Out-Null
}

Write-Step "Installing dependencies"
if (-not $env:ELECTRON_MIRROR) {
  $env:ELECTRON_MIRROR = "https://npmmirror.com/mirrors/electron/"
}
npm install

Write-Step "Building desktop app"
npm run build

Write-Step "Checking Eagle local API"
$eagle = Test-EagleApi
if ($eagle.Connected) {
  $libraryLabel = if ($eagle.LibraryName) { " / Library: $($eagle.LibraryName)" } else { "" }
  Write-Host "Eagle connected: $($eagle.ApiBase)$libraryLabel" -ForegroundColor Green
} else {
  Write-Host "Eagle API is not available yet." -ForegroundColor Yellow
  Write-Host "Open Eagle first, then use Settings -> Detect Eagle or select a .library folder inside the app."
}

Write-Step "Launching AE Workbench"
$oldElectron = Get-CimInstance Win32_Process | Where-Object {
  $_.CommandLine -like ("*" + $root + "*") -and $_.CommandLine -like "*electron*"
}

foreach ($process in $oldElectron) {
  Stop-Process -Id $process.ProcessId -Force -ErrorAction SilentlyContinue
}

$env:AE_MANAGER_PROD = "1"
Start-Process -FilePath $electronCmd -ArgumentList @(".") -WorkingDirectory $root -WindowStyle Normal

Write-Host ""
Write-Host "Done. AE Workbench is starting." -ForegroundColor Green
