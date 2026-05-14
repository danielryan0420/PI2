#!/bin/bash
# Production startup script for Physical Inventory System
# Handles 25+ concurrent users with Gunicorn worker processes
#
# Usage:
#   bash run_production.sh
#
# Or on Windows:
#   python run_production.py

# Number of worker processes (adjust based on CPU cores)
# Formula: (2 x CPU_CORES) + 1
# For 4-core machine: (2 x 4) + 1 = 9 workers
WORKERS=${WORKERS:-9}

# Timeout for worker processes (seconds)
# Increase if you have slow queries or large file uploads
TIMEOUT=${TIMEOUT:-60}

# Port to listen on
PORT=${PORT:-8081}

# Host to bind to
HOST=${HOST:-0.0.0.0}

# Log level
LOG_LEVEL=${LOG_LEVEL:-info}

echo "Starting Physical Inventory System in PRODUCTION MODE"
echo "Workers: $WORKERS"
echo "Port: $PORT"
echo "Timeout: ${TIMEOUT}s"
echo ""

# Install gunicorn if not present
python3 -c "import gunicorn" 2>/dev/null || {
    echo "Installing Gunicorn..."
    pip install gunicorn
}

# Start gunicorn with optimized settings for SQLite + 25 concurrent users
exec gunicorn \
    --workers $WORKERS \
    --worker-class sync \
    --bind $HOST:$PORT \
    --timeout $TIMEOUT \
    --access-logfile - \
    --error-logfile - \
    --log-level $LOG_LEVEL \
    --max-requests 5000 \
    --max-requests-jitter 500 \
    --graceful-timeout 30 \
    wsgi:app
