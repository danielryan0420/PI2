import { Router } from 'express';
import db from '../db';
import { submitCount, editCount, verifyCount, flagCount } from '../services/countService';
import { requireRole } from '../middleware/roleCheck';
import { getIo } from '../socket';

const router = Router();

// Submit a count
router.post('/sessions/:sessionId/counts', (req, res) => {
  const session_id = Number(req.params.sessionId);
  const { username, material_number, quantity, sloc, wm_bin, zbin } = req.body as {
    username: string;
    material_number: string;
    quantity: number;
    sloc: string;
    wm_bin?: string;
    zbin?: string;
  };

  if (!username || !material_number || quantity == null || !sloc) {
    res.status(400).json({ error: 'username, material_number, quantity, and sloc are required' });
    return;
  }

  try {
    const count = submitCount({ session_id, username, material_number: material_number.trim().toUpperCase(), quantity, sloc: sloc.trim().toUpperCase(), wm_bin: wm_bin?.trim(), zbin: zbin?.trim() });
    const enriched = enrichCount(count as Record<string, unknown>);
    getIo().to(`session:${session_id}`).emit('count:created', enriched);
    emitDashboardUpdate(session_id);
    res.status(201).json(enriched);
  } catch (e: unknown) {
    res.status(400).json({ error: e instanceof Error ? e.message : 'Failed to submit count' });
  }
});

// Get all counts for a session (office)
router.get('/sessions/:sessionId/counts', requireRole('office', 'admin'), (req, res) => {
  const { sloc, status, username, material } = req.query as Record<string, string>;
  let query = `
    SELECT c.*, sm.description as material_description
    FROM counts c
    LEFT JOIN sap_materials sm ON c.material_number = sm.material_number
    WHERE c.session_id = ?
  `;
  const params: unknown[] = [req.params.sessionId];

  if (sloc) { query += ' AND c.sloc = ?'; params.push(sloc.toUpperCase()); }
  if (status) { query += ' AND c.status = ?'; params.push(status); }
  if (username) { query += ' AND c.username LIKE ?'; params.push(`%${username}%`); }
  if (material) { query += ' AND c.material_number LIKE ?'; params.push(`%${material.toUpperCase()}%`); }

  query += ' ORDER BY c.created_at DESC';
  const counts = db.prepare(query).all(...params);
  res.json(counts);
});

// Get own counts (counter)
router.get('/sessions/:sessionId/counts/mine', (req, res) => {
  const username = req.headers['x-username'] as string;
  if (!username) { res.status(400).json({ error: 'x-username header required' }); return; }

  const counts = db.prepare(`
    SELECT c.*, sm.description as material_description
    FROM counts c
    LEFT JOIN sap_materials sm ON c.material_number = sm.material_number
    WHERE c.session_id = ? AND c.username = ? COLLATE NOCASE
    ORDER BY c.created_at DESC
  `).all(req.params.sessionId, username);
  res.json(counts);
});

// Get single count
router.get('/counts/:id', (req, res) => {
  const count = db.prepare(`
    SELECT c.*, sm.description as material_description
    FROM counts c
    LEFT JOIN sap_materials sm ON c.material_number = sm.material_number
    WHERE c.id = ?
  `).get(req.params.id);
  if (!count) { res.status(404).json({ error: 'Count not found' }); return; }

  const photos = db.prepare('SELECT * FROM photos WHERE count_id = ?').all(req.params.id);
  const messages = db.prepare('SELECT * FROM messages WHERE count_id = ? ORDER BY sent_at').all(req.params.id);
  res.json({ ...(count as object), photos, messages });
});

// Edit count
router.patch('/counts/:id', requireRole('office', 'admin'), (req, res) => {
  const { changes, reason, editedBy } = req.body as {
    changes: Record<string, unknown>;
    reason: string;
    editedBy: string;
  };
  if (!reason?.trim()) { res.status(400).json({ error: 'reason is required for edits' }); return; }

  try {
    const count = editCount({ id: Number(req.params.id), editor_username: editedBy, changes, reason });
    const enriched = enrichCount(count as Record<string, unknown>);
    const c = count as { session_id: number };
    getIo().to(`session:${c.session_id}`).emit('count:updated', { count: enriched, updatedBy: editedBy });
    emitDashboardUpdate(c.session_id);
    res.json(enriched);
  } catch (e: unknown) {
    res.status(400).json({ error: e instanceof Error ? e.message : 'Failed to edit count' });
  }
});

// Verify count
router.patch('/counts/:id/verify', requireRole('office', 'admin'), (req, res) => {
  const { verifiedBy } = req.body as { verifiedBy: string };
  try {
    const count = verifyCount(Number(req.params.id), verifiedBy) as { session_id: number };
    getIo().to(`session:${count.session_id}`).emit('count:verified', { countId: req.params.id, verifiedBy });
    emitDashboardUpdate(count.session_id);
    res.json(count);
  } catch (e: unknown) {
    res.status(400).json({ error: e instanceof Error ? e.message : 'Failed to verify' });
  }
});

// Flag count for recount
router.patch('/counts/:id/flag', requireRole('office', 'admin'), (req, res) => {
  const { flaggedBy, reason } = req.body as { flaggedBy: string; reason: string };
  if (!reason?.trim()) { res.status(400).json({ error: 'reason is required for flagging' }); return; }
  try {
    const count = flagCount(Number(req.params.id), flaggedBy, reason) as { session_id: number };
    getIo().to(`session:${count.session_id}`).emit('count:flagged', { countId: req.params.id, flaggedBy, reason });
    emitDashboardUpdate(count.session_id);
    res.json(count);
  } catch (e: unknown) {
    res.status(400).json({ error: e instanceof Error ? e.message : 'Failed to flag' });
  }
});

function enrichCount(count: Record<string, unknown>) {
  if (!count) return count;
  const mat = db.prepare('SELECT description FROM sap_materials WHERE material_number = ?').get(count.material_number as string) as { description: string } | undefined;
  return { ...count, material_description: mat?.description ?? null };
}

function emitDashboardUpdate(session_id: number) {
  // Import here to avoid circular dep
  const { computeDashboard } = require('../services/dashboardService');
  try {
    const stats = computeDashboard(session_id);
    getIo().to(`session:${session_id}`).emit('dashboard:updated', stats);
  } catch { /* non-critical */ }
}

export default router;
