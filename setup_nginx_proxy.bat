@echo off
:: setup_nginx_proxy.bat
:: Sets up nginx as a reverse proxy for Physical Inventory on Windows PC.
:: No installation required — downloads nginx portable, runs it directly.
::
:: HTTP only  (port 80):  run this script as-is
:: HTTPS also (port 443): run setup_ssl.py first, then re-run this script
::
:: Usage: Double-click or run from command prompt

setlocal EnableDelayedExpansion
title Physical Inventory - Proxy Setup

echo.
echo ======================================================
echo  Physical Inventory - Windows Proxy Setup (nginx)
echo ======================================================

:: --- Detect SSL ---
set SSL_ENABLED=0
set CERT_FILE=%~dp0cert.pem
set KEY_FILE=%~dp0key.pem
if exist "%CERT_FILE%" if exist "%KEY_FILE%" (
    set SSL_ENABLED=1
    echo  SSL: cert.pem detected — HTTPS will be enabled on port 443
) else (
    echo  SSL: no cert.pem found — HTTP only on port 80
    echo       Run 'python setup_ssl.py' to enable HTTPS + camera scanning
)
echo.

:: --- Download nginx if needed ---
if exist "%~dp0nginx\nginx.exe" goto :WriteConfig

echo [1/3] Downloading nginx for Windows...
set NGINX_URL=https://nginx.org/download/nginx-1.26.2.zip
set NGINX_ZIP=%TEMP%\nginx.zip

powershell -NoProfile -Command ^
    "Invoke-WebRequest -Uri '%NGINX_URL%' -OutFile '%NGINX_ZIP%' -UseBasicParsing"

if not exist "%NGINX_ZIP%" (
    echo.
    echo ERROR: Download failed. Check your internet connection.
    pause
    exit /b 1
)

echo [2/3] Extracting nginx...
powershell -NoProfile -Command ^
    "Expand-Archive -Path '%NGINX_ZIP%' -DestinationPath '%TEMP%\nginx_extracted' -Force"

for /d %%D in ("%TEMP%\nginx_extracted\nginx-*") do (
    xcopy "%%D" "%~dp0nginx\" /E /I /Q /Y >nul
)
del "%NGINX_ZIP%" 2>nul

if not exist "%~dp0nginx\nginx.exe" (
    echo ERROR: nginx extraction failed.
    pause
    exit /b 1
)

:WriteConfig
echo [3/3] Writing nginx configuration...

:: Use forward slashes for nginx paths (Windows nginx requirement)
set CERT_FWD=%CERT_FILE:\=/%
set KEY_FWD=%KEY_FILE:\=/%

if "%SSL_ENABLED%"=="1" (
    :: HTTPS config: port 443 with SSL, redirect port 80 → 443
    (
    echo worker_processes 1;
    echo.
    echo events {
    echo     worker_connections 256;
    echo }
    echo.
    echo http {
    echo     include       mime.types;
    echo     default_type  application/octet-stream;
    echo     client_max_body_size 50m;
    echo     sendfile on;
    echo     keepalive_timeout 65;
    echo.
    echo     # Security headers
    echo     add_header X-Content-Type-Options  "nosniff"                        always;
    echo     add_header X-Frame-Options         "SAMEORIGIN"                     always;
    echo     add_header X-XSS-Protection        "1; mode=block"                  always;
    echo     add_header Referrer-Policy         "strict-origin-when-cross-origin" always;
    echo     add_header Strict-Transport-Security "max-age=31536000"             always;
    echo.
    echo     upstream flask_app {
    echo         server 127.0.0.1:8081;
    echo     }
    echo.
    echo     # Redirect plain HTTP to HTTPS
    echo     server {
    echo         listen 80;
    echo         server_name _;
    echo         return 301 https://$host$request_uri;
    echo     }
    echo.
    echo     # HTTPS server
    echo     server {
    echo         listen 443 ssl;
    echo         server_name _;
    echo.
    echo         ssl_certificate     %CERT_FWD%;
    echo         ssl_certificate_key %KEY_FWD%;
    echo         ssl_protocols       TLSv1.2 TLSv1.3;
    echo         ssl_ciphers         HIGH:!aNULL:!MD5;
    echo         ssl_session_cache   shared:SSL:10m;
    echo         ssl_session_timeout 10m;
    echo.
    echo         location / {
    echo             proxy_pass         http://flask_app;
    echo             proxy_set_header   Host $host;
    echo             proxy_set_header   X-Real-IP $remote_addr;
    echo             proxy_set_header   X-Forwarded-For $proxy_add_x_forwarded_for;
    echo             proxy_set_header   X-Forwarded-Proto https;
    echo             proxy_read_timeout 120s;
    echo             proxy_send_timeout 120s;
    echo         }
    echo.
    echo         # Serve the SSL cert for device installation
    echo         location /cert {
    echo             proxy_pass http://flask_app/cert;
    echo         }
    echo     }
    echo }
    ) > "%~dp0nginx\conf\nginx.conf"
) else (
    :: HTTP-only config
    (
    echo worker_processes 1;
    echo.
    echo events {
    echo     worker_connections 256;
    echo }
    echo.
    echo http {
    echo     include       mime.types;
    echo     default_type  application/octet-stream;
    echo     client_max_body_size 50m;
    echo     sendfile on;
    echo     keepalive_timeout 65;
    echo.
    echo     # Security headers
    echo     add_header X-Content-Type-Options  "nosniff"                        always;
    echo     add_header X-Frame-Options         "SAMEORIGIN"                     always;
    echo     add_header X-XSS-Protection        "1; mode=block"                  always;
    echo     add_header Referrer-Policy         "strict-origin-when-cross-origin" always;
    echo.
    echo     upstream flask_app {
    echo         server 127.0.0.1:8081;
    echo     }
    echo.
    echo     server {
    echo         listen 80;
    echo         server_name _;
    echo.
    echo         location / {
    echo             proxy_pass         http://flask_app;
    echo             proxy_set_header   Host $host;
    echo             proxy_set_header   X-Real-IP $remote_addr;
    echo             proxy_set_header   X-Forwarded-For $proxy_add_x_forwarded_for;
    echo             proxy_read_timeout 120s;
    echo             proxy_send_timeout 120s;
    echo         }
    echo     }
    echo }
    ) > "%~dp0nginx\conf\nginx.conf"
)

:StartNginx
:: Stop any existing nginx
taskkill /F /IM nginx.exe >nul 2>&1

echo Starting nginx...
cd /d "%~dp0nginx"
start /B nginx.exe

timeout /t 2 /nobreak >nul
tasklist | findstr /I "nginx.exe" >nul
if %errorlevel% neq 0 (
    echo ERROR: nginx failed to start. Check nginx\logs\error.log
    pause
    exit /b 1
)

:: Get local IP
set LOCAL_IP=localhost
for /f "tokens=2 delims=:" %%A in ('ipconfig ^| findstr /C:"IPv4"') do (
    set LOCAL_IP=%%A
    set LOCAL_IP=!LOCAL_IP: =!
    goto :PrintDone
)
:PrintDone

echo.
echo ======================================================
if "%SSL_ENABLED%"=="1" (
    echo  Proxy Running — HTTPS Enabled
) else (
    echo  Proxy Running — HTTP only
)
echo ======================================================
echo.
if "%SSL_ENABLED%"=="1" (
    echo  Users access the app at:
    echo    https://%LOCAL_IP%
    echo    https://%COMPUTERNAME%
    echo.
    echo  HTTP requests on port 80 redirect to HTTPS automatically.
    echo.
    echo  To install the certificate on devices:
    echo    https://%LOCAL_IP%/cert
) else (
    echo  Users access the app at:
    echo    http://%LOCAL_IP%
    echo    http://%COMPUTERNAME%
    echo.
    echo  Run 'python setup_ssl.py' then re-run this script to enable HTTPS.
)
echo.
echo  Port 8081 is LOCALHOST-ONLY. No firewall change needed.
echo.
echo  Make sure 'python run_production.py' is also running.
echo.
echo  To stop nginx:  taskkill /F /IM nginx.exe
echo.
