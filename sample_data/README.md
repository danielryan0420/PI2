# Sample Data

Test files for the SAP import system. Upload in Admin → SAP Data.

| File | Table | Records | Notes |
|------|-------|---------|-------|
| `MARA_sample.csv` | Materials | 105 | Metals, plastics, chemicals, fasteners — use for general material lookup |
| `MARC_sample.csv` | Plant data | 100 | 4 plants (1000–4000) — filters materials by plant |
| `MARD_sample.csv` | Warehouse stock | 90 | Stock levels by SLOC — baseline for variance detection |
| `LGAP_sample.csv` | Storage bins | 70+ | Bin layout across 4 plants |
| `T300T_sample.csv` | Storage locations | 32 | Location descriptions (optional) |
| `MSEG_sample.csv` | Movements | 90 | Includes 911/912 adjustments to simulate problem materials |

## Recommended import order

1. MARA → MARC → MARD → T300T → LGAP → MSEG

## Problem materials in MSEG sample

Materials with repeated 911/912 (adjustment) movements indicate historical discrepancies and should be counted carefully: `100-00004`, `100-00013`, `100-00032`, `100-00037`, `100-00064`.

All data is fictional and for testing only.
