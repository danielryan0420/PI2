import { Router } from 'express';
import db from '../db';
import { requireRole } from '../middleware/roleCheck';

const router = Router();

// List all bins (optionally filter by sloc or storage_type)
router.get('/wm-bins', (req, res) => {
  const { sloc, storage_type } = req.query as Record<string, string>;
  let sql = `
    SELECT b.*, COUNT(m.id) as material_count
    FROM wm_bins b
    LEFT JOIN wm_bin_materials m ON m.bin_id = b.id
    WHERE 1=1
  `;
  const params: unknown[] = [];
  if (sloc) { sql += ' AND b.sloc = ?'; params.push(sloc.toUpperCase()); }
  if (storage_type) { sql += ' AND b.storage_type = ?'; params.push(storage_type); }
  sql += ' GROUP BY b.id ORDER BY b.storage_type, b.sloc, b.bin';
  res.json(db.prepare(sql).all(...params));
});

// Create a bin
router.post('/wm-bins', requireRole('office', 'admin'), (req, res) => {
  const { bin, storage_type, sloc, description } = req.body as {
    bin: string; storage_type: string; sloc: string; description?: string;
  };
  if (!bin?.trim() || !storage_type || !sloc?.trim()) {
    res.status(400).json({ error: 'bin, storage_type, and sloc are required' }); return;
  }
  if (!['100', '200'].includes(storage_type)) {
    res.status(400).json({ error: 'storage_type must be 100 or 200' }); return;
  }
  try {
    const result = db.prepare(
      'INSERT INTO wm_bins (bin, storage_type, sloc, description) VALUES (?, ?, ?, ?)'
    ).run(bin.trim().toUpperCase(), storage_type, sloc.trim().toUpperCase(), description?.trim() ?? null);
    const row = db.prepare('SELECT * FROM wm_bins WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(row);
  } catch (e: unknown) {
    if (e instanceof Error && e.message.includes('UNIQUE')) {
      res.status(409).json({ error: 'Bin already exists in this SLOC and storage type' }); return;
    }
    res.status(500).json({ error: 'Failed to create bin' });
  }
});

// Update a bin
router.patch('/wm-bins/:id', requireRole('office', 'admin'), (req, res) => {
  const { description } = req.body as { description?: string };
  const result = db.prepare(
    'UPDATE wm_bins SET description = ? WHERE id = ?'
  ).run(description?.trim() ?? null, req.params.id);
  if (result.changes === 0) { res.status(404).json({ error: 'Bin not found' }); return; }
  res.json(db.prepare('SELECT * FROM wm_bins WHERE id = ?').get(req.params.id));
});

// Delete a bin (cascades to wm_bin_materials)
router.delete('/wm-bins/:id', requireRole('office', 'admin'), (req, res) => {
  const result = db.prepare('DELETE FROM wm_bins WHERE id = ?').run(req.params.id);
  if (result.changes === 0) { res.status(404).json({ error: 'Bin not found' }); return; }
  res.json({ ok: true });
});

// List materials linked to a bin
router.get('/wm-bins/:id/materials', (req, res) => {
  const rows = db.prepare(`
    SELECT m.*, sm.description as material_description
    FROM wm_bin_materials m
    LEFT JOIN sap_materials sm ON sm.material_number = m.material_number
    WHERE m.bin_id = ?
    ORDER BY m.material_number
  `).all(req.params.id);
  res.json(rows);
});

// Link a material to a bin
router.post('/wm-bins/:id/materials', requireRole('office', 'admin'), (req, res) => {
  const { material_number } = req.body as { material_number: string };
  if (!material_number?.trim()) {
    res.status(400).json({ error: 'material_number required' }); return;
  }
  const bin = db.prepare('SELECT id FROM wm_bins WHERE id = ?').get(req.params.id);
  if (!bin) { res.status(404).json({ error: 'Bin not found' }); return; }
  try {
    const result = db.prepare(
      'INSERT INTO wm_bin_materials (bin_id, material_number) VALUES (?, ?)'
    ).run(req.params.id, material_number.trim().toUpperCase());
    const row = db.prepare('SELECT * FROM wm_bin_materials WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(row);
  } catch (e: unknown) {
    if (e instanceof Error && e.message.includes('UNIQUE')) {
      res.status(409).json({ error: 'Material already linked to this bin' }); return;
    }
    res.status(500).json({ error: 'Failed to link material' });
  }
});

// Unlink a material from a bin
router.delete('/wm-bins/:binId/materials/:materialNumber', requireRole('office', 'admin'), (req, res) => {
  const result = db.prepare(
    'DELETE FROM wm_bin_materials WHERE bin_id = ? AND material_number = ? COLLATE NOCASE'
  ).run(req.params.binId, req.params.materialNumber.toUpperCase());
  if (result.changes === 0) { res.status(404).json({ error: 'Link not found' }); return; }
  res.json({ ok: true });
});

// Lookup which bin(s) a material is fixed to
router.get('/wm-bins/material/:materialNumber', (req, res) => {
  const rows = db.prepare(`
    SELECT b.*, m.material_number
    FROM wm_bin_materials m
    JOIN wm_bins b ON b.id = m.bin_id
    WHERE m.material_number = ? COLLATE NOCASE
    ORDER BY b.storage_type, b.bin
  `).all(req.params.materialNumber.toUpperCase());
  res.json(rows);
});

export default router;
