@echo off
setlocal

set "APP_DIR=%~dp0"
cd /d "%APP_DIR%"

title AE Workbench Launcher
echo.
echo Starting AE Workbench...
echo App directory: %APP_DIR%
echo.

if exist "release\win-unpacked\AE Workbench.exe" (
  echo Opening packaged app...
  start "" "%APP_DIR%release\win-unpacked\AE Workbench.exe"
  exit /b 0
)

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js was not found. Please install Node.js first.
  pause
  exit /b 1
)

where npm >nul 2>nul
if errorlevel 1 (
  echo npm was not found. Please reinstall Node.js.
  pause
  exit /b 1
)

if not exist "node_modules\electron\dist\electron.exe" (
  echo Installing dependencies. This may take a while on first launch...
  set "ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/"
  call npm install
  if errorlevel 1 (
    echo Dependency installation failed.
    pause
    exit /b 1
  )
)

if not exist "node_modules\electron\dist\electron.exe" (
  echo Electron runtime is still missing. Rebuilding Electron dependency...
  set "ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/"
  call npm rebuild electron
  if errorlevel 1 (
    echo Electron rebuild failed.
    pause
    exit /b 1
  )
)

echo Building desktop app...
call npm run build
if errorlevel 1 (
  echo Build failed.
  pause
  exit /b 1
)

echo Opening desktop window...
powershell -NoProfile -ExecutionPolicy Bypass -File "%APP_DIR%open-ae-workbench.ps1"
if errorlevel 1 (
  echo Launch failed.
  pause
  exit /b 1
)

echo Started. You can close this launcher window.
exit /b 0
