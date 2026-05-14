#!/usr/bin/env python3
"""
Production startup script for Physical Inventory System
Handles 25+ concurrent users on Windows, macOS, and Linux.

  Windows  → Waitress  (multi-threaded, Windows-native)
  Linux    → Gunicorn  (multi-process, Unix-only)
  macOS    → Gunicorn  (multi-process, Unix-only)

Usage:
    python run_production.py

Environment variables (all optional):
    PORT      Port to listen on          (default: 8081)
    THREADS   Waitress thread count      (default: 32, Windows only)
    WORKERS   Gunicorn worker count      (default: 2*CPUs+1, Linux/Mac only)
    TIMEOUT   Request timeout seconds   (default: 60)
    HOST      Bind address              (default: 127.0.0.1)
"""

import os
import sys
import multiprocessing
import subprocess

HOST    = os.environ.get('HOST',    '127.0.0.1')
PORT    = int(os.environ.get('PORT',    '8081'))
TIMEOUT = int(os.environ.get('TIMEOUT', '60'))

def _cpu_count():
    try:
        return multiprocessing.cpu_count()
    except Exception:
        return 4

def _banner(server, concurrency_label, concurrency_value):
    print("=" * 58)
    print("  Physical Inventory System — PRODUCTION")
    print("=" * 58)
    print(f"  Server   : {server}")
    print(f"  Bind     : {HOST}:{PORT}  (localhost only — no firewall needed)")
    print(f"  {concurrency_label:<9}: {concurrency_value}")
    print(f"  Timeout  : {TIMEOUT}s")
    print("=" * 58)
    print()

def run_waitress():
    """Windows production server — multi-threaded, no fork() required."""
    try:
        import waitress
    except ImportError:
        print("Installing waitress...")
        subprocess.check_call([sys.executable, "-m", "pip", "install", "waitress==3.0.1"])
        import waitress

    threads = int(os.environ.get('THREADS', '64'))
    _banner("Waitress (Windows)", "Threads", threads)

    from wsgi import app
    waitress.serve(
        app,
        host=HOST,
        port=PORT,
        threads=threads,
        connection_limit=256,
        cleanup_interval=30,
        channel_timeout=TIMEOUT,
        asyncore_use_poll=True,
    )

def run_gunicorn():
    """Linux/macOS production server — multi-process."""
    try:
        import gunicorn
    except ImportError:
        print("Installing gunicorn...")
        subprocess.check_call([sys.executable, "-m", "pip", "install", "gunicorn==21.2.0"])

    workers = int(os.environ.get('WORKERS', (_cpu_count() * 2) + 1))
    _banner("Gunicorn (Linux/macOS)", "Workers", workers)

    cmd = [
        sys.executable, "-m", "gunicorn",
        "--workers",              str(workers),
        "--worker-class",         "sync",
        "--bind",                 f"{HOST}:{PORT}",
        "--timeout",              str(TIMEOUT),
        "--access-logfile",       "-",
        "--error-logfile",        "-",
        "--log-level",            "info",
        "--max-requests",         "5000",
        "--max-requests-jitter",  "500",
        "--graceful-timeout",     "30",
        "wsgi:app",
    ]
    try:
        subprocess.run(cmd, check=True)
    except KeyboardInterrupt:
        pass

if __name__ == "__main__":
    if sys.platform == "win32":
        run_waitress()
    else:
        run_gunicorn()
