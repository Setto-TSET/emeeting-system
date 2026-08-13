// ═══════════════════════════════════════════
// Backend Server — e-Meeting System
// ═══════════════════════════════════════════

import express, { Express, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { initDatabase } from './database/connection';
import { errorHandler, authMiddleware } from './middleware';
import transcriptionRoutes from './routes/transcription';
import summarizeRoutes from './routes/summarize';

dotenv.config();

const app: Express = express();
const PORT = process.env.PORT || 3001;

// ─── Middleware ───
app.use(cors({
  origin: process.env.CORS_ORIGIN?.split(',') || 'http://localhost:3000',
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Logging middleware
app.use((req: Request, res: Response, next: NextFunction) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.path} ${res.statusCode} (${duration}ms)`);
  });
  next();
});

// ─── Health Check ───
app.get('/health', (req: Request, res: Response) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ─── API Routes (ต้องมี auth middleware ก่อน) ───
// video token ไม่ผ่าน backend นี้แล้ว — ZegoCloud token ออกจาก Next.js API route โดยตรง
// (src/app/api/video/token/route.ts) ดู backend/README.md
// app.use('/api/transcription', authMiddleware, transcriptionRoutes);
// app.use('/api/summarize', authMiddleware, summarizeRoutes);

// Temporary: ยังไม่ต้อง auth ตอนทดสอบ
app.use('/api/transcription', transcriptionRoutes);
app.use('/api/summarize', summarizeRoutes);

// ─── Error Handler ───
app.use(errorHandler);

// ─── Not Found ───
app.use((req: Request, res: Response) => {
  res.status(404).json({ error: 'Not Found', path: req.path });
});

// ─── Initialize & Start ───
async function start() {
  try {
    console.log('🚀 Initializing database...');
    await initDatabase();
    console.log('✅ Database connected');

    app.listen(PORT, () => {
      console.log(`✅ Server running on http://localhost:${PORT}`);
      console.log(`📝 API Documentation: http://localhost:${PORT}/api-docs`);
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

start();

export default app;
