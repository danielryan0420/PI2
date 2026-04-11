import express from 'express';
import http from 'http';
import cors from 'cors';
import path from 'path';
import './db'; // Run migrations on startup
import { initSocket } from './socket';
import { registerRoutes } from './routes';

const app = express();
const httpServer = http.createServer(app);

// Middleware
app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

// Serve uploaded photos
app.use('/photos', express.static(path.join(__dirname, '..', 'uploads')));

// Initialize Socket.io
initSocket(httpServer);

// API routes
registerRoutes(app);

// Health check
app.get('/health', (_req, res) => res.json({ ok: true, time: new Date().toISOString() }));

// Serve built React frontend in production
const clientDist = path.join(__dirname, '..', '..', 'client', 'dist');
if (require('fs').existsSync(clientDist)) {
  app.use(express.static(clientDist));
  // All non-API routes return index.html (React Router)
  app.get('*', (_req, res) => {
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

const PORT = process.env.PORT ?? 8081;
httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`[server] Listening on http://0.0.0.0:${PORT}`);
  console.log(`[server] Open in browser: http://localhost:${PORT}`);
});
