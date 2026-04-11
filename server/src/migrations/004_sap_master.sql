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
