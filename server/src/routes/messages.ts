import { Router } from 'express';
import db from '../db';
import { getIo } from '../socket';
import { requireRole } from '../middleware/roleCheck';

const router = Router();

// Send a general session-level message (not linked to a count)
router.post('/sessions/:sessionId/messages', (req, res) => {
  const { sender, role, body } = req.body as { sender: string; role: string; body: string };
  if (!sender || !role || !body?.trim()) {
    res.status(400).json({ error: 'sender, role, and body are required' });
    return;
  }

  const session = db.prepare('SELECT id FROM inventory_sessions WHERE id = ?').get(req.params.sessionId);
  if (!session) { res.status(404).json({ error: 'Session not found' }); return; }

  const result = db.prepare(
    'INSERT INTO messages (count_id, session_id, sender, role, body) VALUES (NULL, ?, ?, ?, ?)'
  ).run(req.params.sessionId, sender, role, body.trim());

  const message = db.prepare('SELECT * FROM messages WHERE id = ?').get(result.lastInsertRowid);
  getIo().to(`session:${req.params.sessionId}`).emit('message:created', message);
  res.status(201).json(message);
});

// Get all messages for a session (office view — includes both general and count-linked)
router.get('/sessions/:sessionId/messages', requireRole('office', 'admin'), (req, res) => {
  const messages = db.prepare(`
    SELECT m.*,
           c.material_number, c.sloc, c.username as counter_username
    FROM messages m
    LEFT JOIN counts c ON m.count_id = c.id
    WHERE m.session_id = ?
    ORDER BY m.sent_at DESC
  `).all(req.params.sessionId);
  res.json(messages);
});

// Get general (non-count) messages for current counter in a session
router.get('/sessions/:sessionId/messages/general', (req, res) => {
  const username = req.headers['x-username'] as string;
  if (!username) { res.status(400).json({ error: 'x-username header required' }); return; }

  const messages = db.prepare(`
    SELECT * FROM messages
    WHERE session_id = ? AND count_id IS NULL
    ORDER BY sent_at ASC
  `).all(req.params.sessionId);
  res.json(messages);
});

// Get all messages relevant to a counter: general + threads on their own counts
router.get('/sessions/:sessionId/messages/mine', (req, res) => {
  const username = req.headers['x-username'] as string;
  if (!username) { res.status(400).json({ error: 'x-username header required' }); return; }

  const messages = db.prepare(`
    SELECT m.*, c.material_number, c.sloc
    FROM messages m
    LEFT JOIN counts c ON m.count_id = c.id
    WHERE m.session_id = ?
      AND (m.count_id IS NULL OR c.username = ? COLLATE NOCASE)
    ORDER BY m.sent_at ASC
  `).all(req.params.sessionId, username);
  res.json(messages);
});

// Send a message on a specific count
router.post('/counts/:countId/messages', (req, res) => {
  const { sender, role, body } = req.body as { sender: string; role: string; body: string };
  if (!sender || !role || !body?.trim()) {
    res.status(400).json({ error: 'sender, role, and body are required' });
    return;
  }

  const count = db.prepare('SELECT session_id FROM counts WHERE id = ?').get(req.params.countId) as { session_id: number } | undefined;
  if (!count) { res.status(404).json({ error: 'Count not found' }); return; }

  const result = db.prepare(
    'INSERT INTO messages (count_id, session_id, sender, role, body) VALUES (?, ?, ?, ?, ?)'
  ).run(req.params.countId, count.session_id, sender, role, body.trim());

  const message = db.prepare('SELECT * FROM messages WHERE id = ?').get(result.lastInsertRowid);
  getIo().to(`session:${count.session_id}`).emit('message:created', message);
  res.status(201).json(message);
});

// Get message thread for a count
router.get('/counts/:countId/messages', (req, res) => {
  const messages = db
    .prepare('SELECT * FROM messages WHERE count_id = ? ORDER BY sent_at')
    .all(req.params.countId);
  res.json(messages);
});

export default router;
