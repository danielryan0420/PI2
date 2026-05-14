# Physical Inventory System

A Python/Flask backend + React frontend inventory management system for warehouse counting operations. Supports QR/barcode scanning, photo capture, SAP data imports, and multi-role workflows.

## Features

- **React UI** — Full-featured frontend with Tailwind CSS
- **Flask REST API** — SQLite database, 50+ endpoints
- **Counter Interface** — Camera barcode/QR scanning, photo attachments, Zebra scanner support
- **Admin Features** — Manual entry, bulk SAP import, SLOC management, WM bin configuration
- **Analytics** — Real-time dashboard with discrepancy detection and counter performance tracking
- **Audit Trail** — Complete logging of all count modifications
- **50 Concurrent Users** — Waitress (Windows) / Gunicorn (Linux) production server

## Tech Stack

- **Backend:** Python 3.8+, Flask 3.0.3, SQLite (WAL mode)
- **Production Server:** Waitress 3.0.1 (Windows) / Gunicorn 21.2.0 (Linux/Mac)
- **Proxy:** nginx (Windows PC) or IIS (Windows Server) on port 80/443
- **Frontend:** React 19, TypeScript, Tailwind CSS, Vite
- **Scanning:** zxing (camera) + Bluetooth keyboard input (Zebra scanners)

## Quick Setup (Windows)

**Step 1 — First time only:**
```bat
setup.bat
```
Installs dependencies, builds React, seeds the database.

**Step 2 — Start the app:**
```bat
python run_production.py
```

**Step 3 — Start the proxy:**
```bat
setup_nginx_proxy.bat
```
Users access the app at `http://YOUR-PC-NAME` — no port number, no firewall change.

See **QUICKSTART.md** for full instructions including HTTPS setup.

## User Roles

### Counter
- Submit inventory counts with camera barcode scanning
- Attach photos to counts
- View dashboard and recent submissions

### Admin
- All counter access plus:
- Manual count entry and bulk SAP import
- Manage SLOC configurations and WM bins
- Create and manage inventory sessions
- User administration and audit logs

## Default Credentials

| User | Password | Role |
|------|----------|------|
| `admin` | `admin` | Full access |
| `counter1` | *(any)* | Counter only |
| `counter2` | *(any)* | Counter only |

Change the admin password immediately after first login.

## Project Structure

```
Physical_Inventory/
├── server.py                # Flask application (routes, API)
├── services.py              # Business logic layer
├── database.py              # SQLite setup, WAL config, 15 migrations
├── wsgi.py                  # WSGI entry point for Waitress/Gunicorn
├── init_db.py               # Seed data (auto-runs on startup)
├── run_production.py        # Production server launcher (50 users)
├── run_production.sh        # Bash variant (Linux/Mac)
├── requirements.txt         # Python dependencies
├── setup.bat                # First-time Windows setup
├── update.bat               # Pull updates from GitHub
├── setup_ssl.py             # Generate SSL certificate for HTTPS
├── setup_nginx_proxy.bat    # nginx proxy setup (Windows PC)
├── setup_iis_proxy.ps1      # IIS proxy setup (Windows Server)
├── package.json             # Root npm scripts
├── client/                  # React frontend
│   ├── src/
│   │   ├── pages/           # Page components
│   │   ├── components/      # Reusable components
│   │   ├── lib/             # API client, utilities
│   │   ├── context/         # React context (session, toasts)
│   │   └── types/           # TypeScript interfaces
│   ├── vite.config.ts
│   └── dist/                # Built frontend (served by Flask)
├── uploads/                 # Photo attachments (back up daily)
└── inventory.db             # SQLite database (back up daily)
```

## Architecture

```
Users (port 80/443)
      │
  nginx / IIS          ← handles HTTPS, security headers, access logs
      │
localhost:8081
      │
  Waitress / Gunicorn  ← 64 threads (Windows) / 9 workers (Linux)
      │
  Flask app            ← routes, business logic, serves React
      │
  SQLite (WAL)         ← concurrent reads, serialized writes, ACID
```

Port 8081 is localhost-only — no firewall rule required.

## Running in Development

```bat
REM Terminal 1 — backend
python server.py

REM Terminal 2 — React hot reload
cd client
npm run dev
```

Open `http://localhost:5173` (Vite proxies API to port 8081).

## Features in Detail

### Barcode Scanning
- **Camera:** Click Scan button — uses device camera (HTTPS required on mobile)
- **Zebra Scanner:** Bluetooth keyboard mode — scan then press Enter

### SAP Integration
Imports master data directly from SAP exports (CSV or XLSX):
- MARA/MAKT — Material master and descriptions
- MARC — Plant data
- MBEW — Valuation
- MARD — Warehouse stock levels
- MSEG — Material movements
- LGAP / LGPLO — Storage bins and fixed bin assignments
- T300T — Storage locations
- Snapshot — Stock on hand at inventory freeze

### Photo Management
- Multiple photos per count
- Stored in `uploads/` directory
- UUID-based filenames, original name preserved as metadata

### Discrepancy Detection
- Compares counted quantities against SAP snapshots
- Highlights variance items
- SLOC-level and material-level breakdown

## Database

SQLite with WAL mode. 15 migrations auto-applied on startup:

| Migration | Purpose |
|-----------|---------|
| 001_core | Users, sessions, counts, photos |
| 002_messages | Counter ↔ office messaging |
| 003_audit | Audit log |
| 004_sap_master | Material master (MARA, MARC, MBEW) |
| 005_snapshot | SAP stock snapshot |
| 006_nullable_count_message | Message schema fix |
| 007_wm_bins | WM bin management |
| 008_add_password | User password column |
| 009_user_last_active | Activity tracking |
| 010_sap_ledger_tables | MARD, MSEG, LGAP, MLGT, MLGN, LQUA |
| 011_count_validation_warnings | Validation warning column |
| 012_lgplo | Fixed bin assignments |
| 013_message_threads | Thread-based Q&A |
| 014_message_reply_to | Reply threading |
| 015_counts_warnings_index | Validation warnings index |

## Backup

Back up these files daily:
```bat
REM Windows — run in Task Scheduler
powershell -Command "Compress-Archive -Path inventory.db,inventory.db-wal,inventory.db-shm,uploads -DestinationPath backup_%date:~-4,4%%date:~-10,2%%date:~-7,2%.zip -Force"
```

**Important:** Always back up `inventory.db`, `inventory.db-wal`, and `inventory.db-shm` together.

## Troubleshooting

**Port 8081 already in use:**
```bat
netstat -ano | findstr :8081
taskkill /PID <PID> /F
```

**Port 80 already in use (nginx won't start):**
Close IIS or any other web server, then re-run `setup_nginx_proxy.bat`.

**Camera not working on phone:**
HTTPS is required. Run `python setup_ssl.py` then `setup_nginx_proxy.bat`.

**Node modules not installing:**
```bat
cd client
rmdir /s /q node_modules
del package-lock.json
npm install
```
