import { Router } from 'express';
import db from '../db';
import { requireRole } from '../middleware/roleCheck';

const router = Router();

// Lookup a user by username — returns role or 404
router.get('/lookup', (req, res) => {
  const username = (req.query.username as string)?.trim();
  if (!username) { res.status(400).json({ error: 'username required' }); return; }

  const user = db.prepare('SELECT id, username, role FROM users WHERE username = ? COLLATE NOCASE').get(username);
  if (!user) { res.status(404).json({ error: 'User not found' }); return; }
  res.json(user);
});

// List all users (admin only)
router.get('/', requireRole('admin', 'office'), (_req, res) => {
  const users = db.prepare('SELECT id, username, role, created_at FROM users ORDER BY username').all();
  res.json(users);
});

// Add user
router.post('/', requireRole('admin', 'office'), (req, res) => {
  const { username, role } = req.body as { username: string; role: string };
  if (!username?.trim()) { res.status(400).json({ error: 'username required' }); return; }
  if (!['counter', 'office', 'admin'].includes(role)) { res.status(400).json({ error: 'Invalid role' }); return; }

  try {
    const result = db
      .prepare('INSERT INTO users (username, role) VALUES (?, ?)')
      .run(username.trim(), role);
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(user);
  } catch (e: unknown) {
    if (e instanceof Error && e.message.includes('UNIQUE')) {
      res.status(409).json({ error: 'Username already exists' });
    } else {
      res.status(500).json({ error: 'Failed to create user' });
    }
  }
});

// Update user role
router.patch('/:id', requireRole('admin', 'office'), (req, res) => {
  const { role } = req.body as { role: string };
  if (!['counter', 'office', 'admin'].includes(role)) { res.status(400).json({ error: 'Invalid role' }); return; }

  db.prepare('UPDATE users SET role = ? WHERE id = ?').run(role, req.params.id);
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (!user) { res.status(404).json({ error: 'User not found' }); return; }
  res.json(user);
});

// Delete user
router.delete('/:id', requireRole('admin', 'office'), (req, res) => {
  const result = db.prepare('DELETE FROM users WHERE id = ?').run(req.params.id);
  if (result.changes === 0) { res.status(404).json({ error: 'User not found' }); return; }
  res.json({ ok: true });
});

export default router;
