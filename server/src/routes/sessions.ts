import { Router } from 'express';
import db from '../db';
import { requireRole } from '../middleware/roleCheck';

const router = Router();

router.get('/sessions', (_req, res) => {
  const sessions = db
    .prepare('SELECT * FROM inventory_sessions ORDER BY created_at DESC')
    .all();
  res.json(sessions);
});

router.post('/sessions', requireRole('office', 'admin'), (req, res) => {
  const { name } = req.body as { name: string };
  if (!name?.trim()) { res.status(400).json({ error: 'name required' }); return; }

  const result = db.prepare('INSERT INTO inventory_sessions (name) VALUES (?)').run(name.trim());
  const session = db.prepare('SELECT * FROM inventory_sessions WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(session);
});

router.get('/sessions/:id', (req, res) => {
  const session = db.prepare('SELECT * FROM inventory_sessions WHERE id = ?').get(req.params.id);
  if (!session) { res.status(404).json({ error: 'Session not found' }); return; }
  res.json(session);
});

router.patch('/sessions/:id/close', requireRole('office', 'admin'), (req, res) => {
  const result = db
    .prepare("UPDATE inventory_sessions SET status = 'closed', closed_at = datetime('now') WHERE id = ? AND status = 'open'")
    .run(req.params.id);
  if (result.changes === 0) { res.status(404).json({ error: 'Session not found or already closed' }); return; }
  const session = db.prepare('SELECT * FROM inventory_sessions WHERE id = ?').get(req.params.id);
  res.json(session);
});

export default router;
