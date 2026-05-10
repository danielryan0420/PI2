#!/usr/bin/env python3
"""
Safely apply migration 011 to existing database without losing data.
This adds a validation_warnings column to the counts table to track
materials/bins that failed validation but were still submitted.
"""

import sqlite3
from pathlib import Path

DB_PATH = Path(__file__).parent / "inventory.db"

# Migration 011 SQL - adds validation_warnings column to counts
MIGRATION_011 = """
-- Add validation_warnings column to counts table
ALTER TABLE counts ADD COLUMN validation_warnings TEXT;
CREATE INDEX IF NOT EXISTS idx_counts_warnings ON counts(validation_warnings);
"""

def apply_migration():
    try:
        conn = sqlite3.connect(str(DB_PATH))
        conn.execute("PRAGMA foreign_keys = ON")

        # Split and execute each statement
        statements = [s.strip() for s in MIGRATION_011.split(';') if s.strip()]
        for stmt in statements:
            conn.execute(stmt)

        conn.commit()
        conn.close()

        print("✓ Migration 011 applied successfully!")
        print("✓ validation_warnings column added to counts table")
        return True
    except Exception as e:
        print(f"✗ Error applying migration: {e}")
        return False

if __name__ == '__main__':
    if not DB_PATH.exists():
        print(f"✗ Database not found at {DB_PATH}")
        print("Run: python3 server.py (it will create the database)")
        exit(1)

    print(f"Applying migration 011 to {DB_PATH}")
    if apply_migration():
        print("\nNext: Restart your server")
        print("  python3 server.py")
    else:
        exit(1)
