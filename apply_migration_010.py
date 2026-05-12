#!/usr/bin/env python3
"""
Safely apply migration 010 to existing database without losing data.
This adds only the new SAP tables (MARD, MSEG, LGAP, LQUA, MLGT, MLGN, T300T).
"""

import sqlite3
from pathlib import Path

DB_PATH = Path(__file__).parent / "inventory.db"

# Migration 010 SQL - only CREATE TABLE IF NOT EXISTS statements
MIGRATION_010 = """
-- MARD: Material Valuation at Plant/Warehouse Level (warehouse stock)
CREATE TABLE IF NOT EXISTS sap_mard (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    material_number     TEXT NOT NULL,
    plant               TEXT NOT NULL,
    storage_location    TEXT NOT NULL,
    unrestricted_qty    REAL,
    restricted_qty      REAL,
    quality_qty         REAL,
    return_qty          REAL,
    uom                 TEXT,
    currency            TEXT,
    total_value         REAL,
    uploaded_at         TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(material_number, plant, storage_location)
);

-- MLGT: Material Ledger GL (valuation and GL account mapping)
CREATE TABLE IF NOT EXISTS sap_mlgt (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    material_number     TEXT NOT NULL,
    plant               TEXT NOT NULL,
    valuation_area      TEXT NOT NULL,
    gl_account          TEXT,
    currency            TEXT,
    amount              REAL,
    quantity            REAL,
    uploaded_at         TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(material_number, plant, valuation_area, gl_account)
);

-- MLGN: Material Ledger Line Items (detailed transactions)
CREATE TABLE IF NOT EXISTS sap_mlgn (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    material_number     TEXT NOT NULL,
    plant               TEXT NOT NULL,
    document_number     TEXT,
    item_number         TEXT,
    posting_date        TEXT,
    document_type       TEXT,
    quantity            REAL,
    value               REAL,
    uploaded_at         TEXT NOT NULL DEFAULT (datetime('now'))
);

-- LQUA: Warehouse stock (stock by warehouse, storage location, material)
CREATE TABLE IF NOT EXISTS sap_lqua (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    material_number     TEXT NOT NULL,
    plant               TEXT NOT NULL,
    storage_location    TEXT NOT NULL,
    quantity_unrestricted   REAL,
    quantity_restricted     REAL,
    quantity_blocked        REAL,
    uom                 TEXT,
    uploaded_at         TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(material_number, plant, storage_location)
);

-- T300T: Storage Locations (master data for warehouse storage locations)
CREATE TABLE IF NOT EXISTS sap_storage_locations (
    code                TEXT PRIMARY KEY,
    plant               TEXT,
    description         TEXT,
    storage_type        TEXT,
    uploaded_at         TEXT NOT NULL DEFAULT (datetime('now'))
);

-- LGAP: Storage Bins (warehouse storage bin master data)
CREATE TABLE IF NOT EXISTS sap_lgap (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    bin_code            TEXT NOT NULL,
    plant               TEXT NOT NULL,
    storage_location    TEXT NOT NULL,
    bin_type            TEXT,
    storage_type        TEXT,
    description         TEXT,
    capacity_qty        REAL,
    capacity_uom        TEXT,
    uploaded_at         TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(bin_code, plant, storage_location)
);

-- MSEG: Material Segment Movements (for issue tracking)
CREATE TABLE IF NOT EXISTS sap_mseg (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    material_number     TEXT NOT NULL,
    plant               TEXT NOT NULL,
    document_number     TEXT,
    year_number         TEXT,
    line_item           TEXT,
    storage_location    TEXT,
    movement_type       TEXT,
    posting_date        TEXT,
    quantity            REAL,
    uploaded_at         TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_mard_material ON sap_mard(material_number);
CREATE INDEX IF NOT EXISTS idx_mard_plant ON sap_mard(plant);
CREATE INDEX IF NOT EXISTS idx_mard_sloc ON sap_mard(storage_location);
CREATE INDEX IF NOT EXISTS idx_mlgt_material ON sap_mlgt(material_number);
CREATE INDEX IF NOT EXISTS idx_mlgn_material ON sap_mlgn(material_number);
CREATE INDEX IF NOT EXISTS idx_lqua_material ON sap_lqua(material_number);
CREATE INDEX IF NOT EXISTS idx_lqua_sloc ON sap_lqua(storage_location);
CREATE INDEX IF NOT EXISTS idx_mseg_material ON sap_mseg(material_number);
CREATE INDEX IF NOT EXISTS idx_mseg_movement ON sap_mseg(movement_type);
CREATE INDEX IF NOT EXISTS idx_mseg_plant ON sap_mseg(plant);
CREATE INDEX IF NOT EXISTS idx_mseg_date ON sap_mseg(posting_date);
CREATE INDEX IF NOT EXISTS idx_lgap_plant ON sap_lgap(plant);
CREATE INDEX IF NOT EXISTS idx_lgap_sloc ON sap_lgap(storage_location);
CREATE INDEX IF NOT EXISTS idx_lgap_bin ON sap_lgap(bin_code);
"""

def apply_migration():
    try:
        conn = sqlite3.connect(str(DB_PATH))
        conn.execute("PRAGMA foreign_keys = ON")

        # Split and execute each statement
        statements = [s.strip() for s in MIGRATION_010.split(';') if s.strip()]
        for stmt in statements:
            conn.execute(stmt)

        conn.commit()
        conn.close()

        print("✓ Migration 010 applied successfully!")
        print("✓ Your users, sessions, and counts are preserved")
        print("✓ New SAP tables (MARD, MSEG, LGAP, etc.) are ready")
        return True
    except Exception as e:
        print(f"✗ Error applying migration: {e}")
        return False

if __name__ == '__main__':
    if not DB_PATH.exists():
        print(f"✗ Database not found at {DB_PATH}")
        print("Run: python3 server.py (it will create the database)")
        exit(1)

    print(f"Applying migration 010 to {DB_PATH}")
    if apply_migration():
        print("\nNext: Restart your server")
        print("  python3 server.py")
    else:
        exit(1)
