#!/usr/bin/env python
"""
Generate a self-signed SSL certificate so the app can run over HTTPS.
HTTPS is required for camera access on iPhone/iPad.

Run once:
    python setup_ssl.py

Then restart the server:
    python server.py

The server will automatically detect cert.pem / key.pem and switch to HTTPS.
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
    print(f"Detected local IP: {local_ip}")

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
    (base / 'cert.pem').write_bytes(cert.public_bytes(serialization.Encoding.PEM))
    (base / 'key.pem').write_bytes(key.private_bytes(
        serialization.Encoding.PEM,
        serialization.PrivateFormat.TraditionalOpenSSL,
        serialization.NoEncryption()
    ))

    print("\n✓ cert.pem and key.pem created")
    print(f"✓ Certificate covers: localhost, 127.0.0.1, {local_ip}\n")
    print("=" * 60)
    print("NEXT STEPS TO ENABLE CAMERA ON IPHONE")
    print("=" * 60)
    print(f"""
1. Restart the server:
       python server.py
   It will now run on HTTPS.

2. Install the certificate on your iPhone:
   a. On your iPhone, open Safari and go to:
          https://{local_ip}:8081/cert
   b. Safari will say "This website is trying to download
      a configuration profile." — tap Allow.
   c. Go to Settings → General → VPN & Device Management
   d. Tap "Physical Inventory" and tap Install
   e. Go to Settings → General → About →
      Certificate Trust Settings
   f. Turn on full trust for "Physical Inventory"

3. Open the app on Safari:
       https://{local_ip}:8081
   The camera scanner will now work.

NOTE: You only need to do steps 2-3 once per device.
""")

if __name__ == '__main__':
    generate()
