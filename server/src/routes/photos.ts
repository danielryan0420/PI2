import { Router } from 'express';
import path from 'path';
import fs from 'fs';
import db from '../db';
import { photoUpload, UPLOADS_DIR_PATH } from '../middleware/upload';
import { requireRole } from '../middleware/roleCheck';

const router = Router();

// Upload photos for a count
router.post('/counts/:countId/photos', photoUpload.array('photos', 10), (req, res) => {
  const files = req.files as Express.Multer.File[];
  if (!files || files.length === 0) { res.status(400).json({ error: 'No files uploaded' }); return; }

  const insert = db.prepare(
    'INSERT INTO photos (count_id, filename, original_name) VALUES (?, ?, ?)'
  );
  const photos = files.map((file) => {
    const result = insert.run(req.params.countId, file.filename, file.originalname);
    return { id: result.lastInsertRowid, count_id: Number(req.params.countId), filename: file.filename, original_name: file.originalname };
  });
  res.status(201).json(photos);
});

// Serve a photo file
router.get('/photos/:filename', (req, res) => {
  const filename = path.basename(req.params.filename); // prevent path traversal
  const filepath = path.join(UPLOADS_DIR_PATH, filename);
  if (!fs.existsSync(filepath)) { res.status(404).json({ error: 'Photo not found' }); return; }
  res.sendFile(filepath);
});

// Delete a photo
router.delete('/photos/:id', requireRole('office', 'admin'), (req, res) => {
  const photo = db.prepare('SELECT * FROM photos WHERE id = ?').get(req.params.id) as { filename: string } | undefined;
  if (!photo) { res.status(404).json({ error: 'Photo not found' }); return; }

  const filepath = path.join(UPLOADS_DIR_PATH, photo.filename);
  if (fs.existsSync(filepath)) fs.unlinkSync(filepath);
  db.prepare('DELETE FROM photos WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

export default router;
