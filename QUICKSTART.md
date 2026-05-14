# Quick Start Guide

## First Time Setup

**Step 1 — Run setup (double-click `setup.bat`)**

Installs Python packages, builds the React frontend, and seeds the database.
Takes 2-3 minutes. Only needed once.

**Step 2 — Start everything (double-click `start.bat`)**

Launches the app server and proxy together in one click.
Users access the app at `http://YOUR-PC-NAME` — no port number needed.

To stop everything: double-click `stop.bat`.

---

### Manual startup (alternative to start.bat)

**Start the app:**
```bat
python run_production.py
```
Handles 50 concurrent users on Windows (Waitress) and Linux/Mac (Gunicorn).
Listens on `127.0.0.1:8081` — localhost only, no firewall rule needed.

**Start the proxy:**
```bat
setup_nginx_proxy.bat
```
Routes user traffic through port 80 (already open on any network).
Users access the app at `http://YOUR-PC-NAME` — no port number needed.

---

## Enable HTTPS (Recommended)

HTTPS is required for barcode camera scanning on phones and tablets.
Run once:

```bat
python setup_ssl.py
setup_nginx_proxy.bat
```

Users then access `https://YOUR-PC-NAME`. Install the certificate on each
device once (instructions printed by `setup_ssl.py`).

---

## Default Credentials

| User | Password | Role |
|------|----------|------|
| `admin` | `admin` | Full access |
| `counter1` | *(any)* | Counter only |
| `counter2` | *(any)* | Counter only |

Change the admin password in Admin → Users after first login.

---

## Daily Use

Double-click **`start.bat`** — starts both the app and proxy together.

To stop everything, double-click **`stop.bat`**.

---

## Updates

Double-click **`update.bat`** — pulls latest code from GitHub, rebuilds
the frontend, then prompts you to restart.

---

## Troubleshooting

**Port 80 already in use**
Close IIS or any other web server, then re-run `setup_nginx_proxy.bat`.

**Port 8081 already in use**
```bat
netstat -ano | findstr :8081
taskkill /PID <PID> /F
```

**React build fails**
```bat
cd client
rmdir /s /q node_modules
del package-lock.json
npm install
npm run build
cd ..
```

**Camera not working on phone**
HTTPS is required. Run `python setup_ssl.py` then `setup_nginx_proxy.bat`,
and install the certificate on the device.

---

## Windows Server (IIS)

Use `setup_iis_proxy.ps1` instead of `setup_nginx_proxy.bat`:

```powershell
# Run as Administrator
Set-ExecutionPolicy Bypass -Scope Process -Force
.\setup_iis_proxy.ps1
```

Routes through IIS on the existing port 80/443. No new firewall rules.

---

## File Reference

| File | Purpose |
|------|---------|
| `start.bat` | **Start everything** — app + proxy in one click |
| `stop.bat` | **Stop everything** — kills app server and nginx |
| `setup.bat` | First-time setup (run once) |
| `update.bat` | Pull latest updates from GitHub |
| `run_production.py` | App server only (used by start.bat) |
| `setup_nginx_proxy.bat` | Proxy only (used by start.bat) |
| `server.py` | Dev server — `python server.py` for local testing |
| `setup_ssl.py` | Generate SSL certificate for HTTPS |
| `setup_iis_proxy.ps1` | Configure IIS proxy (Windows Server) |
| `database.py` | Database schema and migrations |
| `services.py` | Business logic |
| `init_db.py` | Seed data (called automatically on startup) |
| `inventory.db` | SQLite database — back this up daily |
| `uploads/` | Photo attachments — back this up daily |
