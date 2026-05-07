#!/bin/bash

# Physical Inventory System - Setup Script for Mac/Linux

echo ""
echo "======================================"
echo "Physical Inventory System - Setup"
echo "======================================"
echo ""

# Check Python
if ! command -v python3 &> /dev/null; then
    echo "ERROR: Python3 is not installed"
    echo "Please install Python 3.8+ from https://www.python.org/"
    exit 1
fi

# Check Node
if ! command -v node &> /dev/null; then
    echo "ERROR: Node.js is not installed"
    echo "Please install Node.js from https://nodejs.org/"
    exit 1
fi

echo "[1/4] Installing Python dependencies..."
pip3 install -r requirements.txt
if [ $? -ne 0 ]; then
    echo "ERROR: Failed to install Python dependencies"
    exit 1
fi

echo ""
echo "[2/4] Installing Node dependencies..."
cd client
npm install
if [ $? -ne 0 ]; then
    echo "ERROR: Failed to install Node dependencies"
    cd ..
    exit 1
fi

echo ""
echo "[3/4] Building React frontend..."
npm run build
if [ $? -ne 0 ]; then
    echo "ERROR: Failed to build React"
    cd ..
    exit 1
fi

cd ..

echo ""
echo "[4/4] Initializing database..."
python3 init_db.py
if [ $? -ne 0 ]; then
    echo "ERROR: Failed to initialize database"
    exit 1
fi

echo ""
echo "======================================"
echo "Setup Complete!"
echo "======================================"
echo ""
echo "To start the application, run:"
echo "  python3 server.py"
echo ""
echo "Then open: http://localhost:8081"
echo ""
echo "Default Credentials:"
echo "  Admin: admin / admin"
echo "  Counter: counter1 / any"
echo ""
