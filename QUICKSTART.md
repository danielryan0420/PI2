# Quick Start

## First time
Double-click **`setup.bat`** — takes 2-3 minutes, run once.

## Every day
Double-click **`start.bat`** — starts the app and proxy together.

Access at **`http://YOUR-PC-NAME`** from any device on the same network.

To find your PC name: open Command Prompt and run `hostname`.
To find your IP address: run `ipconfig` and look for IPv4 Address.

To stop: **`stop.bat`**. To update: **`update.bat`**.

## Credentials

| User | Password | Role |
|------|----------|------|
| `admin` | `admin` | Full access |
| `counter1` | *(any)* | Count entry |
| `counter2` | *(any)* | Count entry |

Change the admin password in Admin → Users after first login.

## Camera scanning on phones

HTTPS is required. Run once:
```bat
python setup_ssl.py
setup_nginx_proxy.bat
```
Then install the certificate on each phone/tablet (instructions printed on screen).

## Windows Server (IIS)

Use `setup_iis_proxy.ps1` instead of `setup_nginx_proxy.bat`:
```powershell
# Run as Administrator
.\setup_iis_proxy.ps1
```
