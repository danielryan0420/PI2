# Physical Inventory System - IT Operations Overview

## Executive Summary

The Physical Inventory System is a web-based inventory management application designed for warehouse and asset counting operations. It combines a Python/Flask REST API backend with a React frontend to provide real-time inventory tracking, barcode scanning, photo documentation, and comprehensive audit trails.

**Current Version:** 1.0.0  
**Status:** Production Ready  
**Platform:** Cross-platform (Windows, Mac, Linux)

---

## Technology Stack

### Backend
- **Language:** Python 3.8+
- **Framework:** Flask 3.0.3
- **Database:** SQLite (file-based)
- **Key Dependencies:**
  - Flask-CORS 4.0.0 (API cross-origin requests)
  - python-socketio 5.10.0 (real-time messaging)
  - Pillow 11.0.0 (image processing)
  - openpyxl 3.1.5 (Excel import/export)
  - cryptography 42.0.0+ (password hashing)

### Frontend
- **Framework:** React 19 with TypeScript
- **Build Tool:** Vite
- **Styling:** Tailwind CSS
- **Scanning:** zxing (barcode/QR camera support)
- **Mobile:** Responsive design, Bluetooth Zebra scanner support

### Development
- **Node.js:** 18+ required
- **Package Manager:** npm
- **Build Process:** Single-command build to production bundle

---

## Architecture

### Application Structure
```
Physical_Inventory/
├── server.py              # Flask REST API (port 8081)
├── database.py            # SQLite setup, migrations, schema
├── services.py            # Business logic & data access layer
├── init_db.py             # Database initialization script
├── requirements.txt       # Python dependencies
├── client/                # React frontend (source)
│   ├── src/               # TypeScript/React source code
│   └── dist/              # Built frontend (served by Flask)
└── uploads/               # User-uploaded photos (file storage)
```

### Deployment Model
- **Single-Server Monolith:** Backend and frontend deployed together
- **Port:** 8081 (default, configurable)
- **Frontend Delivery:** Static files served from Flask
- **Database:** Local SQLite file (`inventory.db`) in app directory

### Key Components
1. **REST API:** 50+ endpoints for users, sessions, counts, materials, audit logs
2. **Database Layer:** 14+ migration-based tables with auto-applied schema updates
3. **File Storage:** Local directory (`uploads/`) for JPG/PNG photo attachments
4. **User Authentication:** Username/password with role-based access (counter, admin)
5. **Real-Time Messaging:** Socket.io for live Q&A between counters and office staff

---

## Database

### Storage
- **Type:** SQLite 3 (embedded, zero-configuration)
- **File Location:** `inventory.db` (app root directory)
- **Size:** Grows with transaction history; typical 10-100MB for active warehouses
- **Schema:** Auto-migrated on startup (14 migrations defined in `database.py`)

### Key Tables
| Table | Purpose |
|-------|---------|
| `users` | Authentication (counter, admin roles) |
| `inventory_sessions` | Physical count batches/events |
| `counts` | Individual inventory count records |
| `photos` | Photo metadata (files in `uploads/`) |
| `audit_log` | Complete change history |
| `sap_*` | SAP master data cache (MARA, MARC, MBEW, etc.) |
| `message_threads` | Q&A between counters and office |

### Data Retention
- No built-in data purging; relies on manual archival
- Audit log preserves all historical changes indefinitely
- Photos stored indefinitely in `uploads/` folder

---

## Deployment & Running the Application

### System Requirements
- **OS:** Windows, macOS, or Linux
- **Python:** 3.8 or higher
- **Node.js:** 18+ (for building frontend only; not needed for production runtime)
- **Disk Space:** 500MB minimum (1GB+ recommended with photo history)
- **Memory:** 256MB minimum (512MB+ recommended)
- **Network:** None required (fully offline-capable)

### Production Start
```bash
python3 server.py
```
- Starts Flask on `http://localhost:8081`
- Automatically initializes/migrates SQLite database on first run
- Serves pre-built React frontend from `client/dist/`
- Listens for HTTP requests only (no HTTPS by default)

### Production Build
```bash
cd client && npm run build && cd ..
python3 server.py
```
- Builds optimized React bundle (`client/dist/`)
- One-command startup with no further build needed

### Development Mode
```bash
# Terminal 1
python3 server.py

# Terminal 2
cd client && npm run dev
```
- Backend on port 8081
- Frontend dev server on port 5173
- Hot-reload enabled for React changes

---

## Security Considerations

### Authentication & Authorization
- **Username/Password:** Stored as cryptographic hashes (PBKDF2/bcrypt equivalent)
- **Roles:** Two-tier system (counter, admin)
- **Session Token:** Tracked via `x-username` HTTP header (stateless)
- **Default Credentials:** Should be changed immediately after initialization

### Data Protection
- **In Transit:** HTTP only by default (add reverse proxy for HTTPS)
- **At Rest:** Plaintext SQLite file; no encryption
- **Photos:** Stored unencrypted in `uploads/` directory
- **Audit Log:** Immutable records of all changes for compliance

### API Security
- **CORS Enabled:** Allows cross-origin requests (verify origin restrictions)
- **File Upload:** Limited to JPG/PNG; filename sanitized with UUID
- **Input Validation:** Present on critical fields; validate at API boundary
- **SQL Injection:** Protected by parameterized queries

### Recommendations
1. Deploy behind HTTPS reverse proxy (nginx/Apache)
2. Restrict file access to `uploads/` directory
3. Regularly rotate admin passwords
4. Archive old `inventory.db` files for compliance
5. Monitor upload directory growth

---

## Performance & Capacity

### Expected Load
- **Concurrent Users:** 20-50 (typical warehouse team)
- **Throughput:** 100+ counts/minute (single user)
- **Response Time:** <500ms for API calls
- **Database:** SQLite handles up to millions of records efficiently

### Optimization Notes
- **Indexes:** Present on material_number, session_id, created_at fields
- **Query Performance:** Optimized for read-heavy workloads (counts are immutable after verification)
- **Photo Storage:** Disk I/O may bottleneck with >10GB of photos; consider external storage or cleanup
- **Scaling:** SQLite is single-writer; for >100 concurrent users, upgrade to PostgreSQL/MySQL

### Monitoring Points
- `inventory.db` file size (should grow predictably, not exponentially)
- `uploads/` directory disk usage
- Response times for dashboard/report APIs
- Concurrent user count via activity log

---

## File Storage & Uploads

### Photo Management
- **Location:** `uploads/` directory (relative to app root)
- **Format:** JPEG, PNG only
- **Size Limits:** Enforced at UI level (adjust in `server.py` if needed)
- **Naming:** UUID-based, preserves original filename as metadata
- **Retention:** Permanent unless manually deleted

### Disk Space Considerations
```
Typical disk usage:
- Database (inventory.db): 10-50MB
- Photos (uploads/): 100MB-1GB per year (assuming 10-20 photos/session)
- Backup: Double the above
```

### Recommended Management
1. Monthly photos cleanup: archive & compress old sessions
2. Quarterly database backups
3. Monitor `du -sh uploads/` growth rate

---

## Backup & Recovery

### What to Backup
1. **`inventory.db`** - Primary data (CRITICAL)
2. **`uploads/` folder** - Photo attachments
3. **`SLOC and Material Master` data** - Imported from SAP

### Backup Strategy
- **Frequency:** Daily (automated via cron/Task Scheduler)
- **Method:** Copy files to network storage or cloud
- **Retention:** 30 days rolling + monthly archives
- **Verification:** Test restore monthly

### Backup Command
```bash
# Windows
powershell -Command "Compress-Archive -Path inventory.db,uploads -DestinationPath backup_$(Get-Date -Format 'yyyyMMdd').zip -Force"

# Linux/Mac
tar -czf backup_$(date +%Y%m%d).tar.gz inventory.db uploads/
```

### Recovery Procedure
1. Stop the application: `python3 server.py` → Ctrl+C
2. Restore `inventory.db` and `uploads/` from backup
3. Restart application: `python3 server.py`
4. Verify data integrity in UI

---

## Maintenance & Monitoring

### Routine Maintenance Tasks
| Task | Frequency | Effort |
|------|-----------|--------|
| Database backup | Daily | Automated |
| Review audit log for anomalies | Weekly | 15 min |
| Monitor disk space | Weekly | 5 min |
| Update Python/Node deps | Quarterly | 1 hour |
| Clear old photos (if needed) | Quarterly | 30 min |
| User access review | Monthly | 30 min |

### Health Checks
- **Application starts:** Verify port 8081 accessible
- **Database accessible:** Login with test user
- **API responsive:** Curl `/api/users` returns 200
- **Photos loadable:** Verify image files in `uploads/` directory

### Logs & Debugging
- **Python logs:** Stdout (no file logging configured)
- **HTTP access:** Not logged by default (add nginx reverse proxy for access logs)
- **Database schema:** View applied migrations in `_migrations` table

### Common Issues & Resolution

**Port 8081 already in use:**
```bash
# Windows: netstat -ano | findstr :8081 → taskkill /PID <id> /F
# Linux: lsof -i :8081 → kill -9 <PID>
# Mac: lsof -i :8081 → kill -9 <PID>
```

**Database locked/corrupted:**
```bash
# Restore from backup and restart
python3 server.py
```

**Photos not loading:**
- Verify `uploads/` directory exists and is readable
- Check disk space availability
- Review file permissions (755 recommended)

**React not building (development):**
```bash
cd client && rm -rf node_modules package-lock.json && npm install && npm run build
```

---

## Disaster Recovery

### Recovery Time Objectives (RTOs)
| Scenario | RTO | Data Loss |
|----------|-----|-----------|
| Application crash | 5 min (restart) | None |
| Database file corruption | 30 min (restore backup) | <1 day |
| Photos lost | 1 hour (restore uploads/) | <1 day |
| Complete system failure | 2 hours (full restore) | <1 day |

### Backup Schedule
- **Automated:** Daily at 2 AM (configure with cron/Task Scheduler)
- **Retention:** 7 daily + 4 weekly + 12 monthly backups
- **Test:** Monthly restore verification

---

## Deployment on New Hardware

### Setup Checklist
- [ ] Install Python 3.8+ and Node.js 18+
- [ ] Clone or transfer application files
- [ ] Copy `inventory.db` (or run `python3 init_db.py` for new database)
- [ ] Copy `uploads/` folder (if migrating existing data)
- [ ] Run: `pip install -r requirements.txt`
- [ ] Build frontend: `cd client && npm install && npm run build && cd ..`
- [ ] Test: `python3 server.py` → verify on http://localhost:8081
- [ ] Configure firewall (open port 8081 or reverse proxy port)
- [ ] Set up automated backup

---

## Support & Documentation

### Internal Support
- **Administrator Guide:** See `README.md` (user roles, features, API endpoints)
- **Troubleshooting:** See "Common Issues" section above
- **Contact:** Development team

### Monitoring Dashboard
- Available at: `http://localhost:8081/admin` (login required)
- View: Active sessions, user activity, count statistics, audit logs

### Performance Tuning
For large deployments (>50 concurrent users or >10M records):
1. Migrate to PostgreSQL backend
2. Add caching layer (Redis)
3. Implement load balancing (nginx)
4. Archive historical data to data warehouse

---

## Version & Change Log

**Current:** 1.0.0 (Production)

### Migration Status
All 14 database migrations automatically applied on startup:
- `001_core.sql` - Users, sessions, counts tables
- `002_messages.sql` - Messaging system
- `003_audit.sql` - Audit logging
- `004_sap_master.sql` - SAP data cache
- `005_snapshot.sql` - Inventory snapshots
- `006-014` - Schema refinements & feature additions

---

**Document Date:** May 2026  
**Last Updated:** 2026-05-14  
**Reviewed By:** IT Operations  
