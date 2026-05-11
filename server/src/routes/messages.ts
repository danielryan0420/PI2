import { Router } from 'express';
import db from '../db';
import { getIo } from '../socket';
import { requireRole } from '../middleware/roleCheck';
import { notifyAdminsOfQuestion, notifyQuestionerOfAnswer, markNotificationsAsRead, getUnreadThreads } from '../services/notifications';

const router = Router();

// Create a new message thread (question)
router.post('/sessions/:sessionId/threads', (req, res) => {
  const { title, countId } = req.body as { title: string; countId?: number };
  const sender = req.headers['x-username'] as string;
  const role = req.headers['x-role'] as string;

  if (!title?.trim() || !sender || !role) {
    res.status(400).json({ error: 'title, x-username, and x-role headers required' });
    return;
  }

  const session = db.prepare('SELECT id FROM inventory_sessions WHERE id = ?').get(req.params.sessionId);
  if (!session) { res.status(404).json({ error: 'Session not found' }); return; }

  if (countId) {
    const count = db.prepare('SELECT id FROM counts WHERE id = ?').get(countId);
    if (!count) { res.status(404).json({ error: 'Count not found' }); return; }
  }

  const result = db.prepare(`
    INSERT INTO message_threads (session_id, count_id, title, created_by, created_by_role)
    VALUES (?, ?, ?, ?, ?)
  `).run(req.params.sessionId, countId || null, title.trim(), sender, role);

  const thread = db.prepare('SELECT * FROM message_threads WHERE id = ?').get(result.lastInsertRowid);
  notifyAdminsOfQuestion(result.lastInsertRowid, Number(req.params.sessionId));
  getIo().to(`session:${req.params.sessionId}`).emit('thread:created', thread);
  res.status(201).json(thread);
});

// Get all threads for a session
router.get('/sessions/:sessionId/threads', (req, res) => {
  const username = req.headers['x-username'] as string;
  const role = req.headers['x-role'] as string;

  if (!username || !role) {
    res.status(400).json({ error: 'x-username and x-role headers required' });
    return;
  }

  let query = `
    SELECT mt.*,
           COUNT(m.id) as message_count
    FROM message_threads mt
    LEFT JOIN messages m ON mt.id = m.thread_id
    WHERE mt.session_id = ?
  `;

  // Counters only see threads they created or threads on their counts
  if (role === 'counter') {
    query += ` AND (mt.created_by = ? COLLATE NOCASE OR EXISTS (
      SELECT 1 FROM counts c WHERE c.id = mt.count_id AND c.username = ? COLLATE NOCASE
    ))`;
  }

  query += ` GROUP BY mt.id ORDER BY mt.created_at DESC`;

  const threads = db.prepare(query).all(
    req.params.sessionId,
    ...(role === 'counter' ? [username, username] : [])
  );

  res.json(threads);
});

// Get messages within a thread
router.get('/threads/:threadId/messages', (req, res) => {
  const thread = db.prepare('SELECT * FROM message_threads WHERE id = ?').get(req.params.threadId);
  if (!thread) { res.status(404).json({ error: 'Thread not found' }); return; }

  const messages = db.prepare(`
    SELECT * FROM messages
    WHERE thread_id = ?
    ORDER BY sent_at ASC
  `).all(req.params.threadId);

  res.json(messages);
});

// Post a message to a thread
router.post('/threads/:threadId/messages', (req, res) => {
  const { body } = req.body as { body: string };
  const sender = req.headers['x-username'] as string;
  const role = req.headers['x-role'] as string;

  if (!body?.trim() || !sender || !role) {
    res.status(400).json({ error: 'body required, x-username and x-role headers required' });
    return;
  }

  const thread = db.prepare('SELECT session_id FROM message_threads WHERE id = ?').get(req.params.threadId) as { session_id: number } | undefined;
  if (!thread) { res.status(404).json({ error: 'Thread not found' }); return; }

  const result = db.prepare(
    'INSERT INTO messages (thread_id, session_id, sender, role, body) VALUES (?, ?, ?, ?, ?)'
  ).run(req.params.threadId, thread.session_id, sender, role, body.trim());

  const message = db.prepare('SELECT * FROM messages WHERE id = ?').get(result.lastInsertRowid);

  // Notify questioner if this is an answer from office/admin
  if (role !== 'counter') {
    notifyQuestionerOfAnswer(Number(req.params.threadId), thread.session_id, sender);
    db.prepare('UPDATE message_threads SET answered = 1, answered_by = ?, answered_at = datetime("now") WHERE id = ?')
      .run(sender, req.params.threadId);
  }

  getIo().to(`session:${thread.session_id}`).emit('message:created', message);
  res.status(201).json(message);
});

// Mark thread as read
router.post('/threads/:threadId/read', (req, res) => {
  const username = req.headers['x-username'] as string;
  const user = db.prepare('SELECT id FROM users WHERE username = ? COLLATE NOCASE').get(username) as { id: number } | undefined;

  if (!user) { res.status(400).json({ error: 'User not found' }); return; }

  markNotificationsAsRead(Number(req.params.threadId), user.id);
  res.json({ ok: true });
});

// Legacy endpoints for backwards compatibility
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

router.get('/counts/:countId/messages', (req, res) => {
  const messages = db
    .prepare('SELECT * FROM messages WHERE count_id = ? ORDER BY sent_at')
    .all(req.params.countId);
  res.json(messages);
});

export default router;
