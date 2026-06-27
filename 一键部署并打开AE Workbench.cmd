@echo off
setlocal

set "APP_DIR=%~dp0"
cd /d "%APP_DIR%"

title AE Workbench Deploy
echo.
echo Deploying AE Workbench...
echo App directory: %APP_DIR%
echo.

powershell -NoProfile -ExecutionPolicy Bypass -File "%APP_DIR%deploy-for-user.ps1"
if errorlevel 1 (
  echo.
  echo Deployment failed. Please check the error above.
  pause
  exit /b 1
)

echo.
echo Deployment complete.
exit /b 0
