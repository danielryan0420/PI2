import ExcelJS from 'exceljs';
import { parse } from 'csv-parse/sync';
import fs from 'fs';
import db from '../db';

type TableType = 'materials' | 'plant_data' | 'valuation' | 'snapshot';

// Flexible column mapping: maps possible SAP column names → internal field names
const COLUMN_MAPS: Record<TableType, Record<string, string>> = {
  materials: {
    matnr: 'material_number', material: 'material_number', 'material number': 'material_number',
    maktx: 'description', 'material description': 'description', description: 'description',
    meins: 'base_uom', 'base unit': 'base_uom', uom: 'base_uom',
    mtart: 'material_type', 'material type': 'material_type',
    mbrsh: 'material_group', 'material group': 'material_group',
  },
  plant_data: {
    matnr: 'material_number', material: 'material_number', 'material number': 'material_number',
    werks: 'plant', plant: 'plant',
    dismm: 'mrp_type', 'mrp type': 'mrp_type',
  },
  valuation: {
    matnr: 'material_number', material: 'material_number', 'material number': 'material_number',
    bwkey: 'valuation_area', 'valuation area': 'valuation_area', plant: 'valuation_area',
    vprsv: 'price_control', 'price control': 'price_control',
    stprs: 'standard_price', 'standard price': 'standard_price',
    verpr: 'moving_avg_price', 'moving average price': 'moving_avg_price', 'moving avg price': 'moving_avg_price',
    lbkum: 'total_stock', 'total stock': 'total_stock',
    salk3: 'total_value', 'total value': 'total_value',
  },
  snapshot: {
    matnr: 'material_number', material: 'material_number', 'material number': 'material_number',
    lgort: 'sloc', sloc: 'sloc', 'storage location': 'sloc',
    labst: 'sap_quantity', quantity: 'sap_quantity', qty: 'sap_quantity', 'unrestricted stock': 'sap_quantity',
    meins: 'uom', uom: 'uom', unit: 'uom',
  },
};

async function readFileRows(filePath: string): Promise<Record<string, string>[]> {
  const ext = filePath.toLowerCase().split('.').pop();
  if (ext === 'xlsx' || ext === 'xls') {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(filePath);
    const ws = wb.worksheets[0];
    const headers: string[] = [];
    const rows: Record<string, string>[] = [];
    ws.eachRow((row, rowNum) => {
      if (rowNum === 1) {
        (row.values as (string | undefined)[]).slice(1).forEach((v) => headers.push(String(v ?? '').trim()));
      } else {
        const obj: Record<string, string> = {};
        (row.values as (string | number | undefined)[]).slice(1).forEach((v, i) => {
          if (headers[i]) obj[headers[i]] = v != null ? String(v).trim() : '';
        });
        rows.push(obj);
      }
    });
    return rows;
  } else {
    const content = fs.readFileSync(filePath, 'utf8');
    // Try comma, then semicolon, then tab
    const delimiters = [',', ';', '\t'];
    for (const delimiter of delimiters) {
      try {
        const parsed = parse(content, { delimiter, columns: true, skip_empty_lines: true, trim: true });
        if (parsed.length > 0) return parsed as Record<string, string>[];
      } catch { /* try next delimiter */ }
    }
    return [];
  }
}

function mapRow(row: Record<string, string>, tableType: TableType): Record<string, string | number | null> {
  const map = COLUMN_MAPS[tableType];
  const result: Record<string, string | number | null> = {};
  for (const [key, value] of Object.entries(row)) {
    const normalized = key.toLowerCase().trim();
    const internal = map[normalized];
    if (internal) result[internal] = value || null;
  }
  return result;
}

export async function importMaterials(filePath: string) {
  const rows = await readFileRows(filePath);
  const insert = db.prepare(`
    INSERT INTO sap_materials (material_number, description, base_uom, material_type, material_group, updated_at)
    VALUES (@material_number, @description, @base_uom, @material_type, @material_group, datetime('now'))
    ON CONFLICT(material_number) DO UPDATE SET
      description = excluded.description,
      base_uom = excluded.base_uom,
      material_type = excluded.material_type,
      material_group = excluded.material_group,
      updated_at = excluded.updated_at
  `);

  let imported = 0;
  const batchInsert = db.transaction((batch: Record<string, unknown>[]) => {
    for (const row of batch) insert.run(row);
    imported += batch.length;
  });

  const mapped = rows
    .map((r) => mapRow(r, 'materials'))
    .filter((r) => r.material_number);

  for (let i = 0; i < mapped.length; i += 500) {
    batchInsert(mapped.slice(i, i + 500) as Record<string, unknown>[]);
  }
  fs.unlinkSync(filePath);
  return { imported, table: 'sap_materials' };
}

export async function importPlantData(filePath: string) {
  const rows = await readFileRows(filePath);
  const insert = db.prepare(`
    INSERT INTO sap_plant_data (material_number, plant, mrp_type, updated_at)
    VALUES (@material_number, @plant, @mrp_type, datetime('now'))
    ON CONFLICT(material_number, plant) DO UPDATE SET
      mrp_type = excluded.mrp_type,
      updated_at = excluded.updated_at
  `);

  let imported = 0;
  const batchInsert = db.transaction((batch: Record<string, unknown>[]) => {
    for (const row of batch) insert.run(row);
    imported += batch.length;
  });

  const mapped = rows
    .map((r) => mapRow(r, 'plant_data'))
    .filter((r) => r.material_number && r.plant);

  for (let i = 0; i < mapped.length; i += 500) {
    batchInsert(mapped.slice(i, i + 500) as Record<string, unknown>[]);
  }
  fs.unlinkSync(filePath);
  return { imported, table: 'sap_plant_data' };
}

export async function importValuation(filePath: string) {
  const rows = await readFileRows(filePath);
  const insert = db.prepare(`
    INSERT INTO sap_valuation (material_number, valuation_area, price_control, standard_price, moving_avg_price, total_stock, total_value, updated_at)
    VALUES (@material_number, @valuation_area, @price_control, @standard_price, @moving_avg_price, @total_stock, @total_value, datetime('now'))
    ON CONFLICT(material_number, valuation_area) DO UPDATE SET
      price_control = excluded.price_control,
      standard_price = excluded.standard_price,
      moving_avg_price = excluded.moving_avg_price,
      total_stock = excluded.total_stock,
      total_value = excluded.total_value,
      updated_at = excluded.updated_at
  `);

  let imported = 0;
  const batchInsert = db.transaction((batch: Record<string, unknown>[]) => {
    for (const row of batch) {
      const r = { ...row };
      // Parse numeric values
      for (const f of ['standard_price', 'moving_avg_price', 'total_stock', 'total_value']) {
        if (r[f] != null) r[f] = parseFloat(String(r[f]).replace(/,/g, '')) || null;
      }
      insert.run(r);
    }
    imported += batch.length;
  });

  const mapped = rows
    .map((r) => mapRow(r, 'valuation'))
    .filter((r) => r.material_number && r.valuation_area);

  for (let i = 0; i < mapped.length; i += 500) {
    batchInsert(mapped.slice(i, i + 500) as Record<string, unknown>[]);
  }
  fs.unlinkSync(filePath);
  return { imported, table: 'sap_valuation' };
}

export async function importSnapshot(filePath: string, session_id: number) {
  const rows = await readFileRows(filePath);

  // Delete existing snapshot for this session before re-importing
  db.prepare('DELETE FROM sap_snapshot WHERE session_id = ?').run(session_id);

  const insert = db.prepare(`
    INSERT INTO sap_snapshot (session_id, material_number, sloc, sap_quantity, uom)
    VALUES (@session_id, @material_number, @sloc, @sap_quantity, @uom)
  `);

  let imported = 0;
  const batchInsert = db.transaction((batch: Record<string, unknown>[]) => {
    for (const row of batch) {
      const r = { ...row, session_id };
      r.sap_quantity = parseFloat(String(r.sap_quantity).replace(/,/g, '')) || 0;
      if (r.material_number) r.material_number = String(r.material_number).trim().toUpperCase();
      if (r.sloc) r.sloc = String(r.sloc).trim().toUpperCase();
      insert.run(r);
    }
    imported += batch.length;
  });

  const mapped = rows
    .map((r) => mapRow(r, 'snapshot'))
    .filter((r) => r.material_number && r.sloc);

  for (let i = 0; i < mapped.length; i += 500) {
    batchInsert(mapped.slice(i, i + 500) as Record<string, unknown>[]);
  }
  fs.unlinkSync(filePath);
  return { imported, table: 'sap_snapshot' };
}
