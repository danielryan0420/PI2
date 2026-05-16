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
    password   TEXT NOT NULL,
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
    ("008_add_password.sql", """
-- Add password column to users table
PRAGMA foreign_keys = OFF;

CREATE TABLE IF NOT EXISTS users_new (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    username   TEXT NOT NULL UNIQUE COLLATE NOCASE,
    role       TEXT NOT NULL CHECK(role IN ('counter','admin')),
    password   TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT INTO users_new (id, username, role, password, created_at)
SELECT id, username, role, '', created_at FROM users;

DROP TABLE users;
ALTER TABLE users_new RENAME TO users;

PRAGMA foreign_keys = ON;
"""),
    ("009_user_last_active.sql", """
ALTER TABLE users ADD COLUMN last_active TEXT NULL;
"""),
    ("010_sap_ledger_tables.sql", """
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
    movement_type       TEXT,  -- 201/202 (receipt), 221/222 (usage), 309 (transfer), 911/912 (adjustment)
    posting_date        TEXT,
    quantity            REAL,
    uploaded_at         TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_mseg_material ON sap_mseg(material_number);
CREATE INDEX IF NOT EXISTS idx_mseg_movement ON sap_mseg(movement_type);
CREATE INDEX IF NOT EXISTS idx_mseg_plant ON sap_mseg(plant);
CREATE INDEX IF NOT EXISTS idx_mseg_date ON sap_mseg(posting_date);

CREATE INDEX IF NOT EXISTS idx_mard_material ON sap_mard(material_number);
CREATE INDEX IF NOT EXISTS idx_mard_plant ON sap_mard(plant);
CREATE INDEX IF NOT EXISTS idx_mard_sloc ON sap_mard(storage_location);
CREATE INDEX IF NOT EXISTS idx_mlgt_material ON sap_mlgt(material_number);
CREATE INDEX IF NOT EXISTS idx_mlgn_material ON sap_mlgn(material_number);
CREATE INDEX IF NOT EXISTS idx_lqua_material ON sap_lqua(material_number);
CREATE INDEX IF NOT EXISTS idx_lqua_sloc ON sap_lqua(storage_location);
CREATE INDEX IF NOT EXISTS idx_lgap_plant ON sap_lgap(plant);
CREATE INDEX IF NOT EXISTS idx_lgap_sloc ON sap_lgap(storage_location);
CREATE INDEX IF NOT EXISTS idx_lgap_bin ON sap_lgap(bin_code);
"""),
    ("011_count_validation_warnings.sql", """
ALTER TABLE counts ADD COLUMN validation_warnings TEXT;
"""),
    ("012_lgplo.sql", """
-- LGPLO: Fixed bin assignments from MM02 WM2 tab
-- MATNR + LGNUM + LGTYP → LGPLA (fixed storage bin)
CREATE TABLE IF NOT EXISTS sap_lgplo (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    material_number TEXT NOT NULL,
    warehouse_number TEXT NOT NULL,
    storage_type    TEXT NOT NULL,
    fixed_bin       TEXT NOT NULL,
    uploaded_at     TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(material_number, warehouse_number, storage_type)
);

CREATE INDEX IF NOT EXISTS idx_lgplo_material ON sap_lgplo(material_number);
CREATE INDEX IF NOT EXISTS idx_lgplo_storage_type ON sap_lgplo(storage_type);
CREATE INDEX IF NOT EXISTS idx_lgplo_fixed_bin ON sap_lgplo(fixed_bin);
"""),
    ("013_message_threads.sql", """
-- One thread per question; messages link to a thread instead of directly to a count
CREATE TABLE IF NOT EXISTS message_threads (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id      INTEGER NOT NULL REFERENCES inventory_sessions(id) ON DELETE CASCADE,
    count_id        INTEGER REFERENCES counts(id) ON DELETE SET NULL,
    title           TEXT NOT NULL,
    created_by      TEXT NOT NULL,
    created_by_role TEXT NOT NULL CHECK(created_by_role IN ('counter','admin')),
    answered        INTEGER NOT NULL DEFAULT 0,
    answered_by     TEXT,
    answered_at     TEXT,
    created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_message_threads_session ON message_threads(session_id);
CREATE INDEX IF NOT EXISTS idx_message_threads_answered ON message_threads(answered);

ALTER TABLE messages ADD COLUMN thread_id INTEGER REFERENCES message_threads(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_messages_thread ON messages(thread_id);
"""),
    ("014_message_reply_to.sql", """
ALTER TABLE messages ADD COLUMN reply_to_id INTEGER REFERENCES messages(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_messages_reply_to ON messages(reply_to_id);
"""),
    ("015_counts_warnings_index.sql", """
CREATE INDEX IF NOT EXISTS idx_counts_warnings ON counts(validation_warnings);
"""),
    ("016_open_orders.sql", """
-- Purchase Order Headers (EKKO)
CREATE TABLE IF NOT EXISTS sap_ekko (
    ebeln       TEXT PRIMARY KEY,
    bstyp       TEXT,
    bsart       TEXT,
    loekz       TEXT,
    status      TEXT,
    aedat       TEXT,
    erdat       TEXT,
    ernam       TEXT,
    lifnr       TEXT,
    zterm       TEXT,
    ekgrp       TEXT,
    bukrs       TEXT,
    bedat       TEXT,
    kdatb       TEXT,
    kdate       TEXT,
    raw_data    TEXT,
    uploaded_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Purchase Order Items (EKPO)
CREATE TABLE IF NOT EXISTS sap_ekpo (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    ebeln       TEXT NOT NULL,
    ebelp       TEXT NOT NULL,
    loekz       TEXT,
    statu       TEXT,
    aedat       TEXT,
    txz01       TEXT,
    matnr       TEXT,
    ematn       TEXT,
    bukrs       TEXT,
    werks       TEXT,
    lgort       TEXT,
    matkl       TEXT,
    menge       REAL,
    meins       TEXT,
    netpr       REAL,
    peinh       REAL,
    netwr       REAL,
    brtwr       REAL,
    bstae       TEXT,
    elikz       TEXT,
    erekz       TEXT,
    raw_data    TEXT,
    uploaded_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(ebeln, ebelp)
);
CREATE INDEX IF NOT EXISTS idx_ekpo_matnr ON sap_ekpo(matnr);
CREATE INDEX IF NOT EXISTS idx_ekpo_werks ON sap_ekpo(werks);
CREATE INDEX IF NOT EXISTS idx_ekpo_ebeln ON sap_ekpo(ebeln);
"""),
    ("017_aufk.sql", """
-- Production / Process Orders (AUFK + AFKO combined export)
CREATE TABLE IF NOT EXISTS sap_aufk (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    aufnr       TEXT NOT NULL UNIQUE,
    auart       TEXT,
    werks       TEXT,
    bukrs       TEXT,
    ktext       TEXT,
    erdat       TEXT,
    ernam       TEXT,
    gstrp       TEXT,
    gltrp       TEXT,
    ftrmi       TEXT,
    matnr       TEXT,
    gamng       REAL,
    gmein       TEXT,
    wemng       REAL,
    lgort       TEXT,
    sysst       TEXT,
    loekz       TEXT,
    raw_data    TEXT,
    uploaded_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_aufk_matnr ON sap_aufk(matnr);
CREATE INDEX IF NOT EXISTS idx_aufk_werks ON sap_aufk(werks);
CREATE INDEX IF NOT EXISTS idx_aufk_sysst ON sap_aufk(sysst);
"""),
    ("018_resb.sql", """
-- Reservations / Dependent Requirements (RESB)
CREATE TABLE IF NOT EXISTS sap_resb (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    rsnum       TEXT NOT NULL,
    rspos       TEXT NOT NULL,
    rsart       TEXT,
    matnr       TEXT NOT NULL,
    werks       TEXT,
    lgort       TEXT,
    bdmng       REAL,
    enmng       REAL,
    bdter       TEXT,
    aufnr       TEXT,
    ebeln       TEXT,
    kzear       TEXT,
    sobkz       TEXT,
    bwart       TEXT,
    raw_data    TEXT,
    uploaded_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(rsnum, rspos)
);
CREATE INDEX IF NOT EXISTS idx_resb_matnr ON sap_resb(matnr);
CREATE INDEX IF NOT EXISTS idx_resb_aufnr ON sap_resb(aufnr);
CREATE INDEX IF NOT EXISTS idx_resb_werks ON sap_resb(werks);
"""),
    ("019_lqua_bins_mseg_orders.sql", """
-- Rebuild LQUA at bin/quant level (LGNUM+LGTYP+LGPLA+LQNUM uniquely identifies a quant)
DROP TABLE IF EXISTS sap_lqua;
CREATE TABLE IF NOT EXISTS sap_lqua (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    lgnum       TEXT,
    lgtyp       TEXT,
    lgpla       TEXT,
    lqnum       TEXT,
    matnr       TEXT NOT NULL,
    werks       TEXT,
    lgort       TEXT,
    charg       TEXT,
    bestq       TEXT,
    sobkz       TEXT,
    verme       REAL,
    menge       REAL,
    meins       TEXT,
    raw_data    TEXT,
    uploaded_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_lqua_matnr ON sap_lqua(matnr);
CREATE INDEX IF NOT EXISTS idx_lqua_lgpla ON sap_lqua(lgpla);
CREATE INDEX IF NOT EXISTS idx_lqua_lgtyp ON sap_lqua(lgtyp);

-- Add order reference columns to MSEG for GR matching
ALTER TABLE sap_mseg ADD COLUMN aufnr TEXT;
ALTER TABLE sap_mseg ADD COLUMN ebeln TEXT;
ALTER TABLE sap_mseg ADD COLUMN ebelp TEXT;
CREATE INDEX IF NOT EXISTS idx_mseg_aufnr ON sap_mseg(aufnr);
CREATE INDEX IF NOT EXISTS idx_mseg_ebeln ON sap_mseg(ebeln);
"""),
]

class Database:
    def __init__(self, db_path: Path = DB_PATH):
        self.db_path = db_path
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self._init_db()

    @contextmanager
    def get_connection(self):
        conn = sqlite3.connect(str(self.db_path), timeout=30.0)
        conn.row_factory = sqlite3.Row
        conn.isolation_level = None  # Autocommit mode for explicit transaction control
        conn.execute("PRAGMA journal_mode = WAL")
        conn.execute("PRAGMA synchronous = NORMAL")
        conn.execute("PRAGMA cache_size = -64000")
        conn.execute("PRAGMA temp_store = MEMORY")
        conn.execute("PRAGMA busy_timeout = 30000")
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

    def execute(self, query: str, params: tuple = ()) -> None:
        with self.get_connection() as conn:
            try:
                conn.execute("BEGIN IMMEDIATE")
                conn.execute(query, params)
                conn.execute("COMMIT")
            except Exception:
                try:
                    conn.execute("ROLLBACK")
                except Exception:
                    pass
                raise

    def execute_many(self, query: str, params: List[tuple]) -> None:
        with self.get_connection() as conn:
            try:
                conn.execute("BEGIN IMMEDIATE")
                conn.executemany(query, params)
                conn.execute("COMMIT")
            except Exception:
                try:
                    conn.execute("ROLLBACK")
                except Exception:
                    pass
                raise

    def insert(self, query: str, params: tuple = ()) -> int:
        with self.get_connection() as conn:
            try:
                conn.execute("BEGIN IMMEDIATE")
                cursor = conn.execute(query, params)
                lastid = cursor.lastrowid
                conn.execute("COMMIT")
                return lastid
            except Exception:
                try:
                    conn.execute("ROLLBACK")
                except Exception:
                    pass
                raise

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
