@echo off
REM Update Physical Inventory from GitHub

cd /d "%~dp0"

echo.
echo ======================================
echo Pulling Latest Changes from GitHub
echo ======================================
echo.

git fetch origin main

if errorlevel 1 (
    echo.
    echo ERROR: Failed to fetch from GitHub
    pause
    exit /b 1
)

git reset --hard origin/main

if errorlevel 1 (
    echo.
    echo ERROR: Failed to reset to latest
    pause
    exit /b 1
)

echo.
echo ======================================
echo Installing/Updating npm packages
echo ======================================
echo.

cd client
if not exist "node_modules\" (
    echo Installing npm packages...
    call npm install
) else (
    echo npm packages already installed
)

if errorlevel 1 (
    echo.
    echo ERROR: Failed to install npm packages
    cd ..
    pause
    exit /b 1
)

echo.
echo ======================================
echo Rebuilding React Frontend
echo ======================================
echo.

call npm run build

if errorlevel 1 (
    echo.
    echo ERROR: Failed to build React
    cd ..
    pause
    exit /b 1
)

cd ..

echo.
echo ======================================
echo Update Complete!
echo ======================================
echo.
echo To start the app, run:
echo   python server.py
echo.
pause
