# IT Overview

Web-based warehouse inventory counting app. Python/Flask, React, SQLite. Runs on Windows 10/11 or Windows Server 2022. No firewall changes required.

## Architecture

```
Users (port 80/443)
      │
  nginx (PC) / IIS (Server)   ← existing open port, HTTPS termination
      │
  localhost:8081               ← Waitress 64 threads (Windows) / Gunicorn (Linux)
      │
  Flask + SQLite (WAL)         ← inventory.db, localhost only
```

Port 8081 is bound to 127.0.0.1 — not exposed to the network, no firewall rule needed.

## Capacity

| Metric | Value |
|--------|-------|
| Concurrent users | 50 |
| Threads (Windows) | 64 (Waitress) |
| DB write timeout | 30 seconds |
| Comfortable DB size | Up to 1 GB |

## Security

| Control | Detail |
|---------|--------|
| Passwords | PBKDF2-SHA256 (Werkzeug) — never stored plaintext |
| Roles | `counter` (submit only) / `admin` (full access) |
| HTTP headers | X-Content-Type-Options, X-Frame-Options, X-XSS-Protection, HSTS (when HTTPS) |
| TLS | 1.2 and 1.3 only when HTTPS enabled |
| File uploads | JPG/PNG only, UUID filenames, 50 MB nginx limit |
| SQL | All queries parameterized |
| Network | Flask binds 127.0.0.1 only |

**Action items:** Change default admin password. Enable HTTPS before going live. Set up daily backup.

## Backup

Back up all three files together — a consistent restore requires all three:

| Path | Criticality |
|------|-------------|
| `inventory.db` | Critical |
| `inventory.db-wal` | Critical |
| `inventory.db-shm` | Critical |
| `uploads/` | Important (photos) |

```bat
:: Add to Windows Task Scheduler — daily
powershell -Command "Compress-Archive -Path inventory.db,inventory.db-wal,inventory.db-shm,uploads -DestinationPath D:\Backups\inventory_%date:~-4,4%%date:~-10,2%%date:~-7,2%.zip -Force"
```

**Recovery:** Stop server → restore files → `python run_production.py`.

## New Machine Deployment

- [ ] Install Python 3.8+ (Add to PATH)
- [ ] Install Node.js 18+ (build only, not needed at runtime)
- [ ] Copy application folder
- [ ] Copy `inventory.db*` and `uploads/` (or let `setup.bat` create a fresh DB)
- [ ] Run `setup.bat`
- [ ] Verify: `http://localhost:8081`
- [ ] Run `setup_nginx_proxy.bat` (PC) or `setup_iis_proxy.ps1` (Server)
- [ ] Verify: `http://MACHINE-NAME`
- [ ] Enable HTTPS: `python setup_ssl.py` → `setup_nginx_proxy.bat`
- [ ] Schedule daily backup in Task Scheduler

## Common Issues

| Problem | Fix |
|---------|-----|
| Port 8081 in use | `netstat -ano \| findstr :8081` → `taskkill /PID <id> /F` |
| 502 Bad Gateway | App server not running — start `run_production.py` first |
| Camera fails on phone | HTTPS required — `python setup_ssl.py` then `setup_nginx_proxy.bat` |
| DB locked error | Retries automatically within 30 s — no action needed |
| Slow dashboard | Expected on large DB (>1 M records) — archive old sessions |

## Logs

- **App:** stdout of `run_production.py`
- **nginx access:** `nginx\logs\access.log`
- **IIS:** `%SystemDrive%\inetpub\logs\LogFiles\`
- **Migration history:** `SELECT * FROM _migrations` in `inventory.db`
