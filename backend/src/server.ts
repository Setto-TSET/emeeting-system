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
import meetingsRoutes, { filesRouter } from './routes/meetings';
import auditRoutes from './routes/audit';
import bookingsRoutes from './routes/bookings';
import { publicInvitesRouter, invitesRouter, meetingInvitesRouter } from './routes/invites';
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
  // 25mb รองรับไฟล์ 20MB ที่ถูกเข้ารหัส base64 (บวมขึ้น ~33%)
  app.use(express.json({ limit: '25mb' }));
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
  // ลิงก์เชิญของการประชุม — ต้องมาก่อน /api/meetings ไม่งั้น router ของ meetings กลืน :id ไปก่อน
  app.use('/api/meetings/:id/invites', meetingInvitesRouter);
  // เปิดลิงก์กับกดยอมรับไม่ต้องล็อกอิน ที่เหลือต้อง — จึงแยกเป็นสอง router บน path เดียวกัน
  app.use('/api/invites', publicInvitesRouter);
  app.use('/api/invites', invitesRouter);
  app.use('/api/meetings', meetingsRoutes);
  app.use('/api/files', filesRouter);
  app.use('/api/bookings', bookingsRoutes);

  app.use(errorHandler);
  app.use((req: Request, res: Response) => {
    res.status(404).json({ error: 'Not Found', path: req.path });
  });

  return app;
}

// เปิด port ก่อนต่อฐานข้อมูล — กลับด้านกันทำให้ platform ที่เช็ค /health
// (Render, Railway) ไม่มีวันเห็น service ขึ้น live เลยถ้า DB ต่อไม่ติด:
// request ค้างเงียบ ไม่มีแม้แต่ error หน้าเดียว และ log ก็เข้าไปดูสาเหตุไม่ได้
async function start() {
  const server = http.createServer(createApp());
  attachRealtime(server);

  server.listen(PORT, () => {
    console.log(`✅ Server running on http://localhost:${PORT}`);
    console.log(`✅ WebSocket listening on ws://localhost:${PORT}/ws`);
  });

  try {
    console.log('🚀 Initializing database...');
    await initDatabase();
    console.log('✅ Database connected');
  } catch (error) {
    // ไม่ปิด process ทิ้ง: เก็บ server ไว้ให้ /health ตอบ คนดูแลจะได้เห็น error นี้
    // ใน log แทนจะเจอแค่ container ที่ restart วนไปเรื่อย — ทุก route ที่แตะ DB จะตอบ 500 ตามปกติ
    console.error('❌ Database connection failed — API ที่ต้องใช้ DB จะตอบ 500 จนกว่าจะแก้:', error);
  }
}

if (require.main === module) {
  start();
}
