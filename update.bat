@echo off
REM Update Physical Inventory from GitHub

cd /d "%~dp0"

echo.
echo ======================================
echo Pulling Latest Changes from GitHub
echo ======================================
echo.

git pull origin claude/typescript-to-python-streamlit-xx0cO

if errorlevel 1 (
    echo.
    echo ERROR: Failed to pull from GitHub
    pause
    exit /b 1
)

echo.
echo ======================================
echo Rebuilding React Frontend
echo ======================================
echo.

cd client
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
