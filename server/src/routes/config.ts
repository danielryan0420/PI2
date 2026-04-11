import { Router } from 'express';
import db from '../db';
import { requireRole } from '../middleware/roleCheck';

const router = Router();

// Get all SLOC configs
router.get('/sloc-config', (_req, res) => {
  const configs = db.prepare('SELECT * FROM sloc_config ORDER BY sloc').all();
  res.json(configs);
});

// Add or update a SLOC
router.post('/sloc-config', requireRole('office', 'admin'), (req, res) => {
  const { sloc, description, wm_enabled, im_enabled } = req.body as {
    sloc: string;
    description?: string;
    wm_enabled: boolean;
    im_enabled: boolean;
  };
  if (!sloc?.trim()) { res.status(400).json({ error: 'sloc is required' }); return; }

  db.prepare(`
    INSERT INTO sloc_config (sloc, description, wm_enabled, im_enabled)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(sloc) DO UPDATE SET
      description = excluded.description,
      wm_enabled = excluded.wm_enabled,
      im_enabled = excluded.im_enabled
  `).run(sloc.trim().toUpperCase(), description ?? null, wm_enabled ? 1 : 0, im_enabled ? 1 : 0);

  const config = db.prepare('SELECT * FROM sloc_config WHERE sloc = ?').get(sloc.trim().toUpperCase());
  res.json(config);
});

// Delete a SLOC config
router.delete('/sloc-config/:sloc', requireRole('office', 'admin'), (req, res) => {
  const result = db.prepare('DELETE FROM sloc_config WHERE sloc = ?').run(req.params.sloc.toUpperCase());
  if (result.changes === 0) { res.status(404).json({ error: 'SLOC not found' }); return; }
  res.json({ ok: true });
});

export default router;
