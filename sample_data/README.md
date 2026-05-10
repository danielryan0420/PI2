# Sample Data Files for Physical Inventory App

These CSV files provide realistic test data for the SAP import system. Each file contains 100+ records.

## Files Overview

### MARA_sample.csv
**Material Master (105 materials)**
- Columns: MATNR, MAKTX, MEINS, MTART, MATKL
- Covers: metals, plastics, chemicals, fasteners, fluids, paints, resins
- Material types: FERT (finished), RAW (raw), semi-finished
- Use: General material lookup and descriptions

### MARC_sample.csv
**Plant Data (100 records across 4 plants)**
- Columns: MATNR, WERKS (Plant), DISMM (MRP type)
- Plants: 1000, 2000, 3000, 4000
- MRP types: 20 (consume forecast), 30 (make-to-order)
- Use: Filter materials by plant; shows which materials are active where

### MARD_sample.csv
**Warehouse Stock (90 records)**
- Columns: MATNR, WERKS, LGORT, LABST, SPERR, MEINS
- Storage locations: A01-A03, B01-B02, C01-C03
- Includes: unrestricted qty, restricted qty, UOM
- Use: Current inventory levels by location; variance detection

### LGAP_sample.csv
**Storage Bins Master (70+ bins across 4 plants)**
- Columns: BINID, WERKS, LGORT, BINTYPE, LOTYP, BINTEXT
- Bin types: FIXED (100), SECONDARY (200)
- Covers: all 4 plants with realistic bin layout
- Use: Warehouse configuration; physical inventory counting

### T300T_sample.csv
**Storage Location Master (32 locations)**
- Columns: LGORT, WERKS, LGOBE, LOTYP
- Descriptions: High Bay, Rack Storage, Pallet Rack, Bulk Storage, etc.
- Type codes: 100 (standard), 200 (special/hazmat)
- Use: Location descriptions; tracking special storage zones

### MSEG_sample.csv
**Material Movements (90 movements showing issues)**
- Columns: MATNR, WERKS, MBLNR, MJAHR, ZEILE, LGORT, BWART, BUDAT, MENGE
- Movement types:
  - **201/202**: Receipts (normal goods in)
  - **221/222**: Consumption (usage out)
  - **309**: Transfers (material moves between locations)
  - **911/912**: Adjustments (+ or - corrections)
- Issue patterns: Some materials show repeated adjustments (quality issues)
- Use: **Identify problem materials** that need extra verification during inventory

## How to Use These Files

### Step 1: Test Database Setup
```bash
# Delete existing database to start fresh
rm inventory.db

# Restart server (migrations will create new DB)
python3 server.py
```

### Step 2: Import Data (in Admin → SAP Data tab)

1. **MARA** (one-time)
   - Upload: `MARA_sample.csv`
   - Result: 105 materials in system

2. **MARC** (per plant/event)
   - Upload: `MARC_sample.csv`
   - Filters MARA to active materials per plant
   - Shows only ~20-25 materials per plant

3. **MARD** (per plant/event)
   - Upload: `MARD_sample.csv`
   - Warehouse stock levels
   - Used for variance analysis during counts

4. **T300T** (reference data)
   - Upload: `T300T_sample.csv`
   - Storage location descriptions (optional)

5. **LGAP** (warehouse configuration)
   - Upload: `LGAP_sample.csv`
   - All 70+ bins across plants
   - Configure WM Bins tab with this data

6. **MSEG** (movement analysis)
   - Upload: `MSEG_sample.csv`
   - Shows which materials have issues
   - Movement types reveal patterns:
     - Multiple 911/912 adjustments = quality/tracking issues
     - Frequent 309 transfers = location inconsistency
     - High variance = needs verification

## Data Patterns to Notice

### Problem Materials (Flagged in MSEG)
These materials show repeated adjustments (911/912) indicating historical issues:
- **100-00004**: 2 positive adjustments (911) + 1 negative (912) = qty discrepancies
- **100-00013**: Multiple adjustments + inventory variance
- **100-00032**: Adjustment movements = handling issues
- **100-00037, 100-00064**: Transfer corrections (309) = location tracking issues

**Usage**: When counting these materials, flag them for extra verification due to their history.

### High-Activity Materials
- **100-00010**: 45,000 units + adjustments = critical material
- **100-00061**: High count + lot management
- **100-00044, 100-00042**: Bulk items with movement history

## Customizing for Your Plant

### Modify Material List
- Open `MARA_sample.csv` in Excel/CSV editor
- Change material numbers, descriptions to your actual materials
- Adjust MEINS (UOM) to match your units

### Adjust Plant Structure
- Edit plant codes in MARC, MARD, LGAP, T300T
- Add/remove plants as needed
- Link same materials to different plants

### Add More Locations
- Duplicate rows in MARD with new LGORT values
- Add corresponding bins in LGAP
- Update T300T with location descriptions

### Scale Up
- Use Excel formulas to generate 500+ materials
- Copy-paste MARC/MARD records with variations
- Adjust quantities to realistic levels

## Movement Type Reference

SAP Document Type Codes in MSEG:

| Code | Type | Direction |
|------|------|-----------|
| 201 | Goods Receipt PO | IN (+) |
| 202 | Goods Issue | OUT (-) |
| 221 | Goods Issue (Consumption) | OUT (-) |
| 222 | Goods Receipt (Return) | IN (+) |
| 309 | Material Transfer | MOVE |
| 901 | Physical Inv. Diff. | VARIES |
| 911 | Positive Adjustment | IN (+) |
| 912 | Negative Adjustment | OUT (-) |

**Inventory Verification Tip**: Materials with repeated 911/912 movements should be counted carefully and reviewed for quality/tracking issues.

## Notes

- All data is fictional and for testing purposes
- Dates are in 2026 format
- Quantities are reasonable for warehouse operations
- Sample includes edge cases (adjustments, transfers) to test real scenarios
