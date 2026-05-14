# setup_iis_proxy.ps1
# Run once as Administrator on Windows Server to set up IIS reverse proxy.
# After this runs, users access the app at http://<server-name>/inventory
# No firewall port changes needed - rides on port 80 which is already open.
#
# Usage (run as Administrator in PowerShell):
#   Set-ExecutionPolicy Bypass -Scope Process -Force
#   .\setup_iis_proxy.ps1

param(
    [string]$SitePath = "/inventory",
    [string]$BackendPort = "8081",
    [string]$SiteName = "PhysicalInventory"
)

$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "======================================================"
Write-Host " Physical Inventory - IIS Reverse Proxy Setup"
Write-Host "======================================================"
Write-Host ""

# --- 1. Check running as admin ---
if (-not ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Write-Error "Must be run as Administrator. Right-click PowerShell -> Run as Administrator."
    exit 1
}

# --- 2. Enable IIS and required features ---
Write-Host "[1/5] Enabling IIS features..."
$features = @(
    "IIS-WebServerRole",
    "IIS-WebServer",
    "IIS-CommonHttpFeatures",
    "IIS-StaticContent",
    "IIS-DefaultDocument",
    "IIS-HttpErrors",
    "IIS-ApplicationDevelopment",
    "IIS-ASPNET45",
    "IIS-NetFxExtensibility45",
    "IIS-ISAPIExtensions",
    "IIS-ISAPIFilter",
    "IIS-HttpCompressionStatic",
    "IIS-ManagementConsole"
)
foreach ($f in $features) {
    $state = (Get-WindowsOptionalFeature -Online -FeatureName $f).State
    if ($state -ne "Enabled") {
        Enable-WindowsOptionalFeature -Online -FeatureName $f -All -NoRestart | Out-Null
        Write-Host "  Enabled: $f"
    }
}
Write-Host "  IIS features: OK"

# --- 3. Install URL Rewrite module (required for reverse proxy) ---
Write-Host "[2/5] Checking URL Rewrite module..."
$urlRewritePath = "$env:SystemRoot\System32\inetsrv\rewrite.dll"
if (-not (Test-Path $urlRewritePath)) {
    Write-Host "  Downloading URL Rewrite 2.1..."
    $urlRewriteUrl = "https://download.microsoft.com/download/1/2/8/128E2E22-C1B9-44A4-BE2A-5859ED1D4592/rewrite_amd64_en-US.msi"
    $installer = "$env:TEMP\urlrewrite2.msi"
    Invoke-WebRequest -Uri $urlRewriteUrl -OutFile $installer -UseBasicParsing
    Start-Process msiexec.exe -ArgumentList "/i `"$installer`" /quiet /norestart" -Wait
    Remove-Item $installer
    Write-Host "  URL Rewrite: Installed"
} else {
    Write-Host "  URL Rewrite: Already installed"
}

# --- 4. Install Application Request Routing (ARR) ---
Write-Host "[3/5] Checking Application Request Routing (ARR)..."
$arrPath = "$env:ProgramFiles\IIS\Application Request Routing"
if (-not (Test-Path $arrPath)) {
    Write-Host "  Downloading ARR 3.0..."
    $arrUrl = "https://download.microsoft.com/download/E/9/8/E9849D6A-020E-47E4-9FD0-A023E99B54EB/requestRouter_amd64.msi"
    $arrInstaller = "$env:TEMP\arr3.msi"
    Invoke-WebRequest -Uri $arrUrl -OutFile $arrInstaller -UseBasicParsing
    Start-Process msiexec.exe -ArgumentList "/i `"$arrInstaller`" /quiet /norestart" -Wait
    Remove-Item $arrInstaller
    Write-Host "  ARR: Installed"
} else {
    Write-Host "  ARR: Already installed"
}

# --- 5. Enable proxy in ARR ---
Write-Host "[4/5] Enabling ARR proxy..."
Import-Module WebAdministration -ErrorAction SilentlyContinue
$arrConfig = Get-WebConfiguration "system.webServer/proxy" "MACHINE/WEBROOT/APPHOST"
if ($arrConfig) {
    Set-WebConfiguration "system.webServer/proxy" "MACHINE/WEBROOT/APPHOST" -Value @{enabled=$true}
}

# --- 6. Create web.config with reverse proxy rule ---
Write-Host "[5/5] Writing reverse proxy web.config..."

# Place web.config in Default Web Site's physical path
$iisRoot = (Get-Website "Default Web Site").physicalPath -replace "%SystemDrive%", $env:SystemDrive
$proxyDir = Join-Path $iisRoot $SitePath.TrimStart("/")

if (-not (Test-Path $proxyDir)) {
    New-Item -ItemType Directory -Path $proxyDir -Force | Out-Null
}

$webConfig = @"
<?xml version="1.0" encoding="UTF-8"?>
<configuration>
  <system.webServer>
    <rewrite>
      <rules>
        <rule name="PhysicalInventoryProxy" stopProcessing="true">
          <match url="(.*)" />
          <action type="Rewrite" url="http://127.0.0.1:$BackendPort/{R:1}" />
        </rule>
      </rules>
    </rewrite>
    <proxy>
      <settings>
        <buffer enabled="true" />
        <timeout>00:01:00</timeout>
      </settings>
    </proxy>
  </system.webServer>
</configuration>
"@

$webConfig | Out-File -FilePath (Join-Path $proxyDir "web.config") -Encoding utf8 -Force

# Restart IIS to apply changes
Write-Host ""
Write-Host "Restarting IIS..."
iisreset /noforce | Out-Null

# --- Done ---
$serverName = $env:COMPUTERNAME
Write-Host ""
Write-Host "======================================================"
Write-Host " Setup Complete!"
Write-Host "======================================================"
Write-Host ""
Write-Host " Users access the app at:"
Write-Host "   http://$serverName$SitePath"
Write-Host ""
Write-Host " The app (port 8081) is LOCALHOST-ONLY."
Write-Host " No firewall rule for port 8081 is needed."
Write-Host " Traffic flows through IIS on port 80 (already open)."
Write-Host ""
Write-Host " Make sure run_production.py is running before users connect."
Write-Host ""
