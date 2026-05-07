import sqlite3
import os
from pathlib import Path
from contextlib import contextmanager
from typing import Optional, List, Dict, Any

DB_PATH = Path(__file__).parent / "inventory.db"
MIGRATIONS_DIR = Path(__file__).parent / "migrations"

MIGRATIONS_DIR.mkdir(exist_ok=True)

MIGRATION_FILES = [
    ("001_core.sql", """
-- Users (pre-configured role list)
CREATE TABLE IF NOT EXISTS users (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    username   TEXT NOT NULL UNIQUE COLLATE NOCASE,
    role       TEXT NOT NULL CHECK(role IN ('counter','admin')),
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Inventory sessions
CREATE TABLE IF NOT EXISTS inventory_sessions (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    name       TEXT NOT NULL,
    status     TEXT NOT NULL DEFAULT 'open',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    closed_at  TEXT
);

-- SLOC configuration (managed in-app by office)
CREATE TABLE IF NOT EXISTS sloc_config (
    sloc        TEXT PRIMARY KEY,
    description TEXT,
    wm_enabled  INTEGER NOT NULL DEFAULT 0,
    im_enabled  INTEGER NOT NULL DEFAULT 0
);

-- Count records
CREATE TABLE IF NOT EXISTS counts (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id      INTEGER NOT NULL REFERENCES inventory_sessions(id),
    username        TEXT NOT NULL,
    material_number TEXT NOT NULL,
    quantity        REAL NOT NULL,
    sloc            TEXT NOT NULL,
    wm_bin          TEXT,
    zbin            TEXT,
    status          TEXT NOT NULL DEFAULT 'pending',
    created_at      TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_counts_session ON counts(session_id);
CREATE INDEX IF NOT EXISTS idx_counts_material ON counts(material_number);
CREATE INDEX IF NOT EXISTS idx_counts_sloc ON counts(sloc);
CREATE INDEX IF NOT EXISTS idx_counts_username ON counts(username);

-- Photos linked to counts
CREATE TABLE IF NOT EXISTS photos (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    count_id      INTEGER NOT NULL REFERENCES counts(id) ON DELETE CASCADE,
    filename      TEXT NOT NULL,
    original_name TEXT,
    uploaded_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_photos_count ON photos(count_id);
"""),
    ("002_messages.sql", """
-- Counter <-> Office Q&A messages
CREATE TABLE IF NOT EXISTS messages (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    count_id   INTEGER REFERENCES counts(id) ON DELETE CASCADE,
    session_id INTEGER NOT NULL REFERENCES inventory_sessions(id),
    sender     TEXT NOT NULL,
    role       TEXT NOT NULL CHECK(role IN ('counter','admin')),
    body       TEXT NOT NULL,
    sent_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_messages_count ON messages(count_id);
CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id);
"""),
    ("003_audit.sql", """
-- Audit log: every create, edit, verify, flag event on a count record
CREATE TABLE IF NOT EXISTS audit_log (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    count_id        INTEGER NOT NULL REFERENCES counts(id),
    editor_username TEXT NOT NULL,
    event_type      TEXT NOT NULL,
    field_name      TEXT,
    old_value       TEXT,
    new_value       TEXT,
    reason          TEXT,
    created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_audit_count ON audit_log(count_id);
CREATE INDEX IF NOT EXISTS idx_audit_time ON audit_log(created_at);
"""),
    ("004_sap_master.sql", """
-- MARA + MAKT: material master + descriptions
CREATE TABLE IF NOT EXISTS sap_materials (
    material_number TEXT PRIMARY KEY,
    description     TEXT,
    base_uom        TEXT,
    material_type   TEXT,
    material_group  TEXT,
    updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

-- MARC: plant-level material data
CREATE TABLE IF NOT EXISTS sap_plant_data (
    material_number TEXT NOT NULL,
    plant           TEXT NOT NULL,
    mrp_type        TEXT,
    updated_at      TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (material_number, plant)
);

-- MBEW: material valuation (used for high-value prioritization)
CREATE TABLE IF NOT EXISTS sap_valuation (
    material_number  TEXT NOT NULL,
    valuation_area   TEXT NOT NULL,
    price_control    TEXT,
    standard_price   REAL,
    moving_avg_price REAL,
    total_stock      REAL,
    total_value      REAL,
    updated_at       TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (material_number, valuation_area)
);

CREATE INDEX IF NOT EXISTS idx_valuation_value ON sap_valuation(total_value DESC);
"""),
    ("005_snapshot.sql", """
-- SAP stock-on-hand snapshot at time of inventory freeze
CREATE TABLE IF NOT EXISTS sap_snapshot (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id      INTEGER NOT NULL REFERENCES inventory_sessions(id),
    material_number TEXT NOT NULL,
    sloc            TEXT NOT NULL,
    sap_quantity    REAL NOT NULL,
    uom             TEXT,
    loaded_at       TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_snapshot_session ON sap_snapshot(session_id);
CREATE INDEX IF NOT EXISTS idx_snapshot_material ON sap_snapshot(material_number, sloc);
"""),
    ("006_nullable_count_message.sql", """
-- Allow messages not linked to a specific count (general session Q&A)
PRAGMA foreign_keys = OFF;

CREATE TABLE IF NOT EXISTS messages_new (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    count_id   INTEGER REFERENCES counts(id) ON DELETE CASCADE,
    session_id INTEGER NOT NULL REFERENCES inventory_sessions(id),
    sender     TEXT NOT NULL,
    role       TEXT NOT NULL CHECK(role IN ('counter','admin')),
    body       TEXT NOT NULL,
    sent_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT INTO messages_new SELECT * FROM messages;
DROP TABLE messages;
ALTER TABLE messages_new RENAME TO messages;

PRAGMA foreign_keys = ON;
"""),
    ("007_wm_bins.sql", """
-- WM Bin management: fixed bins (storage type 100) and secondary bins (storage type 200)
CREATE TABLE IF NOT EXISTS wm_bins (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    bin          TEXT NOT NULL,
    storage_type TEXT NOT NULL CHECK(storage_type IN ('100', '200')),
    sloc         TEXT NOT NULL,
    description  TEXT,
    created_at   TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(bin, storage_type, sloc)
);

-- Materials linked to fixed bins (storage type 100 strategy)
CREATE TABLE IF NOT EXISTS wm_bin_materials (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    bin_id          INTEGER NOT NULL REFERENCES wm_bins(id) ON DELETE CASCADE,
    material_number TEXT NOT NULL,
    created_at      TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(bin_id, material_number)
);
"""),
]

class Database:
    def __init__(self, db_path: Path = DB_PATH):
        self.db_path = db_path
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self._init_db()

    @contextmanager
    def get_connection(self):
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys = ON")
        try:
            yield conn
        finally:
            conn.close()

    def _init_db(self):
        with self.get_connection() as conn:
            # Create migrations table
            conn.execute("""
                CREATE TABLE IF NOT EXISTS _migrations (
                    filename TEXT PRIMARY KEY,
                    applied_at TEXT NOT NULL DEFAULT (datetime('now'))
                )
            """)
            conn.commit()

            # Run pending migrations
            applied = set()
            cursor = conn.execute("SELECT filename FROM _migrations")
            for row in cursor:
                applied.add(row[0])

            for filename, sql in MIGRATION_FILES:
                if filename not in applied:
                    conn.executescript(sql)
                    conn.execute("INSERT INTO _migrations (filename) VALUES (?)", (filename,))
                    conn.commit()

    def execute(self, query: str, params: tuple = ()) -> sqlite3.Cursor:
        with self.get_connection() as conn:
            return conn.execute(query, params)

    def execute_many(self, query: str, params: List[tuple]) -> None:
        with self.get_connection() as conn:
            conn.executemany(query, params)
            conn.commit()

    def insert(self, query: str, params: tuple = ()) -> int:
        with self.get_connection() as conn:
            cursor = conn.execute(query, params)
            conn.commit()
            return cursor.lastrowid

    def fetch_one(self, query: str, params: tuple = ()) -> Optional[Dict[str, Any]]:
        with self.get_connection() as conn:
            cursor = conn.execute(query, params)
            row = cursor.fetchone()
            return dict(row) if row else None

    def fetch_all(self, query: str, params: tuple = ()) -> List[Dict[str, Any]]:
        with self.get_connection() as conn:
            cursor = conn.execute(query, params)
            return [dict(row) for row in cursor.fetchall()]

db = Database()
