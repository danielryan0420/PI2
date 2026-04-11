import ExcelJS from 'exceljs';
import db from '../db';

const EXPORT_COLUMNS = [
  { key: 'id', header: 'Count ID' },
  { key: 'username', header: 'Username' },
  { key: 'material_number', header: 'Material Number' },
  { key: 'material_description', header: 'Material Description' },
  { key: 'quantity', header: 'Quantity' },
  { key: 'sloc', header: 'SLOC' },
  { key: 'wm_bin', header: 'WM Bin' },
  { key: 'zbin', header: 'ZBIN' },
  { key: 'status', header: 'Status' },
  { key: 'created_at', header: 'Submitted At' },
  { key: 'updated_at', header: 'Last Updated' },
];

function getRows(session_id: number, from?: string, to?: string): Record<string, unknown>[] {
  let query = `
    SELECT c.id, c.username, c.material_number, sm.description as material_description,
           c.quantity, c.sloc, c.wm_bin, c.zbin, c.status, c.created_at, c.updated_at
    FROM counts c
    LEFT JOIN sap_materials sm ON c.material_number = sm.material_number
    WHERE c.session_id = ?
  `;
  const params: unknown[] = [session_id];
  if (from) { query += ' AND c.created_at >= ?'; params.push(from); }
  if (to) { query += ' AND c.created_at <= ?'; params.push(to + 'T23:59:59'); }
  query += ' ORDER BY c.created_at ASC';
  return db.prepare(query).all(...params) as Record<string, unknown>[];
}

export function exportCSV(session_id: number, from?: string, to?: string): string {
  const rows = getRows(session_id, from, to);
  const headers = EXPORT_COLUMNS.map((c) => c.header).join(',');
  const lines = rows.map((row) =>
    EXPORT_COLUMNS.map((col) => {
      const v = row[col.key];
      if (v == null) return '';
      const s = String(v);
      return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s;
    }).join(',')
  );
  return [headers, ...lines].join('\n');
}

export function exportTSV(session_id: number, from?: string, to?: string): string {
  const rows = getRows(session_id, from, to);
  const headers = EXPORT_COLUMNS.map((c) => c.header).join('\t');
  const lines = rows.map((row) =>
    EXPORT_COLUMNS.map((col) => {
      const v = row[col.key];
      return v != null ? String(v).replace(/\t/g, ' ') : '';
    }).join('\t')
  );
  return [headers, ...lines].join('\n');
}

export async function exportXLSX(session_id: number, from?: string, to?: string): Promise<Buffer> {
  const rows = getRows(session_id, from, to);
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Count Data');

  ws.columns = EXPORT_COLUMNS.map((col) => ({
    header: col.header,
    key: col.key,
    width: Math.max(col.header.length + 2, 18),
  }));

  // Bold header row
  ws.getRow(1).font = { bold: true };
  ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD6E4F0' } };

  for (const row of rows) {
    ws.addRow(EXPORT_COLUMNS.map((col) => row[col.key] ?? ''));
  }

  return wb.xlsx.writeBuffer() as unknown as Promise<Buffer>;
}
