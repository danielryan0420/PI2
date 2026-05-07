#!/usr/bin/env python
"""Initialize database with seed data."""

from database import db
from services import UserService, SlocConfigService, MaterialService

def init_seed_data():
    """Create seed users and configuration."""

    # Create default users
    users = [
        ("admin", "admin"),
        ("office1", "office"),
        ("counter1", "counter"),
        ("counter2", "counter"),
    ]

    for username, role in users:
        existing = UserService.get_user(username)
        if not existing:
            UserService.create_user(username, role)
            print(f"✓ Created user: {username} ({role})")
        else:
            print(f"  User {username} already exists")

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

    print("\n✓ Seed data initialized successfully")
    print("\nDefault Credentials:")
    print("  Admin:    admin / admin")
    print("  Office:   office1 / any")
    print("  Counters: counter1, counter2 / any")

if __name__ == "__main__":
    init_seed_data()
