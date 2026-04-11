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
