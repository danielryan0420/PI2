@echo off
:: setup_nginx_proxy.bat
:: Sets up nginx as a reverse proxy for Physical Inventory on Windows PC.
:: No installation required - downloads nginx portable, runs it directly.
:: Users access the app at http://<computer-name> (port 80, no firewall change).
::
:: Usage: Double-click or run from command prompt
::   setup_nginx_proxy.bat

setlocal EnableDelayedExpansion
title Physical Inventory - Proxy Setup

echo.
echo ======================================================
echo  Physical Inventory - Windows Proxy Setup (nginx)
echo ======================================================
echo.

:: --- Check for nginx already set up ---
if exist "%~dp0nginx\nginx.exe" (
    echo nginx already downloaded. Starting...
    goto :StartNginx
)

:: --- Download nginx portable ---
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

:: Move to our directory
for /d %%D in ("%TEMP%\nginx_extracted\nginx-*") do (
    xcopy "%%D" "%~dp0nginx\" /E /I /Q /Y >nul
)
del "%NGINX_ZIP%" 2>nul

if not exist "%~dp0nginx\nginx.exe" (
    echo ERROR: nginx extraction failed.
    pause
    exit /b 1
)

echo [3/3] Writing nginx configuration...

:: Write the nginx config that proxies port 80 -> localhost:8081
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
echo.
echo     client_max_body_size 50m;
echo     sendfile on;
echo     keepalive_timeout 65;
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

:StartNginx
echo.
echo Checking if port 80 is available...
netstat -ano | findstr ":80 " >nul 2>&1
if %errorlevel% equ 0 (
    echo.
    echo WARNING: Something is already using port 80.
    echo          Close IIS or any other web server first,
    echo          then re-run this script.
    echo.
    pause
    exit /b 1
)

:: Stop any existing nginx
taskkill /F /IM nginx.exe >nul 2>&1

echo Starting nginx proxy on port 80...
cd /d "%~dp0nginx"
start /B nginx.exe

:: Quick health check
timeout /t 2 /nobreak >nul
tasklist | findstr /I "nginx.exe" >nul
if %errorlevel% neq 0 (
    echo ERROR: nginx failed to start. Check nginx\logs\error.log
    pause
    exit /b 1
)

:: Get local IP
for /f "tokens=2 delims=:" %%A in ('ipconfig ^| findstr /C:"IPv4"') do (
    set LOCAL_IP=%%A
    set LOCAL_IP=!LOCAL_IP: =!
    goto :PrintDone
)
:PrintDone

echo.
echo ======================================================
echo  Proxy Running!
echo ======================================================
echo.
echo  Users access the app at:
echo    http://%LOCAL_IP%
echo    http://%COMPUTERNAME%
echo.
echo  Port 8081 is LOCALHOST-ONLY. No firewall change needed.
echo  Traffic flows through port 80 (already allowed).
echo.
echo  Make sure run_production.py is also running.
echo.
echo  To stop nginx:  taskkill /F /IM nginx.exe
echo.
pause
