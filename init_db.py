#!/usr/bin/env python
"""Initialize database with seed data."""

from database import db
from services import UserService, SlocConfigService, MaterialService, SessionService

def init_seed_data():
    """Create seed users and configuration."""

    # Create default users
    users = [
        ("admin", "admin", "StopGap"),
        ("counter1", "counter", ""),
        ("counter2", "counter", ""),
    ]

    for username, role, password in users:
        existing = UserService.get_user(username)
        if not existing:
            UserService.create_user(username, role, password)
            print(f"✓ Created user: {username} ({role})")
        else:
            print(f"  User {username} already exists")
            if password and username == "admin":
                UserService.set_password(username, password)
                print(f"  Updated admin password")

    # Create default SLOC configurations
    slocs = [
        ("1010", "Main Warehouse", True, False),
        ("1020", "Secondary Location", True, True),
        ("1030", "Quality Check", False, False),
    ]

    for sloc, description, wm_enabled, im_enabled in slocs:
        existing = SlocConfigService.get_sloc(sloc)
        if not existing:
            SlocConfigService.create_sloc(sloc, description, wm_enabled, im_enabled)
            print(f"✓ Created SLOC: {sloc}")
        else:
            print(f"  SLOC {sloc} already exists")

    # Create sample materials
    materials = [
        ("100-00001", "Widget A", "PC", "FERT", "Materials"),
        ("100-00002", "Widget B", "PC", "FERT", "Materials"),
        ("100-00003", "Component X", "EA", "HALB", "Components"),
        ("100-00004", "Raw Material Y", "KG", "ROH", "Raw Materials"),
    ]

    for mat_num, description, uom, mat_type, mat_group in materials:
        existing = MaterialService.get_material(mat_num)
        if not existing:
            MaterialService.create_or_update_material(
                material_number=mat_num,
                description=description,
                base_uom=uom,
                material_type=mat_type,
                material_group=mat_group
            )
            print(f"✓ Created material: {mat_num}")
        else:
            print(f"  Material {mat_num} already exists")

    # Create default session
    existing_session = db.fetch_one("SELECT * FROM inventory_sessions WHERE name = 'Mosel PI July 2026'")
    if not existing_session:
        SessionService.create_session("Mosel PI July 2026")
        print(f"✓ Created session: Mosel PI July 2026")
    else:
        print(f"  Session 'Mosel PI July 2026' already exists")

    print("\n✓ Seed data initialized successfully")
    print("\nDefault Credentials:")
    print("  Admin:    admin / admin")
    print("  Counters: counter1, counter2 / any")
    print("\nDefault Session:")
    print("  Mosel PI July 2026 (ready to use)")

if __name__ == "__main__":
    init_seed_data()
