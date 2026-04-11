import { Router } from 'express';
import db from '../db';

const router = Router();

// Quick material lookup for inline description in count form
router.get('/materials/:materialNumber', (req, res) => {
  const mat = db
    .prepare('SELECT material_number, description, base_uom FROM sap_materials WHERE material_number = ? COLLATE NOCASE')
    .get(req.params.materialNumber.toUpperCase());
  if (!mat) { res.status(404).json({ error: 'Material not found' }); return; }
  res.json(mat);
});

export default router;
