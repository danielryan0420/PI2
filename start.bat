@echo off
REM Physical Inventory System - Single-click launcher
REM Starts the app server and proxy together

cd /d "%~dp0"

echo.
echo ======================================
echo  Physical Inventory System - Starting
echo ======================================
echo.

REM Check Python
python --version >nul 2>&1
if errorlevel 1 (
    echo ERROR: Python is not installed or not in PATH
    pause
    exit /b 1
)

REM Check that the app has been set up
if not exist "inventory.db" (
    echo Database not found. Running first-time setup...
    echo.
    call setup.bat
    if errorlevel 1 exit /b 1
)

if not exist "client\dist\index.html" (
    echo React build not found. Running first-time setup...
    echo.
    call setup.bat
    if errorlevel 1 exit /b 1
)

echo Starting app server (port 8081)...
start "Physical Inventory - App Server" /D "%~dp0" python run_production.py

REM Wait until the app server is actually listening before starting nginx
echo Waiting for app server to be ready...
set /a attempts=0
:wait_loop
set /a attempts+=1
if %attempts% gtr 30 (
    echo.
    echo ERROR: App server did not start within 30 seconds.
    echo Check the "Physical Inventory - App Server" window for errors.
    pause
    exit /b 1
)
netstat -ano | findstr ":8081 " | findstr "LISTENING" >nul 2>&1
if errorlevel 1 (
    timeout /t 1 /nobreak >nul
    goto wait_loop
)
echo App server is ready.
echo.

echo Starting proxy...
call setup_nginx_proxy.bat

REM setup_nginx_proxy.bat prints the URL — nothing else needed here
