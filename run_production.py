#!/usr/bin/env python3
"""
Production startup script for Physical Inventory System - 25+ concurrent users
Works on Windows, macOS, and Linux

Usage:
    python3 run_production.py

    Optional environment variables:
    - WORKERS: Number of worker processes (default: 9)
    - PORT: Port to listen on (default: 8081)
    - TIMEOUT: Worker timeout in seconds (default: 60)
"""

import os
import subprocess
import sys
import multiprocessing

def get_cpu_count():
    """Get number of CPU cores for worker calculation."""
    try:
        return multiprocessing.cpu_count()
    except:
        return 4  # Default to 4 if detection fails

def main():
    # Configuration from environment or defaults
    cpu_cores = get_cpu_count()
    workers = int(os.environ.get('WORKERS', (2 * cpu_cores) + 1))
    port = os.environ.get('PORT', '8081')
    host = os.environ.get('HOST', '127.0.0.1')
    timeout = int(os.environ.get('TIMEOUT', '60'))
    log_level = os.environ.get('LOG_LEVEL', 'info')

    print("=" * 60)
    print("Physical Inventory System - PRODUCTION MODE")
    print("=" * 60)
    print(f"CPU Cores: {cpu_cores}")
    print(f"Worker Processes: {workers}")
    print(f"Host: {host}:{port}")
    print(f"Worker Timeout: {timeout}s")
    print(f"Log Level: {log_level}")
    print("")
    print("Database: SQLite with WAL mode (optimized for 25+ concurrent users)")
    print("=" * 60)
    print("")

    # Check if gunicorn is installed
    try:
        import gunicorn
    except ImportError:
        print("Installing Gunicorn...")
        subprocess.check_call([sys.executable, "-m", "pip", "install", "gunicorn"])

    # Build gunicorn command
    cmd = [
        sys.executable, "-m", "gunicorn",
        "--workers", str(workers),
        "--worker-class", "sync",
        "--bind", f"{host}:{port}",
        "--timeout", str(timeout),
        "--access-logfile", "-",
        "--error-logfile", "-",
        "--log-level", log_level,
        "--max-requests", "5000",
        "--max-requests-jitter", "500",
        "--graceful-timeout", "30",
        "wsgi:app"
    ]

    print("Starting server...")
    print("")

    try:
        subprocess.run(cmd, check=True)
    except KeyboardInterrupt:
        print("\n\nServer shutdown requested.")
        sys.exit(0)
    except Exception as e:
        print(f"Error starting server: {e}", file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    main()
