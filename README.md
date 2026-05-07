# Physical Inventory System

A Python/Streamlit-based inventory management system with support for QR/barcode scanning, photo capture, and multi-role workflows.

## Features

- **Counter Interface**: Capture inventory counts with barcode/QR scanning and photo attachments
- **Manual & Bulk Entry**: Manual count entry and bulk import via Excel
- **Configuration**: SLOC management, material master data, WM bin setup (admin only)
- **Admin Tools**: Session management, user administration, comprehensive audit logs
- **Dashboard**: Real-time analytics, discrepancy detection, counter performance tracking
- **Mobile-Friendly**: Works on tablets and phones with Bluetooth Zebra scanner support

## Installation

### Prerequisites
- Python 3.8+
- pip

### Setup

1. Create a virtual environment:
```bash
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
```

2. Install dependencies:
```bash
pip install -r requirements.txt
```

3. Initialize the database (automatic on first run)

4. Create initial admin user:
```bash
python init_db.py
```

## Quick Start

```bash
pip install -r requirements.txt
python3 init_db.py        # Creates admin and counter users
streamlit run app.py      # Runs at http://localhost:8501
```

**Test Credentials:**
- `admin` (admin role - full access)
- `counter1`, `counter2` (counter role - limited access)

## Running the Application

```bash
streamlit run app.py
```

The app will be available at `http://localhost:8501`

## User Roles

### Counter
- Submit inventory counts with camera-based barcode scanning
- Attach photos to counts
- View recent submissions
- View dashboard

### Admin
- Submit inventory counts (full counter access)
- Manual count entry and bulk import
- Manage SLOC configurations
- Maintain material master data
- Configure WM bins and storage locations
- Create and manage inventory sessions
- User administration (create, update roles)
- View comprehensive audit logs
- Access full dashboard features

## Project Structure

```
.
├── app.py                 # Main Streamlit application
├── database.py            # SQLite database setup and migrations
├── services.py            # Business logic layer
├── requirements.txt       # Python dependencies
├── pages/
│   ├── counter.py        # Counter interface
│   ├── entry.py          # Manual entry and bulk import
│   ├── office.py         # Office management
│   ├── admin.py          # Admin tools
│   └── dashboard.py      # Analytics dashboard
└── uploads/              # Photo storage directory

```

## Database

SQLite database automatically migrates on startup. Database file: `inventory.db`

## Features in Detail

### Barcode Scanning
- **Phone Camera**: Click "Scan" button to use device camera (requires HTTPS in production)
- **Bluetooth Scanner**: Zebra scanners appear as keyboard input, press Enter to advance fields

### Photo Management
- Attach multiple photos to each count
- Photos stored in `uploads/` directory (not in database to keep it lean)
- Automatic file naming with unique identifiers

### Audit Trail
- Every count creation, modification, and verification is logged
- Tracks who made changes, when, and what changed
- Available in Admin > Audit Log

### Discrepancy Detection
- Compares counted quantities with SAP snapshots
- Highlights high-variance items (>10% difference)
- Helps identify potential stock issues

## Known Limitations

- Single-user SQLite database (suitable for small to medium deployments)
- Real-time updates require browser refresh
- Camera scanning requires HTTPS in production environments
