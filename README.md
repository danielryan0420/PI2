# Physical Inventory System

A Python/Flask backend + React frontend inventory management system with support for QR/barcode scanning, photo capture, and multi-role workflows.

## Features

- **Beautiful React UI**: Full-featured React frontend with Tailwind CSS styling
- **Python Backend**: Flask-based REST API with SQLite database
- **Counter Interface**: Capture inventory counts with camera-based barcode/QR scanning and photo attachments
- **Admin Features**: Manual entry, bulk import, SLOC management, material master data, WM bin configuration
- **Analytics**: Real-time dashboard with discrepancy detection and counter performance tracking
- **Mobile-Friendly**: Works on tablets and phones with Bluetooth Zebra scanner support
- **Audit Trail**: Complete audit logging of all count modifications

## Tech Stack

- **Backend**: Python 3.8+, Flask, SQLite
- **Frontend**: React 19, TypeScript, Tailwind CSS, Vite
- **Scanning**: zxing (camera) + Bluetooth keyboard input (Zebra scanners)

## Installation

### Prerequisites
- Python 3.8+ 
- Node.js 18+ (for building React)

### Setup

1. **Clone and enter the project:**
```bash
cd C:\Users\danie\Desktop\Projects\Physical_Inventory
```

2. **Install Python dependencies:**
```bash
pip install -r requirements.txt
```

3. **Install Node dependencies and build React:**
```bash
cd client
npm install
npm run build
cd ..
```

4. **Initialize database:**
```bash
python3 init_db.py
```

## Running the Application

### Development (with React hot reload)

Terminal 1 - Python backend:
```bash
python3 server.py
```

Terminal 2 - React dev server:
```bash
cd client
npm run dev
```

Then open http://localhost:5173

### Production

```bash
python3 server.py
```

App will be available at http://localhost:8081

## User Roles

### Counter
- Submit inventory counts with camera barcode scanning
- Attach photos to counts
- View dashboard and recent submissions

### Admin
- Full counter access
- Manual count entry and bulk import
- Manage SLOC configurations
- Maintain material master data
- Configure WM bins and storage locations
- Create and manage inventory sessions
- User administration
- View comprehensive audit logs

## Default Credentials

After running `python3 init_db.py`:
- **Admin**: `admin` / `admin`
- **Counters**: `counter1`, `counter2` / any

## Project Structure

```
.
├── server.py              # Flask API server
├── database.py            # SQLite setup & migrations
├── services.py            # Business logic layer
├── init_db.py             # Database initialization
├── requirements.txt       # Python dependencies
├── client/                # React frontend
│   ├── src/
│   │   ├── pages/         # Page components
│   │   ├── components/    # React components
│   │   ├── lib/           # Utilities & API client
│   │   ├── context/       # React context
│   │   └── types/         # TypeScript types
│   ├── package.json
│   ├── vite.config.ts
│   ├── tailwind.config.js
│   └── dist/              # Built React app (generated)
└── uploads/               # Photo storage directory
```

## Features in Detail

### Barcode Scanning
- **Phone Camera**: Click "Scan" button to use device camera (works on mobile)
- **Bluetooth Scanner**: Zebra scanners appear as keyboard input, press Enter to advance fields

### Photo Management
- Attach multiple photos to each count
- Photos stored in `uploads/` directory
- Automatic file naming with unique identifiers

### Audit Trail
- Every count creation, modification, and verification is logged
- Tracks who made changes, when, and what changed
- Available in Admin > View Audit Log

### Discrepancy Detection
- Compares counted quantities with SAP snapshots
- Highlights high-variance items
- Helps identify potential stock issues

## API Endpoints

### Users
- `GET /api/users` - List all users
- `POST /api/users` - Create user
- `GET /api/users/<username>` - Get user details

### Sessions
- `GET /api/sessions` - List sessions
- `POST /api/sessions` - Create session
- `GET /api/sessions/<id>` - Get session
- `POST /api/sessions/<id>/close` - Close session

### Counts
- `POST /api/sessions/<id>/counts` - Create count
- `GET /api/sessions/<id>/counts` - List counts
- `GET /api/counts/<id>` - Get count
- `PATCH /api/counts/<id>` - Update count
- `POST /api/counts/<id>/verify` - Verify count
- `POST /api/counts/<id>/flag` - Flag count

### Photos
- `POST /api/counts/<id>/photos` - Upload photo
- `GET /api/counts/<id>/photos` - List photos
- `DELETE /api/photos/<id>` - Delete photo
- `GET /photos/<filename>` - View photo

### More
- Dashboard, materials, WM bins, messages, audit logs, etc.

See `server.py` for complete API documentation.

## Building for Production

```bash
# Build React
cd client
npm run build
cd ..

# Run Flask with built React
python3 server.py
```

Flask will serve the built React app from `/client/dist`.

## Troubleshooting

**Port 8081 already in use:**
```bash
# On Windows
netstat -ano | findstr :8081
taskkill /PID <PID> /F

# On Mac/Linux
lsof -i :8081
kill -9 <PID>
```

**Node modules not installing:**
```bash
cd client
rm -rf node_modules package-lock.json
npm install
```

**React not building:**
```bash
cd client
npm install
npm run build
```

## Database

SQLite database automatically migrates on startup. Database file: `inventory.db`

Migrations:
- `001_core.sql` - Base tables
- `002_messages.sql` - Messaging
- `003_audit.sql` - Audit log
- `004_sap_master.sql` - Material master
- `005_snapshot.sql` - SAP snapshots
- `006_nullable_count_message.sql` - Message schema fix
- `007_wm_bins.sql` - WM bin management
