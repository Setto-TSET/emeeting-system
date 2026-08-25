// ═══════════════════════════════════════════
// Backend Server — e-Meeting System
// ═══════════════════════════════════════════

import express, { Express, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import http from 'http';
import { initDatabase } from './database/connection';
import { authMiddleware, errorHandler } from './middleware';
import authRoutes from './routes/auth';
import transcriptionRoutes from './routes/transcription';
import summarizeRoutes from './routes/summarize';
import roomsRoutes from './routes/rooms';
import auditRoutes from './routes/audit';
import { attachRealtime } from './realtime/server';

dotenv.config();

const PORT = process.env.PORT || 3001;

export function createApp(): Express {
  const app: Express = express();

  // Trust the first hop reverse proxy (Railway/Caddy) so req.ip reflects the real
  // client IP (X-Forwarded-For) instead of the proxy's address.
  app.set('trust proxy', 1);

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

  // ─── API Routes ───
  // /api/auth เป็นเส้นทางเดียวที่เข้าได้โดยไม่มี token (login/refresh)
  // ที่เหลือต้องผ่าน authMiddleware — /api/rooms ผูก authMiddleware ไว้ในไฟล์ route เอง
  // video token ไม่ผ่าน backend นี้แล้ว — ZegoCloud token ออกจาก Next.js API route โดยตรง
  // (src/app/api/video/token/route.ts) ดู backend/README.md
  app.use('/api/auth', authRoutes);
  app.use('/api/transcription', authMiddleware, transcriptionRoutes);
  app.use('/api/summarize', authMiddleware, summarizeRoutes);
  app.use('/api/audit', authMiddleware, auditRoutes);
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
