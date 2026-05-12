@echo off
REM Physical Inventory System - Setup Script for Windows

echo.
echo ======================================
echo Physical Inventory System - Setup
echo ======================================
echo.

REM Check Python
python --version >nul 2>&1
if errorlevel 1 (
    echo ERROR: Python is not installed or not in PATH
    echo Please install Python 3.8+ from https://www.python.org/
    pause
    exit /b 1
)

REM Check Node
node --version >nul 2>&1
if errorlevel 1 (
    echo ERROR: Node.js is not installed or not in PATH
    echo Please install Node.js from https://nodejs.org/
    pause
    exit /b 1
)

echo [1/4] Installing Python dependencies...
pip install -r requirements.txt
if errorlevel 1 (
    echo ERROR: Failed to install Python dependencies
    pause
    exit /b 1
)

echo.
echo [2/4] Installing Node dependencies...
cd client
call npm install
if errorlevel 1 (
    echo ERROR: Failed to install Node dependencies
    cd ..
    pause
    exit /b 1
)

echo.
echo [3/4] Building React frontend...
call npm run build
if errorlevel 1 (
    echo ERROR: Failed to build React
    cd ..
    pause
    exit /b 1
)

cd ..

echo.
echo [4/4] Initializing database...
python init_db.py
if errorlevel 1 (
    echo ERROR: Failed to initialize database
    pause
    exit /b 1
)

echo.
echo ======================================
echo Setup Complete!
echo ======================================
echo.
echo To start the application, run:
echo   python server.py
echo.
echo Then open: http://localhost:8081
echo.
echo Default Credentials:
echo   Admin: admin / admin
echo   Counter: counter1 / any
echo.
pause
