-- Users (pre-configured role list)
CREATE TABLE IF NOT EXISTS users (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    username   TEXT NOT NULL UNIQUE COLLATE NOCASE,
    role       TEXT NOT NULL CHECK(role IN ('counter','office','admin')),
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
