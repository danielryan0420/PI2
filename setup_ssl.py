#!/usr/bin/env python3
"""
Generate a self-signed SSL certificate for the nginx reverse proxy.

Run once to enable HTTPS so that:
  - Barcode camera works on phones/tablets (requires secure context)
  - Traffic between users and the server is encrypted
  - IT sees a padlock in the browser

After running this, re-run setup_nginx_proxy.bat — it detects cert.pem
automatically and switches nginx to HTTPS on port 443.

Usage:
    python setup_ssl.py
    setup_nginx_proxy.bat        (re-run to pick up the cert)
"""

import socket
import datetime
import ipaddress
from pathlib import Path


def get_local_ip():
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(('8.8.8.8', 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return '127.0.0.1'


def generate():
    try:
        from cryptography import x509
        from cryptography.x509.oid import NameOID
        from cryptography.hazmat.primitives import hashes, serialization
        from cryptography.hazmat.primitives.asymmetric import rsa
    except ImportError:
        import subprocess, sys
        print("Installing cryptography package...")
        subprocess.check_call([sys.executable, '-m', 'pip', 'install', 'cryptography'])
        from cryptography import x509
        from cryptography.x509.oid import NameOID
        from cryptography.hazmat.primitives import hashes, serialization
        from cryptography.hazmat.primitives.asymmetric import rsa

    local_ip = get_local_ip()
    hostname = socket.gethostname()
    print(f"Detected local IP : {local_ip}")
    print(f"Detected hostname : {hostname}")
    print()

    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)

    subject = issuer = x509.Name([
        x509.NameAttribute(NameOID.COMMON_NAME, "Physical Inventory"),
        x509.NameAttribute(NameOID.ORGANIZATION_NAME, "Physical Inventory App"),
    ])

    sans = [
        x509.DNSName("localhost"),
        x509.DNSName(hostname),
        x509.IPAddress(ipaddress.IPv4Address("127.0.0.1")),
        x509.IPAddress(ipaddress.IPv4Address(local_ip)),
    ]

    cert = (
        x509.CertificateBuilder()
        .subject_name(subject)
        .issuer_name(issuer)
        .public_key(key.public_key())
        .serial_number(x509.random_serial_number())
        .not_valid_before(datetime.datetime.utcnow())
        .not_valid_after(datetime.datetime.utcnow() + datetime.timedelta(days=825))
        .add_extension(x509.SubjectAlternativeName(sans), critical=False)
        .add_extension(x509.BasicConstraints(ca=True, path_length=None), critical=True)
        .sign(key, hashes.SHA256())
    )

    base = Path(__file__).parent
    cert_path = base / 'cert.pem'
    key_path  = base / 'key.pem'

    cert_path.write_bytes(cert.public_bytes(serialization.Encoding.PEM))
    key_path.write_bytes(key.private_bytes(
        serialization.Encoding.PEM,
        serialization.PrivateFormat.TraditionalOpenSSL,
        serialization.NoEncryption()
    ))

    print("✓ cert.pem created")
    print("✓ key.pem  created")
    print(f"✓ Certificate covers: localhost, 127.0.0.1, {local_ip}, {hostname}")
    print()
    print("=" * 60)
    print("NEXT STEPS")
    print("=" * 60)
    print()
    print("1. Re-run the proxy setup (detects cert.pem automatically):")
    print()
    print("   Windows PC (nginx):     setup_nginx_proxy.bat")
    print("   Windows Server (IIS):   setup_iis_proxy.ps1")
    print()
    print("   nginx will now listen on port 443 (HTTPS) and redirect")
    print("   plain HTTP on port 80 to HTTPS automatically.")
    print()
    print("2. Install the certificate on each device (one time per device)")
    print("   so the browser trusts it without a warning:")
    print()
    print(f"   Open:  https://{local_ip}/cert")
    print()
    print("   Windows:  double-click the downloaded .crt → Install →")
    print("             'Local Machine' → 'Trusted Root Certification'")
    print()
    print("   iPhone:   Safari will offer 'Allow' → Settings →")
    print("             General → VPN & Device Management → Install →")
    print("             Settings → General → About →")
    print("             Certificate Trust Settings → enable trust")
    print()
    print("   Android:  Settings → Security → Install from storage")
    print()
    print("3. Users then access the app at:")
    print(f"   https://{local_ip}     or     https://{hostname}")
    print()
    print("Camera / barcode scanning will work on all devices.")
    print()


if __name__ == '__main__':
    generate()
