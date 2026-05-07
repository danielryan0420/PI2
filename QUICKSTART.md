# Quick Start Guide - Windows

Get the Physical Inventory System running in 5 minutes.

## Step 1: Clone the Project

```powershell
cd C:\Users\danie\Desktop\Projects
git clone --branch claude/typescript-to-python-streamlit-xx0cO https://github.com/danielryan0420/Physical_Inventory.git
cd Physical_Inventory
```

## Step 2: Run Setup (Automated)

**Just double-click `setup.bat`** and wait for it to finish.

This will:
1. ✓ Install Python dependencies
2. ✓ Install Node dependencies
3. ✓ Build React frontend
4. ✓ Initialize database with seed data

Takes 2-3 minutes total.

## Step 3: Start the Application

```powershell
python server.py
```

You should see:
```
* Running on http://0.0.0.0:8081
```

## Step 4: Open in Browser

Go to: **http://localhost:8081**

## Login Credentials

| User | Password | Access |
|------|----------|--------|
| `admin` | `admin` | Full access - all features |
| `counter1` | any | Counter role - counting only |
| `counter2` | any | Counter role - counting only |

## What You Can Do

### As Counter (`counter1`)
- ✓ Click scan button and use phone camera to scan barcodes/QR codes
- ✓ Use Zebra scanner (just scan, press Enter to advance fields)
- ✓ Attach photos to counts
- ✓ See dashboard

### As Admin (`admin`)
- ✓ Everything counter can do, PLUS:
- ✓ Manually create counts
- ✓ Bulk import from Excel
- ✓ Configure SLOCs
- ✓ Manage materials
- ✓ Set up WM bins
- ✓ Create/close sessions
- ✓ Manage users
- ✓ View audit logs

## Troubleshooting

### "Python is not installed"
Download from https://www.python.org/ and ensure you check "Add Python to PATH" during installation.

### "Node is not installed"
Download from https://nodejs.org/ and install LTS version.

### "Port 8081 is already in use"
```powershell
# Find what's using the port
netstat -ano | findstr :8081

# Kill the process (replace PID with the number shown)
taskkill /PID <PID> /F
```

### React build fails
```powershell
cd client
rm -r node_modules package-lock.json
npm install
npm run build
cd ..
```

## Development Mode (with hot reload)

Want to modify the React code and see changes instantly?

**Terminal 1:**
```powershell
python server.py
```

**Terminal 2:**
```powershell
cd client
npm run dev
```

Then open http://localhost:5173

## Production Build

To prepare for deployment:

```powershell
cd client
npm run build
cd ..
python server.py
```

Flask will serve the built React app at http://localhost:8081

## File Locations

- **Database**: `inventory.db` (auto-created)
- **Photos**: `uploads/` folder
- **React code**: `client/src/` folder
- **Python API**: `server.py`

## Next Steps

1. **Create a session** (Admin page)
2. **Create some users** (Admin page)
3. **Configure SLOCs** (Office section)
4. **Start counting** (Counter page)

## Need Help?

Check the full README.md for detailed documentation.
