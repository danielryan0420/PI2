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

// Initialize Socket.io
initSocket(httpServer);

// API routes
registerRoutes(app);

// Health check
app.get('/health', (_req, res) => res.json({ ok: true, time: new Date().toISOString() }));

const PORT = process.env.PORT ?? 3001;
httpServer.listen(PORT, () => {
  console.log(`[server] Listening on http://localhost:${PORT}`);
});
