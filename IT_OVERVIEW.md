# Physical Inventory System — IT Operations Overview

## Executive Summary

Web-based warehouse inventory counting application. Python/Flask backend, React frontend, SQLite database. Supports 50 concurrent users. No firewall changes required — all external traffic routes through port 80/443 (already open).

**Version:** 1.0.0 | **Status:** Production Ready | **Platform:** Windows Server 2022 / Windows 10+

---

## Technology Stack

### Backend
| Component | Technology |
|-----------|-----------|
| Language | Python 3.8+ |
| Framework | Flask 3.0.3 (application layer only) |
| Production server (Windows) | Waitress 3.0.1 — 64 threads |
| Production server (Linux) | Gunicorn 21.2.0 — multi-process |
| Database | SQLite 3 with WAL mode |
| Password hashing | Werkzeug PBKDF2-SHA256 |
| Excel import | openpyxl 3.1.5 |
| Image processing | Pillow 11.0.0 |

### Frontend
| Component | Technology |
|-----------|-----------|
| Framework | React 19 with TypeScript |
| Build tool | Vite |
| Styling | Tailwind CSS |
| Barcode scanning | zxing (camera) + Zebra Bluetooth scanner |

### Proxy Layer
| Deployment | Proxy | Handles |
|------------|-------|---------|
| Windows PC | nginx (portable, no install) | Port 80 → localhost:8081, optional HTTPS on 443 |
| Windows Server | IIS + ARR module | Port 80/443 → localhost:8081 |

---

## Architecture

```
Users (browser / phone)
         │
    Port 80 or 443          ← nginx or IIS (existing open port)
         │ HTTPS termination, security headers, access logs
         │
   localhost:8081           ← Waitress (Windows) or Gunicorn (Linux)
         │ 64 threads, handles 50 concurrent users
         │
     Flask app              ← routes, business logic, serves React
         │
  SQLite (WAL mode)         ← inventory.db (localhost only)
```

**Port 8081 is bound to 127.0.0.1 only.** It is not visible on the network and requires no firewall rule.

---

## Capacity

| Metric | Value |
|--------|-------|
| Concurrent users | **50** (tested) |
| Concurrent threads | 64 (Waitress, Windows) |
| Simultaneous reads | Unlimited (SQLite WAL) |
| Simultaneous writes | Serialized, ~50ms each, 30s timeout |
| Database size (comfortable) | Up to 1GB / ~5M records |
| Photo storage | Up to 50GB on local disk |

---

## Database

- **Type:** SQLite 3.45+ with Write-Ahead Logging (WAL)
- **File:** `inventory.db` (+ `inventory.db-wal`, `inventory.db-shm`)
- **Migrations:** 15, auto-applied on startup, tracked in `_migrations` table
- **Concurrency:** WAL allows concurrent reads; writes serialize with 30-second timeout
- **Integrity:** ACID transactions with automatic rollback on failure

### Key Tables
| Table | Purpose |
|-------|---------|
| `users` | Authentication — username, hashed password, role |
| `inventory_sessions` | Inventory count events |
| `counts` | Individual item count records |
| `photos` | Photo metadata (files stored in `uploads/`) |
| `audit_log` | Immutable change history for all counts |
| `sap_materials` | Material master cache (MARA/MAKT) |
| `sap_mard` | Warehouse stock levels |
| `sap_mseg` | Material movements |
| `sap_lgap` / `sap_lgplo` | Storage bin master and fixed bin assignments |
| `sap_snapshot` | Stock on hand at inventory freeze |
| `message_threads` | Counter ↔ office Q&A threads |

---

## Deployment

### System Requirements
- OS: Windows Server 2022 or Windows 10/11 Pro
- Python: 3.8 or higher
- Node.js: 18+ (for building frontend — not needed at runtime)
- Disk: 2GB minimum, 10GB+ recommended (photos grow over time)
- RAM: 512MB minimum, 1GB+ recommended

### First-Time Setup
```bat
setup.bat                    ← installs dependencies, builds frontend, seeds DB
python run_production.py     ← starts application on localhost:8081
setup_nginx_proxy.bat        ← starts nginx proxy on port 80
```

### Enable HTTPS (Recommended)
```bat
python setup_ssl.py          ← generates self-signed cert.pem + key.pem
setup_nginx_proxy.bat        ← detects cert and switches to port 443 automatically
```

Users install the certificate once per device (instructions printed by setup_ssl.py).

### Windows Server (IIS)
```powershell
# Run as Administrator — installs ARR, creates proxy rule
.\setup_iis_proxy.ps1
```

### Daily Startup
```bat
python run_production.py     ← start app
setup_nginx_proxy.bat        ← start proxy (if not running)
```

### Firewall
**No changes required.** Traffic routes through port 80/443, which is already open on all corporate networks. Port 8081 is localhost-only and not exposed to the network.

---

## Security

### What's In Place
| Control | Implementation |
|---------|---------------|
| Password storage | PBKDF2-SHA256 hash (Werkzeug) — plaintext never stored |
| Role-based access | Two roles: `counter` (submit only) and `admin` (full access) |
| HTTP security headers | X-Content-Type-Options, X-Frame-Options, X-XSS-Protection, Referrer-Policy, Permissions-Policy |
| HSTS (when HTTPS enabled) | Strict-Transport-Security on all responses |
| TLS (when enabled) | TLS 1.2 and 1.3 only; weak ciphers disabled |
| File upload | JPG/PNG only; UUID filename; size limited at nginx layer |
| SQL injection | All queries parameterized — no string concatenation |
| Path traversal | send_from_directory() enforces root boundary |
| Network exposure | Flask binds to 127.0.0.1 only |

### Known Limitations
- Authentication uses a custom header (`x-username`) — no session cookies or JWT tokens
- SQLite database file is not encrypted at rest
- Photo files in `uploads/` are not encrypted at rest
- Self-signed certificate will show browser warning until installed on devices

### Recommendations
1. Change default admin password immediately after setup
2. Enable HTTPS (`python setup_ssl.py`) before going live
3. Restrict filesystem access to `uploads/` and `inventory.db*` to the service account
4. Set up daily automated backups (see Backup section)
5. Review `audit_log` table periodically for unexpected changes

---

## File Storage

- **Photos:** `uploads/` directory, UUID-named JPG/PNG files
- **No size limit enforced at Flask level** — nginx limits uploads to 50MB per request
- **Retention:** Permanent until manually archived
- **Growth estimate:** ~500MB–1GB per year (10–20 photos per session)

---

## Backup & Recovery

### What to Back Up
| Item | Criticality | Notes |
|------|-------------|-------|
| `inventory.db` | Critical | Main database |
| `inventory.db-wal` | Critical | WAL log — must back up with .db |
| `inventory.db-shm` | Critical | Shared memory — must back up with .db |
| `uploads/` | Important | Photo attachments |

**All three `.db*` files must be backed up together.**

### Backup Command (Windows Task Scheduler)
```bat
powershell -Command "Compress-Archive -Path inventory.db,inventory.db-wal,inventory.db-shm,uploads -DestinationPath D:\Backups\inventory_%date:~-4,4%%date:~-10,2%%date:~-7,2%.zip -Force"
```

### Recovery Procedure
1. Stop the server (close `run_production.py` window)
2. Restore all three `inventory.db*` files and `uploads/` from backup
3. Restart: `python run_production.py`
4. Verify: log in and confirm recent data is present

### Recovery Time Objectives
| Scenario | RTO | Data Loss |
|----------|-----|-----------|
| App crash | 2 min (restart) | None |
| DB corruption | 30 min (restore) | Up to 1 day |
| Full disk | 1 hour (clear + restore) | Up to 1 day |
| Hardware failure | 2 hours (new machine + restore) | Up to 1 day |

---

## Monitoring & Health Checks

### Daily
```bat
REM Check app is responding
curl http://localhost:8081/health

REM Check proxy is up
curl http://localhost/health

REM Check database file sizes
dir inventory.db*

REM Check uploads growth
powershell -Command "(Get-ChildItem uploads -Recurse | Measure-Object Length -Sum).Sum / 1MB"
```

### Alert Thresholds
| Metric | Alert At |
|--------|---------|
| Database file | > 500MB |
| uploads/ folder | > 20GB |
| Response time | > 3 seconds |
| Disk free space | < 5GB |

### Logs
- **App logs:** stdout of `run_production.py` (redirect to file if needed)
- **Access logs:** nginx logs in `nginx\logs\access.log` (Windows PC)
- **IIS logs:** `%SystemDrive%\inetpub\logs\LogFiles\` (Windows Server)
- **Migration history:** `SELECT * FROM _migrations` in `inventory.db`

---

## Routine Maintenance

| Task | Frequency | How |
|------|-----------|-----|
| Backup | Daily | Automated (Task Scheduler) |
| Archive old photos | Quarterly | Move `uploads/` files to network share |
| Check disk space | Weekly | `df -h` or Windows Storage |
| User access review | Monthly | Admin → Users in the app |
| Update dependencies | Quarterly | `pip install -r requirements.txt --upgrade` |
| Certificate renewal | Every 2 years | Re-run `python setup_ssl.py` + `setup_nginx_proxy.bat` |

---

## New Machine Deployment

- [ ] Install Python 3.8+ (check "Add to PATH")
- [ ] Install Node.js 18+ (for frontend build only)
- [ ] Copy application folder to new machine
- [ ] Copy `inventory.db`, `inventory.db-wal`, `inventory.db-shm` (existing data) OR let setup.bat create a fresh database
- [ ] Copy `uploads/` folder (existing photos)
- [ ] Run `setup.bat`
- [ ] Run `python run_production.py` — verify on http://localhost:8081
- [ ] Run `setup_nginx_proxy.bat` — verify on http://MACHINE-NAME
- [ ] If HTTPS: run `python setup_ssl.py` then `setup_nginx_proxy.bat`
- [ ] Set up daily backup in Task Scheduler
- [ ] **No firewall changes needed**

---

## Common Issues

| Problem | Cause | Fix |
|---------|-------|-----|
| "Port 80 in use" | IIS or another server running | Stop it, then re-run `setup_nginx_proxy.bat` |
| "Port 8081 in use" | Previous run still active | `netstat -ano \| findstr :8081` → `taskkill /PID <id> /F` |
| Camera not working | HTTPS required for getUserMedia | Run `python setup_ssl.py` + `setup_nginx_proxy.bat` |
| Slow dashboard | Large database (>1M records) | Expected; archive old sessions |
| Photos not showing | Wrong path or disk full | Check `uploads/` exists; check disk space |
| DB locked error | Write collision (extremely rare) | Retries automatically within 30s; no action needed |

---

**Last Updated:** 2026-05-14
