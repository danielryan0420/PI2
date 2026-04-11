import { Router } from 'express';
import db from '../db';
import { importMaterials, importPlantData, importValuation, importSnapshot } from '../services/importService';
import { importUpload } from '../middleware/upload';
import { requireRole } from '../middleware/roleCheck';
import { getIo } from '../socket';

const router = Router();

router.use(requireRole('office', 'admin'));

router.post('/imports/materials', importUpload.single('file'), async (req, res) => {
  if (!req.file) { res.status(400).json({ error: 'No file uploaded' }); return; }
  try {
    const result = await importMaterials(req.file.path);
    getIo().emit('import:completed', { ...result, timestamp: new Date().toISOString() });
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : 'Import failed' });
  }
});

router.post('/imports/plant-data', importUpload.single('file'), async (req, res) => {
  if (!req.file) { res.status(400).json({ error: 'No file uploaded' }); return; }
  try {
    const result = await importPlantData(req.file.path);
    getIo().emit('import:completed', { ...result, timestamp: new Date().toISOString() });
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : 'Import failed' });
  }
});

router.post('/imports/valuation', importUpload.single('file'), async (req, res) => {
  if (!req.file) { res.status(400).json({ error: 'No file uploaded' }); return; }
  try {
    const result = await importValuation(req.file.path);
    getIo().emit('import:completed', { ...result, timestamp: new Date().toISOString() });
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : 'Import failed' });
  }
});

router.post('/imports/snapshot', importUpload.single('file'), async (req, res) => {
  if (!req.file) { res.status(400).json({ error: 'No file uploaded' }); return; }
  const { sessionId } = req.body as { sessionId: string };
  if (!sessionId) { res.status(400).json({ error: 'sessionId required' }); return; }
  try {
    const result = await importSnapshot(req.file.path, Number(sessionId));
    const session_id = Number(sessionId);
    getIo().to(`session:${session_id}`).emit('snapshot:loaded', { session_id, rowCount: result.imported, loadedAt: new Date().toISOString() });
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : 'Import failed' });
  }
});

router.get('/imports/status', (_req, res) => {
  const tables = ['sap_materials', 'sap_plant_data', 'sap_valuation'] as const;
  const status: Record<string, { count: number; updated_at: string | null }> = {};
  for (const t of tables) {
    const row = db.prepare(`SELECT COUNT(*) as c, MAX(updated_at) as updated_at FROM ${t}`).get() as { c: number; updated_at: string | null };
    status[t] = row;
  }
  res.json(status);
});

export default router;
