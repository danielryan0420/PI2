@echo off
REM Physical Inventory System - Stop all processes

cd /d "%~dp0"

echo.
echo ======================================
echo  Physical Inventory System - Stopping
echo ======================================
echo.

echo Stopping nginx proxy...
taskkill /F /IM nginx.exe >nul 2>&1
if errorlevel 1 (
    echo   nginx was not running
) else (
    echo   nginx stopped
)

echo Stopping app server...
for /f "tokens=5" %%p in ('netstat -ano ^| findstr ":8081 " ^| findstr "LISTENING"') do (
    taskkill /PID %%p /F >nul 2>&1
)
REM Confirm
netstat -ano | findstr ":8081 " | findstr "LISTENING" >nul 2>&1
if errorlevel 1 (
    echo   App server stopped
) else (
    echo   WARNING: Something is still listening on port 8081
)

echo.
echo Done. All processes stopped.
echo.
pause
