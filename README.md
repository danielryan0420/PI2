# Physical Inventory System

Warehouse counting app — Python/Flask backend, React frontend, SQLite database. Up to 50 concurrent users. No firewall changes required.

## Setup (Windows, first time only)

```bat
setup.bat          :: installs dependencies, builds React, seeds DB
start.bat          :: starts app server + nginx proxy together
```

Users reach the app at `http://YOUR-PC-NAME` (no port number needed).

To stop: `stop.bat`. To update: `update.bat`.

**Access from another laptop or phone:** run `ipconfig` on the server PC, note the IPv4 address (e.g. `192.168.1.10`), then open `http://192.168.1.10` on any device on the same network.

## Enable HTTPS (required for camera scanning on phones)

```bat
python setup_ssl.py
setup_nginx_proxy.bat
```

Install the generated certificate on each device (instructions printed by setup_ssl.py). Users then access `https://YOUR-PC-NAME`.

## Default Credentials

| User | Password | Role |
|------|----------|------|
| `admin` | `admin` | Full access |
| `counter1` | *(any)* | Count entry only |
| `counter2` | *(any)* | Count entry only |

Change the admin password in Admin → Users immediately after setup.

## User Roles

**Counter** — submit counts, scan barcodes, attach photos, message office.

**Admin** — everything above plus: manual entry, SAP data import, session management, user admin, audit log, export.

## SAP Data Imports

Upload CSV or XLSX exports directly from SAP in Admin → SAP Data:

| Table | Source | Purpose |
|-------|--------|---------|
| MARA/MAKT | MM60 / SE16 | Material master and descriptions |
| MARC | SE16 | Plant-level material data |
| MBEW | SE16 | Valuation |
| MARD | MB52 | Warehouse stock (snapshot baseline) |
| MSEG | MB51 | Material movements |
| MLGT | LS26 | WM storage type data |
| MLGN | LS26 | WM storage section data |
| LQUA | LS26 | Bin quants (WM discrepancy check) |
| T300T | SE16 | Storage location descriptions |
| EKKO/EKPO | ME2M | Purchase order headers/lines |
| AUFK | CO03 | Production/process orders |
| RESB | MB25 | Open reservations |
| Snapshot | Custom | Stock freeze at count start |
| Exclusion list | — | Materials to exclude from SAP export |

All tables accept any SAP column — extra columns are captured automatically in `raw_data`.

## Exports

**Admin → Export → SAP Adjustment Export** — the main output. One row per material/SLOC where the count differs from the snapshot. Excluded materials are filtered out. Columns: Material, Description, Plant, SLOC, UOM, Snapshot Qty, Counted Qty, Adjustment.

**Admin → Export → Full Count Data** — all individual count records.

## Dashboard Warnings

- **Counts Over Snapshot** — materials counted higher than the MARD snapshot
- **WM Discrepancies** — bin-level differences between LQUA and final counts
- **Reservation Warnings** — materials counted below snapshot with open RESB reservations (risk of over-adjusting stock out)

Counters see open PO / production order / reservation warnings at count entry time.

## Architecture

```
Users (port 80/443)
      │
  nginx / IIS          ← port 80, no firewall rule needed
      │
localhost:8081
      │
  Waitress (Windows)   ← 64 threads
  Gunicorn (Linux)     ← multi-process
      │
  Flask + SQLite (WAL) ← ACID, concurrent reads, serialized writes
```

Port 8081 is localhost-only — not visible on the network.

## File Reference

| File | Purpose |
|------|---------|
| `start.bat` | Start everything (app + proxy) |
| `stop.bat` | Stop everything |
| `setup.bat` | First-time setup |
| `update.bat` | Pull updates from GitHub |
| `setup_ssl.py` | Generate SSL certificate |
| `setup_nginx_proxy.bat` | nginx proxy (Windows PC) |
| `setup_iis_proxy.ps1` | IIS proxy (Windows Server) |
| `run_production.py` | App server (used by start.bat) |
| `server.py` | Flask routes |
| `services.py` | Business logic |
| `database.py` | Schema + 20 migrations |
| `inventory.db` | SQLite database — back up daily |
| `uploads/` | Photo attachments — back up daily |

## Development

```bat
:: Terminal 1
python server.py

:: Terminal 2
cd client && npm run dev
```

Open `http://localhost:5173` — Vite proxies API calls to port 8081.

## Backup

Back up `inventory.db`, `inventory.db-wal`, `inventory.db-shm`, and `uploads/` together — all three `.db*` files are required for a consistent restore.

```bat
powershell -Command "Compress-Archive -Path inventory.db,inventory.db-wal,inventory.db-shm,uploads -DestinationPath backup_%date:~-4,4%%date:~-10,2%%date:~-7,2%.zip -Force"
```

## Troubleshooting

| Problem | Fix |
|---------|-----|
| Port 8081 in use | `netstat -ano \| findstr :8081` → `taskkill /PID <id> /F` |
| Camera not working on phone | HTTPS required — run `python setup_ssl.py` then `setup_nginx_proxy.bat` |
| 502 Bad Gateway | App server not running — start `run_production.py` first |
| Node modules error | `cd client && rmdir /s /q node_modules && del package-lock.json && npm install` |
