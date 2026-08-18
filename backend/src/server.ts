// ═══════════════════════════════════════════
// Backend Server — e-Meeting System
// ═══════════════════════════════════════════

import express, { Express, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import http from 'http';
import { initDatabase } from './database/connection';
import { errorHandler } from './middleware';
import authRoutes from './routes/auth';
import transcriptionRoutes from './routes/transcription';
import summarizeRoutes from './routes/summarize';
import roomsRoutes from './routes/rooms';
import { attachRealtime } from './realtime/server';

dotenv.config();

const PORT = process.env.PORT || 3001;

export function createApp(): Express {
  const app: Express = express();

  app.use(
    cors({
      origin: process.env.CORS_ORIGIN?.split(',') || 'http://localhost:3000',
      credentials: true,
    })
  );
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  app.use((req: Request, res: Response, next: NextFunction) => {
    const start = Date.now();
    res.on('finish', () => {
      const duration = Date.now() - start;
      console.log(`[${new Date().toISOString()}] ${req.method} ${req.path} ${res.statusCode} (${duration}ms)`);
    });
    next();
  });

  app.get('/health', (req: Request, res: Response) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  app.use('/api/auth', authRoutes);
  app.use('/api/transcription', transcriptionRoutes);
  app.use('/api/summarize', summarizeRoutes);
  app.use('/api/rooms', roomsRoutes);

  app.use(errorHandler);
  app.use((req: Request, res: Response) => {
    res.status(404).json({ error: 'Not Found', path: req.path });
  });

  return app;
}

async function start() {
  try {
    console.log('🚀 Initializing database...');
    await initDatabase();
    console.log('✅ Database connected');

    const server = http.createServer(createApp());
    attachRealtime(server);

    server.listen(PORT, () => {
      console.log(`✅ Server running on http://localhost:${PORT}`);
      console.log(`✅ WebSocket listening on ws://localhost:${PORT}/ws`);
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  start();
}
