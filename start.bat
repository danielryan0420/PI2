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
start "Physical Inventory - App Server" /min python run_production.py

REM Give the server a moment to bind before nginx tries to proxy it
timeout /t 3 /nobreak >nul

echo Starting proxy...
call setup_nginx_proxy.bat

REM setup_nginx_proxy.bat prints the URL — nothing else needed here
