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
