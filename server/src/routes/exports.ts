import { Router } from 'express';
import { exportCSV, exportTSV, exportXLSX } from '../services/exportService';
import { requireRole } from '../middleware/roleCheck';

const router = Router();
router.use(requireRole('office', 'admin'));

router.get('/sessions/:sessionId/export', async (req, res) => {
  const { format, from, to } = req.query as { format?: string; from?: string; to?: string };
  const session_id = Number(req.params.sessionId);
  const date = new Date().toISOString().slice(0, 10);

  try {
    if (format === 'xlsx') {
      const buffer = await exportXLSX(session_id, from, to);
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="inventory_${date}.xlsx"`);
      res.send(buffer);
    } else if (format === 'tsv') {
      const content = exportTSV(session_id, from, to);
      res.setHeader('Content-Type', 'text/tab-separated-values');
      res.setHeader('Content-Disposition', `attachment; filename="inventory_${date}.tsv"`);
      res.send(content);
    } else {
      // Default: CSV
      const content = exportCSV(session_id, from, to);
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="inventory_${date}.csv"`);
      res.send(content);
    }
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : 'Export failed' });
  }
});

export default router;
